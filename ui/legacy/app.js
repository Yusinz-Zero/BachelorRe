const $ = (sel) => document.querySelector(sel);
const consoleEl = $("#console");

function log(msg) {
  const esc = String(msg).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  consoleEl.innerHTML += esc + "\n";
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || "GET", headers: { "content-type": "application/json" } });
  return res.json();
}

// tabs
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("#panel-" + btn.dataset.panel).classList.add("active");
  });
});

$("#btn-clear-log").addEventListener("click", () => (consoleEl.innerHTML = ""));

// polling helper for long tasks (downloads can take minutes)
function pollTask(id, onDone) {
  const timer = setInterval(async () => {
    const t = await api("/api/task/" + id);
    if (t.lines && t.lines.length) log("[" + id + "] " + t.lines.join("\n[" + id + "] "));
    if (t.done) {
      clearInterval(timer);
      if (t.error) log(`[${id}] FAILED: ${t.error}`);
      onDone(t);
      refresh();
    }
  }, 800);
}

function trigger(endpoint) {
  return api(endpoint, { method: "POST" }).then((r) => pollTask(r.task, () => {}));
}

$("#btn-check").addEventListener("click", () => {
  log("→ Checking upstream master (manual)…");
  trigger("/api/check");
});
$("#btn-update").addEventListener("click", () => trigger("/api/update"));
$("#btn-deps").addEventListener("click", () => trigger("/api/deps"));

// components status cards
async function refresh() {
  try {
    const st = await api("/api/status");
    const state = st.state;
    const cards = $("#component-cards");
    cards.innerHTML = "";
    for (const id of ["S", "C"]) {
      const c = state.components[id];
      const instCnt = Object.keys(c.installs || {}).length;
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="card-head"><strong>${id} · ${id === "S" ? "Server" : "Client"}</strong>
          <span class="badge ${instCnt ? "ok" : "idle"}">${instCnt ? "installed" : "not installed"}</span></div>
        <div class="kv"><span>active</span><code>${c.activeDir ? short(c.activeDir) : "—"}</code></div>
        <div class="kv"><span>known sha</span><code>${c.knownSha ? c.knownSha.slice(0, 7) : "—"}</code></div>
        <div class="kv"><span>versions kept</span><code>${instCnt}</code></div>`;
      cards.appendChild(el);
    }

    // play status placeholder
    $("#play-status").innerHTML = `
      <div class="card">
        <div class="card-head"><strong>Stack readiness</strong><span class="badge idle">loading…</span></div>
      </div>`;

    // settings values into form
    const s = st.settings || {};
    $("#set-region").value = s.Region || "EN";
    $("#set-clientver").value = s.ClientVersion || "37.7.41";
    $("#set-serverport").value = s.ServerPort ?? 8443;
    $("#set-trainerport").value = s.TrainerPort ?? 9443;
    $("#set-gamepath").value = s.GamePath || "";
    $("#set-roster").value = s.RosterMode || "none";
  } catch (err) {
    log("status refresh failed: " + err.message);
  }
}

function short(p) {
  return "…" + p.slice(-48);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// patch catalog cards
async function refreshPatches() {
  try {
    const patches = await api("/api/patch-status");
    const pc = $("#patch-cards");
    pc.innerHTML = "";
    for (const p of patches) {
      const el = document.createElement("div");
      el.className = "card";
      const off = !p.enabled;
      const badgeCls = off ? "idle" : p.state === "applied" ? "ok" : "idle";
      const badgeTxt = off ? "off" : p.state === "applied" ? "applied" : p.state === "no-active" ? "no active" : "pending";
      el.innerHTML = `
        <div class="card-head"><strong>${esc(p.id)}</strong>
          <span class="badge ${badgeCls}">${badgeTxt}</span></div>
        <div class="kv"><span>component</span><code>${p.component} · ${esc(p.title)}</code></div>
        <div class="kv"><span>detail</span><code>${esc(p.description || "")}</code></div>`;
      pc.appendChild(el);
    }
  } catch (err) {
    log("patch status failed: " + err.message);
  }
}

$("#btn-patch").addEventListener("click", () => {
  log("→ Applying patch catalog (idempotent)…");
  trigger("/api/patch");
});

// --- M3: play tab health + one-button boot ---
const kv = (label, val, ok) =>
  `<div class="kv"><span>${label}</span><code class="${ok ? "ok-text" : ""}">${String(val)}</code></div>`;

async function refreshHealth() {
  try {
    const h = await api("/api/health");
    const s = h.server;
    const g = h.game;
    $("#play-status").innerHTML = `
      <div class="card">
        <div class="card-head"><strong>Stack readiness</strong>
          <span class="badge ${h.readyToPlay ? "ok" : "idle"}">${h.readyToPlay ? "READY" : "not ready"}</span></div>
        ${kv("server", s.listening ? `up :${s.port} (pid ${s.pid})` : "down", s.listening)}
        ${kv("game", g.ready ? "ready to attach" : `not ready — ${g.reason || g.detail}`, g.ready)}
        ${kv("trainer", h.trainer.attached ? "attached" : "not attached", h.trainer.attached)}
        ${kv("version", `${h.version.actual ?? "-"} (want ${h.version.want})${h.version.mismatch ? " ✖ MISMATCH" : ""}`, !h.version.mismatch)}
      </div>`;
    $("#btn-play").disabled = h.readyToPlay;
    $("#btn-stop").disabled = !(s.listening || h.game.ready || h.trainer.attached);
  } catch (err) {
    log("health refresh failed: " + err.message);
  }
}

$("#btn-play").addEventListener("click", () => {
  log("→ Play: booting server…");
  api("/api/server/start", { method: "POST" }).then((r) =>
    pollTask(r.task, () => {
      log("→ Play: launching game (attach)…");
      api("/api/game/start", { method: "POST" }).then((r2) => pollTask(r2.task, () => {}));
    })
  );
});

$("#btn-stop").addEventListener("click", () => {
  log("→ Stop: closing game then server…");
  api("/api/game/stop", { method: "POST" }).then((r) =>
    pollTask(r.task, () => {
      api("/api/server/stop", { method: "POST" }).then((r2) => pollTask(r2.task, () => {}));
    })
  );
});

$("#btn-save-settings").addEventListener("click", async () => {
  const obj = {
    Region: $("#set-region").value,
    ClientVersion: $("#set-clientver").value,
    ServerPort: Number($("#set-serverport").value),
    TrainerPort: Number($("#set-trainerport").value),
    GamePath: $("#set-gamepath").value,
    RosterMode: $("#set-roster").value,
  };
  const res = await fetch("/api/save-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  });
  const saved = $("#settings-saved");
  saved.textContent = res.ok ? "saved ✓" : "failed ✖";
  setTimeout(() => (saved.textContent = ""), 1500);
});

refresh();
refreshPatches();
refreshHealth();
setInterval(refresh, 5000);
setInterval(refreshPatches, 5000);
setInterval(refreshHealth, 3000);
