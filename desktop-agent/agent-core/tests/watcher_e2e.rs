//! End-to-end test for the Claude Code log watcher.
//!
//! Writes JSONL lines into a temp directory, asserts that:
//! - usage lines are emitted as `Sample`s with the right counters
//! - non-usage lines (raw user prompts) never emit
//! - the watcher resumes from the persisted offset on restart instead of
//!   re-emitting the whole file

use pulsewatch_agent_core::config::{load_state, save_state, WatcherState};
use pulsewatch_agent_core::watcher::start;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

#[tokio::test(flavor = "multi_thread")]
async fn watcher_emits_only_counters_and_resumes() {
    let dir = tempfile::tempdir().unwrap();
    let claude_root = dir.path().join("projects");
    std::fs::create_dir_all(&claude_root).unwrap();
    let state_path = dir.path().join("state.json");

    // Pre-write a few lines so the initial sweep picks them up.
    let log_path = claude_root.join("p").join("session1.jsonl");
    std::fs::create_dir_all(log_path.parent().unwrap()).unwrap();
    {
        let mut f = tokio::fs::File::create(&log_path).await.unwrap();
        // line 1: assistant usage
        f.write_all(b"{\"type\":\"assistant\",\"timestamp\":\"2026-05-06T00:00:00Z\",\"message\":{\"model\":\"claude-sonnet\",\"usage\":{\"input_tokens\":10,\"output_tokens\":20,\"cache_read_input_tokens\":0,\"cache_creation_input_tokens\":0}}}\n").await.unwrap();
        // line 2: raw user prompt — must NOT emit
        f.write_all(b"{\"type\":\"user\",\"timestamp\":\"2026-05-06T00:00:01Z\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"my secret prompt\"}]}}\n").await.unwrap();
        // line 3: another assistant usage
        f.write_all(b"{\"timestamp\":\"2026-05-06T00:00:02Z\",\"message\":{\"model\":\"claude-sonnet\",\"usage\":{\"input_tokens\":1,\"output_tokens\":2}}}\n").await.unwrap();
        f.flush().await.unwrap();
    }

    let state = Arc::new(Mutex::new(WatcherState::default()));
    let mut watcher = start(
        state_path.clone(),
        state.clone(),
        vec![claude_root.clone()],
        Vec::new(),
    )
    .unwrap();

    // Collect what arrives within a short window.
    let mut samples = Vec::new();
    while let Ok(Some(s)) =
        tokio::time::timeout(Duration::from_secs(2), watcher.samples.recv()).await
    {
        samples.push(s);
        if samples.len() >= 2 {
            break;
        }
    }

    assert_eq!(
        samples.len(),
        2,
        "expected 2 usage rows from initial sweep, got {samples:?}"
    );
    assert_eq!(samples[0].input_tokens + samples[0].output_tokens, 30);
    assert_eq!(samples[1].input_tokens + samples[1].output_tokens, 3);
    assert!(samples
        .iter()
        .all(|s| s.input_tokens > 0 || s.output_tokens > 0));

    // Persist offset and tear down the first watcher instance.
    let saved_state = state.lock().unwrap().clone();
    save_state(&state_path, &saved_state).unwrap();
    drop(watcher);

    // Append one more line and start a new watcher. It must NOT re-emit the
    // first three lines.
    {
        let mut f = tokio::fs::OpenOptions::new()
            .append(true)
            .open(&log_path)
            .await
            .unwrap();
        f.write_all(b"{\"timestamp\":\"2026-05-06T00:00:03Z\",\"message\":{\"model\":\"claude\",\"usage\":{\"input_tokens\":7,\"output_tokens\":11}}}\n").await.unwrap();
        f.flush().await.unwrap();
    }

    let resumed_state = Arc::new(Mutex::new(load_state(&state_path).unwrap()));
    let mut watcher2 = start(
        state_path.clone(),
        resumed_state,
        vec![claude_root],
        Vec::new(),
    )
    .unwrap();

    let mut second = Vec::new();
    while let Ok(Some(s)) =
        tokio::time::timeout(Duration::from_secs(2), watcher2.samples.recv()).await
    {
        second.push(s);
        if !second.is_empty() {
            break;
        }
    }
    assert_eq!(
        second.len(),
        1,
        "should only emit the appended line, got {second:?}"
    );
    assert_eq!(second[0].input_tokens + second[0].output_tokens, 18);
}
