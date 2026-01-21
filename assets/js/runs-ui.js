/* assets/js/runs-ui.js — V1.0.2 (RUNS_UI_POLISH_BIND_FIX)
   - Restores Save / Runs buttons binding (shogSaveRunBtn / shogRunsBtn)
   - Keeps polished modal UI (V1.0.1)
   - Shows buttons only when Discord token is present (sessionStorage 'shog.discord.token')
*/
(() => {
  "use strict";

  // Storage keys (shared across the HUB / modules)
  const TOKEN_KEY = "shog.discord.token";
  const USER_KEY  = "shog.discord.user";

  // DOM ids (expected in pages/* html)
  const SAVE_BTN_ID = "shogSaveRunBtn";
  const RUNS_BTN_ID = "shogRunsBtn";

  // Default Runs Vault Worker base (can be overridden)
  const DEFAULT_RUNS_API_BASE = "https://saveruns.yoyoastico74.workers.dev";

  // Internal state
  const state = {
    module: null,
    runs: [],
    activeId: null,
    activeJson: null,
    dom: null,
    isOpen: false,
  };

  // --------- helpers ---------
  function nowIso() {
    return new Date().toISOString();
  }

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; }
  }

  function isLogged() {
    return !!getToken();
  }

  function normalizeBase(url) {
    if (!url) return DEFAULT_RUNS_API_BASE;
    return String(url).replace(/\/+$/, "");
  }

  function getRunsApiBase() {
    // 1) explicit global override
    if (window.SHOG_RUNS_API_BASE) return normalizeBase(window.SHOG_RUNS_API_BASE);

    // 2) data attribute override
    const html = document.documentElement;
    const dataUrl = html ? html.getAttribute("data-runs-api") : null;
    if (dataUrl) return normalizeBase(dataUrl);

    // 3) default
    return DEFAULT_RUNS_API_BASE;
  }

  function inferModule() {
    const b = document.body;

    // Prefer explicit page classes (consistent in your project)
    if (b && b.classList) {
      if (b.classList.contains("page-mining"))  return "mining";
      if (b.classList.contains("page-salvage")) return "salvage";
      if (b.classList.contains("page-hauling")) return "fret";
    }

    // Fallback: infer from URL
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("mining"))  return "mining";
    if (p.includes("salvage") || p.includes("recycl")) return "salvage";
    if (p.includes("hauling") || p.includes("fret"))   return "fret";

    // Default (safe)
    return "mining";
  }

  async function authFetch(url, opts = {}) {
    const token = getToken();
    const headers = new Headers(opts.headers || {});
    if (token) headers.set("Authorization", "Bearer " + token);
    return fetch(url, { ...opts, headers });
  }

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function toPrettyJson(obj) {
    try { return JSON.stringify(obj, null, 2); } catch (_) { return String(obj); }
  }

  function setBtnBusy(btn, busy, label = null) {
    if (!btn) return;
    if (busy) {
      btn.dataset.prevText = btn.textContent;
      btn.textContent = label || "…";
      btn.disabled = true;
      btn.classList.add("is-busy");
    } else {
      btn.textContent = btn.dataset.prevText || btn.textContent;
      btn.disabled = false;
      btn.classList.remove("is-busy");
      delete btn.dataset.prevText;
    }
  }

  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
  }

  // --------- payload builder (generic/minimal) ---------
  function buildRunPayload(module) {
    const createdAt = nowIso();
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (
      "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10)
    );

    // Minimal payload; module-specific enrichment can be added later.
    return {
      id,
      module,
      title: `Run ${module} ${createdAt.slice(0,16).replace("T"," ")}`,
      notes: null,
      created_at: createdAt,
      updated_at: createdAt,
      app_version: window.SHOG_APP_VERSION || null,
      worker_version: window.SHOG_WORKER_VERSION || null,
      path: location.pathname || null,
      ship: null,
      totals: null,
      items: null,
      items_count: null
    };
  }

  // --------- modal UI ---------
  function ensureModal() {
    if (state.dom) return state.dom;

    const root = document.createElement("div");
    root.id = "shogRunsRoot";
    root.className = "shog-modal-overlay is-hidden";
    root.setAttribute("aria-hidden", "true");

    root.innerHTML = `
      <div class="shog-modal-backdrop" data-action="close"></div>
      <div class="shog-modal" role="dialog" aria-modal="true" aria-label="My Runs">
        <div class="shog-modal-head">
          <div class="shog-modal-title">My Runs</div>
          <div class="shog-modal-actions">
            <button class="btn-ghost" type="button" id="shogRunsRefreshBtn">Refresh</button>
            <button class="btn-ghost" type="button" id="shogRunsCloseBtn">Close</button>
          </div>
        </div>

        <div class="shog-modal-body">
          <div class="shog-runs-list" id="shogRunsList"></div>

          <div class="shog-runs-detail">
            <div class="shog-runs-detail-pane">
              <div class="shog-runs-detail-head">
                <div>
                  <div class="shog-runs-detail-title" id="shogRunsDetailTitle">—</div>
                  <div class="shog-runs-detail-sub" id="shogRunsDetailSub">—</div>
                </div>
                <div class="shog-runs-detail-actions">
                  <button class="btn-ghost" type="button" id="shogRunsCopyBtn">Copy JSON</button>
                </div>
              </div>

              <pre class="shog-json" id="shogRunsJson">{}</pre>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const dom = {
      root,
      backdrop: root.querySelector(".shog-modal-backdrop"),
      closeBtn: root.querySelector("#shogRunsCloseBtn"),
      refreshBtn: root.querySelector("#shogRunsRefreshBtn"),
      list: root.querySelector("#shogRunsList"),
      title: root.querySelector("#shogRunsDetailTitle"),
      sub: root.querySelector("#shogRunsDetailSub"),
      json: root.querySelector("#shogRunsJson"),
      copyBtn: root.querySelector("#shogRunsCopyBtn"),
    };

    // close handlers
    dom.backdrop.addEventListener("click", () => close());
    dom.closeBtn.addEventListener("click", () => close());
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    // refresh
    dom.refreshBtn.addEventListener("click", () => refresh());

    // copy
    dom.copyBtn.addEventListener("click", () => {
      if (!state.activeJson) return;
      copyToClipboard(toPrettyJson(state.activeJson));
    });

    state.dom = dom;
    return dom;
  }

  function open(module = null, opts = {}) {
    state.module = module || inferModule();
    ensureModal();

    state.dom.root.classList.remove("is-hidden");
    state.dom.root.setAttribute("aria-hidden", "false");
    state.isOpen = true;

    // focus for ESC key
    state.dom.root.tabIndex = -1;
    state.dom.root.focus();

    return refresh({ selectId: opts.selectId || null });
  }

  function close() {
    if (!state.dom) return;
    state.dom.root.classList.add("is-hidden");
    state.dom.root.setAttribute("aria-hidden", "true");
    state.isOpen = false;
  }

  // --------- API ---------
  async function fetchRunsList(module) {
    const base = getRunsApiBase();
    const url = `${base}/runs/${encodeURIComponent(module)}`;

    const res = await authFetch(url, { method: "GET" });
    const txt = await res.text();
    const data = safeJsonParse(txt) || { status: "error", message: txt };

    if (!res.ok || data.status === "error") {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    // support shapes: {runs:[...]} or {items:[...]} or direct array
    const runs = Array.isArray(data) ? data : (data.runs || data.items || []);
    return runs;
  }

  async function fetchRunDetail(module, runId) {
    const base = getRunsApiBase();
    const url = `${base}/runs/${encodeURIComponent(module)}/${encodeURIComponent(runId)}`;

    const res = await authFetch(url, { method: "GET" });
    const txt = await res.text();
    const data = safeJsonParse(txt) || { status: "error", message: txt };

    if (!res.ok || data.status === "error") {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    // support shapes: {run:{...}} or direct object
    return data.run || data;
  }

  async function createRun(module, payload) {
    const base = getRunsApiBase();
    const url = `${base}/runs/${encodeURIComponent(module)}`;

    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const txt = await res.text();
    const data = safeJsonParse(txt) || { status: "error", message: txt };

    if (!res.ok || data.status === "error") {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    // support shapes: {run:{...}} or {id:"..."}
    return data.run || data;
  }

  // --------- render ---------
  function renderList() {
    const dom = state.dom;
    if (!dom) return;

    dom.list.innerHTML = "";

    if (!state.runs || state.runs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "shog-empty";
      empty.textContent = "Aucun run sauvegardé.";
      dom.list.appendChild(empty);
      return;
    }

    // Sort newest first if timestamps exist
    const sorted = [...state.runs].sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at || "") || 0;
      const tb = Date.parse(b.updated_at || b.created_at || "") || 0;
      return tb - ta;
    });

    sorted.forEach((run) => {
      const id = run.id || run.run_id || run.uuid;
      const title = run.title || `Run ${state.module}`;
      const created = run.created_at || run.updated_at || "";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shog-run-card" + (id === state.activeId ? " is-active" : "");
      btn.dataset.runId = id;

      btn.innerHTML = `
        <div class="shog-run-title">${escapeHtml(title)}</div>
        <div class="shog-run-meta">${escapeHtml(created)}</div>
        <div class="shog-run-id">${escapeHtml(String(id || ""))}</div>
      `;

      btn.addEventListener("click", () => {
        if (!id) return;
        selectRun(id);
      });

      dom.list.appendChild(btn);
    });
  }

  function renderDetail(run) {
    const dom = state.dom;
    if (!dom) return;

    const title = run && (run.title || run.name) ? (run.title || run.name) : "—";
    const created = run && (run.created_at || run.updated_at) ? (run.created_at || run.updated_at) : "—";
    const id = run && run.id ? run.id : "—";

    dom.title.textContent = title;
    dom.sub.textContent = `${created}  •  ${id}`;

    dom.json.textContent = toPrettyJson(run || {});
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function selectRun(runId) {
    state.activeId = runId;
    renderList(); // update active highlight

    try {
      const run = await fetchRunDetail(state.module, runId);
      state.activeJson = run;
      renderDetail(run);
    } catch (e) {
      console.error("[runs-ui] fetchRunDetail error:", e);
      state.activeJson = { status: "error", message: String(e.message || e) };
      renderDetail(state.activeJson);
    }
  }

  // --------- public operations ---------
  async function refresh(opts = {}) {
    if (!state.dom) ensureModal();
    const dom = state.dom;

    setBtnBusy(dom.refreshBtn, true, "…");
    try {
      state.runs = await fetchRunsList(state.module);

      // select latest or requested id
      const wanted = opts.selectId || state.activeId;
      renderList();

      const first = state.runs && state.runs[0] ? (state.runs[0].id || state.runs[0].run_id) : null;
      const selectId = wanted || first;

      if (selectId) await selectRun(selectId);
      else {
        state.activeId = null;
        state.activeJson = null;
        renderDetail(null);
      }
    } catch (e) {
      console.error("[runs-ui] refresh error:", e);
      dom.list.innerHTML = `<div class="shog-empty">Erreur: ${escapeHtml(e.message || e)}</div>`;
      renderDetail({ status: "error", message: String(e.message || e) });
    } finally {
      setBtnBusy(dom.refreshBtn, false);
    }
  }

  async function saveCurrentRun(module = null) {
    const saveBtn = document.getElementById(SAVE_BTN_ID);

    if (!isLogged()) {
      // Keep it silent in production UI; user already sees Login
      console.warn("[runs-ui] save aborted: not logged");
      return;
    }

    const mod = module || state.module || inferModule();
    const payload = buildRunPayload(mod);

    setBtnBusy(saveBtn, true, "Saving…");
    try {
      const created = await createRun(mod, payload);
      const id = created && (created.id || created.run_id) ? (created.id || created.run_id) : payload.id;

      // Open modal and focus the newly created run
      await open(mod, { selectId: id });
    } catch (e) {
      console.error("[runs-ui] save error:", e);
      // optional: could show a toast; for now just console
      alert(`Save run: ${e.message || e}`);
    } finally {
      setBtnBusy(saveBtn, false);
      if (saveBtn && saveBtn.dataset.prevText) saveBtn.textContent = saveBtn.dataset.prevText;
    }
  }

  // --------- buttons bootstrap ---------
  function updateButtonsVisibility() {
    const saveBtn = document.getElementById(SAVE_BTN_ID);
    const runsBtn = document.getElementById(RUNS_BTN_ID);
    const logged = isLogged();

    if (saveBtn) saveBtn.style.display = logged ? "" : "none";
    if (runsBtn) runsBtn.style.display = logged ? "" : "none";
  }

  function bindTopButtons() {
    const saveBtn = document.getElementById(SAVE_BTN_ID);
    const runsBtn = document.getElementById(RUNS_BTN_ID);

    // If a page doesn't include the widget buttons, do nothing.
    if (!saveBtn && !runsBtn) return;

    updateButtonsVisibility();

    if (runsBtn && !runsBtn.dataset.bound) {
      runsBtn.dataset.bound = "1";
      runsBtn.addEventListener("click", () => open(inferModule()));
    }

    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", () => saveCurrentRun(inferModule()));
    }

    // Refresh on auth events (auth.js dispatches "shog:auth")
    window.addEventListener("shog:auth", () => updateButtonsVisibility());

    // Safety: on focus, re-check token (sessionStorage updated after auth redirect)
    window.addEventListener("focus", () => updateButtonsVisibility());
  }

  function bootstrap() {
    bindTopButtons();
  }

  // auto-bootstrap
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  // Public API
  window.ShogRunsUI = {
    open,
    close,
    refresh,
    saveCurrentRun,
    inferModule,
    getRunsApiBase
  };
})();
