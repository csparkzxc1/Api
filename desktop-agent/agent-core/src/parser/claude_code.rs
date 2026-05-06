//! Parser for `~/.claude/projects/<project>/sessions/<session>.jsonl`.
//!
//! Lines look roughly like:
//! `{"type":"assistant","timestamp":"...","message":{"model":"claude-...","usage":{"input_tokens":N,"output_tokens":N,"cache_read_input_tokens":N,"cache_creation_input_tokens":N}}}`
//!
//! We only consume the `usage` numbers, the model id, and the timestamp.
//! Everything else (text content, tool inputs, file paths) is ignored.

use super::{Sample, Source};
use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Deserialize)]
struct Line<'a> {
    #[serde(borrow)]
    timestamp: Option<&'a str>,
    message: Option<Message<'a>>,
}

#[derive(Deserialize)]
struct Message<'a> {
    #[serde(borrow)]
    model: Option<&'a str>,
    usage: Option<Usage>,
}

#[derive(Deserialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
}

pub fn parse_line(line: &str) -> Option<Sample> {
    if line.trim().is_empty() {
        return None;
    }
    let parsed: Line = serde_json::from_str(line).ok()?;
    let usage = parsed.message.as_ref().and_then(|m| m.usage.as_ref())?;
    let t: DateTime<Utc> = parsed
        .timestamp
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    Sample {
        t,
        source: Source::ClaudeCode,
        model: parsed
            .message
            .as_ref()
            .and_then(|m| m.model)
            .map(|s| s.to_string()),
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        cache_write_tokens: usage.cache_creation_input_tokens,
        cost_usd: 0.0,
    }
    .sanitise()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_assistant_usage() {
        let line = r#"{"type":"assistant","timestamp":"2026-05-06T08:30:00Z","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":120,"output_tokens":340,"cache_read_input_tokens":2000,"cache_creation_input_tokens":0}}}"#;
        let s = parse_line(line).expect("sample");
        assert_eq!(s.input_tokens, 120);
        assert_eq!(s.output_tokens, 340);
        assert_eq!(s.cache_read_tokens, 2000);
        assert_eq!(s.model.as_deref(), Some("claude-sonnet-4-6"));
    }

    #[test]
    fn ignores_lines_without_usage() {
        let line = r#"{"type":"user","timestamp":"2026-05-06T08:30:00Z","message":{"content":[{"type":"text","text":"secret prompt"}]}}"#;
        assert!(parse_line(line).is_none());
    }

    #[test]
    fn ignores_zero_only_usage() {
        let line = r#"{"timestamp":"2026-05-06T08:30:00Z","message":{"usage":{"input_tokens":0,"output_tokens":0}}}"#;
        assert!(parse_line(line).is_none());
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_line("not json").is_none());
    }
}
