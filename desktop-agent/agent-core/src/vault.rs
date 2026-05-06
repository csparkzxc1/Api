//! OS keyring-backed token storage.
//!
//! On macOS this is the login Keychain, on Windows the Credential Manager,
//! and on Linux the Secret Service (libsecret). Tokens never touch disk.

use anyhow::{Context, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.pulsewatch.agent";
const ACCOUNT: &str = "session";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub device_id: String,
    pub token: String,
    pub expires_at: String,
    pub base_url: String,
    pub agent_id: String,
}

pub struct Vault;

impl Vault {
    pub fn load() -> Result<Option<StoredSession>> {
        let entry = Entry::new(SERVICE, ACCOUNT).context("create keyring entry")?;
        match entry.get_password() {
            Ok(s) => Ok(Some(serde_json::from_str(&s).context("decode session")?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(session: &StoredSession) -> Result<()> {
        let entry = Entry::new(SERVICE, ACCOUNT)?;
        entry.set_password(&serde_json::to_string(session)?)?;
        Ok(())
    }

    pub fn clear() -> Result<()> {
        let entry = Entry::new(SERVICE, ACCOUNT)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
