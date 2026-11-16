use crate::web_search::{self, SearchResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;


#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchTrace {
    pub attempted_queries: Vec<String>,
    pub raw_results: usize,
    pub returned_results: usize,
    /// Results rescued as unverified candidates after strict lexical filtering.
    pub provisional_results: usize,
    /// Up to four untrusted result headlines, for debugging a zero-match filter.
    pub rejected_titles: Vec<String>,
    pub upstream_errors: Vec<String>,
}
pub struct SearchBatch {
    pub sources: Vec<SearchResult>,
    pub trace: SearchTrace,
    // Only considered for structured research after an empty strict match.
    provisional_pool: Vec<SearchResult>,
}
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

// A family name can have a numeric model suffix without a word boundary
// (e.g. Qwen3.5 versus Qwen). Do not accept alphabetic partial names.
fn matches_term(wanted:&str, actual:&str)->bool {
    wanted==actual || (wanted.chars().last().is_some_and(|c|c.is_alphabetic())
        && actual.starts_with(wanted)
        && actual[wanted.len()..].chars().next().is_some_and(|c|c.is_ascii_digit()))
}
fn words(text:&str)->Vec<String>{
    text.to_lowercase().split(|c:char|!c.is_alphanumeric())
        .filter(|w|!w.is_empty()).map(str::to_owned).collect()
}
fn subject_matches(text:&str,subject:&str)->bool {
    let wanted=words(subject);
    if wanted.is_empty(){return false}
    let actual=words(text);
    actual.windows(wanted.len()).any(|window|
        wanted.iter().enumerate().all(|(i,part)|
            if i+1==wanted.len(){matches_term(part,&window[i])}
            else {part==&window[i]})
    )
}
fn overlap(query:&str,text:&str)->usize {
    let requested=terms(query);
    let actual=terms(text);
    requested.iter().filter(|q|actual.iter().any(|word|matches_term(q,word))).count()
}
fn priority_score(item:&SearchResult, rule:Option<&SourcePreference>, query:&str) -> i32 {
    let relevance=overlap(query,&(item.title.clone()+" "+&item.content)) as i32 * 4;
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
    let text=format!("{} {}",item.title,item.content);
    // Structured public subjects are identity anchors, not a demand that
    // each result repeat the model's verbose query verbatim.
    if subject.filter(|s|s.trim().chars().count()>=2)
        .is_some_and(|s|subject_matches(&text,s)) {return true}
    let requested=terms(query);
    !requested.is_empty() && overlap(query,&text)>=requested.len().min(2)
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

// Only a named public subject already present in the approved query may
// become a broader retry. No new private terms can enter a web request.
fn relaxed_subject_query(query:&str,subject:Option<&str>)->Option<String> {
    let subject=subject?.trim();
    if !(3..=90).contains(&subject.chars().count())
        || subject.chars().any(|c|c.is_control() ||
            !(c.is_alphanumeric() || c.is_whitespace() || matches!(c,'-'|'.'|'_'|'+'|'&'))) {
        return None;
    }
    let original=words(query);
    let wanted=words(subject);
    if wanted.is_empty() || original==wanted
        || !original.windows(wanted.len()).any(|w|w==wanted.as_slice()) {
        return None;
    }
    Some(subject.to_owned())
}
fn assemble_search(
    query:&str, subject:Option<&str>, rule:Option<&SourcePreference>,
    attempted_queries:Vec<String>, responses:Vec<Result<Vec<SearchResult>,String>>
)->Result<SearchBatch,String> {
    let mut all=Vec::new();
    let mut errors=Vec::new();
    let mut successes=0;
    for response in responses {
        match response {
            Ok(mut items)=>{successes+=1;all.append(&mut items);}
            Err(err)=>errors.push(err)
        }
    }
    // A failed broad search plus an empty targeted search is an upstream error,
    // NOT a genuine empty search. This was previously silently swallowed.
    if successes==0 || (all.is_empty() && !errors.is_empty()) {
        return Err(errors.join("; "));
    }
    let raw_results=all.len();
    let sources=rank_for_task(all.clone(),Vec::new(),rule,query,subject);
    let rejected_titles=if sources.is_empty() {
        all.iter().take(4).map(|hit|hit.title.chars().take(110).collect()).collect()
    } else {Vec::new()};
    // SearXNG has already ranked these by search relevance. If a brittle
    // lexical screen rejects every hit, retain at most a few as CANDIDATES for
    // the existing source-quote and task-validation stages, not as trusted facts.
    let mut provisional_pool=if sources.is_empty() {all} else {Vec::new()};
    provisional_pool.sort_by_key(|hit|-priority_score(hit,rule,query));
    let mut seen=HashSet::new();
    provisional_pool.retain(|hit|seen.insert(hit.url.clone()));
    provisional_pool.truncate(3);
    let returned_results=sources.len();
    Ok(SearchBatch{sources,provisional_pool,trace:SearchTrace{
        attempted_queries,raw_results,returned_results,provisional_results:0,
        rejected_titles,upstream_errors:errors
    }})
}
async fn search_once(
    endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>,
    subject:Option<&str>,preferred_enabled:bool
)->Result<SearchBatch,String> {
    let rule=match_topic(preferences,selected_topic,&query);
    let preferred=if preferred_enabled {
        rule.and_then(|r|r.domains.iter().find(|d|valid_domain(d)))
            .map(|domain|format!("{query} site:{domain}"))
            .filter(|q|q.chars().count()<=250)
    } else {None};
    let broad_endpoint=endpoint.clone();
    let broad_query=query.clone();
    let broad=async move {web_search::search_candidates(broad_endpoint,broad_query,recent,24).await};
    if let Some(targeted)=preferred {
        let (broad_result,preferred_result)=futures_util::future::join(
            broad,web_search::web_search(endpoint,targeted.clone())
        ).await;
        return assemble_search(&query,subject,rule,vec![query.clone(),targeted],
            vec![broad_result,preferred_result]);
    }
    assemble_search(&query,subject,rule,vec![query.clone()],vec![broad.await])
}
/// Search once, then retry ONE broader public-entity query only if the ranked
/// result is empty. The caller can log raw hits vs retained hits reliably.
pub async fn search_with_trace(
    endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>,
    subject:Option<&str>,retry_empty:bool
)->Result<SearchBatch,String> {
    let mut first=search_once(endpoint.clone(),query.clone(),recent,
        preferences,selected_topic,subject,true).await?;
    if first.sources.is_empty() && retry_empty {
        if let Some(retry)=relaxed_subject_query(&query,subject) {
            let second=search_once(endpoint,retry,false,
                preferences,selected_topic,subject,false).await?;
            first.trace.attempted_queries.extend(second.trace.attempted_queries);
            first.trace.raw_results+=second.trace.raw_results;
            first.trace.upstream_errors.extend(second.trace.upstream_errors);
            if !second.sources.is_empty() {
                first.sources=second.sources;
            } else {
                first.provisional_pool.extend(second.provisional_pool);
            }
            if !second.trace.rejected_titles.is_empty() {
                first.trace.rejected_titles.extend(second.trace.rejected_titles);
                first.trace.rejected_titles.truncate(4);
            }
            first.trace.returned_results=first.sources.len();
        }
        if first.sources.is_empty() {
            let mut seen=HashSet::new();
            first.sources=std::mem::take(&mut first.provisional_pool)
                .into_iter().filter(|item|seen.insert(item.url.clone()))
                .take(3).collect();
            first.trace.provisional_results=first.sources.len();
            first.trace.returned_results=first.sources.len();
        }
    }
    Ok(first)
}
pub async fn search(
    endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>
)->Result<Vec<SearchResult>,String>{
    search_for_task(endpoint,query,recent,preferences,selected_topic,None).await
}
pub async fn search_for_task(
    endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>,subject:Option<&str>
)->Result<Vec<SearchResult>,String>{
    search_with_trace(endpoint,query,recent,preferences,selected_topic,subject,false)
        .await.map(|batch|batch.sources)
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

#[cfg(test)]
mod search_recovery_tests {
    use super::*;
    fn hit(title:&str)->SearchResult {
        SearchResult{title:title.into(),content:title.into(),
            url:format!("https://example.org/{}",title.replace(' ',"-")),
            engine:"isolated fixture".into(),published_date:None}
    }
    #[test]
    fn versioned_names_match_a_family_but_an_alphabetic_substring_does_not() {
        let versioned=hit("Qwen3.5 latest officially released model");
        assert!(relevant(&versioned,"latest officially released Qwen model AI Model",Some("Qwen")));
        assert!(relevant(&versioned,"Qwen latest model",None));
        assert!(!subject_matches("Coral reef study","Cora"));
        assert!(!relevant(&hit("Coral reef study"),"Cora birth year",Some("Cora")));
        assert!(!subject_matches("Qwen35 technical notes","Qwen3"));
    }
    #[test]
    fn relaxed_retry_uses_only_a_name_present_in_the_original_public_query(){
        assert_eq!(relaxed_subject_query("latest officially released Qwen model",Some("Qwen")),
            Some("Qwen".into()));
        assert_eq!(relaxed_subject_query("Qwen",Some("Qwen")),None);
        assert_eq!(relaxed_subject_query("latest release",Some("Private Person")),None);
        assert_eq!(relaxed_subject_query("Qwen release",Some("Qwen\nprivate")),None);
    }

    #[test]
    fn structured_search_can_inspect_rejected_results_without_calling_them_verified(){
        let raw=vec![hit("Generic AI commentary"),hit("Qwen3.5 technical release notes"),
            hit("Cloud model comparison")];
        // Query includes two unrelated filler terms, and structured subject was
        // omitted by the planner. Strict matching must remain conservative.
        let mut batch=assemble_search(
            "latest officially released Qwen model AI Model",None,None,
            vec!["latest officially released Qwen model AI Model".into()],
            vec![Ok(raw)]).unwrap();
        // The result pool remains provisional until a separate quote check.
        assert!(batch.sources.is_empty() || batch.trace.provisional_results==0);
        let mut seen=HashSet::new();
        batch.sources=std::mem::take(&mut batch.provisional_pool)
            .into_iter().filter(|item|seen.insert(item.url.clone()))
            .take(3).collect();
        batch.trace.provisional_results=batch.sources.len();
        assert!(batch.trace.provisional_results>0);
        assert_eq!(batch.trace.raw_results,3);
        assert!(batch.trace.rejected_titles.iter().any(|title|title.contains("Qwen")));
    }
    #[test]
    fn raw_hit_counts_distinguish_no_results_from_relevance_filtering() {
        let empty=assemble_search("Cora birth year",Some("Cora"),None,
            vec!["Cora birth year".into()],vec![Ok(vec![])]).unwrap();
        assert_eq!(empty.trace.raw_results,0);
        assert_eq!(empty.trace.returned_results,0);
        let filtered=assemble_search("Cora birth year",Some("Cora"),None,
            vec!["Cora birth year".into()],vec![Ok(vec![hit("Coral reef study")])]).unwrap();
        assert_eq!(filtered.trace.raw_results,1);
        assert_eq!(filtered.trace.returned_results,0);
        assert_eq!(filtered.trace.provisional_results,0);
        assert_eq!(filtered.trace.rejected_titles,vec!["Coral reef study"]);
        assert!(assemble_search("Cora birth year",Some("Cora"),None,
            vec!["Cora birth year".into(),"Cora birth year site:example.com".into()],
            vec![Err("upstream failed".into()),Ok(vec![])]).is_err());
    }
}
