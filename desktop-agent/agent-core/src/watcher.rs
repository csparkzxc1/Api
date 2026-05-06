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
use anyhow::Result;
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
    claude_roots: Vec<PathBuf>,
    codex_roots: Vec<PathBuf>,
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

    for p in claude_roots.iter().chain(codex_roots.iter()) {
        let _ = std::fs::create_dir_all(p);
        if let Err(e) = debouncer.watcher().watch(p, RecursiveMode::Recursive) {
            tracing::warn!(path = %p.display(), error = %e, "watch failed; skipping");
        }
    }

    // Initial sweep of any existing files so we don't miss usage written
    // before the watcher attached. We do the sweep synchronously *before*
    // returning the Watcher so the caller can be sure that any subsequent
    // file events read offsets that already account for the sweep.
    let mut sweep_state = state.lock().unwrap().clone();
    for root in &claude_roots {
        scan_sync(root, Source::ClaudeCode, &mut sweep_state, &sample_tx)?;
    }
    for root in &codex_roots {
        scan_sync(root, Source::CodexCli, &mut sweep_state, &sample_tx)?;
    }
    {
        let mut s = state.lock().unwrap();
        *s = sweep_state.clone();
        let _ = save_state(&state_path, &s);
    }

    // Ongoing watcher loop.
    let claude_set = claude_roots.clone();
    let codex_set = codex_roots.clone();
    tokio::spawn(async move {
        while let Some(events) = event_rx.recv().await {
            for ev in events {
                for path in ev.paths.iter() {
                    if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                        continue;
                    }
                    let source = if claude_set.iter().any(|r| path.starts_with(r)) {
                        Source::ClaudeCode
                    } else if codex_set.iter().any(|r| path.starts_with(r)) {
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
///
/// Uses `walkdir` rather than `glob` so the recursion behaves identically on
/// Windows (where `Path::display()` would emit backslashes that glob's
/// pattern-matcher handles inconsistently).
fn scan_sync(
    root: &Path,
    source: Source,
    state: &mut WatcherState,
    tx: &mpsc::Sender<Sample>,
) -> Result<()> {
    if !root.exists() {
        return Ok(());
    }
    for entry in walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        let path = entry.path().to_path_buf();
        let key = path.to_string_lossy().into_owned();
        let offset = state.offsets.get(&key).copied().unwrap_or(0);
        if let Ok(new_offset) = read_from_sync(&path, offset, source.clone(), tx) {
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
