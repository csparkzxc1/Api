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
    /// All Claude Code log roots to watch. Multiple supported so a single
    /// agent can cover both Windows-native and WSL distros at once.
    pub claude_roots: Vec<PathBuf>,
    pub codex_roots: Vec<PathBuf>,
}

impl Paths {
    pub fn discover() -> Self {
        let local = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
        let state_file = local.join("pulsewatch-agent").join("state.json");
        Self {
            state_file,
            claude_roots: discover_roots("PULSEWATCH_CLAUDE_ROOT", ".claude/projects"),
            codex_roots: discover_roots("PULSEWATCH_CODEX_ROOT", ".codex/sessions"),
        }
    }
}

fn discover_roots(env_key: &str, suffix: &str) -> Vec<PathBuf> {
    if let Ok(raw) = std::env::var(env_key) {
        let sep = if cfg!(windows) { ';' } else { ':' };
        return raw
            .split(sep)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .collect();
    }

    let mut out = Vec::new();
    if let Some(home) = dirs::home_dir() {
        let mut p = home;
        for part in suffix.split('/') {
            p.push(part);
        }
        out.push(p);
    }

    // On Windows we also probe `\\wsl.localhost\<distro>\home\<user>\<suffix>`
    // for any running WSL distro, since Claude Code today runs in WSL on Windows.
    #[cfg(windows)]
    {
        out.extend(wsl_candidates(suffix));
    }

    out
}

#[cfg(windows)]
fn wsl_candidates(suffix: &str) -> Vec<PathBuf> {
    use std::process::Command;

    // `wsl --list --quiet` returns one distro per line, UTF-16LE on most
    // Windows installs. We tolerate either encoding so a misconfigured WSL
    // doesn't bring the agent down.
    let output = match Command::new("wsl").args(["--list", "--quiet"]).output() {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let raw = if output.stdout.iter().any(|b| *b == 0) {
        // UTF-16LE
        let pairs: Vec<u16> = output
            .stdout
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&pairs)
    } else {
        String::from_utf8_lossy(&output.stdout).into_owned()
    };

    let mut out = Vec::new();
    for distro in raw.lines().map(str::trim).filter(|s| !s.is_empty()) {
        // Probe likely $HOME paths inside the distro. We can't know the user's
        // login name without invoking wsl again; trying both the running-user
        // env and a wildcard-free guess covers the common case.
        if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
            let mut p = PathBuf::from(format!(r"\\wsl.localhost\{distro}\home\{user}"));
            for part in suffix.split('/') {
                p.push(part);
            }
            if p.exists() {
                out.push(p);
            }
        }
    }
    out
}

pub fn load_state(path: &Path) -> Result<WatcherState> {
    if !path.exists() {
        return Ok(WatcherState::default());
    }
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
