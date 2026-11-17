//! Enrich time-sensitive search results with relevant source-page passages.
//! This works across research topics: science, arts, software, products, etc.
//! Preserve the source URL and [n] citation indexes used by the UI.
use crate::{web_reader, web_search::SearchResult};
use futures_util::future::join_all;
use std::{collections::HashSet, net::IpAddr};

const MAX_SOURCE_PAGES: usize = 2;
const MAX_SOURCE_EXCERPT_CHARS: usize = 2300;

/// Selection is subject-agnostic. The existing reader independently enforces
/// strict public-HTTPS/DNS protections before making network requests.
fn candidate_host(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if parsed.scheme() != "https"
        || parsed.port_or_known_default() != Some(443)
        || parsed.username() != ""
        || parsed.password().is_some()
    { return None; }
    let host = parsed.host_str()?;
    if !host.contains('.')
        || host.ends_with(".localhost")
        || host.ends_with(".internal")
        || host.ends_with(".local")
        || host.parse::<IpAddr>().is_ok()
    { return None; }
    Some(host.to_ascii_lowercase())
}

fn topic_terms(topic: &str) -> Vec<String> {
    topic.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| word.len() >= 4 && !matches!(*word,
            "about" | "what" | "when" | "which" | "with" | "this" |
            "that" | "there" | "have" | "been" | "from" | "next" |
            "latest" | "news" | "details" | "some" | "more"))
        .map(str::to_owned)
        .take(18)
        .collect()
}

fn score_text(text: &str, terms: &[String], date_sensitive: bool) -> i32 {
    let lower = text.to_lowercase();
    let matching = terms.iter().filter(|term| lower.contains(term.as_str())).count() as i32;
    let years = lower.split(|c: char| !c.is_ascii_digit()).any(|word| {
        word.len() == 4 && word.parse::<u16>().is_ok_and(|year| (1900..=2100).contains(&year))
    });
    // These markers apply to any kind of dated claim, not just a particular
    // kind of mission, album, product or industry.
    let status_markers = ["scheduled", "planned", "targeted", "announc", "confirm",
        "updated", "expected", "effective", "released", "available",
        "completed", "postpon", "delayed", "cancel", "before", "after"];
    matching * 3
        + if date_sensitive && years { 5 } else { 0 }
        + if date_sensitive && status_markers.iter().any(|term| lower.contains(term)) { 2 } else { 0 }
}

/// An exact publisher-like domain match is useful for deciding which page
/// to READ, never for accepting a statement as true. The registrable-looking
/// left label must match a query term (or a hyphenated name in the query).
/// A URL such as subject.example.attacker.org receives no identity hint.
fn site_identity_hint(host:&str,terms:&[String])->i32 {
    let without_www=host.strip_prefix("www.").unwrap_or(host);
    let labels:Vec<_>=without_www.split('.').collect();
    if labels.len()<2 {return 0}
    let label=labels[labels.len()-2].to_ascii_lowercase();
    let parts:Vec<_>=label.split('-').filter(|s|!s.is_empty()).collect();
    if parts.len()==1 && parts[0].len()>=4 &&
        terms.iter().any(|term|term==parts[0]) {return 18}
    if parts.len()>1 && parts.iter().all(|part|
        part.len()>=3 && terms.iter().any(|term|term==part)) {return 18}
    0
}

/// Compare the subject and preview with each search result. Institutional
/// domains are a modest tie-breaker, not a claim that a page is infallible.
/// A band's .com homepage or an open-source project's site is equally eligible.
/// URL paths contain useful structured document locators: /releases, /news,
/// /docs, /readme, etc. Match against the CURRENT QUERY rather than preferring
/// any fixed website or guessing which source is true. A release index can
/// outrank a broad article when the request asks for a release.
fn url_topic_hint(url:&str,terms:&[String])->i32 {
    let Ok(parsed)=reqwest::Url::parse(url) else {return 0};
    let path=parsed.path().to_ascii_lowercase();
    let tokens:Vec<_>=path.split(|ch:char|!ch.is_ascii_alphanumeric())
        .filter(|token|token.len()>=4).collect();
    terms.iter().filter(|term|tokens.iter().any(|part|
        *part==term.as_str() || part.starts_with(term.as_str()) && part.len()<=term.len()+2
    )).count().min(3) as i32 * 6
}
fn source_score(item: &SearchResult, host: &str, terms: &[String]) -> i32 {
    let institutional = if [".gov", ".edu", ".mil"].iter().any(|suffix| host.ends_with(suffix)) {
        8
    } else { 0 };
    score_text(&item.title, terms, false) * 2
        + score_text(&item.content, terms, true)
        + institutional
        + site_identity_hint(host,terms)
        + url_topic_hint(&item.url,terms)
}

/// Pick relevant passages rather than an arbitrary first 400 characters.
/// Return text in original page order to preserve context and chronology.
pub(crate) fn focused_page_excerpt(page: &str, topic: &str) -> String {
    crate::passages::select(page, topic, 18, MAX_SOURCE_EXCERPT_CHARS).join("\n\n")
}

/// Choose bounded, domain-diverse pages to read using topic relevance
/// plus a soft subject/domain identity hint. Neither establishes authorship.
/// The existing HTTPS/DNS checks still apply to every actual fetch.
fn choose_page_candidates(results:&[SearchResult],query:&str)->Vec<usize>{
    let terms=topic_terms(query);
    let mut candidates:Vec<(usize,i32,String)>=results.iter().enumerate()
        .filter_map(|(index,item)|{
            let host=candidate_host(&item.url)?;
            let relevant=terms.is_empty() || terms.iter().any(|term|
                item.title.to_lowercase().contains(term.as_str())||
                item.content.to_lowercase().contains(term.as_str()));
            relevant.then_some((index,source_score(item,&host,&terms),host))
        }).collect();
    candidates.sort_by(|a,b|b.1.cmp(&a.1).then_with(||a.0.cmp(&b.0)));
    let mut selected=Vec::new();
    let mut hosts=HashSet::new();
    for (index,_,host) in &candidates {
        if hosts.insert(host.as_str()) {
            selected.push(*index);
            if selected.len()==MAX_SOURCE_PAGES {return selected}
        }
    }
    for (index,_,_) in candidates {
        if !selected.contains(&index) {
            selected.push(index);
            if selected.len()==MAX_SOURCE_PAGES {break}
        }
    }
    selected
}

pub(crate) fn select_release_resource(results:&[SearchResult],task:Option<&crate::recommendation_gate::ResearchTask>)->Option<usize> {
    let task=task?;
    if task.resource.as_deref()!=Some("latestRelease") || task.source_url.is_some() {return None}
    let subject=task.subject.as_deref()?;
    // Multiple owners can publish different projects under the same name.
    let mut matches=results.iter().enumerate().filter_map(|(index,hit)|
        web_reader::latest_release_url(&hit.url,subject).map(|url|(index,url)));
    let (index,url)=matches.next()?;
    if matches.any(|(_,other)|other!=url) {return None}
    // A requested release may already be a separately ranked result.
    Some(results.iter().position(|item|item.url==url).unwrap_or(index))
}

/// Read at most two subject-relevant results in parallel while retaining their
/// original source labels. A failed read leaves its original snippet intact.
pub async fn enrich_relevant_sources(
    app: &tauri::AppHandle,
    results: &mut [SearchResult],
    query: &str,
    cache_hours: u64,
    task: Option<&crate::recommendation_gate::ResearchTask>,
) -> usize {
    let release=select_release_resource(results,task);
    let mut candidates=choose_page_candidates(results,query);
    if let Some(index)=release {
        candidates.retain(|&i|i!=index);
        candidates.insert(0,index);
        candidates.truncate(MAX_SOURCE_PAGES);
    }
    let requests = candidates.into_iter().map(|index| {
        let app = app.clone();
        let release_url=(release==Some(index)).then(|| task.and_then(|t|t.subject.as_deref())
            .and_then(|subject|web_reader::latest_release_url(&results[index].url,subject))).flatten();
        let url=release_url.unwrap_or_else(||results[index].url.clone());
        async move {
            (index, web_reader::read_page_impl(&app, &url, false, cache_hours).await)
        }
    });
    let mut updated = 0;
    for (index, result) in join_all(requests).await {
        if let Ok(page) = result {
            let excerpt = focused_page_excerpt(&page.content, query);
            if excerpt.chars().count() >= 90 {
                if page.url!=results[index].url {
                    results[index].url=page.url;
                    results[index].title=page.title;
                    results[index].published_date=None;
                }
                results[index].content = excerpt;
                results[index].engine = "webpage excerpt".into();
                updated += 1;
            }
        }
    }
    updated
}

#[cfg(test)]
mod tests {
    use super::*;
    fn result(title: &str, url: &str, content: &str) -> SearchResult {
        SearchResult { title: title.into(), url: url.into(), content: content.into(),
            engine: "test".into(), published_date: None }
    }

    #[test]
    fn accepts_topic_relevant_pages_across_domains_and_rejects_unsafe_urls() {
        assert_eq!(candidate_host("https://www.nasa.gov/mission/artemis-iii/").as_deref(), Some("www.nasa.gov"));
        assert_eq!(candidate_host("https://artist.example.com/news").as_deref(), Some("artist.example.com"));
        assert_eq!(candidate_host("https://university.edu/research").as_deref(), Some("university.edu"));
        assert!(candidate_host("https://nasa.gov.bad.example/").is_some());
        assert!(candidate_host("http://www.nasa.gov/").is_none());
        assert!(candidate_host("https://127.0.0.1/").is_none());
        assert!(candidate_host("https://localhost/").is_none());
        assert!(candidate_host("https://example.com:8443/").is_none());
        assert!(candidate_host("https://user:password@example.com/").is_none());
    }

    #[test]
    fn publisher_domain_identity_is_only_a_soft_enrichment_hint(){
        let terms=topic_terms("Latest Aurora Studio release status");
        let site=result("Aurora Studio new model discussion","https://aurora.dev/blog",
            "Technical architecture notes and reasoning improvements.");
        let aggregator=result("Latest Aurora Studio release news",
            "https://videos.example.com/watch","Latest Aurora Studio model officially released.");
        let hint=site_identity_hint("aurora.dev",&terms);
        assert!(hint>0);
        assert_eq!(site_identity_hint("aurora.dev.attacker.org",&terms),0);
        assert!(source_score(&site,"aurora.dev",&terms)>
            source_score(&aggregator,"videos.example.com",&terms));
        let picked=choose_page_candidates(&[aggregator,site],"Latest Aurora Studio release status");
        assert!(picked.contains(&1),"directly relevant publisher-like domain should get read");
    }
    #[test]
    fn page_fetch_selection_spreads_two_slots_across_domains(){
        let candidates=vec![
            result("Aurora software official new update","https://aurora.dev/a",
                "Aurora project released a major update."),
            result("Aurora software official new update","https://aurora.dev/b",
                "Aurora project released a major update."),
            result("Aurora software announcement","https://observer.example.org/report",
                "Aurora software released a new update.")
        ];
        let selected=choose_page_candidates(&candidates,"Latest Aurora software update");
        assert_eq!(selected.len(),2);
        assert!(selected.contains(&0));
        assert!(selected.contains(&2),"a second same-host page should not crowd out independent context");
    }
    #[test]
    fn release_resource_requires_an_unambiguous_named_project_and_never_relabels_a_snippet() {
        use crate::recommendation_gate::ResearchTask;
        let hits=vec![
            result("Mirror","https://github.com.evil.example/lab/oriole","public overview"),
            result("Project","https://github.com/lab/oriole","README content")];
        let task=ResearchTask{subject:Some("Oriole".into()),resource:Some("latestRelease".into()),..Default::default()};
        assert_eq!(select_release_resource(&hits,Some(&task)),Some(1));
        assert_eq!(hits[1].content,"README content");
        assert_eq!(web_reader::latest_release_url(&hits[1].url,"Oriole").unwrap(),
            "https://github.com/lab/oriole/releases/latest");
        let mut ambiguous=hits.clone();
        ambiguous.push(result("Another project","https://github.com/other/oriole","different owner"));
        assert_eq!(select_release_resource(&ambiguous,Some(&task)),None);
        assert_eq!(select_release_resource(&hits,None),None);
        assert_eq!(select_release_resource(&hits,Some(&ResearchTask{source_url:Some(hits[1].url.clone()),..task})),None);
    }
    #[test]
    fn source_ranking_does_not_require_a_government_site() {
        let terms = topic_terms("Midnight Engine new album announcement");
        let project = result("Midnight Engine new album recording update",
            "https://midnight-engine.example.com/news",
            "The band announced new recording sessions in late 2026.");
        let unrelated = result("Government budget report",
            "https://agency.gov/report", "Annual spending report.");
        assert!(source_score(&project, "midnight-engine.example.com", &terms)
            > source_score(&unrelated, "agency.gov", &terms));
    }

    #[test]
    fn requested_release_document_path_competes_with_generic_comparison_articles(){
        let terms=topic_terms("latest Aurora Engine release version");
        let release=result("Aurora Engine releases","https://github.com/aurora/engine/releases",
            "See published build notes and release metadata.");
        let commentary=result("Aurora Engine general tutorial",
            "https://writer.example.com/aurora-engine-guide",
            "I like Aurora Engine and how the engine works.");
        assert!(url_topic_hint(&release.url,&terms)>url_topic_hint(&commentary.url,&terms));
        assert!(source_score(&release,"github.com",&terms)>
            source_score(&commentary,"writer.example.com",&terms));
    }
    #[test]
    fn preserve_distinct_mission_objectives_from_fetched_page() {
        let page = concat!(
            "A space agency provided an update on its missions and plans for astronauts to return to the Moon in 2028.\n\n",
            "General background material discusses rocket designs and science partnerships without any particular dates or mission objectives.\n\n",
            "The third mission is scheduled in 2027 and will test docking with prototypes in low Earth orbit. The crew will NOT land on the Moon during this test.\n\n",
            "The fourth mission is the 2028 human lunar landing, which will send astronauts to the surface near the south pole.\n\n",
            "Another unrelated article paragraph about the long history of spacecraft design and engineering practices."
        );
        let excerpt = focused_page_excerpt(page, "space agency mission next schedule");
        assert!(excerpt.contains("third mission is scheduled in 2027"));
        assert!(excerpt.contains("low Earth orbit"));
        assert!(excerpt.contains("fourth mission is the 2028 human lunar landing"));
        assert!(excerpt.chars().count() <= MAX_SOURCE_EXCERPT_CHARS);
    }

    #[test]
    fn preserve_distinct_software_release_stages() {
        let page = concat!(
            "Aurora Editor has published updates to its roadmap and future plans for release.\n\n",
            "The 2026 preview build of Aurora Editor is only for developer testing and is not the generally available version.\n\n",
            "The stable release is targeted for 2027, with no confirmed month, and may change based on testing results.\n\n",
            "An unrelated paragraph about computer hardware and support pages."
        );
        let excerpt = focused_page_excerpt(page, "Aurora Editor release schedule");
        assert!(excerpt.contains("2026 preview build"));
        assert!(excerpt.contains("stable release is targeted for 2027"));
    }

    #[test]
    fn passage_extraction_is_bounded() {
        let page = "Project roadmap planned for 2027. ".repeat(10_000);
        let excerpt = focused_page_excerpt(&page, "project roadmap");
        assert!(excerpt.chars().count() <= MAX_SOURCE_EXCERPT_CHARS);
    }
}
