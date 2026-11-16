use crate::web_search::{self, SearchResult};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePreference {
    pub topic: String,
    #[serde(default)]
    pub cues: Vec<String>,
    #[serde(default)]
    pub domains: Vec<String>,
}

fn valid_domain(domain: &str) -> bool {
    domain.len() <= 100 && domain.contains('.')
        && domain.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        && !domain.contains("..") && !domain.starts_with('.') && !domain.ends_with('.')
}
fn domain_matches(url: &str, domain: &str) -> bool {
    if !valid_domain(domain) { return false; }
    let Ok(url) = reqwest::Url::parse(url) else {return false};
    let Some(host) = url.host_str() else {return false};
    host == domain || host.strip_suffix(domain).is_some_and(|s| s.ends_with('.'))
}
fn match_topic<'a>(
    preferences: &'a [SourcePreference], request: Option<&str>, query: &str
) -> Option<&'a SourcePreference> {
    if let Some(request) = request {
        if let Some(preferred) = preferences.iter().find(|p| p.topic == request && !p.domains.is_empty()) {
            return Some(preferred);
        }
    }
    let words: HashSet<&str> = query.split(|c:char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty()).collect();
    preferences.iter().filter(|p| !p.domains.is_empty()).max_by_key(|p| {
        p.cues.iter().filter(|cue| words.iter().any(|w| w.eq_ignore_ascii_case(cue))).count()
    }).filter(|p| p.cues.iter().any(|cue| words.iter().any(|w| w.eq_ignore_ascii_case(cue))))
}

fn priority_score(item:&SearchResult, rule:Option<&SourcePreference>, query:&str) -> i32 {
    let text=terms(&(item.title.clone()+" "+&item.content));
    let relevance=terms(query).intersection(&text).count() as i32 * 4;
    let domain_bonus=rule.map_or(0,|r| {
        if relevance>0 && r.domains.iter().any(|d| domain_matches(&item.url,d)) {2} else {0}
    });
    domain_bonus + relevance
}

fn terms(text:&str)->HashSet<String>{
    text.to_lowercase().split(|c:char|!c.is_alphanumeric())
        .filter(|w|w.chars().count()>=3 && !matches!(*w,
            "the"|"and"|"for"|"with"|"from"|"latest"|"recent"|"news"|"search"|"find"|"what"|"similar"|"like"|"site"))
        .map(str::to_owned).collect()
}

fn relevant(item:&SearchResult,query:&str,subject:Option<&str>)->bool{
    let text=format!("{} {}",item.title,item.content).to_lowercase();
    // A model-selected named entity can be a single word. Otherwise a lone
    // shared category word cannot qualify a multi-term query.
    let words=|s:&str|s.to_lowercase().split(|c:char|!c.is_alphanumeric())
        .filter(|w|!w.is_empty()).collect::<Vec<_>>().join(" ");
    if subject.filter(|s|s.trim().chars().count()>=2)
        .is_some_and(|s|format!(" {} ",words(&text)).contains(&format!(" {} ",words(s)))) {return true}
    let requested=terms(query);
    !requested.is_empty() && requested.intersection(&terms(&text)).count()>=requested.len().min(2)
}

#[cfg(test)]
fn rank_sources(
    broad: Vec<SearchResult>, focused: Vec<SearchResult>,
    rule: Option<&SourcePreference>, query:&str
)->Vec<SearchResult>{
    rank_for_task(broad,focused,rule,query,None)
}

fn rank_for_task(broad:Vec<SearchResult>,focused:Vec<SearchResult>,rule:Option<&SourcePreference>,query:&str,subject:Option<&str>)->Vec<SearchResult>{
    let mut seen=HashSet::new();
    let mut candidates:Vec<SearchResult>=broad.into_iter().chain(focused)
        .filter(|s|seen.insert(s.url.clone()) && relevant(s,query,subject)).collect();
    // Retain original relevance order on ties. Preferred domains gain a modest
    // boost, but nonpreferred sources remain eligible and can still win.
    candidates.sort_by_key(|s| -priority_score(s,rule,query));
    candidates.truncate(8);
    candidates
}

/// Broad public search and a *single* optional preferred domain search happen
/// concurrently. Neither domain nor topic becomes an allowlist.
pub async fn search(
    endpoint:String, query:String, recent:bool,
    preferences:&[SourcePreference], selected_topic:Option<&str>
)->Result<Vec<SearchResult>,String>{
    search_for_task(endpoint,query,recent,preferences,selected_topic,None).await
}

pub async fn search_for_task(endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>,subject:Option<&str>
)->Result<Vec<SearchResult>,String>{
    let rule=match_topic(preferences,selected_topic,&query);
    let first=rule.and_then(|r|r.domains.iter().find(|d|valid_domain(d))).cloned();
    let broad_endpoint=endpoint.clone();
    let broad_query=query.clone();
    let broad=async move {
        web_search::search_candidates(broad_endpoint,broad_query,recent,24).await
    };
    if let Some(domain)=first {
        let targeted=format!("{} site:{}",query,domain);
        // Avoid runaway query expansion if a long user-supplied term is present.
        if targeted.chars().count()<=250 {
            let (broad_result,preferred_result)=futures_util::future::join(
                broad, web_search::web_search(endpoint,targeted)
            ).await;
            if broad_result.is_err() && preferred_result.is_err() {
                return Err(broad_result.err().unwrap_or_else(|| preferred_result.err().unwrap()));
            }
            return Ok(rank_for_task(
                broad_result.unwrap_or_default(),preferred_result.unwrap_or_default(),rule,&query,subject));
        }
    }
    broad.await.map(|items|rank_for_task(items,Vec::new(),rule,&query,subject))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(name:&str)->SearchResult {
        SearchResult {title:"Black metal albums news".into(),url:format!("https://{name}/new"),
            content:"new album release music".into(),engine:"test".into(),published_date:None}
    }
    fn rule()->SourcePreference {
        SourcePreference{topic:"music".into(),cues:vec!["album".into()],
            domains:vec!["metal-archives.com".into()]}
    }
    #[test]
    fn preferred_sites_receive_soft_ranking_not_exclusive_access() {
        let one=rule();
        let ranked=rank_sources(vec![entry("random.net"),entry("www.metal-archives.com")],
            vec![entry("another.org")],Some(&one),"new album");
        assert_eq!(ranked.len(),3);
        assert!(ranked[0].url.contains("metal-archives.com"));
        assert!(ranked.iter().any(|x|x.url.contains("random.net")));
    }
    #[test]
    fn registrable_domain_matching_rejects_spoofing() {
        assert!(domain_matches("https://www.metal-archives.com/band","metal-archives.com"));
        assert!(!domain_matches("https://metal-archives.com.attacker.net","metal-archives.com"));
        assert!(!domain_matches("https://othermetal-archives.com","metal-archives.com"));
        assert!(!domain_matches("javascript:alert(0)","metal-archives.com"));
    }
    #[test]
    fn topic_is_only_a_ranking_hint_and_unknown_falls_back() {
        let rules=[rule()];
        assert_eq!(match_topic(&rules,Some("unlisted"),"latest album").unwrap().topic,"music");
        assert!(match_topic(&rules,Some("unlisted"),"jellyfish").is_none());
    }
}

#[cfg(test)]
mod relevance_tests {
    use super::*;
    fn hit(title:&str,url:&str)->SearchResult{SearchResult{title:title.into(),url:url.into(),content:title.into(),engine:"isolated fixture".into(),published_date:None}}
    #[test]
    fn rank_before_cutoff_and_reject_single_generic_word_matches(){
        let mut hits:Vec<_>=(0..20).map(|i|hit("Latest news headlines",&format!("https://noise.example/{i}"))).collect();
        hits.push(hit("Aurora Vulkan release v3", "https://aurora.example/releases"));
        let ranked=rank_for_task(hits,vec![],None,"latest Aurora Vulkan release",Some("Aurora"));
        assert_eq!(ranked.len(),1);assert_eq!(ranked[0].url,"https://aurora.example/releases");
    }
    #[test]
    fn named_entities_allow_paraphrases_but_not_substring_collisions(){
        assert!(relevant(&hit("Cora: born 1975", "https://example.org/cora"),"Cora birth year",Some("Cora")));
        assert!(!relevant(&hit("Coral reefs", "https://example.org/coral"),"Cora birth year",Some("Cora")));
        assert!(!relevant(&hit("Melodic dictionary definition", "https://example.org/word"),"melodic death metal bands",None));
    }
}
