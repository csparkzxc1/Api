//! Watches Claude Code / Codex JSONL log roots and emits parsed `Sample`s.
//!
//! Implementation notes:
//! - We tail each `.jsonl` file from a persisted byte offset. When a file is
//!   appended (the only mutation pattern these tools use) we read just the
//!   new bytes, split into lines, and run the strict parser.
//! - File creation events trigger an initial read with offset = 0.
//! - We never read sibling files (e.g. `.json` index files) — only `.jsonl`.

use crate::config::{save_state, WatcherState};
use crate::parser::{claude_code, codex, Sample, Source};
use anyhow::{Context, Result};
use notify_debouncer_full::{
    new_debouncer,
    notify::{RecursiveMode, Watcher as _},
    DebounceEventResult, DebouncedEvent,
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

pub struct Watcher {
    pub samples: mpsc::Receiver<Sample>,
    _debouncer: notify_debouncer_full::Debouncer<
        notify_debouncer_full::notify::RecommendedWatcher,
        notify_debouncer_full::FileIdMap,
    >,
}

pub fn start(
    state_path: PathBuf,
    state: Arc<Mutex<WatcherState>>,
    claude_root: Option<PathBuf>,
    codex_root: Option<PathBuf>,
) -> Result<Watcher> {
    let (sample_tx, sample_rx) = mpsc::channel::<Sample>(1024);
    let (event_tx, mut event_rx) = mpsc::channel::<Vec<DebouncedEvent>>(64);

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let _ = event_tx.blocking_send(events);
            }
        },
    )?;

    if let Some(p) = claude_root.as_ref() {
        let _ = std::fs::create_dir_all(p);
        debouncer
            .watcher()
            .watch(p, RecursiveMode::Recursive)
            .context("watch claude root")?;
    }
    if let Some(p) = codex_root.as_ref() {
        let _ = std::fs::create_dir_all(p);
        debouncer
            .watcher()
            .watch(p, RecursiveMode::Recursive)
            .context("watch codex root")?;
    }

    // Initial sweep of any existing files so we don't miss usage written
    // before the watcher attached. We do the sweep synchronously *before*
    // returning the Watcher so the caller can be sure that any subsequent
    // file events read offsets that already account for the sweep.
    let mut sweep_state = state.lock().unwrap().clone();
    if let Some(root) = claude_root.as_ref() {
        scan_sync(root, Source::ClaudeCode, &mut sweep_state, &sample_tx)?;
    }
    if let Some(root) = codex_root.as_ref() {
        scan_sync(root, Source::CodexCli, &mut sweep_state, &sample_tx)?;
    }
    {
        let mut s = state.lock().unwrap();
        *s = sweep_state.clone();
        let _ = save_state(&state_path, &s);
    }

    // Ongoing watcher loop.
    let claude_root2 = claude_root.clone();
    let codex_root2 = codex_root.clone();
    tokio::spawn(async move {
        while let Some(events) = event_rx.recv().await {
            for ev in events {
                for path in ev.paths.iter() {
                    if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                        continue;
                    }
                    let source = if claude_root2.as_ref().is_some_and(|r| path.starts_with(r)) {
                        Source::ClaudeCode
                    } else if codex_root2.as_ref().is_some_and(|r| path.starts_with(r)) {
                        Source::CodexCli
                    } else {
                        continue;
                    };
                    if let Err(e) =
                        tail(path, source.clone(), &state, &state_path, &sample_tx).await
                    {
                        tracing::warn!(?path, error = %e, "tail failed");
                    }
                }
            }
        }
    });

    Ok(Watcher {
        samples: sample_rx,
        _debouncer: debouncer,
    })
}

/// Synchronous sweep used during start-up. Reads each `.jsonl` file from its
/// last known offset, emits parsed samples, and writes the new offset back
/// into `state` before any async file event has a chance to fire.
fn scan_sync(
    root: &Path,
    source: Source,
    state: &mut WatcherState,
    tx: &mpsc::Sender<Sample>,
) -> Result<()> {
    let pattern = format!("{}/**/*.jsonl", root.display());
    let glob = match glob::glob(&pattern) {
        Ok(g) => g,
        Err(_) => return Ok(()),
    };
    for entry in glob.flatten() {
        let key = entry.to_string_lossy().into_owned();
        let offset = state.offsets.get(&key).copied().unwrap_or(0);
        if let Ok(new_offset) = read_from_sync(&entry, offset, source.clone(), tx) {
            state.offsets.insert(key, new_offset);
        }
    }
    Ok(())
}

async fn tail(
    path: &Path,
    source: Source,
    state: &Arc<Mutex<WatcherState>>,
    state_path: &Path,
    tx: &mpsc::Sender<Sample>,
) -> Result<()> {
    let key = path.to_string_lossy().into_owned();
    let offset = state
        .lock()
        .unwrap()
        .offsets
        .get(&key)
        .copied()
        .unwrap_or(0);
    let new_offset = read_from(path, offset, source, tx).await?;
    let mut s = state.lock().unwrap();
    s.offsets.insert(key, new_offset);
    save_state(state_path, &s)?;
    Ok(())
}

async fn read_from(
    path: &Path,
    offset: u64,
    source: Source,
    tx: &mpsc::Sender<Sample>,
) -> Result<u64> {
    let bytes = tokio::fs::read(path).await?;
    let (samples, new_offset) = parse_chunk(&bytes, offset, source);
    for s in samples {
        let _ = tx.send(s).await;
    }
    Ok(new_offset)
}

fn read_from_sync(
    path: &Path,
    offset: u64,
    source: Source,
    tx: &mpsc::Sender<Sample>,
) -> Result<u64> {
    let bytes = std::fs::read(path)?;
    let (samples, new_offset) = parse_chunk(&bytes, offset, source);
    for s in samples {
        // Sync send — bounded channel; if full we drop the rest, the next file
        // event will pick them up on rescan.
        if tx.try_send(s).is_err() {
            break;
        }
    }
    Ok(new_offset)
}

fn parse_chunk(bytes: &[u8], offset: u64, source: Source) -> (Vec<Sample>, u64) {
    let len = bytes.len() as u64;
    let from = if len < offset { 0 } else { offset as usize };
    let slice = &bytes[from..];
    let consumed = slice.len() as u64;

    // Drop a partial trailing line so we don't half-parse during a write.
    let raw = std::str::from_utf8(slice).unwrap_or("");
    let (text, partial_bytes): (&str, u64) = match raw.rfind('\n') {
        Some(last_nl) => {
            let trimmed = &raw[..=last_nl];
            (trimmed, consumed - trimmed.len() as u64)
        }
        None if raw.is_empty() => ("", 0),
        None => return (Vec::new(), offset),
    };

    let mut samples = Vec::new();
    for line in text.lines() {
        let sample = match source {
            Source::ClaudeCode => claude_code::parse_line(line),
            Source::CodexCli => codex::parse_line(line),
        };
        if let Some(s) = sample {
            samples.push(s);
        }
    }

    let base = if len < offset { 0 } else { offset };
    (samples, base + consumed - partial_bytes)
}
