//! Thin HTTP client for the two endpoints the desktop agent uses.

use crate::parser::Sample;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct ApiClient {
    pub base_url: String,
    pub http: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent(concat!("cap-agent/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("reqwest build"),
        }
    }

    pub async fn enroll(&self, req: &EnrollRequest) -> Result<EnrollResponse> {
        let url = format!("{}/v1/auth/devices", self.base_url.trim_end_matches('/'));
        let res = self.http.post(&url).json(req).send().await?;
        if !res.status().is_success() {
            return Err(anyhow!(
                "enroll {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            ));
        }
        Ok(res.json().await?)
    }

    pub async fn ingest(&self, token: &str, body: &IngestBody<'_>) -> Result<()> {
        let url = format!("{}/v1/agent/ingest", self.base_url.trim_end_matches('/'));
        let res = self
            .http
            .post(&url)
            .bearer_auth(token)
            .json(body)
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(anyhow!(
                "ingest {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            ));
        }
        Ok(())
    }
}

#[derive(Serialize)]
pub struct EnrollRequest {
    pub platform: &'static str,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pairing_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
}

#[derive(Deserialize)]
pub struct EnrollResponse {
    pub device_id: String,
    pub token: String,
    pub expires_at: String,
}

#[derive(Serialize)]
pub struct IngestBody<'a> {
    pub agent_id: &'a str,
    pub samples: &'a [Sample],
}
