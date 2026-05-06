# PulseWatch Desktop Agent

Tauri 2 (Rust + minimal HTML/JS) menu-bar app that streams local Claude Code
and Codex CLI usage counters to the PulseWatch backend so the watch app can
show the 5-hour Claude Code Max window — a metric no public API exposes.

## Layout

```
desktop-agent/
├── Cargo.toml                       # Cargo workspace
├── frontend/                        # plain HTML/JS onboarding + status
│   ├── index.html
│   ├── main.js
│   └── style.css
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json    # Tauri 2 capability allowlist
    ├── build.rs
    └── src/
        ├── main.rs
        ├── lib.rs                   # tray, builder, worker wiring
        ├── api.rs                   # POST /v1/auth/devices + /v1/agent/ingest
        ├── vault.rs                 # OS keyring (macOS Keychain, Win Cred Mgr,
        │                            # Linux Secret Service)
        ├── config.rs                # paths, persisted watcher offsets
        ├── parser/
        │   ├── mod.rs               # Sample type + sanitiser
        │   ├── claude_code.rs       # ~/.claude/projects/**/*.jsonl
        │   └── codex.rs             # ~/.codex/sessions/**/*.jsonl
        ├── watcher.rs               # notify-based incremental tail
        ├── uploader.rs              # batched POST with exponential backoff
        └── commands.rs              # IPC: status, enroll, sign_out, toggle_pause
```

## Build / run

Prerequisites:
- Rust toolchain (stable)
- Tauri 2 platform deps — see
  https://v2.tauri.app/start/prerequisites
- Place app icons in `desktop-agent/src-tauri/icons/`. The `tauri.conf.json`
  expects `32x32.png`, `128x128.png`, `icon.icns` (macOS), `icon.ico`
  (Windows), and a tray `icon.png`.

```bash
cd desktop-agent/src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri dev          # runs the agent against frontend/index.html
cargo tauri build        # produces signed bundle (.app/.dmg/.msi/.deb/.AppImage)
```

Unit tests for the parsers (no Tauri build dependency required):

```bash
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
```

## Privacy contract

The struct `parser::Sample` is the only shape that crosses the network:

```rust
struct Sample {
    t: DateTime<Utc>,
    source: Source,         // "claude_code" | "codex_cli"
    model: Option<String>,  // capped at 128 chars; control chars stripped
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    cost_usd: f64,
}
```

Anything not on this struct cannot be uploaded. The uploader serialises
`Sample` directly with `serde_json`, so the type system enforces the contract
at compile time. Prompt content, completion content, tool inputs, file paths,
project/session ids, and any text fields are never read from the JSONL beyond
the numeric counters and the model id — the parsers explicitly only
deserialise the fields listed in `parser::claude_code::Line` and
`parser::codex::Line`.

## Where the agent looks for logs

By default:

- `~/.claude/projects/**/*.jsonl`
- `~/.codex/sessions/**/*.jsonl`

Override with comma-separated paths via env vars (separator is `;` on
Windows, `:` elsewhere):

```bash
PULSEWATCH_CLAUDE_ROOT="/Users/me/.claude/projects:/Users/me/work/.claude/projects"
PULSEWATCH_CODEX_ROOT="/Users/me/.codex/sessions"
```

### Windows + WSL

Claude Code runs in WSL on Windows today. The agent ships two coverage
strategies:

1. **Recommended**: install the agent inside the WSL distro (`cargo build` /
   `tauri build` in the WSL shell). The default paths resolve to the WSL
   filesystem and everything just works.
2. **Best-effort**: run the agent on Windows native and let it auto-probe
   `\\wsl.localhost\<distro>\home\<user>\.claude\projects` for every running
   distro that `wsl --list --quiet` reports. WSL must be started for the UNC
   path to exist, and `notify`'s `ReadDirectoryChangesW` is less reliable
   over `\\wsl.localhost\` than against a local NTFS path; if you see
   missed events use option 1 instead.

`PULSEWATCH_CLAUDE_ROOT` overrides both behaviours, so power users can
explicitly target the right path.

## How it works

1. **Enroll**: the user enters a backend URL (and optionally a 6-digit
   pairing code from the phone app) into the onboarding window. The agent
   calls `POST /v1/auth/devices` with `platform: "desktop"` and stores the
   resulting bearer token plus a stable per-machine `agent_id` in the OS
   keyring.
2. **Watch**: the agent registers a recursive `notify` watcher on
   `~/.claude/projects/` and `~/.codex/sessions/`. On startup it also
   sweeps existing `*.jsonl` files so it doesn't miss usage that happened
   before launch.
3. **Tail**: each event triggers an incremental read from a per-file byte
   offset persisted in the local data dir. A partial trailing line (no
   `\n` yet) is retained for the next event so we never half-parse a
   record.
4. **Validate**: every line is run through the strict validator. Lines that
   don't decode, that have zero tokens, or that look corrupted are dropped.
5. **Upload**: samples accumulate in a 60-second / 500-sample bounded buffer
   and ship to `POST /v1/agent/ingest` with exponential-backoff retry.
   The buffer is capped to `4 × MAX_BATCH` so a wedged backend can't OOM
   the agent.
6. **Tray + window**: the agent runs headless in the menu bar; the window
   only shows on first launch or when the user clicks the tray icon. The
   tray menu has Open, Pause uploads, Quit.

## Release

`.github/workflows/desktop-agent-release.yml` (at the repo root) runs on
`agent-v*` tags and builds bundles for macOS arm64/x86_64, Windows, and
Linux. Signing requires the maintainer to add `APPLE_*` and
`TAURI_SIGNING_*` repo secrets; without them the workflow still produces
unsigned bundles for development.
