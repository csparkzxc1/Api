//! Tauri-free core of the PulseWatch desktop agent. The Tauri shell
//! (`pulsewatch-agent`) wires these modules into the menu-bar app, but
//! everything privacy-critical lives here so it can be exercised in unit
//! tests on any platform without GTK/WebView deps.

pub mod api;
pub mod config;
pub mod parser;
pub mod uploader;
pub mod vault;
pub mod watcher;
