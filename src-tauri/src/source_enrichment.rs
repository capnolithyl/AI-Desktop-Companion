//! Enrich time-sensitive search results with relevant source-page passages.
//! This works across research topics: science, arts, software, products, etc.
//! Preserve the source URL and [n] citation indexes used by the UI.
use crate::{web_reader, web_search::SearchResult};
use futures_util::future::join_all;
use std::net::IpAddr;

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

/// Compare the subject and preview with each search result. Institutional
/// domains are a modest tie-breaker, not a claim that a page is infallible.
/// A band's .com homepage or an open-source project's site is equally eligible.
fn source_score(item: &SearchResult, host: &str, terms: &[String]) -> i32 {
    let institutional = if [".gov", ".edu", ".mil"].iter().any(|suffix| host.ends_with(suffix)) {
        8
    } else { 0 };
    score_text(&item.title, terms, false) * 2
        + score_text(&item.content, terms, true)
        + institutional
}

/// Pick relevant passages rather than an arbitrary first 400 characters.
/// Return text in original page order to preserve context and chronology.
fn focused_page_excerpt(page: &str, topic: &str) -> String {
    let terms = topic_terms(topic);
    let paragraphs: Vec<&str> = page.split("\n\n")
        .map(str::trim)
        .filter(|paragraph| paragraph.chars().count() >= 45)
        .take(100).collect();
    if paragraphs.is_empty() {
        return page.chars().take(MAX_SOURCE_EXCERPT_CHARS).collect();
    }
    let mut priorities: Vec<usize> = (0..paragraphs.len()).collect();
    priorities.sort_by(|&a, &b| {
        score_text(paragraphs[b], &terms, true)
            .cmp(&score_text(paragraphs[a], &terms, true))
            .then_with(|| a.cmp(&b))
    });
    // Include the introduction for context, then the strongest passages.
    let mut chosen = vec![0usize];
    for index in priorities {
        if chosen.len() >= 5 { break }
        if !chosen.contains(&index) && score_text(paragraphs[index], &terms, true) > 0 {
            chosen.push(index);
        }
    }
    chosen.sort_unstable();
    let mut output = String::new();
    for index in chosen {
        let paragraph = paragraphs[index];
        let used = output.chars().count();
        let available = MAX_SOURCE_EXCERPT_CHARS.saturating_sub(used + 2);
        if available < 150 { break; }
        if paragraph.chars().count() > available {
            if output.is_empty() {
                let short: String = paragraph.chars().take(available).collect();
                let safe_end = short.rfind(". ").map(|index| index + 1)
                    .unwrap_or(short.len());
                output.push_str(&short[..safe_end]);
            }
            continue;
        }
        if !output.is_empty() { output.push_str("\n\n"); }
        output.push_str(paragraph);
    }
    output
}

/// Read at most two subject-relevant results in parallel while retaining their
/// original source labels. A failed read leaves its original snippet intact.
pub async fn enrich_relevant_sources(
    app: &tauri::AppHandle,
    results: &mut [SearchResult],
    query: &str,
    cache_hours: u64,
) -> usize {
    let terms = topic_terms(query);
    let mut candidates: Vec<(usize, i32)> = results.iter().enumerate()
        .filter_map(|(index, item)| {
            let host = candidate_host(&item.url)?;
            let relevant = terms.is_empty() || terms.iter().any(|term|
                item.title.to_lowercase().contains(term.as_str())
                    || item.content.to_lowercase().contains(term.as_str()));
            relevant.then_some((index, source_score(item, &host, &terms)))
        })
        .collect();
    candidates.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    candidates.truncate(MAX_SOURCE_PAGES);
    let requests = candidates.into_iter().map(|(index, _)| {
        let app = app.clone();
        let url = results[index].url.clone();
        async move {
            (index, web_reader::read_page_impl(&app, &url, false, cache_hours).await)
        }
    });
    let mut updated = 0;
    for (index, result) in join_all(requests).await {
        if let Ok(page) = result {
            let excerpt = focused_page_excerpt(&page.content, query);
            if excerpt.chars().count() >= 90 {
                results[index].content = format!(
                    "Relevant text from the linked webpage (not just a search snippet):\n{excerpt}"
                );
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
