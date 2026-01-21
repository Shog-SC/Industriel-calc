// runs-ui.js — V1.0.0
// Save + Runs UI for players (KV vault via Cloudflare Worker).
// Buttons are hidden unless Discord token is present.
//
// Runs Vault endpoints:
//   POST /runs/:module
//   GET  /runs/:module
//   GET  /runs/:module/:id
//
// NOTE: This file expects the unified auth helper (window.ShogAuth) OR sessionStorage token.

(function () {
  "use strict";

  const VERSION = "V1.0.0";
  const RUNS_BASE = "https://saveruns.yoyoastico74.workers.dev";

  const BTN_SAVE_ID = "shogSaveRunBtn";
  const BTN_RUNS_ID = "shogRunsBtn";

  const lastApiByModule = Object.create(null);

  function getToken() {
    try {
      if (window.ShogAuth && typeof window.ShogAuth.getAccessToken === "function") {
        const t = window.ShogAuth.getAccessToken();
        if (t) return String(t);
      }
    } catch (_) {}
    try {
      const t = sessionStorage.getItem("shog.discord.token");
      return t ? String(t) : null;
    } catch (_) {}
    return null;
  }

  function getUser() {
    try {
      if (window.ShogAuth && typeof window.ShogAuth.getUser === "function") {
        const u = window.ShogAuth.getUser();
        if (u) return u;
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem("shog.discord.user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {}
    return null;
  }

  function getModule() {
    const b = document.body;
    const d = b && b.getAttribute("data-shog-module");
    if (d) return String(d).toLowerCase();

    const p = (location.pathname || "").toLowerCase();
    if (p.includes("mining")) return "mining";
    if (p.includes("hauling") || p.includes("fret")) return "fret";
    if (p.includes("salvage") || p.includes("recycl")) return "salvage";
    return "unknown";
  }

  function shouldCapture(url) {
    const u = String(url || "");
    return (u.includes("/advanced") || u.includes("/ores") || u.includes("/catalog/ship"));
  }

  (function patchFetch() {
    if (typeof window.fetch !== "function") return;
    const orig = window.fetch.bind(window);

    window.fetch = async function (...args) {
      const res = await orig(...args);
      try {
        const req = args[0];
        const url = (typeof req === "string") ? req : (req && req.url ? req.url : "");
        if (url && shouldCapture(url) && res && typeof res.clone === "function") {
          const mod = getModule();
          res.clone().json().then((data) => { lastApiByModule[mod] = data; }).catch(() => {});
        }
      } catch (_) {}
      return res;
    };
  })();

  function snapshotInputs() {
    const out = Object.create(null);
    const els = Array.from(document.querySelectorAll("input, select, textarea"));
    for (const el of els) {
      if (!el) continue;
      const tag = (el.tagName || "").toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const key = el.getAttribute("name") || el.id || el.getAttribute("data-key") || null;
      if (!key) continue;
      if (tag === "input" && (type === "password" || type === "hidden")) continue;

      let val;
      if (tag === "input" && (type === "checkbox" || type === "radio")) val = !!el.checked;
      else val = el.value;

      out[key] = val;
    }
    return out;
  }

  function snapshotPanels() {
    const pickText = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const t = (el.innerText || "").trim();
      return t ? t.slice(0, 20000) : null;
    };

    return {
      title: document.title || null,
      url: location.href,
      hash: location.hash || null,
      salvage_results: pickText("#results") || pickText("#salvageResults") || null
    };
  }

  function buildRunPayload() {
    const mod = getModule();
    const user = getUser();
    const apiLast = lastApiByModule[mod] || null;

    const createdAt = new Date().toISOString();
    const title = "Run " + mod + " " + createdAt.replace("T", " ").slice(0, 16);

    return {
      title,
      created_at: createdAt,
      module: mod,
      user: user ? {
        discordId: user.discordId || user.id || null,
        username: user.username || null,
        globalName: user.globalName || user.global_name || null,
        avatar: user.avatar || null
      } : null,
      payload: {
        api_last: apiLast,
        inputs: snapshotInputs(),
        ui: snapshotPanels()
      }
    };
  }

  function ensureModal() {
    if (document.getElementById("shogRunsModalOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "shogRunsModalOverlay";
    overlay.innerHTML = `
      <div id="shogRunsModal" role="dialog" aria-modal="true">
        <div id="shogRunsModalHeader">
          <h3>My Runs</h3>
          <div class="shog-runs-actions">
            <button id="shogRunsRefreshBtn" class="btn-ghost" type="button">Refresh</button>
            <button id="shogRunsCloseBtn" class="btn-ghost" type="button">Close</button>
          </div>
        </div>
        <div id="shogRunsModalBody">
          <div class="shogRunsList" id="shogRunsList"></div>
          <div class="shogRunsDetail" id="shogRunsDetail">
            <div class="shogRunsHint">Select a run to view details.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById("shogRunsCloseBtn").addEventListener("click", closeModal);
    document.getElementById("shogRunsRefreshBtn").addEventListener("click", () => loadRuns(true));
  }

  function openModal() { ensureModal(); document.getElementById("shogRunsModalOverlay").style.display = "block"; }
  function closeModal() { const o = document.getElementById("shogRunsModalOverlay"); if (o) o.style.display = "none"; }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function toast(msg) {
    let el = document.querySelector(".shogRunsToast");
    if (!el) { el = document.createElement("div"); el.className = "shogRunsToast"; document.body.appendChild(el); }
    el.textContent = String(msg || "");
    el.style.display = "block";
    clearTimeout(el.__t);
    el.__t = setTimeout(() => (el.style.display = "none"), 2800);
  }

  async function apiFetch(path, opts = {}) {
    const t = getToken();
    if (!t) throw new Error("Not logged (missing token)");
    const headers = Object.assign({}, opts.headers || {}, { authorization: "Bearer " + t });
    return fetch(RUNS_BASE + path, Object.assign({}, opts, { headers }));
  }

  async function saveRun() {
    const mod = getModule();
    const body = buildRunPayload();

    const res = await apiFetch("/runs/" + encodeURIComponent(mod), {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && (json.message || json.error)) ? (json.message || json.error) : ("Save failed (" + res.status + ")"));
    toast("Run saved");
    return json;
  }

  async function loadRuns(openIfClosed = false) {
    const mod = getModule();
    const res = await apiFetch("/runs/" + encodeURIComponent(mod), { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && (json.message || json.error)) ? (json.message || json.error) : ("Load failed (" + res.status + ")"));

    if (openIfClosed) openModal();
    const items = json && (json.runs || json.data || json.items) ? (json.runs || json.data || json.items) : json;
    renderRunsList(items);
  }

  function renderRunsList(items) {
    const list = document.getElementById("shogRunsList");
    const detail = document.getElementById("shogRunsDetail");
    if (!list || !detail) return;

    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      list.innerHTML = `<div class="shogRunsListItem">No runs yet.</div>`;
      detail.innerHTML = `<div class="shogRunsHint">Save your first run, then come back here.</div>`;
      return;
    }

    list.innerHTML = "";
    arr.forEach((it, i) => {
      const title = escapeHtml(it.title || it.name || "Run");
      const ts = escapeHtml(it.created_at || it.createdAt || it.date || "");
      const id = escapeHtml(it.id || it.run_id || it.key || String(i));

      const div = document.createElement("div");
      div.className = "shogRunsListItem";
      div.innerHTML = `<div><strong>${title}</strong></div><div class="shogRunsMetaLine">${ts} • ${id}</div>`;

      div.addEventListener("click", () => {
        Array.from(list.querySelectorAll(".shogRunsListItem")).forEach(x => x.classList.remove("active"));
        div.classList.add("active");
        renderRunDetail(it);
      });

      list.appendChild(div);

      if (i === 0) { div.classList.add("active"); renderRunDetail(it); }
    });
  }

  function renderRunDetail(it) {
    const detail = document.getElementById("shogRunsDetail");
    if (!detail) return;
    const payload = it.payload || it.data || it;

    detail.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div>
          <div><strong>${escapeHtml(it.title || "Run")}</strong></div>
          <div class="shogRunsMetaLine">${escapeHtml(it.created_at || "")}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="shogRunsCopyBtn" class="btn-ghost" type="button">Copy JSON</button>
        </div>
      </div>
      <pre id="shogRunsJson">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    `;

    const copyBtn = document.getElementById("shogRunsCopyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); toast("Copied"); }
        catch (_) { toast("Copy failed"); }
      });
    }
  }

  function setButtonsVisible(visible) {
    const bSave = document.getElementById(BTN_SAVE_ID);
    const bRuns = document.getElementById(BTN_RUNS_ID);
    if (bSave) bSave.style.display = visible ? "" : "none";
    if (bRuns) bRuns.style.display = visible ? "" : "none";
  }

  function wireButtons() {
    const bSave = document.getElementById(BTN_SAVE_ID);
    const bRuns = document.getElementById(BTN_RUNS_ID);

    if (bSave) {
      bSave.addEventListener("click", async () => {
        try { bSave.disabled = true; await saveRun(); }
        catch (e) { toast(String(e && e.message ? e.message : e)); }
        finally { bSave.disabled = false; }
      });
    }

    if (bRuns) {
      bRuns.addEventListener("click", async () => {
        try { await loadRuns(true); }
        catch (e) { toast(String(e && e.message ? e.message : e)); }
      });
    }
  }

  function init() {
    const t = getToken();
    setButtonsVisible(!!t);
    wireButtons();
    window.ShogRunsUI = { version: VERSION, buildRunPayload, openRuns: () => loadRuns(true), saveRun };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
