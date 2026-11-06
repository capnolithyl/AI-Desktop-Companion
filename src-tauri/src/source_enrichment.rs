//! Read the most relevant official webpages for date-sensitive research.
//! A search snippet is often too short to distinguish a preliminary test from
//! a later milestone. Keep the original citation numbers and URLs unchanged.
use crate::{web_reader, web_search::SearchResult};
use futures_util::future::join_all;

const MAX_PRIMARY_PAGES: usize = 2;
const MAX_PRIMARY_EXCERPT_CHARS: usize = 2300;

fn is_official_public_source(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else { return false };
    if parsed.scheme() != "https" || parsed.username() != "" || parsed.password().is_some() {
        return false;
    }
    let Some(host) = parsed.host_str() else { return false };
    // This is a deliberately conservative first pass; it does not assume that
    // arbitrary .com/.org sites are official just because their title says so.
    host == "gov" || host.ends_with(".gov")
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
        word.len() == 4 && word.parse::<u16>().is_ok_and(|year| (2020..=2100).contains(&year))
    });
    let future_plan = ["scheduled", "planned", "targeted", "test flight", "demonstrat",
        "launch", "landing", "mission", "orbit", "release", "before", "after"];
    matching * 3
        + if date_sensitive && years { 5 } else { 0 }
        + if date_sensitive && future_plan.iter().any(|term| lower.contains(term)) { 2 } else { 0 }
}

/// Readable, bounded passages rather than an arbitrary first 400 characters.
fn focused_page_excerpt(page: &str, topic: &str) -> String {
    let terms = topic_terms(topic);
    let paragraphs: Vec<&str> = page.split("\n\n")
        .map(str::trim)
        .filter(|paragraph| paragraph.chars().count() >= 45)
        .take(100).collect();
    if paragraphs.is_empty() {
        return page.chars().take(MAX_PRIMARY_EXCERPT_CHARS).collect();
    }
    let mut priorities: Vec<usize> = (0..paragraphs.len()).collect();
    priorities.sort_by(|&a, &b| {
        score_text(paragraphs[b], &terms, true)
            .cmp(&score_text(paragraphs[a], &terms, true))
            .then_with(|| a.cmp(&b))
    });
    // Include the introduction for context, then up to four highly relevant
    // passages. Reorder selected paragraphs into their original page order.
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
        let available = MAX_PRIMARY_EXCERPT_CHARS.saturating_sub(used + 2);
        if available < 150 { break; }
        if paragraph.chars().count() > available {
            // Do not cut at an arbitrary point within the sentence when a
            // paragraph is too long for the available context budget.
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

/// Enrich at most two official results in parallel and retain their original
/// [n] indexes. Failure is nonfatal; the app can still answer using snippets.
pub async fn enrich_official_sources(
    app: &tauri::AppHandle,
    results: &mut [SearchResult],
    query: &str,
    cache_hours: u64,
) -> usize {
    let terms = topic_terms(query);
    let mut candidates: Vec<usize> = results.iter().enumerate()
        .filter(|(_, result)| is_official_public_source(&result.url))
        .map(|(index, _)| index).collect();
    candidates.sort_by(|&a, &b| {
        score_text(&results[b].title, &terms, false)
            .cmp(&score_text(&results[a].title, &terms, false))
            .then_with(|| a.cmp(&b))
    });
    candidates.truncate(MAX_PRIMARY_PAGES);
    let requests = candidates.into_iter().map(|index| {
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
                    "Relevant text from the linked official webpage (not just search snippet):\n{excerpt}"
                );
                results[index].engine = "official webpage".into();
                updated += 1;
            }
        }
    }
    updated
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_official_source_filter_rejects_spoofed_hosts() {
        assert!(is_official_public_source("https://www.nasa.gov/mission/artemis-iii/"));
        assert!(is_official_public_source("https://sub.example.gov/article"));
        assert!(!is_official_public_source("https://nasa.gov.bad.example/"));
        assert!(!is_official_public_source("https://example.com/"));
        assert!(!is_official_public_source("http://www.nasa.gov/"));
    }

    #[test]
    fn preserve_distinct_mission_objectives_from_fetched_page() {
        let page = concat!(
            "NASA provided an update on the Artemis program and plans for astronauts to return to the Moon in 2028.\n\n",
            "General background material discusses rocket designs and science partnerships without any particular dates or mission objectives.\n\n",
            "The Artemis III mission is scheduled in 2027 and will test rendezvous and docking with lunar lander prototypes in low Earth orbit. The crew will NOT land on the Moon during Artemis III.\n\n",
            "The Artemis IV mission is the 2028 human lunar landing mission, which will send astronauts to the lunar surface near the south pole.\n\n",
            "Another unrelated article paragraph about the long history of spacecraft design and engineering practices."
        );
        let excerpt = focused_page_excerpt(page, "NASA Artemis missions next mission schedule");
        assert!(excerpt.contains("Artemis III mission is scheduled in 2027"));
        assert!(excerpt.contains("low Earth orbit"));
        assert!(excerpt.contains("Artemis IV mission is the 2028 human lunar landing"));
        assert!(excerpt.chars().count() <= MAX_PRIMARY_EXCERPT_CHARS);
    }

    #[test]
    fn passage_extraction_is_bounded() {
        let page = "Mission plans in 2027. ".repeat(10_000);
        let excerpt = focused_page_excerpt(&page, "mission plans");
        assert!(excerpt.chars().count() <= MAX_PRIMARY_EXCERPT_CHARS);
    }
}
