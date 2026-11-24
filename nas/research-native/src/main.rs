// Headless adapter: the validators are compiled from their original desktop
// source paths. No Tauri, network, credentials, database or filesystem API.
#[path = "../../../src-tauri/src/source_record.rs"]
mod source_record;
mod web_search { pub use crate::source_record::SearchResult; }
#[path = "../../../src-tauri/src/quantities.rs"]
mod quantities;
#[path = "../../../src-tauri/src/attribution.rs"]
mod attribution;
#[path = "../../../src-tauri/src/recommendation_gate.rs"]
mod recommendation_gate;
#[path = "../../../src-tauri/src/cloud_evidence.rs"]
mod cloud_evidence;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read};
use web_search::SearchResult;
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Input {
    question: String,
    sources: Vec<SearchResult>,
    task: Option<recommendation_gate::ResearchTask>,
    #[serde(default)]
    suggestions: Vec<recommendation_gate::Suggestion>,
    #[serde(default)]
    passages: Vec<cloud_evidence::ProposedPassage>,
}
fn evaluate(input: Input) -> Value {
    if let Some(task)=input.task {
        if !task.uses_fact_evidence() {
            let gate=recommendation_gate::screen_task(&input.question,&task,input.suggestions,&input.sources);
            return json!({"kind":"recommendation","approved":gate.approved,"rejected":gate.rejected,
                "requirements":gate.requirements,"ignoredRequirements":gate.ignored_requirements,
                "rejectedDetails":gate.rejected_details,"relationsChecked":gate.relations_checked,
                "exclusionsChecked":gate.exclusions_checked});
        }
    }
    let (verified,rejected)=cloud_evidence::verified_passages(&input.passages,&input.sources);
    let chosen=cloud_evidence::displayable_passages(&verified,&input.sources);
    json!({"kind":"passages","accepted":chosen.len(),"rejected":rejected,
        "passages":chosen.iter().map(|p|json!({"source":p.source,"quote":p.quote})).collect::<Vec<_>>(),
        "text":cloud_evidence::render_grounded_with_tone(&verified,&input.sources,Some("neutral"))})
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut body=String::new();
    io::stdin().take(512_001).read_to_string(&mut body)?;
    if body.len()>512_000 { return Err("Input exceeds limit".into()); }
    let input:Input=serde_json::from_str(&body)?;
    if input.sources.len()>8 || input.suggestions.len()>12 || input.passages.len()>5 {
        return Err("Input exceeds item limits".into());
    }
    println!("{}",evaluate(input));
    Ok(())
}
