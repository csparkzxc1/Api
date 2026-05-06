//! Tauri IPC commands invoked from the onboarding webview.

use pulsewatch_agent_core::api::{ApiClient, EnrollRequest};
use pulsewatch_agent_core::vault::{StoredSession, Vault};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Default)]
pub struct AgentStatus {
    pub last_upload: Arc<Mutex<Option<String>>>,
    pub last_error: Arc<Mutex<Option<String>>>,
    pub paused: Arc<Mutex<bool>>,
}

#[derive(Serialize)]
pub struct Status {
    pub enrolled: bool,
    pub base_url: Option<String>,
    pub device_id: Option<String>,
    pub last_upload: Option<String>,
    pub last_error: Option<String>,
    pub paused: bool,
}

#[tauri::command]
pub fn status(state: State<'_, AgentStatus>) -> Status {
    let session = Vault::load().ok().flatten();
    Status {
        enrolled: session.is_some(),
        base_url: session.as_ref().map(|s| s.base_url.clone()),
        device_id: session.as_ref().map(|s| s.device_id.clone()),
        last_upload: state.last_upload.lock().unwrap().clone(),
        last_error: state.last_error.lock().unwrap().clone(),
        paused: *state.paused.lock().unwrap(),
    }
}

#[tauri::command]
pub async fn enroll(
    app: AppHandle,
    base_url: String,
    pairing_code: Option<String>,
    device_name: Option<String>,
) -> Result<Status, String> {
    let client = ApiClient::new(&base_url);
    let pubkey = generate_dummy_pubkey();
    let req = EnrollRequest {
        platform: "desktop",
        public_key: pubkey,
        pairing_code,
        device_name,
    };
    let resp = client.enroll(&req).await.map_err(|e| e.to_string())?;
    let session = StoredSession {
        device_id: resp.device_id,
        token: resp.token,
        expires_at: resp.expires_at,
        base_url,
        agent_id: agent_id_for_machine(),
    };
    Vault::save(&session).map_err(|e| e.to_string())?;
    let _ = app.emit("agent://enrolled", ());
    Ok(status(app.state::<AgentStatus>()))
}

#[tauri::command]
pub fn sign_out(app: AppHandle) -> Result<(), String> {
    Vault::clear().map_err(|e| e.to_string())?;
    let _ = app.emit("agent://signed-out", ());
    Ok(())
}

#[tauri::command]
pub fn toggle_pause(state: State<'_, AgentStatus>) -> bool {
    let mut p = state.paused.lock().unwrap();
    *p = !*p;
    *p
}

/// X25519 raw pubkey isn't actually used by the agent today — the agent talks
/// to the backend via bearer-token only — but the enroll endpoint requires it,
/// so we send 32 random bytes with no agent-side private key retained.
fn generate_dummy_pubkey() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut buf = [0u8; 32];
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let mut seed = now.as_nanos();
    for slot in buf.iter_mut() {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        *slot = (seed >> 64) as u8;
    }
    use base64::Engine;
    base64::engine::general_purpose::STANDARD_NO_PAD.encode(buf)
}

fn agent_id_for_machine() -> String {
    // Stable-per-machine agent id derived from the data dir path; not a secret.
    let local = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir);
    let s = format!("{}{}", local.display(), env!("CARGO_PKG_VERSION"));
    let mut hash: u64 = 1469598103934665603;
    for b in s.as_bytes() {
        hash = (hash ^ *b as u64).wrapping_mul(1099511628211);
    }
    format!("00000000-0000-4000-8000-{:012x}", hash & 0xffffffffffff)
}
