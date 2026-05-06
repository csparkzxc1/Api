//! Per-machine config and watcher state. Persisted under `dirs::data_local_dir()`.
//!
//! The state file stores read offsets per log path so a restart resumes where
//! it left off. It is intentionally not encrypted — these are byte offsets
//! into local files, not secrets.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WatcherState {
    /// Map of absolute log path → last byte offset processed.
    pub offsets: HashMap<String, u64>,
}

pub struct Paths {
    pub state_file: PathBuf,
    pub claude_root: Option<PathBuf>,
    pub codex_root: Option<PathBuf>,
}

impl Paths {
    pub fn discover() -> Self {
        let local = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
        let state_file = local.join("pulsewatch-agent").join("state.json");
        let home = dirs::home_dir();
        let claude_root = home.as_ref().map(|h| h.join(".claude").join("projects"));
        let codex_root = home.as_ref().map(|h| h.join(".codex").join("sessions"));
        Self { state_file, claude_root, codex_root }
    }
}

pub fn load_state(path: &Path) -> Result<WatcherState> {
    if !path.exists() { return Ok(WatcherState::default()); }
    let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

pub fn save_state(path: &Path, state: &WatcherState) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(state)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
