use serde_json::{Value, json};

use crate::utils::read_credentials;

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

/// Thin GraphQL client for the Linear API.
///
/// Rust counterpart of `LinearService` from `@talosjs/linear`: it wraps a
/// personal API token and exposes typed helpers for the operations the CLI
/// needs.
pub struct LinearClient {
    token: String,
}

impl LinearClient {
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            token: token.into(),
        }
    }

    /// Build a client from the `linear.yml` credentials saved by
    /// `talos credentials:create --provider=linear`.
    pub fn from_credentials() -> Option<Self> {
        let profile = read_credentials("linear.yml")?;
        let token = profile
            .into_iter()
            .find_map(|(key, value)| (key == "token").then_some(value))?;
        Some(Self::new(token))
    }

    /// Execute a GraphQL query/mutation and return the `data` payload.
    ///
    /// Returns `None` on transport failure or when the response carries
    /// GraphQL `errors`.
    pub fn request(&self, query: &str, variables: Value) -> Option<Value> {
        let body = json!({ "query": query, "variables": variables });
        let response: Value = ureq::post(LINEAR_API_URL)
            .header("Authorization", &self.token)
            .header("Content-Type", "application/json")
            .send_json(body)
            .ok()?
            .into_body()
            .read_json()
            .ok()?;
        if response.get("errors").is_some() {
            return None;
        }
        response.get("data").cloned()
    }
}
