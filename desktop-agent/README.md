# PulseWatch Desktop Agent (M5)

Tauri 2 (Rust + TypeScript) menu-bar app that watches local Claude Code and Codex CLI logs and uploads numeric counters to the backend via `POST /v1/agent/ingest`.

## What it parses

- `~/.claude/projects/**/*.jsonl` — Claude Code session logs (input/output/cache tokens, model, timestamp). The schema is the one consumed by the open-source `ccusage` tool; we only read counters and never prompts.
- `~/.codex/sessions/**/*.jsonl` — Codex CLI logs.

## What it does NOT collect

Prompt content, completion content, tool inputs, file paths, or repo names. The agent enforces this with a strict sample-shape validator before any HTTP call.

## Auth

The agent calls `POST /v1/auth/devices` with `platform: "desktop"` once during onboarding and stores the resulting bearer token in the OS keychain (`keyring` crate).

Implementation lands in M5.
