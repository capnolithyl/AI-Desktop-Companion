//! Bound and rank contiguous passages without changing their source ownership.
use std::collections::{HashMap, HashSet};

const MAX_PASSAGE: usize = 500;

/// Standalone dated section labels. Metadata alone is not release proof.
pub(crate) fn date_heading_key(line:&str)->Option<u32>{
    let title=line.trim().trim_start_matches('#').trim();
    let words:Vec<&str>=title.split(|c:char|!c.is_ascii_alphanumeric())
        .filter(|w|!w.is_empty()).collect();
    if words.len()!=3{return None}
    let month_name=|raw:&str|->Option<u32>{
        match raw.to_ascii_lowercase().as_str(){
            "january"|"jan"=>Some(1),"february"|"feb"=>Some(2),
            "march"|"mar"=>Some(3),"april"|"apr"=>Some(4),
            "may"=>Some(5),"june"|"jun"=>Some(6),
            "july"|"jul"=>Some(7),"august"|"aug"=>Some(8),
            "september"|"sep"|"sept"=>Some(9),
            "october"|"oct"=>Some(10),"november"|"nov"=>Some(11),
            "december"|"dec"=>Some(12),_=>None
        }
    };
    let (year,month,day)=if words[0].len()==4 {
        (words[0].parse::<u32>().ok()?,
         words[1].parse::<u32>().ok()?,words[2].parse::<u32>().ok()?)
    }else if let Some(month)=month_name(words[0]){
        (words[2].parse::<u32>().ok()?,month,words[1].parse::<u32>().ok()?)
    }else{
        (words[2].parse::<u32>().ok()?,month_name(words[1])?,
         words[0].parse::<u32>().ok()?)
    };
    (1900..=2100).contains(&year).then_some(())?;
    if (1..=12).contains(&month)&&(1..=31).contains(&day){
        Some(year*10000+month*100+day)
    }else{None}
}


/// Reuse the same numeric-version family matching as web result ranking.
/// "Qwen" may match "Qwen4", but "Cora" must not match "Coral".
fn count_matches(expected:&HashSet<String>, actual:&HashSet<String>)->usize {
    expected.iter().filter(|term|actual.iter().any(|word|
        crate::source_priority::matches_term(term,word))).count()
}

fn terms(text: &str) -> HashSet<String> {
    let prose=text.split_whitespace().filter(|word| !word.contains("://") && !word.contains("]("))
        .collect::<Vec<_>>().join(" ").to_lowercase();
    prose.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 2 && !matches!(*w, "the" | "and" | "what" | "does" |
            "did" | "say" | "how" | "can" | "for" | "that" | "this" | "about" | "from" |
            "with" | "tell" | "me" | "its" | "is" | "to" | "of" | "it" | "at" | "on"))
        .map(str::to_owned).collect()
}

/// Keep version dots, domain names and decimal values intact. Split a long
/// unpunctuated line at a word boundary when possible, never inside UTF-8.
fn units(mut line: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    while !line.is_empty() {
        let mut boundary = 0;
        let mut end = line.len();
        let mut previous = ' ';
        for (i, (offset, ch)) in line.char_indices().enumerate() {
            if ch.is_whitespace() {
                boundary = offset;
                if matches!(previous, '.' | '!' | '?') {
                    end = offset;
                    break;
                }
            }
            if i >= MAX_PASSAGE {
                end = if boundary > 0 { boundary } else { offset };
                break;
            }
            previous = ch;
        }
        let part = line[..end].trim();
        if part.chars().count() >= 12 { parts.push(part); }
        line = line[end..].trim_start();
    }
    parts
}

pub(crate) fn select<'a>(text: &'a str, question: &str, max_items: usize, max_chars: usize) -> Vec<&'a str> {
    let wanted = terms(question);
    let mut heading = HashSet::new();
    let mut title = HashSet::new();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for line in text.lines().map(str::trim).filter(|s| !s.is_empty()) {
        if line.starts_with('#') && line.trim_start_matches('#').starts_with(' ') {
            heading = terms(line);
            if title.is_empty() && line.starts_with("# ") { title=heading.clone(); }
            continue;
        }
        for part in units(line) {
            if seen.insert(part) {
                let actual = terms(part);
                let hits: Vec<_> = wanted.iter().filter(|term|actual.iter().any(|word|
                    crate::source_priority::matches_term(term,word))).cloned().collect();
                let salience=count_matches(&title,&actual);
                candidates.push((part, hits, count_matches(&wanted,&heading), salience));
            }
        }
    }
    // Section-specific terms discriminate better than a name on every line.
    let mut frequency = HashMap::new();
    for (_, hits, _, _) in &candidates {
        for term in hits { *frequency.entry(term).or_insert(0usize) += 1; }
    }
    let mut ranked: Vec<_> = candidates.iter().enumerate().collect();
    // Reserve broad coverage when the focus has little lexical overlap.
    // The strongest passage in each region gets a turn before incidental
    // nearby lines. Explicit topic matches still win first.
    let regions=candidates.len().clamp(1,8);
    let mut region_ranks=vec![0usize; candidates.len()];
    ranked.sort_by_key(|(i,(_,_,_,salience))|(std::cmp::Reverse(*salience),*i));
    let mut assigned=vec![0usize;regions];
    for (i,_) in &ranked {
        let region=i*regions/candidates.len();
        region_ranks[*i]=assigned[region];
        assigned[region]+=1;
    }
    ranked.sort_by_cached_key(|(index, (_, hits, heading_hits, salience))| {
        let score: usize = hits.iter().map(|t| 4 + (candidates.len() / frequency[t]).min(12)).sum();
        (std::cmp::Reverse(score + 5 * heading_hits), region_ranks[*index], std::cmp::Reverse(*salience), *index)
    });
    let mut selected = Vec::new();
    let mut used = 0;
    for (index, (part, _, _, _)) in ranked {
        let cost = part.chars().count() + if selected.is_empty() { 0 } else { 2 };
        if used + cost <= max_chars {
            selected.push((index, *part));
            used += cost;
            if selected.len() == max_items { break; }
        }
    }
    selected.sort_by_key(|(index, _)| *index);
    selected.into_iter().map(|(_, part)| part).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terse_section_headings_and_late_sentences_survive_a_tight_budget() {
        let text=format!("{}\\n## Calibration\\nA removable resistor sets the offset.\\n## Other\\nKeep the spare cover dry.",
            "A long introductory paragraph talks about the weather. ".repeat(80)).replace("\\n","\n");
        assert_eq!(select(&text,"calibration",1,120),["A removable resistor sets the offset."]);
        let line=format!("{} The gasket seals the optical tube.", "Introductory details. ".repeat(400));
        assert_eq!(select(&line,"gasket",1,120),["The gasket seals the optical tube."]);
    }

    #[test]
    fn versioned_model_name_matches_family_without_alphabetic_prefix_collision() {
        let document=concat!(
            "August 2, 2026: Orion3 is the previous model family.\n",
            "November 16, 2026: Orion4-Max is the newly released Orion model.\n",
            "Another old article mentions Coralline, not Cora.\n");
        let selected=select(document,"latest released Orion model",1,160);
        assert_eq!(selected.len(),1);
        assert!(selected[0].contains("Orion4-Max"));
        let unrelated=select("Coralline reefs cover the region.","Cora",1,120);
        assert_eq!(unrelated,["Coralline reefs cover the region."],
            "with no matching passage, retain source text rather than invent evidence");
        assert_eq!(count_matches(&terms("Cora"),&terms("Coralline")),0);
    }

    #[test]
    fn passage_boundaries_preserve_utf8_and_version_tags() {
        let text=format!("{} Vale 2.4.1 measures 3.5 mm.", "?".repeat(605));
        let selected=select(&text,"Vale",3,800);
        assert!(selected.iter().all(|s|text.contains(s) && s.chars().count()<=MAX_PASSAGE));
        assert!(selected.iter().any(|s|s.contains("Vale 2.4.1 measures 3.5 mm.")));
    }
}
