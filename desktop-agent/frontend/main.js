const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (sel) => document.querySelector(sel);

async function refresh() {
  const status = await invoke("status");
  const onboard = $("#onboard-view");
  const enrolled = $("#enrolled-view");
  if (status.enrolled) {
    onboard.hidden = true;
    enrolled.hidden = false;
    $("#status-base-url").textContent = status.base_url ?? "—";
    $("#status-device-id").textContent = status.device_id ?? "—";
    $("#status-last-upload").textContent = status.last_upload ?? "—";
    $("#status-state").textContent = status.paused ? "paused" : "running";
    $("#pause-btn").textContent = status.paused ? "Resume uploads" : "Pause uploads";
  } else {
    onboard.hidden = false;
    enrolled.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  refresh();

  $("#enroll-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#enroll-error").hidden = true;
    const base_url = $("#base-url").value.trim();
    const code = $("#pair-code").value.trim();
    try {
      await invoke("enroll", {
        baseUrl: base_url,
        pairingCode: code === "" ? null : code,
        deviceName: navigator.userAgent.includes("Mac") ? "Mac" : navigator.platform || null,
      });
      refresh();
    } catch (err) {
      $("#enroll-error").textContent = String(err);
      $("#enroll-error").hidden = false;
    }
  });

  $("#pause-btn").addEventListener("click", async () => {
    await invoke("toggle_pause");
    refresh();
  });

  $("#signout-btn").addEventListener("click", async () => {
    if (!confirm("Sign out and forget this machine's session?")) return;
    await invoke("sign_out");
    refresh();
  });
});

listen("agent://enrolled", refresh);
listen("agent://signed-out", refresh);
