//! Batches `Sample`s and uploads them to `/v1/agent/ingest` with
//! exponential-backoff retry. Drops the in-memory buffer only after a 2xx.

use crate::api::{ApiClient, IngestBody};
use crate::parser::Sample;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::{interval, sleep, MissedTickBehavior};

const FLUSH_INTERVAL: Duration = Duration::from_secs(60);
const MAX_BATCH: usize = 500;
const MAX_RETRIES: u32 = 6;

pub async fn run(
    client: ApiClient,
    token: String,
    agent_id: String,
    mut samples: mpsc::Receiver<Sample>,
) {
    let mut buf: Vec<Sample> = Vec::with_capacity(MAX_BATCH);
    let mut tick = interval(FLUSH_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            maybe = samples.recv() => match maybe {
                Some(s) => {
                    buf.push(s);
                    if buf.len() >= MAX_BATCH {
                        flush(&client, &token, &agent_id, &mut buf).await;
                    }
                }
                None => {
                    flush(&client, &token, &agent_id, &mut buf).await;
                    return;
                }
            },
            _ = tick.tick() => {
                flush(&client, &token, &agent_id, &mut buf).await;
            }
        }
    }
}

async fn flush(client: &ApiClient, token: &str, agent_id: &str, buf: &mut Vec<Sample>) {
    if buf.is_empty() {
        return;
    }
    let body = IngestBody {
        agent_id,
        samples: buf.as_slice(),
    };

    let mut attempt = 0u32;
    let mut delay = Duration::from_secs(2);
    loop {
        match client.ingest(token, &body).await {
            Ok(()) => {
                tracing::info!(count = buf.len(), "uploaded samples");
                buf.clear();
                return;
            }
            Err(e) if attempt < MAX_RETRIES => {
                attempt += 1;
                tracing::warn!(attempt, error = %e, "ingest failed; will retry");
                sleep(delay).await;
                delay = (delay * 2).min(Duration::from_secs(120));
            }
            Err(e) => {
                tracing::error!(error = %e, "ingest gave up after {MAX_RETRIES} retries");
                // Cap the backlog so a wedged backend doesn't OOM us.
                if buf.len() > MAX_BATCH * 4 {
                    let drop = buf.len() - MAX_BATCH * 4;
                    buf.drain(0..drop);
                }
                return;
            }
        }
    }
}
