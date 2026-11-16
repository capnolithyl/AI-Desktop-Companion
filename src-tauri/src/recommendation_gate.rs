//! Validate evidence for a discovery or verification task selected by the planner.
use crate::{web_search::SearchResult, quantities, attribution};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResearchKind {
    Discover,
    Verify,
    #[default]
    Lookup,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTask {
    pub kind: ResearchKind,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub entity_type: String,
    #[serde(default)]
    pub details: Vec<String>,
    #[serde(default)]
    pub preferences: Vec<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub requirements: Vec<HardRequirement>,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

impl ResearchTask {
    pub fn uses_fact_evidence(&self) -> bool {
        self.kind == ResearchKind::Lookup ||
            (self.kind == ResearchKind::Verify && self.requirements.is_empty() && self.roles.is_empty())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HardRequirement {
    pub quote: String,
    pub relation: String,
    pub limit: f64,
    pub unit: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Measurement {
    pub source: usize,
    pub value: f64,
    pub unit: String,
    pub quote: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Suggestion {
    pub source: usize,
    #[serde(rename = "name", alias = "title")]
    pub title: String,
    #[serde(default)]
    pub creator: String,
    pub identity_quote: String,
    pub fit_quote: String,
    #[serde(default)]
    pub measurements: Vec<Measurement>,
    #[serde(default)]
    pub relations: Vec<attribution::ProposedRelation>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedSuggestion {
    pub source: usize,
    pub title: String,
    pub creator: String,
    pub identity_quote: String,
    pub fit_quote: String,
    pub measurements: Vec<MeasurementEvidence>,
    pub relations: Vec<attribution::GroundedRelation>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub missing_details: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasurementEvidence {
    pub source: usize,
    pub value: f64,
    pub unit: String,
    pub quote: String,
}

#[derive(Debug)]
pub struct GateResult {
    pub approved: Vec<ApprovedSuggestion>,
    pub rejected: usize,
    pub requirements: Vec<HardRequirement>,
    pub ignored_requirements: Vec<HardRequirement>,
    pub note: String,
    pub relations_checked: usize,
    pub exclusions_checked: usize,
    pub followup_query: Option<String>,
    /// Stable failure stages for the owner to debug real extracted candidates.
    pub rejected_details: Vec<String>,
}

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn quote_from_source<'a>(quote: &str, sources: &'a [SearchResult], idx: usize) -> Option<&'a SearchResult> {
    if !(3..=550).contains(&quote.trim().chars().count()) { return None; }
    let source = sources.get(idx.checked_sub(1)?)?;
    let quote = norm(quote);
    (norm(&source.content).contains(&quote) || norm(&source.title).contains(&quote))
        .then_some(source)
}

fn same_clause(quote: &str, title: &str, amount: Option<quantities::Quantity>) -> bool {
    let key = norm(title);
    if key.len() < 3 {return false}
    attribution::clauses(quote).into_iter().any(|clause|{
        let lowered=norm(clause);
        let Some(at)=lowered.find(key.as_str()) else {return false};
        amount.is_none_or(|q|quantities::first_measure_matches(
            &lowered[at+key.len()..],q))
    })
}

pub fn quoted_requirement_valid(question: &str, req: &HardRequirement) -> bool {
    if req.quote.len() < 5 || req.quote.len() > 120
        || !norm(question).contains(norm(&req.quote).as_str()) { return false; }
    let Some(target)=quantities::canonical(req.limit,&req.unit) else {return false};
    if !quantities::mention_supports(&req.quote,target){return false}
    let text = norm(&req.quote);
    // These are comparison operators for numbers, NOT route/intent
    // classifiers; we deliberately don't guess what media a word denotes.
    // Negated comparisons have priority over their positive substrings:
    // "no less than" means >=, not <.
    let expected = if ["no less than","not less than","no fewer than","at least","minimum ","min "]
        .iter().any(|marker| text.contains(*marker)) { Some("gte") }
    else if ["no more than","not more than","at most","up to ","maximum ","max "]
        .iter().any(|marker| text.contains(*marker)) { Some("lte") }
    else if ["under ","less than","fewer than","below ","shorter than"]
        .iter().any(|marker| text.contains(*marker)) { Some("lt") }
    else if ["over ","more than","greater than","above ","longer than"]
        .iter().any(|marker| text.contains(*marker)) { Some("gt") }
    else if ["exactly ","equal to "]
        .iter().any(|marker| text.contains(*marker)) { Some("eq") }
    else {None};
    expected == Some(req.relation.as_str())
}

fn missing_field(unit: quantities::Dimension) -> &'static str {
    use quantities::Dimension::*;
    match unit {
        Duration => "duration",
        Episodes => "episode count",
        Tracks => "track listing",
        Pages => "page count",
        Chapters => "chapter count",
        Words => "word count",
        Seasons => "season count",
    }
}

fn role_search_term(role: &str) -> Option<&str> {
    match role {
        "studio" => Some("production company"),
        "author" | "director" | "producer" | "distributor" | "publisher"
        | "developer" | "artist" | "composer" | "creator" => Some(role),
        _ => None,
    }
}

pub(crate) fn followup_query(title: &str, fields: &[&str]) -> Option<String> {
    // The title must come from a matched public excerpt. Use it as a quoted
    // search term and append only field names from the application.
    if fields.is_empty() || title.contains(['"', '@', '<', '>'])
        || title.contains("://") || title.chars().any(char::is_control)
    {
        return None;
    }
    let query = format!("\"{title}\" {}", fields.join(" "));
    (query.chars().count() <= 180).then_some(query)
}

/// Public candidate-title query. Fields are derived from typed limits/roles,
/// never from injected source instructions or private profile text.
pub(crate) fn candidate_details_query(title: &str, task: &ResearchTask) -> Option<String> {
    let mut fields = Vec::new();
    for requirement in &task.requirements {
        if let Some(value) = quantities::canonical(requirement.limit, &requirement.unit) {
            let field = missing_field(value.dim);
            if !fields.contains(&field) { fields.push(field); }
        }
    }
    for role in &task.roles {
        if let Some(field) = role_search_term(role) {
            if !fields.contains(&field) { fields.push(field); }
        }
    }
    if fields.is_empty() { fields.push("details"); }
    followup_query(title, &fields)
}

fn candidate_evidence<'a>(
    item: Suggestion,
    requirements: &[HardRequirement],
    required_roles: &'a [String],
    kind: ResearchKind,
    sources: &[SearchResult],
) -> Result<(ApprovedSuggestion, Vec<&'a str>), &'static str> {
    let title = item.title.trim();
    if !(3..=110).contains(&title.chars().count()) || item.creator.chars().count() > 110
        || item.measurements.len() > 6 || item.relations.len() > 6
    {
        return Err("invalid_candidate_fields");
    }
    quote_from_source(&item.identity_quote, sources, item.source)
        .ok_or("identity_quote_not_found_in_cited_source")?;
    if !same_clause(&item.identity_quote, title, None) {
        return Err("identity_quote_does_not_name_candidate");
    }
    if kind == ResearchKind::Discover || !item.fit_quote.is_empty() {
        quote_from_source(&item.fit_quote, sources, item.source)
            .ok_or("relevance_quote_not_found_in_cited_source")?;
        if !same_clause(&item.fit_quote, title, None) || norm(&item.fit_quote) == norm(title) {
            return Err("relevance_quote_does_not_describe_candidate");
        }
    }

    let relations: Vec<_> = item.relations.into_iter()
        .filter_map(|relation| attribution::verify(title, relation, sources))
        .collect();
    if !item.creator.trim().is_empty()
        && !relations.iter().any(|edge| norm(&edge.name) == norm(&item.creator))
    {
        return Err("claimed_creator_has_no_supported_credit");
    }
    let mut missing: Vec<_> = required_roles.iter()
        .filter(|role| !relations.iter().any(|edge| &edge.role == *role))
        .filter_map(|role| role_search_term(role))
        .collect();
    let mut measurements = Vec::new();
    for requirement in requirements {
        let threshold = quantities::canonical(requirement.limit, &requirement.unit)
            .ok_or("unsupported_requirement_unit")?;
        let observed = item.measurements.iter().find_map(|measure| {
            let value = quantities::canonical(measure.value, &measure.unit)?;
            if threshold.dim != value.dim {
                return None;
            }
            quote_from_source(&measure.quote, sources, measure.source)?;
            same_clause(&measure.quote, title, Some(value)).then_some((measure, value))
        });
        if let Some((measure, value)) = observed {
            // A verification can report what the source says about a specific
            // work, including a measured value outside the user's limit.
            if kind == ResearchKind::Discover
                && !quantities::compare(value, &requirement.relation, threshold)
            {
                return Err("measurement_does_not_satisfy_strict_limit");
            }
            measurements.push(MeasurementEvidence {
                source: measure.source,
                value: measure.value,
                unit: measure.unit.clone(),
                quote: measure.quote.clone(),
            });
        } else {
            missing.push(missing_field(threshold.dim));
        }
    }
    if kind == ResearchKind::Verify && item.fit_quote.is_empty()
        && required_roles.is_empty() && requirements.is_empty()
    {
        return Err("verification_has_no_supported_property");
    }
    missing.dedup();
    Ok((ApprovedSuggestion {
        source: item.source,
        title: title.to_owned(),
        creator: item.creator.trim().to_owned(),
        identity_quote: item.identity_quote,
        fit_quote: item.fit_quote,
        measurements,
        relations,
        missing_details: missing.iter().map(|field| (*field).to_owned()).collect(),
    }, missing))
}

pub fn screen_task(
    question: &str, task: &ResearchTask, suggestions: Vec<Suggestion>, sources: &[SearchResult],
) -> GateResult {
    let (requirements, ignored_requirements): (Vec<_>, Vec<_>) = task.requirements.iter()
        .take(4).cloned().partition(|limit| quoted_requirement_valid(question, limit));
    let unresolved_limit = ignored_requirements.iter().any(|limit|
        norm(question).contains(&norm(&limit.quote))
        && !quantities::measured_in(&limit.quote).is_empty()
    );
    let mut exclusions: HashSet<_> = task.exclude.iter().take(6)
        .filter(|name| (3..=110).contains(&name.trim().chars().count())
            && norm(question).contains(&norm(name)))
        .map(|name| norm(name)).collect();
    // A reference for similarity is the target of the comparison, not
    // a candidate answer. Reuse the structured relationship the planner made.
    if task.kind == ResearchKind::Discover {
        for detail in &task.details {
            let lower=detail.trim().to_ascii_lowercase();
            if let Some(reference)=lower.strip_prefix("similar to ") {
                if (3..=110).contains(&reference.chars().count()) {
                    exclusions.insert(norm(reference));
                }
            }
        }
    }
    let target = task.subject.as_deref().map(norm);
    let mut approved = Vec::new();
    let mut seen = HashSet::new();
    let mut next_query = None;
    let mut rejected_details = Vec::new();
    let count = suggestions.len();

    for item in suggestions.into_iter().take(3).filter(|_| !unresolved_limit) {
        let title = norm(&item.title);
        if task.kind == ResearchKind::Discover && exclusions.contains(&title) {
            rejected_details.push(format!("{}: explicitly_excluded", item.title));
            continue;
        }
        if task.subject.is_some() && target.as_ref() != Some(&title) {
            rejected_details.push(format!("{}: not_the_named_target_subject", item.title));
            continue;
        }
        // An identity quote may justify a *focused real search* even when the
        // initial preview cannot prove fit, a credit, or a strict measurement.
        // It NEVER justifies accepting or recommending the candidate by itself.
        let identity_anchored = quote_from_source(&item.identity_quote, sources, item.source)
            .is_some_and(|_| same_clause(&item.identity_quote, &item.title, None));
        let lead_title = item.title.clone();
        match candidate_evidence(item, &requirements, &task.roles, task.kind, sources) {
            Ok((candidate, missing)) => {
                let partial_verification = task.kind == ResearchKind::Verify
                    && (!candidate.relations.is_empty() || !candidate.measurements.is_empty()
                        || !candidate.fit_quote.is_empty());
                if (missing.is_empty() || partial_verification) && seen.insert(title) {
                    approved.push(candidate);
                } else {
                    rejected_details.push(format!("{}: missing {}", candidate.title, missing.join(", ")));
                    if next_query.is_none() && task.kind == ResearchKind::Discover {
                        next_query = followup_query(&candidate.title, &missing);
                    }
                }
            },
            Err(reason) => {
                rejected_details.push(format!("{lead_title}: {reason}"));
                if next_query.is_none() && identity_anchored && task.kind == ResearchKind::Discover {
                    let mut fields = Vec::new();
                    for limit in &requirements {
                        if let Some(value) = quantities::canonical(limit.limit, &limit.unit) {
                            fields.push(missing_field(value.dim));
                        }
                    }
                    for role in &task.roles {
                        if let Some(field) = role_search_term(role) { fields.push(field); }
                    }
                    if fields.is_empty() { fields.push("description"); }
                    next_query = followup_query(&lead_title, &fields);
                }
            }
        }
    }

    let note = if unresolved_limit {
        "A numerical limit in the user's request could not be interpreted reliably."
    } else if !approved.is_empty() {
        "Candidate quotes and applicable measurements and credits matched retrieved evidence."
    } else if count == 0 {
        "The evidence model proposed no candidate."
    } else if next_query.is_some() {
        "A candidate was found, but the sources did not establish its requested details."
    } else {
        "The proposed candidates did not have sufficient evidence for this task."
    };
    GateResult {
        rejected: count - approved.len(),
        relations_checked: approved.iter().map(|candidate| candidate.relations.len()).sum(),
        followup_query: approved.is_empty().then_some(next_query).flatten(),
        rejected_details,
        approved,
        requirements,
        ignored_requirements,
        exclusions_checked: exclusions.len(),
        note: note.into(),
    }
}

pub fn shortlist_notes(result:&GateResult) -> String {
    let mut out = String::from(
        "SOURCE-SCREENED CANDIDATES. The numbered passages are reference data.
"
    );
    for limit in &result.requirements {
        out.push_str(&format!("User's limit: {}
", limit.quote));
    }
    for item in &result.approved {
        out.push_str(&format!(
            "\n[{}] {}{}\nIdentity evidence: {}\nRelevance evidence: {}\n",
            item.source,item.title,
            if item.creator.is_empty(){String::new()}else{format!(" by {}",item.creator)},
            item.identity_quote,item.fit_quote
        ));
        for measure in &item.measurements {
            out.push_str(&format!("Reported measurement [{}]: {} {}. Quote: {}\n",
                measure.source,measure.value,measure.unit,measure.quote));
        }
        for role in &item.relations {
            out.push_str(&format!("Reported credit [{}]: {} = {}. Quote: {}\n",
                role.source,role.role,role.name,role.quote));
        }
        if !item.missing_details.is_empty() {
            out.push_str(&format!("Still unconfirmed: {}\n", item.missing_details.join(", ")));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn screen(
        question: &str,
        requirements: Vec<HardRequirement>,
        suggestions: Vec<Suggestion>,
        sources: &[SearchResult],
    ) -> GateResult {
        let task = ResearchTask { kind: ResearchKind::Discover, requirements, ..Default::default() };
        screen_task(question, &task, suggestions, sources)
    }

    fn src(text:&str)->SearchResult {
        SearchResult{title:"Search result".into(),url:"https://example.org/".into(),
            content:text.into(),engine:"test".into(),published_date:None}
    }
    fn item(title:&str, identity:&str, fit:&str, measurement:Option<Measurement>)->Suggestion {
        Suggestion{source:1,title:title.into(),creator:String::new(),
            identity_quote:identity.into(),fit_quote:fit.into(),
            measurements:measurement.into_iter().collect(),relations:vec![]}
    }
    fn limit()->HardRequirement {
        HardRequirement{quote:"under six episodes".into(),relation:"lt".into(),
            limit:6.0,unit:"episodes".into()}
    }
    #[test]
    fn four_episode_work_is_admitted_and_twelve_episode_work_rejected() {
        let allowed="Pet Shop of Horrors has 4 episodes. Pet Shop of Horrors is a horror anthology series with unusual stories.";
        let disallowed="Junji Ito Collection has 12 episodes. Junji Ito Collection is an animated horror series based on manga.";
        let ok=item("Pet Shop of Horrors",
            "Pet Shop of Horrors has 4 episodes.",
            "Pet Shop of Horrors is a horror anthology series with unusual stories.",
            Some(Measurement{source:1,value:4.0,unit:"episodes".into(),
                quote:"Pet Shop of Horrors has 4 episodes.".into()}));
        let mut bad=item("Junji Ito Collection",
            "Junji Ito Collection has 12 episodes.",
            "Junji Ito Collection is an animated horror series based on manga.",
            Some(Measurement{source:2,value:12.0,unit:"episodes".into(),
                quote:"Junji Ito Collection has 12 episodes.".into()}));
        bad.source=2;
        let r=screen("short horror anime under six episodes",vec![limit()],
            vec![ok,bad],&[src(allowed),src(disallowed)]);
        assert_eq!(r.approved.len(),1);
        assert_eq!(r.approved[0].title,"Pet Shop of Horrors");
        assert_eq!(r.rejected,1);
    }
    #[test]
    fn neighboring_result_count_and_equal_boundary_cannot_pass() {
        let merged="6 Episodes TV-MA 2024. Watch High-Rise Invasion. High-Rise Invasion is a horror survival series.";
        let item=item("High-Rise Invasion",
            "Watch High-Rise Invasion. High-Rise Invasion is a horror survival series.",
            "High-Rise Invasion is a horror survival series.",
            Some(Measurement{source:1,value:6.0,unit:"episodes".into(),
                quote:"6 Episodes TV-MA 2024. Watch High-Rise Invasion.".into()}));
        let r=screen("under six episodes",vec![limit()],vec![item],&[src(merged)]);
        assert!(r.approved.is_empty());
    }
    #[test]
    fn two_works_in_one_sentence_do_not_share_episode_counts() {
        let quote="Pet Shop of Horrors has 4 episodes and Junji Ito Collection has 12 episodes.";
        let source=format!("{quote} Junji Ito Collection is a horror anime.");
        let invalid=item("Junji Ito Collection",quote,
            "Junji Ito Collection is a horror anime.",
            Some(Measurement{source:1,value:4.0,unit:"episodes".into(),
                quote:quote.into()}));
        let result=screen("horror anime under six episodes",vec![limit()],
            vec![invalid],&[src(&source)]);
        assert!(result.approved.is_empty(),"Cross-entity numeric borrow must fail");
    }

    #[test]
    fn game_list_excerpt_recommends_individual_work_not_article_title() {
        let text = "1. The Convenience Store – playtime 1hr · 2. Iron Lung – playtime 30-40 minutes · 3. No One Lives Under the Lighthouse – playtime 45-60 minutes";
        let quote = "2. Iron Lung – playtime 30-40 minutes";
        let item = item("Iron Lung", quote, quote, Some(Measurement {
            source:1, value:40.0, unit:"minutes".into(), quote:quote.into()
        }));
        let task = ResearchTask {
            kind: ResearchKind::Discover,
            requirements: vec![HardRequirement {quote:"under two hours".into(),
                relation:"lt".into(),limit:2.0,unit:"hours".into()}],
            ..Default::default()
        };
        let outcome = screen_task("short horror games under two hours", &task,
            vec![item], &[src(text)]);
        assert_eq!(outcome.approved.len(), 1);
        assert_eq!(outcome.approved[0].title, "Iron Lung");
        assert_eq!(outcome.approved[0].measurements[0].value, 40.0);
    }

    #[test]
    fn a_targeted_discovery_can_never_switch_to_an_unrelated_work() {
        let data = "Iron Lung is a short horror game. The Exit 8 is another short horror game.";
        let task = ResearchTask {kind:ResearchKind::Discover,subject:Some("Iron Lung".into()), ..Default::default()};
        let other = item("The Exit 8","The Exit 8 is another short horror game.",
            "The Exit 8 is another short horror game.",None);
        let out = screen_task("short horror games",&task,vec![other],&[src(data)]);
        assert!(out.approved.is_empty());
        assert!(out.rejected_details[0].contains("not_the_named_target_subject"));
    }
    #[test]
    fn a_candidate_details_query_uses_numeric_dimensions_and_credit_roles() {
        let task=ResearchTask {kind:ResearchKind::Discover,
            requirements:vec![HardRequirement{quote:"under two hours".into(),
                relation:"lt".into(),limit:2.0,unit:"hours".into()}],
            roles:vec!["director".into()],..Default::default()};
        assert_eq!(candidate_details_query("Iron Lung",&task).as_deref(),
            Some("\"Iron Lung\" duration director"));
    }

    #[test]
    fn anchored_candidate_without_fit_triggers_real_lookup_not_a_fake_recommendation() {
        // Search excerpt recorded from a live source, not a fabricated answer.
        let snippet = "2. Iron Lung – playtime 30-40 minutes";
        let candidate = item("Iron Lung", snippet,
            "Horror game with highly atmospheric visuals", None);
        let task = ResearchTask {
            kind: ResearchKind::Discover,
            requirements: vec![HardRequirement {
                quote: "under two hours".into(),relation:"lt".into(),
                limit:2.0,unit:"hours".into()
            }],
            ..Default::default()
        };
        let result = screen_task("horror games under two hours", &task,
            vec![candidate], &[src(snippet)]);
        assert!(result.approved.is_empty());
        assert_eq!(result.followup_query.as_deref(), Some("\"Iron Lung\" duration"));
        assert!(result.rejected_details.iter().any(|reason|
            reason.contains("relevance_quote_not_found_in_cited_source")));
    }

    #[test]
    fn an_explicit_limit_requires_evidence_and_a_consistent_comparison() {
        let src_text="Pet Shop of Horrors has 4 episodes. Pet Shop of Horrors is a horror anthology series with unusual stories.";
        let item=item("Pet Shop of Horrors",
            "Pet Shop of Horrors has 4 episodes.",
            "Pet Shop of Horrors is a horror anthology series with unusual stories.",
            None);
        let held = screen("under six episodes", vec![limit()], vec![item.clone()], &[src(src_text)]);
        assert!(held.approved.is_empty());
        assert_eq!(held.followup_query.as_deref(), Some("\"Pet Shop of Horrors\" episode count"));
        assert!(screen("under six episodes",vec![HardRequirement{
            quote:"under six episodes".into(),relation:"lte".into(),
            limit:6.0,unit:"episodes".into()}],vec![item],&[src(src_text)]).approved.is_empty());
    }
    #[test]
    fn band_identity_requires_same_source_quotes_but_no_quantitative_gate() {
        let text="Dark Tranquillity is a Swedish melodic death metal band. Dark Tranquillity blends melodic death metal with atmospheric synth textures.";
        let ok=item("Dark Tranquillity",
            "Dark Tranquillity is a Swedish melodic death metal band.",
            "Dark Tranquillity blends melodic death metal with atmospheric synth textures.",None);
        let r=screen("more atmospheric melodic death metal",vec![],vec![ok],&[src(text)]);
        assert_eq!(r.approved.len(),1);
    }
    #[test]
    fn unrelated_neighboring_creator_does_not_validate_a_work() {
        let content="The album Hegemony was released by Samael in 2017. Emperor is a Norwegian black metal band. Hegemony is an industrial metal album.";
        let mut proposal=item("Hegemony",
            "The album Hegemony was released by Samael in 2017. Emperor is a Norwegian black metal band.",
            "Hegemony is an industrial metal album.",None);
        proposal.creator="Emperor".into();
        assert!(screen("industrial metal albums",vec![],vec![proposal],&[src(content)])
            .approved.is_empty(), "Creator from another sentence must not pass");
    }

    #[test]
    fn negated_numeric_limit_does_not_flip_the_comparison() {
        let gte=HardRequirement{quote:"no less than 10 songs".into(),
            relation:"gte".into(),limit:10.0,unit:"songs".into()};
        assert!(quoted_requirement_valid("albums with no less than 10 songs",&gte));
        let wrong=HardRequirement{quote:"no less than 10 songs".into(),
            relation:"lt".into(),limit:10.0,unit:"songs".into()};
        assert!(!quoted_requirement_valid("albums with no less than 10 songs",&wrong));
    }

    #[test]
    fn runtime_units_and_song_track_aliases_follow_strict_user_limits() {
        let movie="The film Quiet Harbor runs for 1h 35m. Quiet Harbor is a psychological horror film with tense atmosphere.";
        let suggestion=item("Quiet Harbor",
            "The film Quiet Harbor runs for 1h 35m.",
            "Quiet Harbor is a psychological horror film with tense atmosphere.",
            Some(Measurement{source:1,value:95.0,unit:"minutes".into(),
                quote:"The film Quiet Harbor runs for 1h 35m.".into()}));
        let req=HardRequirement{quote:"under 2 hours".into(),
            relation:"lt".into(),limit:2.0,unit:"hours".into()};
        let r=screen("a horror movie under 2 hours",vec![req],vec![suggestion],&[src(movie)]);
        assert_eq!(r.approved.len(),1);

        let album="The album Lantern Lines has 9 tracks. Lantern Lines is an atmospheric metal album.";
        let suggestion=item("Lantern Lines",
            "The album Lantern Lines has 9 tracks.",
            "Lantern Lines is an atmospheric metal album.",
            Some(Measurement{source:1,value:9.0,unit:"tracks".into(),
                quote:"The album Lantern Lines has 9 tracks.".into()}));
        let req=HardRequirement{quote:"less than 10 songs".into(),
            relation:"lt".into(),limit:10.0,unit:"songs".into()};
        let r=screen("an album with less than 10 songs",vec![req],vec![suggestion],&[src(album)]);
        assert_eq!(r.approved.len(),1);
    }

    #[test]
    fn explicit_prior_reference_artist_is_excluded_from_recommendations() {
        let a="Dark Tranquillity is a melodic death metal band. Dark Tranquillity has a moody atmospheric sound.";
        let b="The Halo Effect is a melodic death metal band. The Halo Effect performs atmospheric melodic death metal.";
        let mut other=item("The Halo Effect","The Halo Effect is a melodic death metal band.",
            "The Halo Effect performs atmospheric melodic death metal.",None);
        other.source=2;
        let ref_band=item("Dark Tranquillity","Dark Tranquillity is a melodic death metal band.",
            "Dark Tranquillity has a moody atmospheric sound.",None);
        let task = ResearchTask {
            kind: ResearchKind::Discover,
            exclude: vec!["Dark Tranquillity".into()],
            ..Default::default()
        };
        let result = screen_task(
            "I've been listening to Dark Tranquillity. Recommend me similar bands.",
            &task, vec![ref_band,other], &[src(a),src(b)]
        );
        assert_eq!(result.approved.len(),1);
        assert_eq!(result.approved[0].title,"The Halo Effect");
        assert_eq!(result.rejected,1);
        assert_eq!(result.exclusions_checked,1);
    }

    #[test]
    fn a_structured_similarity_reference_is_not_its_own_recommendation() {
        let a="Copper Atlas is a melodic death metal band. Copper Atlas plays atmospheric melodic death metal.";
        let b="Silver Harbor is a melodic death metal band. Silver Harbor plays atmospheric melodic death metal.";
        let mut alternative=item("Silver Harbor",
            "Silver Harbor is a melodic death metal band.",
            "Silver Harbor plays atmospheric melodic death metal.", None);
        alternative.source=2;
        let reference=item("Copper Atlas",
            "Copper Atlas is a melodic death metal band.",
            "Copper Atlas plays atmospheric melodic death metal.", None);
        let task=ResearchTask{kind:ResearchKind::Discover,
            details:vec!["similar to Copper Atlas".into(),"melodic death metal".into()],
            ..Default::default()};
        let result=screen_task("Recommend a melodic death metal band like Copper Atlas.",
            &task,vec![reference,alternative],&[src(a),src(b)]);
        assert_eq!(result.approved.len(),1);
        assert_eq!(result.approved[0].title,"Silver Harbor");
        assert_eq!(result.exclusions_checked,1);
    }

    #[test]
    fn copied_search_query_limit_is_not_allowed_when_the_user_never_requested_it() {
        let candidate=item("Pet Shop of Horrors",
            "Pet Shop of Horrors has 4 episodes.",
            "Pet Shop of Horrors is a short horror anthology series.",None);
        let sourced="Pet Shop of Horrors has 4 episodes. Pet Shop of Horrors is a short horror anthology series.";
        let forged=HardRequirement{quote:"under 24 episodes".into(),
            relation:"lt".into(),limit:24.0,unit:"episodes".into()};
        let result=screen("I'm running out of short horror anime to watch",
            vec![forged],vec![candidate],&[src(sourced)]);
        assert_eq!(result.approved.len(), 1);
        assert!(result.requirements.is_empty());
        assert_eq!(result.ignored_requirements[0].quote, "under 24 episodes");
    }

    #[test]
    fn movie_runtime_and_director_and_studio_roles_are_screened_together() {
        let content="Lantern Harbor runs for 95 minutes. Lantern Harbor was directed by June Vale. Lantern Harbor production studio: North Shore Pictures. Lantern Harbor is an atmospheric horror film.";
        let mut candidate=item("Lantern Harbor",
            "Lantern Harbor was directed by June Vale.",
            "Lantern Harbor is an atmospheric horror film.",
            Some(Measurement{source:1,value:95.0,unit:"minutes".into(),
                quote:"Lantern Harbor runs for 95 minutes.".into()}));
        candidate.creator="June Vale".into();
        candidate.relations=vec![
            attribution::ProposedRelation{source:1,role:"director".into(),
                name:"June Vale".into(),
                quote:"Lantern Harbor was directed by June Vale.".into()},
            attribution::ProposedRelation{source:1,role:"studio".into(),
                name:"North Shore Pictures".into(),
                quote:"Lantern Harbor production studio: North Shore Pictures.".into()}
        ];
        let limit=HardRequirement{quote:"under two hours".into(),
            relation:"lt".into(),limit:2.0,unit:"hours".into()};
        let good=screen("a horror movie under two hours",vec![limit],
            vec![candidate.clone()],&[src(content)]);
        assert_eq!(good.approved.len(),1);
        assert_eq!(good.relations_checked,2);
        assert_eq!(good.approved[0].measurements[0].value,95.0);
        candidate.relations[1].role = "distributor".into();
        let task = ResearchTask {
            kind: ResearchKind::Discover,
            roles: vec!["director".into(), "studio".into()],
            ..Default::default()
        };
        let bad = screen_task("an atmospheric film and its director and studio",
            &task, vec![candidate], &[src(content)]);
        assert!(bad.approved.is_empty(), "A missing requested credit cannot pass");
        assert_eq!(bad.followup_query.as_deref(), Some("\"Lantern Harbor\" production company"));
    }

    #[test]
    fn verification_reports_supported_details_only_for_the_selected_work() {
        let content = "Lantern Harbor was directed by June Vale. Quiet Orchard production studio: North Shore Pictures.";
        let mut selected = item("Lantern Harbor", "Lantern Harbor was directed by June Vale.", "", None);
        selected.relations.push(attribution::ProposedRelation {
            source: 1, role: "director".into(), name: "June Vale".into(),
            quote: "Lantern Harbor was directed by June Vale.".into(),
        });
        let mut other = item("Quiet Orchard", "Quiet Orchard production studio: North Shore Pictures.", "", None);
        other.relations.push(attribution::ProposedRelation {
            source: 1, role: "studio".into(), name: "North Shore Pictures".into(),
            quote: "Quiet Orchard production studio: North Shore Pictures.".into(),
        });
        let task = ResearchTask {
            kind: ResearchKind::Verify, subject: Some("Lantern Harbor".into()),
            roles: vec!["director".into(), "studio".into()], ..Default::default()
        };
        let outcome = screen_task("Check its director and studio.", &task, vec![other, selected], &[src(content)]);
        assert_eq!(outcome.approved.len(), 1);
        let candidate = &outcome.approved[0];
        assert_eq!(candidate.title, "Lantern Harbor");
        assert_eq!(candidate.relations[0].name, "June Vale");
        assert_eq!(candidate.missing_details, ["production company"]);
    }

    #[test]
    fn relational_author_evidence_is_required_before_naming_an_author() {
        let source="The novel The Hollow Places was written by T. Kingfisher. The Hollow Places features an eerie setting.";
        let mut candidate=item("The Hollow Places",
            "The novel The Hollow Places was written by T. Kingfisher.",
            "The Hollow Places features an eerie setting.",None);
        candidate.creator="T. Kingfisher".into();
        candidate.relations=vec![attribution::ProposedRelation{
            role:"author".into(),name:"T. Kingfisher".into(),
            source:1,quote:"The novel The Hollow Places was written by T. Kingfisher.".into()}];
        let r=screen("books with eerie settings",vec![],vec![candidate],&[src(source)]);
        assert_eq!(r.approved.len(),1);
        assert_eq!(r.relations_checked,1);
    }

    #[test]
    fn a_creator_not_appearing_with_the_title_is_rejected() {
        let text="The book A Short Stay in Hell is a novella. A Short Stay in Hell explores a very large mysterious library.";
        let mut item=item("A Short Stay in Hell",
            "The book A Short Stay in Hell is a novella.",
            "A Short Stay in Hell explores a very large mysterious library.",None);
        item.creator="An Invented Author".into();
        assert!(screen("short horror books",vec![],vec![item],&[src(text)]).approved.is_empty());
    }
}
