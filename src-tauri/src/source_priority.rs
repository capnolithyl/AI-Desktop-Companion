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
// Publication metadata is a ranking hint, NEVER the release/event date.
// Parse only a trustworthy-looking date *format*, not an asserted truth.
// An undated source remains eligible; old primary publications are valuable
// historical evidence but cannot monopolize a present-day "latest" search.
fn civil_day(year:i32,month:u32,day:u32)->i64 {
    let year=year-if month<=2 {1} else {0};
    let era=if year>=0 {year} else {year-399}/400;
    let yo=year-era*400;
    let shifted=month as i32+if month>2 {-3} else {9};
    let ordinal=(153*shifted+2)/5+day as i32-1;
    let days=yo*365+yo/4-yo/100+ordinal;
    (era*146097+days-719468) as i64
}
fn absolute_day(input:&str)->Option<i64> {
    let bytes=input.trim().as_bytes();
    if bytes.len()<10||bytes[4]!=b'-'||bytes[7]!=b'-'{return None}
    let year=std::str::from_utf8(&bytes[..4]).ok()?.parse::<i32>().ok()?;
    let month=std::str::from_utf8(&bytes[5..7]).ok()?.parse::<u32>().ok()?;
    let day=std::str::from_utf8(&bytes[8..10]).ok()?.parse::<u32>().ok()?;
    if !(1990..=2200).contains(&year)||!(1..=12).contains(&month){return None}
    let leap=year%4==0&&(year%100!=0||year%400==0);
    let days=[31,if leap {29} else {28},31,30,31,30,31,31,30,31,30,31];
    if day==0||day>days[(month-1) as usize]{return None}
    Some(civil_day(year,month,day))
}
fn snippet_relative_age(content:&str)->Option<i64>{
    // SearXNG often has no publishedDate but prefixes snippets with
    // "1 day ago" or "17 hours ago". Use ONLY the leading metadata-like
    // prefix; never treat a date deeper in an article as its publication.
    let mut words=content.split_whitespace();
    let count=words.next()?.parse::<i64>().ok()?;
    let unit=words.next()?.trim_matches(|ch:char|!ch.is_ascii_alphabetic()).to_ascii_lowercase();
    if words.next()?.trim_matches(|ch:char|!ch.is_ascii_alphabetic())!="ago" ||
        !(0..=3650).contains(&count){return None}
    match unit.as_str(){
        "minute"|"minutes"|"hour"|"hours"=>Some(0),
        "day"|"days"=>Some(count),
        "week"|"weeks"=>Some(count*7),
        "month"|"months"=>Some(count*30),
        "year"|"years"=>Some(count*365),
        _=>None
    }
}
fn freshness_bonus_at(hit:&SearchResult,query:&str,today:i64)->i32{
    let temporal=words(query).iter().any(|word|matches!(word.as_str(),
        "latest"|"newest"|"recent"|"currently"|"current"|"today"|"yesterday"|"thisweek"));
    if !temporal{return 0}
    let absolute=hit.published_date.as_deref().and_then(absolute_day)
        .or_else(||absolute_day(&hit.content));
    let age=absolute.map(|day|today-day).or_else(||snippet_relative_age(&hit.content));
    match age {
        Some(0..=3)=>12,
        Some(4..=14)=>9,
        Some(15..=45)=>6,
        Some(46..=120)=>2,
        _=>0
    }
}
fn freshness_bonus(hit:&SearchResult,query:&str)->i32{
    let today=std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()/86400;
    freshness_bonus_at(hit,query,today as i64)
}

fn priority_score(item:&SearchResult, rule:Option<&SourcePreference>, query:&str) -> i32 {
    let relevance=overlap(query,&(item.title.clone()+" "+&item.content)) as i32 * 4;
    let domain_bonus=rule.map_or(0,|r| {
        if relevance>0 && r.domains.iter().any(|d| domain_matches(&item.url,d)) {2} else {0}
    });
    domain_bonus + relevance + freshness_bonus(item,query)
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

/// Ranking remains about topical relevance. Diversity prevents one search
/// aggregator or model-hosting site from occupying every source slot.
/// No host is treated as proof of a claim or as a universal authority.
fn diversify_hosts(hits:Vec<SearchResult>)->Vec<SearchResult>{
    let mut seen=HashSet::new();
    let mut distinct=Vec::new();
    let mut remaining=Vec::new();
    for hit in hits {
        let host=reqwest::Url::parse(&hit.url).ok()
            .and_then(|url|url.host_str().map(str::to_owned))
            .unwrap_or_else(||hit.url.clone());
        let host=host.strip_prefix("www.").unwrap_or(&host).to_owned();
        if seen.insert(host) { distinct.push(hit); } else { remaining.push(hit); }
    }
    distinct.extend(remaining);
    distinct
}

fn rank_for_task(broad:Vec<SearchResult>,focused:Vec<SearchResult>,rule:Option<&SourcePreference>,query:&str,subject:Option<&str>)->Vec<SearchResult>{
    let mut seen=HashSet::new();
    let mut candidates:Vec<SearchResult>=broad.into_iter().chain(focused)
        .filter(|s|seen.insert(s.url.clone()) && relevant(s,query,subject)).collect();
    // Retain original relevance order on ties. Preferred domains gain a modest
    // boost, but nonpreferred sources remain eligible and can still win.
    candidates.sort_by_cached_key(|hit| {
        let names_subject=subject.is_some_and(|name| subject_matches(&hit.title,name)
            || subject_matches(&hit.url,name));
        (!names_subject, -priority_score(hit,rule,query))
    });
    let mut candidates=diversify_hosts(candidates);
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
/// Preserve the entire already privacy-approved PUBLIC search query when
/// looking for primary announcements. Reducing "latest released X" to "X"
/// silently discards the user's comparison and favors older model listings.
/// A named task subject is not itself a search authorization.
pub(crate) fn primary_followup_query(query:&str,_subject:Option<&str>)->Option<String> {
    let public_query=query.trim();
    if public_query.is_empty() || public_query.chars().any(char::is_control) { return None }
    let existing=words(public_query);
    let missing:Vec<_>=["official","announcement"].into_iter()
        .filter(|word|!existing.iter().any(|term|term==word)).collect();
    if missing.is_empty() {return None}
    let followup=format!("{public_query} {}",missing.join(" "));
    (followup.chars().count()<=250).then_some(followup)
}

/// Relevance of a search hit among THIS query's candidates.
///
/// Rare matching terms provide more identifying power than boilerplate shared
/// by almost every result (e.g. "model", "news"). This uses no entity/domain
/// hardcoding and never approves a factual claim by itself.
fn provisional_score(hit:&SearchResult, query:&str, corpus:&[SearchResult]) -> i32 {
    let wanted=terms(query);
    let title=terms(&hit.title);
    let body=terms(&hit.content);
    let size=corpus.len() as i32;
    wanted.iter().map(|term|{
        let matched_title=title.iter().any(|candidate|matches_term(term,candidate));
        let matched_body=body.iter().any(|candidate|matches_term(term,candidate));
        if !(matched_title||matched_body){return 0}
        let frequency=corpus.iter().filter(|other|{
            let words=terms(&(other.title.clone()+" "+&other.content));
            words.iter().any(|candidate|matches_term(term,candidate))
        }).count() as i32;
        let rarity=(size-frequency+1).max(1);
        rarity * (if matched_title {3} else {1})
    }).sum()
}

/// Preserve domain diversity so a single aggregator cannot consume every
/// provisional slot. This is a selection policy, not a trust designation.
fn select_provisional(mut hits:Vec<SearchResult>,query:&str)->Vec<SearchResult>{
    hits.retain(|hit| overlap(query,&format!("{} {} {}",hit.title,hit.content,hit.url))>0);
    let corpus=hits.clone();
    hits.sort_by_cached_key(|hit|-provisional_score(hit,query,&corpus));
    let mut unique_urls=HashSet::new();
    hits.retain(|hit|unique_urls.insert(hit.url.clone()));
    let mut distinct=diversify_hosts(hits);
    distinct.truncate(6);
    distinct
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
        // The web can contain untrusted control characters. Debug lines must
        // not allow a search headline to spoof subsequent diagnostic fields.
        all.iter().take(4).map(|hit|hit.title.split_whitespace()
            .collect::<Vec<_>>().join(" ").chars().take(110).collect()).collect()
    } else {Vec::new()};
    // SearXNG has already ranked these by search relevance. If a brittle
    // lexical screen rejects every hit, retain at most a few as CANDIDATES for
    // the existing source-quote and task-validation stages, not as trusted facts.
    let provisional_pool=if sources.is_empty() {
        select_provisional(all,query)
    } else {Vec::new()};
    let returned_results=sources.len();
    Ok(SearchBatch{sources,provisional_pool,trace:SearchTrace{
        attempted_queries,raw_results,returned_results,provisional_results:0,
        rejected_titles,upstream_errors:errors
    }})
}
async fn search_once(
    endpoint:String,query:String,goal:&str,recent:bool,
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
        return assemble_search(goal,subject,rule,vec![query.clone(),targeted],
            vec![broad_result,preferred_result]);
    }
    assemble_search(goal,subject,rule,vec![query.clone()],vec![broad.await])
}
/// Promote a bounded, diverse candidate set after *all* strict matches
/// and bounded retries have failed. This changes retrieval, not verification.
fn promote_provisional(batch:&mut SearchBatch){
    if !batch.sources.is_empty(){return}
    let mut seen=HashSet::new();
    batch.sources=std::mem::take(&mut batch.provisional_pool)
        .into_iter().filter(|item|seen.insert(item.url.clone()))
        .take(6).collect();
    batch.trace.provisional_results=batch.sources.len();
    batch.trace.returned_results=batch.sources.len();
}
/// Search once, then retry ONE broader public-entity query only if the ranked
/// result is empty. The caller can log raw hits vs retained hits reliably.
pub async fn search_with_trace(
    endpoint:String,query:String,recent:bool,
    preferences:&[SourcePreference],selected_topic:Option<&str>,
    subject:Option<&str>,retry_empty:bool
)->Result<SearchBatch,String> {
    let initial=search_once(endpoint.clone(),query.clone(),&query,recent,
        preferences,selected_topic,subject,true).await;
    let unrestricted=recent && initial.is_ok();
    let mut first=match initial {
        Ok(batch)=>batch,
        Err(error) if recent=>{
            let mut batch=search_once(endpoint.clone(),query.clone(),&query,false,
                preferences,selected_topic,subject,false).await?;
            batch.trace.upstream_errors.push(error);
            batch.trace.attempted_queries.insert(0,query.clone());
            batch
        },
        Err(error)=>return Err(error)
    };
    if first.sources.is_empty() {
        // A time-filtered engine can return nonempty, unrelated front pages.
        // Retry the same goal without the date filter before stripping terms.
        let broad=retry_empty.then(||relaxed_subject_query(&query,subject)).flatten();
        for retry in unrestricted.then(||query.clone()).into_iter().chain(broad) {
            match search_once(endpoint.clone(),retry.clone(),&query,false,
                preferences,selected_topic,subject,false).await {
                Ok(second)=>{
                    first.trace.attempted_queries.extend(second.trace.attempted_queries);
                    first.trace.raw_results+=second.trace.raw_results;
                    first.trace.upstream_errors.extend(second.trace.upstream_errors);
                    first.trace.rejected_titles.extend(second.trace.rejected_titles);
                    first.trace.rejected_titles.truncate(4);
                    if !second.sources.is_empty() {
                        first.sources=second.sources;
                        break;
                    }
                    first.provisional_pool.extend(second.provisional_pool);
                },
                Err(error)=>{
                    first.trace.attempted_queries.push(retry);
                    first.trace.upstream_errors.push(error);
                }
            }
        }
        first.trace.returned_results=first.sources.len();
        if retry_empty {promote_provisional(&mut first);}
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
    fn recency_boost_is_scoped_to_temporal_queries_and_never_claims_a_release_date() {
        let today=civil_day(2026,11,17);
        let mut new=entry("public.example");
        new.published_date=Some("2026-11-16T15:20:00Z".into());
        let mut old=entry("archive.example");
        old.published_date=Some("2026-08-02T00:00:00Z".into());
        assert_eq!(freshness_bonus_at(&new,"latest metal album",today),12);
        assert_eq!(freshness_bonus_at(&old,"latest metal album",today),2);
        assert_eq!(freshness_bonus_at(&new,"history of metal",today),0);
        new.published_date=Some("2026-11-22T00:00:00Z".into());
        assert_eq!(freshness_bonus_at(&new,"latest metal album",today),0,
            "future publication dates cannot boost source rank");
        assert!(absolute_day("2026-02-30").is_none());
        assert!(absolute_day("2026-13-01").is_none());
        assert!(absolute_day("2024-02-29").is_some());
    }
    #[test]
    fn undated_search_snippet_prefix_can_supply_a_bounded_recency_hint(){
        let today=civil_day(2026,11,17);
        let mut hit=entry("publisher.example");
        hit.content="1 day ago ... new public software announcement".into();
        assert_eq!(freshness_bonus_at(&hit,"latest software release",today),12);
        hit.content="17 hours ago ... event report".into();
        assert_eq!(freshness_bonus_at(&hit,"latest software release",today),12);
        hit.content="The release is 1 day old, according to a forum post.".into();
        assert_eq!(freshness_bonus_at(&hit,"latest software release",today),0);
        hit.content="13 months ago ... historical press release".into();
        assert_eq!(freshness_bonus_at(&hit,"latest software release",today),0);
    }
    #[test]
    fn dated_current_hit_can_outrank_equally_relevant_archived_hits(){
        let mut archived=entry("archive.example");
        archived.title="Aurora version official update".into();
        archived.content="Aurora version official update".into();
        archived.published_date=Some("2021-06-10".into());
        let mut current=entry("current.example");
        current.title=archived.title.clone();
        current.content="1 day ago ... Aurora version official update".into();
        let query="latest Aurora version";
        assert!(priority_score(&current,None,query)>priority_score(&archived,None,query));
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
    fn primary_lookup_keeps_latest_goal_instead_of_collapsing_to_family_name(){
        assert_eq!(primary_followup_query("latest officially released Qwen model",Some("Qwen")),
            Some("latest officially released Qwen model official announcement".into()));
        assert_eq!(primary_followup_query("latest officially released Qwen model",None),
            Some("latest officially released Qwen model official announcement".into()));
        assert_eq!(primary_followup_query("public software release",Some("Private Name")),
            Some("public software release official announcement".into()));
        assert_eq!(primary_followup_query("Qwen latest model",Some("Qwen\\nsecret")),
            Some("Qwen latest model official announcement".into()));
        assert_eq!(primary_followup_query("  ",None),None);
        assert_eq!(primary_followup_query("public\nprivate",None),None);
        assert_eq!(primary_followup_query(&"a".repeat(246),None),None);
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
        // Test the same promotion path used by production search_with_trace.
        assert!(batch.sources.is_empty());
        assert_eq!(batch.trace.provisional_results,0);
        promote_provisional(&mut batch);
        assert!(batch.trace.provisional_results>0);
        assert_eq!(batch.trace.raw_results,3);
        assert!(batch.trace.rejected_titles.iter().any(|title|title.contains("Qwen")));
    }

    #[test]
    fn provisional_selection_rewards_discriminating_terms_and_diverse_domains(){
        let make=|name:&str,host:&str|SearchResult{
            title:name.into(),content:name.into(),
            url:format!("https://{host}/{}",name.replace(' ',"-")),
            engine:"test".into(),published_date:None};
        let inputs=vec![
            make("AI model release guide","generic-one.test"),
            make("Model release guide","generic-two.test"),
            make("Cloud model news","generic-three.test"),
            make("Qwen4-Max official model release","publisher.test"),
            make("Qwen4-Max details","publisher.test"),
            make("Generic AI model overview","generic-four.test"),
            make("Qwen release announcement","release.test"),
            make("AI model update","generic-five.test")
        ];
        let chosen=select_provisional(inputs,
            "latest officially released Qwen model AI Model");
        assert_eq!(chosen.len(),6);
        assert_eq!(chosen[0].title,"Qwen4-Max official model release");
        assert!(chosen.iter().any(|hit|hit.title=="Qwen release announcement"));
        assert!(!chosen.iter().any(|hit|hit.title=="Qwen4-Max details"),
            "diverse sources outrank a second page from the same host at the six-source cap");
        assert!(chosen.iter().any(|hit|hit.url.starts_with("https://publisher.test/")));
    }
    #[test]
    fn completely_irrelevant_front_pages_do_not_consume_an_extraction_call(){
        let raw=vec![hit("Global news homepage"),hit("Video streaming service")];
        let mut batch=assemble_search("Oriole spectrometer calibration",Some("Oriole"),None,
            vec!["Oriole".into()],vec![Ok(raw)]).unwrap();
        promote_provisional(&mut batch);
        assert_eq!(batch.trace.raw_results,2);
        assert!(batch.sources.is_empty());
        assert_eq!(primary_followup_query("Oriole official announcement",None),None);
    }
    #[test]
    fn top_eight_keep_relevant_independent_sources_when_one_host_dominates() {
        let mut hits:Vec<_>=(0..15).map(|i|SearchResult{
            title:"Latest officially released Qwen model official announcement".into(),
            url:format!("https://aggregator.example/release/{i}"),
            content:"Latest officially released Qwen model official announcement".into(),
            engine:"fixture".into(),published_date:None
        }).collect();
        hits.push(SearchResult{
            title:"Publisher releases Qwen model".into(),
            url:"https://publisher.example/press/announcement".into(),
            content:"Publisher has released a new Qwen model.".into(),
            engine:"fixture".into(),published_date:None
        });
        let ranked=rank_for_task(hits,vec![],None,
            "latest officially released Qwen model",Some("Qwen"));
        assert_eq!(ranked.len(),8);
        assert!(ranked.iter().any(|s|s.url.contains("publisher.example")),
            "independent publisher evidence cannot be crowded out by one aggregator");
        assert!(ranked.iter().all(|s|s.title.contains("Qwen")));
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
