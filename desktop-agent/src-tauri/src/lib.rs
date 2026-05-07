use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use cap_agent_core as core;

pub mod commands;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info,cap_agent=debug")
            }),
        )
        .compact()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(commands::AgentStatus::default())
        .invoke_handler(tauri::generate_handler![
            commands::status,
            commands::enroll,
            commands::sign_out,
            commands::toggle_pause,
        ])
        .setup(|app| {
            install_tray(app.handle())?;
            spawn_workers(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of quitting; the app lives in the tray.
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running cap-agent");
}

fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Cap Agent", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause uploads", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &sep, &quit])?;

    let _ = TrayIconBuilder::with_id("cap-tray")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "pause" => {
                let s = app.state::<commands::AgentStatus>();
                let now = *s.paused.lock().unwrap();
                *s.paused.lock().unwrap() = !now;
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn spawn_workers(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let session = match core::vault::Vault::load() {
            Ok(Some(s)) => s,
            Ok(None) => {
                tracing::info!("not enrolled — open the window to set up");
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                }
                return;
            }
            Err(e) => {
                tracing::error!(error = %e, "vault load failed");
                return;
            }
        };

        let paths = core::config::Paths::discover();
        let state = Arc::new(Mutex::new(
            core::config::load_state(&paths.state_file).unwrap_or_default(),
        ));
        let watcher = match core::watcher::start(
            paths.state_file.clone(),
            state.clone(),
            paths.claude_roots.clone(),
            paths.codex_roots.clone(),
        ) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!(error = %e, "watcher start failed");
                return;
            }
        };

        let client = core::api::ApiClient::new(&session.base_url);
        let pause = app.state::<commands::AgentStatus>().paused.clone();
        let gated = paused_pass_through(watcher.samples, pause).await;

        tauri::async_runtime::spawn(async move {
            core::uploader::run(client, session.token, session.agent_id, gated).await;
        });
    });
}

/// Pump samples through unless `pause` is true; in that case drop them on the
/// floor (we don't want a queue building up for hours of paused uptime).
async fn paused_pass_through(
    mut rx: tokio::sync::mpsc::Receiver<core::parser::Sample>,
    pause: Arc<Mutex<bool>>,
) -> tokio::sync::mpsc::Receiver<core::parser::Sample> {
    let (out_tx, out_rx) = tokio::sync::mpsc::channel(1024);
    tauri::async_runtime::spawn(async move {
        while let Some(sample) = rx.recv().await {
            if *pause.lock().unwrap() {
                continue;
            }
            if out_tx.send(sample).await.is_err() {
                break;
            }
        }
    });
    out_rx
}
