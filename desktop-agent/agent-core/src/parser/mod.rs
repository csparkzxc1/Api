//! Strict, append-only parsing of local AI-CLI logs.
//!
//! The validator below is the only path data takes from disk to the network.
//! `Sample` carries numeric counters, a model id (string but never PII), and a
//! timestamp. **No prompt text, no completion text, no tool inputs, no file
//! paths, no project names.** The uploader serialises `Sample` directly, so
//! anything not on the struct cannot leak.

use chrono::{DateTime, Utc};
use serde::Serialize;

pub mod claude_code;
pub mod codex;

#[derive(Debug, Clone, PartialEq)]
pub enum Source {
    ClaudeCode,
    CodexCli,
}

impl Source {
    pub fn as_wire(&self) -> &'static str {
        match self {
            Source::ClaudeCode => "claude_code",
            Source::CodexCli => "codex_cli",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Sample {
    pub t: DateTime<Utc>,
    #[serde(serialize_with = "serialize_source")]
    pub source: Source,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "is_zero")]
    pub cache_read_tokens: u64,
    #[serde(skip_serializing_if = "is_zero")]
    pub cache_write_tokens: u64,
    #[serde(skip_serializing_if = "is_zero_f64")]
    pub cost_usd: f64,
}

fn serialize_source<S: serde::Serializer>(s: &Source, ser: S) -> Result<S::Ok, S::Error> {
    ser.serialize_str(s.as_wire())
}

fn is_zero(v: &u64) -> bool {
    *v == 0
}
fn is_zero_f64(v: &f64) -> bool {
    *v == 0.0
}

impl Sample {
    /// Models accept arbitrary strings from the log; cap and sanitise before
    /// shipping so we never relay anything weird.
    pub fn sanitise(mut self) -> Option<Self> {
        if let Some(m) = &self.model {
            if m.is_empty() || m.len() > 128 || m.chars().any(|c| c.is_control()) {
                self.model = None;
            }
        }
        if self.input_tokens == 0
            && self.output_tokens == 0
            && self.cache_read_tokens == 0
            && self.cache_write_tokens == 0
            && self.cost_usd == 0.0
        {
            return None;
        }
        Some(self)
    }
}
