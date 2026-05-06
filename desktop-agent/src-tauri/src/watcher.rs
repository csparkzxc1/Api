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
    new_debouncer, notify::RecursiveMode, DebouncedEvent, DebounceEventResult,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
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
    // before the watcher attached.
    let claude_clone = claude_root.clone();
    let codex_clone = codex_root.clone();
    let state_clone = state.clone();
    let state_path_clone = state_path.clone();
    let sample_tx_initial = sample_tx.clone();
    tokio::spawn(async move {
        let mut cache: HashMap<PathBuf, u64> = HashMap::new();
        if let Some(root) = claude_clone {
            scan(&root, Source::ClaudeCode, &state_clone, &mut cache, &sample_tx_initial).await;
        }
        if let Some(root) = codex_clone {
            scan(&root, Source::CodexCli, &state_clone, &mut cache, &sample_tx_initial).await;
        }
        if !cache.is_empty() {
            let mut s = state_clone.lock().unwrap();
            for (p, off) in cache.drain() {
                s.offsets.insert(p.to_string_lossy().into_owned(), off);
            }
            let _ = save_state(&state_path_clone, &s);
        }
    });

    // Ongoing watcher loop.
    let claude_root2 = claude_root.clone();
    let codex_root2 = codex_root.clone();
    tokio::spawn(async move {
        while let Some(events) = event_rx.recv().await {
            for ev in events {
                for path in ev.paths.iter() {
                    if path.extension().and_then(|s| s.to_str()) != Some("jsonl") { continue; }
                    let source = if claude_root2.as_ref().is_some_and(|r| path.starts_with(r)) {
                        Source::ClaudeCode
                    } else if codex_root2.as_ref().is_some_and(|r| path.starts_with(r)) {
                        Source::CodexCli
                    } else { continue; };
                    if let Err(e) = tail(path, source.clone(), &state, &state_path, &sample_tx).await {
                        tracing::warn!(?path, error = %e, "tail failed");
                    }
                }
            }
        }
    });

    Ok(Watcher { samples: sample_rx, _debouncer: debouncer })
}

async fn scan(
    root: &Path,
    source: Source,
    state: &Arc<Mutex<WatcherState>>,
    cache: &mut HashMap<PathBuf, u64>,
    tx: &mpsc::Sender<Sample>,
) {
    let pattern = format!("{}/**/*.jsonl", root.display());
    let glob = match glob::glob(&pattern) {
        Ok(g) => g,
        Err(_) => return,
    };
    for entry in glob.flatten() {
        let offset = state
            .lock()
            .unwrap()
            .offsets
            .get(&entry.to_string_lossy().into_owned())
            .copied()
            .unwrap_or(0);
        if let Ok(new_offset) = read_from(&entry, offset, source.clone(), tx).await {
            cache.insert(entry, new_offset);
        }
    }
}

async fn tail(
    path: &Path,
    source: Source,
    state: &Arc<Mutex<WatcherState>>,
    state_path: &Path,
    tx: &mpsc::Sender<Sample>,
) -> Result<()> {
    let key = path.to_string_lossy().into_owned();
    let offset = state.lock().unwrap().offsets.get(&key).copied().unwrap_or(0);
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
    let mut file = tokio::fs::File::open(path).await?;
    let len = file.metadata().await?.len();
    if len < offset {
        // file rotated or truncated; restart from 0
        file.seek(std::io::SeekFrom::Start(0)).await?;
    } else {
        file.seek(std::io::SeekFrom::Start(offset)).await?;
    }
    let mut buf = Vec::with_capacity((len.saturating_sub(offset)).min(1 << 20) as usize);
    file.read_to_end(&mut buf).await?;
    let consumed = buf.len() as u64;
    let new_offset = if len < offset { consumed } else { offset + consumed };

    // Drop a partial trailing line so we don't half-parse during a write.
    let raw = std::str::from_utf8(&buf).unwrap_or("");
    let (text, partial_bytes): (&str, u64) = match raw.rfind('\n') {
        Some(last_nl) => {
            let trimmed = &raw[..=last_nl];
            (trimmed, consumed - trimmed.len() as u64)
        }
        None if raw.is_empty() => ("", 0),
        // No newline yet — wait for one.
        None => return Ok(offset),
    };

    for line in text.lines() {
        let sample = match source {
            Source::ClaudeCode => claude_code::parse_line(line),
            Source::CodexCli => codex::parse_line(line),
        };
        if let Some(s) = sample {
            let _ = tx.send(s).await;
        }
    }

    Ok(new_offset - partial_bytes)
}
