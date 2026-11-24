use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub engine: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_date: Option<String>,
}
