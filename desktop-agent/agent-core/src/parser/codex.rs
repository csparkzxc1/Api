//! Parser for `~/.codex/sessions/<session>.jsonl`.
//!
//! The Codex CLI writes events similar to:
//! `{"timestamp":"...","kind":"completion","model":"gpt-...","usage":{"prompt_tokens":N,"completion_tokens":N,"cached_tokens":N},"cost_usd":0.0123}`
//!
//! As with the Claude Code parser, only counters and the model id are read.

use super::{Sample, Source};
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Deserialize)]
struct Line<'a> {
    #[serde(borrow)]
    timestamp: Option<&'a str>,
    #[serde(borrow)]
    model: Option<&'a str>,
    usage: Option<Usage>,
    #[serde(default)]
    cost_usd: Option<f64>,
}

#[derive(Deserialize, Default)]
struct Usage {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
    #[serde(default)]
    cached_tokens: u64,
}

pub fn parse_line(line: &str) -> Option<Sample> {
    if line.trim().is_empty() {
        return None;
    }
    let parsed: Line = serde_json::from_str(line).ok()?;
    let usage = parsed.usage.as_ref()?;
    let t: DateTime<Utc> = parsed
        .timestamp
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    Sample {
        t,
        source: Source::CodexCli,
        model: parsed.model.map(|s| s.to_string()),
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        cache_read_tokens: usage.cached_tokens,
        cache_write_tokens: 0,
        cost_usd: parsed.cost_usd.unwrap_or(0.0).max(0.0),
    }
    .sanitise()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_completion() {
        let line = r#"{"timestamp":"2026-05-06T09:00:00Z","model":"gpt-5","usage":{"prompt_tokens":50,"completion_tokens":120,"cached_tokens":10},"cost_usd":0.0042}"#;
        let s = parse_line(line).expect("sample");
        assert_eq!(s.input_tokens, 50);
        assert_eq!(s.output_tokens, 120);
        assert_eq!(s.cache_read_tokens, 10);
        assert!((s.cost_usd - 0.0042).abs() < 1e-9);
    }

    #[test]
    fn drops_negative_cost() {
        let line = r#"{"usage":{"prompt_tokens":1,"completion_tokens":1},"cost_usd":-1.0}"#;
        let s = parse_line(line).expect("sample");
        assert_eq!(s.cost_usd, 0.0);
    }
}
