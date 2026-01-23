/* assets/js/runs-ui.js — V1.1.4 (MINING_WORK_ORDERS_FROM_PAYLOAD + SUMMARY_TOTALS_FROM_PAYLOAD + EXPORT_FULL_RUNS + SAVE_MODULE_OVERRIDE)
   ---------------------------------------------------------------------------
   UI "Save / Runs" (FRET / MINING / SALVAGE) — Runs Vault Worker compatible.
   - Adds: robust show/hide of Save/Runs buttons based on Discord login token.
   - Adds: auto-fix Support link to Discord channel 1453446130858852422.
   - Keeps: layout manager, search, sort, export JSON, delete run, edit title/notes.
   - Requires: auth.js provides Discord token in sessionStorage ("shog.discord.token")
   - Backend: SHOG Runs Vault Worker (GET/POST/PUT/DELETE /runs/:module/...).
*/
(() => {
  "use strict";

  const RUNS_UI_VERSION = "V1.1.4 (MINING_WORK_ORDERS_FROM_PAYLOAD + SUMMARY_TOTALS_FROM_PAYLOAD + EXPORT_FULL_RUNS + SAVE_MODULE_OVERRIDE)";

  // ---------------------------
  // Constants
  // ---------------------------
  const DISCORD_GUILD_ID = "1428047802805653640";
  const SUPPORT_CHANNEL_ID = "1453446130858852422";

  // ---------------------------
  // Utils
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function fmtIsoShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtNumber(x) {
    const n = Number(x);
    if (Number.isNaN(n)) return String(x);
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function cap(s) {
    return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
  }

  // ---------------------------
  // Module & endpoints
  // ---------------------------
  function detectModule() {
    const b = document.body;
    const de = document.documentElement;
    const explicit = (b && b.dataset && b.dataset.shogModule) || (de && de.dataset && de.dataset.shogModule);
    if (explicit) return explicit;

    const cls = (b && b.className) ? b.className : "";
    if (/\bpage-mining\b/i.test(cls) || /\bmining\b/i.test(document.title)) return "mining";
    if (/\bpage-salvage\b/i.test(cls) || /\brecyclage\b/i.test(document.title) || /\bsalvage\b/i.test(document.title)) return "salvage";
    if (/\bpage-hauling\b/i.test(cls) || /\bfret\b/i.test(document.title) || /\bhauling\b/i.test(document.title)) return "fret";
    return "mining";
  }

  function getRunsWorkerUrl() {
    if (window.SHOG_RUNS_VAULT_URL && typeof window.SHOG_RUNS_VAULT_URL === "string") return window.SHOG_RUNS_VAULT_URL;
    const meta = document.querySelector('meta[name="shog-runs-vault"]');
    if (meta && meta.content) return meta.content;
    return "https://saveruns.yoyoastico74.workers.dev";
  }

  function getDiscordToken() {
    return sessionStorage.getItem("shog.discord.token") || null;
  }

  function authHeader() {
    const t = getDiscordToken();
    if (!t) return null;
    return { Authorization: `Bearer ${t}` };
  }

  // ---------------------------
  // Support link fix
  // ---------------------------
  function fixSupportLink() {
    try {
      const target = `https://discord.com/channels/${DISCORD_GUILD_ID}/${SUPPORT_CHANNEL_ID}`;
      $$("a").forEach((a) => {
        const label = (a.textContent || "").trim().toLowerCase();
        if (label !== "support") return;
        const href = a.getAttribute("href") || "";
        if (!href.includes("discord.com/channels/")) return;
        if (!href.includes(DISCORD_GUILD_ID)) return;
        if (href === target) return;
        a.setAttribute("href", target);
      });
    } catch (_) {
      // ignore
    }
  }

  // ---------------------------
  // API
  // ---------------------------
  async function apiFetch(path, init = {}) {
    const base = getRunsWorkerUrl().replace(/\/+$/, "");
    const url = base + path;

    const headers = Object.assign(
      { "content-type": "application/json; charset=utf-8" },
      init.headers || {}
    );

    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    const data = safeJsonParse(text) || { raw: text };

    if (!res.ok) {
      const msg = (data && (data.message || data.error)) ? (data.message || data.error) : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function apiListRuns(module) {
    const h = authHeader();
    if (!h) throw new Error("Login requis (token Discord manquant).");
    return apiFetch(`/runs/${encodeURIComponent(module)}`, { method: "GET", headers: h });
  }

  async function apiGetRun(module, id) {
    const h = authHeader();
    if (!h) throw new Error("Login requis (token Discord manquant).");
    return apiFetch(`/runs/${encodeURIComponent(module)}/${encodeURIComponent(id)}`, { method: "GET", headers: h });
  }

  async function apiCreateRun(module, payload) {
    const h = authHeader();
    if (!h) throw new Error("Login requis (token Discord manquant).");
    return apiFetch(`/runs/${encodeURIComponent(module)}`, { method: "POST", headers: h, body: JSON.stringify(payload || {}) });
  }

  async function apiUpdateRun(module, id, payload) {
    const h = authHeader();
    if (!h) throw new Error("Login requis (token Discord manquant).");
    return apiFetch(`/runs/${encodeURIComponent(module)}/${encodeURIComponent(id)}`, { method: "PUT", headers: h, body: JSON.stringify(payload || {}) });
  }

  async function apiDeleteRun(module, id) {
    const h = authHeader();
    if (!h) throw new Error("Login requis (token Discord manquant).");
    return apiFetch(`/runs/${encodeURIComponent(module)}/${encodeURIComponent(id)}`, { method: "DELETE", headers: h });
  }

  // ---------------------------
  // Payload builder (extensible)
  // ---------------------------
  function buildBasePayload(module) {
    const now = new Date();
    const title = `Run ${module} ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const payload = {
      title,
      notes: null,
      app_version: null,
      worker_version: null,
      patch: null,
      ship: null,
      inputs: null,
      result: null,
      schema: `shog.run.v1.${module}`,
    };

    // Optional: app exposes a builder
    try {
      if (window.SHOG_RUN_BUILDERS && typeof window.SHOG_RUN_BUILDERS[module] === "function") {
        const extra = window.SHOG_RUN_BUILDERS[module]();
        if (extra && typeof extra === "object") Object.assign(payload, extra);
      }
      if (typeof window.SHOG_BUILD_RUN_PAYLOAD === "function") {
        const extra2 = window.SHOG_BUILD_RUN_PAYLOAD(module);
        if (extra2 && typeof extra2 === "object") Object.assign(payload, extra2);
      }
    } catch (_) {}

    // Optional: attach versions from techbar fields if present
    try {
      const tvHtml = $(`#tvHtml${cap(module)}`) ? $(`#tvHtml${cap(module)}`).textContent.trim() : null;
      const tvJs = $(`#tvJs${cap(module)}`) ? $(`#tvJs${cap(module)}`).textContent.trim() : null;
      const tvCss = $(`#tvCss${cap(module)}`) ? $(`#tvCss${cap(module)}`).textContent.trim() : null;
      payload.app_version = [tvHtml, tvCss, tvJs].filter(Boolean).join(" / ") || payload.app_version;
    } catch (_) {}

    return payload;
  }

  // ---------------------------
  // UI (modal)
  // ---------------------------
  const state = {
    module: detectModule(),
    runs: [],
    filtered: [],
    selectedId: null,
    selectedRun: null,
    search: "",
    sort: "created_desc",
    tab: "summary",
    loading: false,
  };

  function ensureModal() {
    if ($("#shogRunsOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "shogRunsOverlay";
    overlay.className = "shog-runs-overlay is-hidden";
    overlay.innerHTML = `
      <div class="shog-runs-modal" role="dialog" aria-modal="true" aria-label="My Runs">
        <div class="shog-runs-header">
          <div class="shog-runs-titlewrap">
            <div class="shog-runs-title">My Runs</div>
            <div class="shog-runs-sub">
              <span class="shog-runs-badge">${escapeHtml(state.module)}</span>
              <span class="shog-runs-count" id="shogRunsCount">0</span>
              <span class="shog-runs-version" title="runs-ui">${escapeHtml(RUNS_UI_VERSION)}</span>
            </div>
          </div>

          <div class="shog-runs-actions">
            <div class="shog-runs-search">
              <input id="shogRunsSearch" type="text" placeholder="Search runs..." autocomplete="off" />
            </div>

            <select id="shogRunsSort" class="shog-runs-sort" title="Sort">
              <option value="created_desc">Newest</option>
              <option value="created_asc">Oldest</option>
              <option value="updated_desc">Updated</option>
              <option value="title_asc">Title A→Z</option>
              <option value="title_desc">Title Z→A</option>
            </select>

            <button id="shogRunsRefresh" class="btn-ghost shog-runs-btn" type="button">Refresh</button>
            <button id="shogRunsExport" class="btn-ghost shog-runs-btn" type="button">Export</button>
            <button id="shogRunsClose" class="btn-ghost shog-runs-btn" type="button">Close</button>
          </div>
        </div>

        <div class="shog-runs-body">
          <aside class="shog-runs-pane shog-runs-pane-left">
            <div class="shog-runs-list" id="shogRunsList" aria-label="Runs list"></div>
            <div class="shog-runs-listfoot">
              <div class="shog-runs-muted" id="shogRunsListHint">Select a run to view details.</div>
            </div>
          </aside>

          <main class="shog-runs-pane shog-runs-pane-right">
            <div class="shog-runs-detail" id="shogRunsDetail">
              <div class="shog-runs-empty">
                <div class="shog-runs-empty-title">No run selected</div>
                <div class="shog-runs-empty-sub">Use <b>Save</b> to create a new run, then open <b>Runs</b>.</div>
              </div>
            </div>
          </main>
        </div>

        <div class="shog-runs-toast" id="shogRunsToast" aria-live="polite"></div>

        <div class="shog-runs-confirm is-hidden" id="shogRunsConfirm">
          <div class="shog-runs-confirm-card">
            <div class="shog-runs-confirm-title" id="shogRunsConfirmTitle">Confirm</div>
            <div class="shog-runs-confirm-msg" id="shogRunsConfirmMsg">—</div>
            <div class="shog-runs-confirm-actions">
              <button class="btn-ghost" id="shogRunsConfirmCancel" type="button">Cancel</button>
              <button class="btn-primary" id="shogRunsConfirmOk" type="button">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind header buttons
    $("#shogRunsClose").addEventListener("click", hideModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideModal();
    });

    $("#shogRunsRefresh").addEventListener("click", () => refreshRuns(true));
    $("#shogRunsExport").addEventListener("click", exportRuns);

    $("#shogRunsSearch").addEventListener("input", (e) => {
      state.search = String(e.target.value || "").trim();
      applyFilterSortRender();
    });

    $("#shogRunsSort").addEventListener("change", (e) => {
      state.sort = String(e.target.value || "created_desc");
      applyFilterSortRender();
    });

    // Confirm dialog
    $("#shogRunsConfirmCancel").addEventListener("click", () => setConfirm(false));
  }

  function showToast(msg, kind = "info") {
    const el = $("#shogRunsToast");
    if (!el) return;
    el.textContent = msg;
    el.className = `shog-runs-toast is-show ${kind}`;
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      el.className = "shog-runs-toast";
      el.textContent = "";
    }, 2400);
  }

  function showModal() {
    ensureModal();
    const overlay = $("#shogRunsOverlay");
    overlay.classList.remove("is-hidden");
    document.body.classList.add("shog-runs-open");
    refreshRuns(false);
  }

  function hideModal() {
    const overlay = $("#shogRunsOverlay");
    if (!overlay) return;
    overlay.classList.add("is-hidden");
    document.body.classList.remove("shog-runs-open");
    setConfirm(false);
  }

  // ---------------------------
  // Render list / detail
  // ---------------------------
  function applyFilterSortRender() {
    const term = state.search.toLowerCase();
    const filtered = (state.runs || []).filter((r) => {
      if (!term) return true;
      const t = `${r.title || ""} ${r.id || ""} ${r.created_at || ""} ${r.updated_at || ""}`.toLowerCase();
      return t.includes(term);
    });

    filtered.sort((a, b) => {
      const sa = state.sort;
      if (sa === "created_asc") return (a.created_at || "").localeCompare(b.created_at || "");
      if (sa === "updated_desc") return (b.updated_at || "").localeCompare(a.updated_at || "");
      if (sa === "title_asc") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sa === "title_desc") return String(b.title || "").localeCompare(String(a.title || ""));
      return (b.created_at || "").localeCompare(a.created_at || "");
    });

    state.filtered = filtered;
    renderList();
    renderDetail();
  }

  function renderList() {
    const list = $("#shogRunsList");
    if (!list) return;

    const items = state.filtered || [];
    $("#shogRunsCount").textContent = `${items.length} run${items.length === 1 ? "" : "s"}`;

    if (!items.length) {
      list.innerHTML = `<div class="shog-runs-list-empty">No runs found.</div>`;
      return;
    }

    list.innerHTML = items.map((r) => {
      const active = (r.id === state.selectedId) ? " is-active" : "";
      const title = escapeHtml(r.title || "(untitled)");
      const created = escapeHtml(fmtIsoShort(r.created_at));
      const idShort = escapeHtml(String(r.id || "").slice(0, 8));
      const updated = r.updated_at && r.updated_at !== r.created_at ? ` • upd. ${escapeHtml(fmtIsoShort(r.updated_at))}` : "";
      return `
        <div class="shog-runs-item${active}" data-run-id="${escapeHtml(r.id)}">
          <div class="shog-runs-item-main">
            <div class="shog-runs-item-title" title="${title}">${title}</div>
            <div class="shog-runs-item-meta">${created}${updated}</div>
            <div class="shog-runs-item-id">#${idShort}</div>
          </div>
          <div class="shog-runs-item-actions">
            <button class="shog-runs-iconbtn" data-action="copy" title="Copy JSON" aria-label="Copy JSON">⎘</button>
            <button class="shog-runs-iconbtn danger" data-action="delete" title="Delete" aria-label="Delete">✕</button>
          </div>
        </div>
      `;
    }).join("");

    $$(".shog-runs-item", list).forEach((el) => {
      el.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button[data-action]") : null;
        const id = el.getAttribute("data-run-id");
        if (!id) return;

        if (btn) {
          const action = btn.getAttribute("data-action");
          if (action === "copy") return void onCopyRun(id);
          if (action === "delete") return void onDeleteRun(id);
        }
        selectRun(id);
      });
    });
  }

  function renderDetail() {
    const detail = $("#shogRunsDetail");
    if (!detail) return;

    const run = state.selectedRun;
    if (!run) {
      detail.innerHTML = `
        <div class="shog-runs-empty">
          <div class="shog-runs-empty-title">No run selected</div>
          <div class="shog-runs-empty-sub">Select a run on the left.</div>
        </div>
      `;
      return;
    }

    const title = escapeHtml(run.title || "");

    const woEnabled = (state.module === "mining");
    if (!woEnabled && state.tab === "work_orders") state.tab = "summary";
    const notes = escapeHtml(run.notes || "");
    const created = escapeHtml(fmtDate(run.created_at));
    const updated = escapeHtml(fmtDate(run.updated_at));
    const appv = escapeHtml(run.app_version || "—");
    const workv = escapeHtml(run.worker_version || "—");
    const schema = escapeHtml(run.schema || "—");

    detail.innerHTML = `
      <div class="shog-runs-detail-head">
        <div class="shog-runs-detail-title">
          <input id="shogRunsEditTitle" type="text" value="${title}" placeholder="Title" />
          <div class="shog-runs-detail-meta">
            <span>Created: <b>${created}</b></span>
            <span class="sep">•</span>
            <span>Updated: <b>${updated}</b></span>
          </div>
        </div>

        <div class="shog-runs-detail-actions">
          <button class="btn-ghost" id="shogRunsCopyBtn" type="button">Copy JSON</button>
          <button class="btn-ghost danger" id="shogRunsDeleteBtn" type="button">Delete</button>
        </div>
      </div>

      <div class="shog-runs-tabs">
        <button class="shog-runs-tab ${state.tab === "summary" ? "is-active" : ""}" data-tab="summary" type="button">Summary</button>
        <button class="shog-runs-tab ${state.tab === "json" ? "is-active" : ""}" data-tab="json" type="button">Raw JSON</button>
        ${state.module === "mining" ? `<button class="shog-runs-tab ${state.tab === "work_orders" ? "is-active" : ""}" data-tab="work_orders" type="button">Ordres</button>` : ""}
      </div>

      <div class="shog-runs-tabpanel ${state.tab === "summary" ? "" : "is-hidden"}" data-panel="summary">
        <div class="shog-runs-summarygrid">
          ${renderSummaryCards(run)}
        </div>

        <div class="shog-runs-editblock">
          <label class="shog-runs-label" for="shogRunsEditNotes">Notes</label>
          <textarea id="shogRunsEditNotes" rows="4" placeholder="Notes...">${notes}</textarea>

          <div class="shog-runs-editactions">
            <button class="btn-primary" id="shogRunsSaveEdit" type="button">Save changes</button>
            <button class="btn-ghost" id="shogRunsRevertEdit" type="button">Revert</button>
          </div>
        </div>

        <div class="shog-runs-footmeta">
          <div><span class="k">Schema</span> <span class="v">${schema}</span></div>
          <div><span class="k">App</span> <span class="v">${appv}</span></div>
          <div><span class="k">Worker</span> <span class="v">${workv}</span></div>
          <div><span class="k">ID</span> <span class="v">${escapeHtml(run.id)}</span></div>
        </div>
      </div>

      ${state.module === "mining" ? `
      <div class="shog-runs-tabpanel ${state.tab === "work_orders" ? "" : "is-hidden"}" data-panel="work_orders">
        ${renderWorkOrdersPanel(run)}
      </div>
      ` : ""}

      <div class="shog-runs-tabpanel ${state.tab === "json" ? "" : "is-hidden"}" data-panel="json">
        <div class="shog-runs-jsonactions">
          <button class="btn-ghost" id="shogRunsCopyBtn2" type="button">Copy JSON</button>
          <button class="btn-ghost" id="shogRunsDownloadBtn" type="button">Download</button>
        </div>
        <pre class="shog-runs-json"><code id="shogRunsJsonCode">${escapeHtml(JSON.stringify(run, null, 2))}</code></pre>
      </div>
    `;

    $("#shogRunsCopyBtn").addEventListener("click", () => onCopySelected());
    $("#shogRunsCopyBtn2").addEventListener("click", () => onCopySelected());
    $("#shogRunsDownloadBtn").addEventListener("click", () => downloadSelected());
    $("#shogRunsDeleteBtn").addEventListener("click", () => onDeleteRun(run.id));

    $("#shogRunsSaveEdit").addEventListener("click", onSaveEdit);
    $("#shogRunsRevertEdit").addEventListener("click", () => {
      $("#shogRunsEditTitle").value = run.title || "";
      $("#shogRunsEditNotes").value = run.notes || "";
      showToast("Reverted", "info");
    });

    $$(".shog-runs-tab", detail).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-tab") || "summary";
        renderDetail();
      });
    });

    if (state.tab === "work_orders" && (state.module === "mining")) bindWorkOrdersPanel(detail);
  }

  
  // ---------------------------
  // Work Orders (MINING) — onglet "Ordres" (FR)
  // ---------------------------
  function pick(obj, keys) {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return null;
  }

  function toBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["1","true","yes","y","ok","paid","sold"].includes(s)) return true;
      if (["0","false","no","n",""].includes(s)) return false;
    }
    return null;
  }

  function normalizeOres(v) {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v.map((x) => {
        if (typeof x === "string") return { name: x, qty: null, unit: null };
        if (x && typeof x === "object") {
          const name = (
            pick(x, ["name","ore","material","label","type"]) ??
            x?.raw?.name ??
            x?.refined?.name ??
            x?.key ??
            "—"
          );
          const qty  = pick(x, ["qty","quantity","amount","scu","value","input_scu","inputScu","input","in_scu","output_scu","outputScu"]); 
          const unit = pick(x, ["unit","uom"]) ?? null;
          return { name: String(name), qty: (qty==null?null:Number(qty)), unit: unit ? String(unit) : null };
        }
        return { name: String(x), qty: null, unit: null };
      });
    }
    if (typeof v === "object") {
      try {
        return Object.keys(v).map((k) => ({ name: String(k), qty: (v[k]==null?null:Number(v[k])), unit: null }));
      } catch { return []; }
    }
    return [{ name: String(v), qty: null, unit: null }];
  }

  function fmtHHMM(val) {
    if (val == null) return "—";
    if (typeof val === "string") return escapeHtml(val);
    const n = Number(val);
    if (!Number.isFinite(n)) return "—";

    // Heuristic: if small (< 1000) assume minutes, else seconds.
    const sec = (n < 1000) ? Math.round(n * 60) : Math.round(n);
    const s = Math.max(0, sec);

    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }

  function extractWorkOrders(run) {
    const candidates = [
      run?.work_orders,
      run?.workOrders,
      run?.result?.work_orders,
      run?.result?.workOrders,
      run?.result?.refinery?.work_orders,
      run?.result?.refinery?.workOrders,
      run?.result?.refinery?.orders,
      run?.inputs?.work_orders,
      run?.inputs?.workOrders,
    ];
    const list = candidates.find((x) => Array.isArray(x) && x.length) || null;
    if (list) return list.map((wo) => normalizeWorkOrder(wo, run)).filter(Boolean);

    // Fallback: attempt single object-like order
    const wo = normalizeWorkOrder(run?.result?.payload || run?.result?.refinery || run?.result || run?.inputs || null, run);
    return wo ? [wo] : [];
  }

  function normalizeWorkOrder(src, run) {
    if (!src || typeof src !== "object") return null;

    const type = pick(src, ["type","method","refinery_method","process","mode","name"]) ?? "—";
    const orderId = pick(src, ["order_id","orderId","id","job_id","jobId"]) ?? run?.id ?? "—";

    const ores = normalizeOres(
      pick(src, ["ores","materials","inputs","items","ore_list","oreList"]) ??
      run?.inputs?.ores ??
      run?.result?.ores ??
      run?.items
    );

    const yieldScu  = pick(src, ["yield_scu","yieldScu","yield","output_scu","outputScu","result_scu","resultScu"]);
    const grossAuec = pick(src, ["gross","gross_total","grossTotal","gross_auec","grossAuec"]);
    const netAuec   = pick(src, ["net","net_total","netTotal","net_auec","netAuec"]);
    const duration  = pick(src, ["duration","duration_s","durationS","time","time_s","timeS","eta"]);

    const sold  = toBool(pick(src, ["sold","is_sold","isSold"])) ?? null;
    const paid  = toBool(pick(src, ["paid","is_paid","isPaid"])) ?? null;
    const parts = pick(src, ["shares","share_count","shareCount","parts","parts_count"]);

    // Derive missing fields from nested mining payloads (result.payload)
    const totalsObj = (
      src?.totals ||
      src?.payload?.totals ||
      src?.result?.totals ||
      src?.result?.payload?.totals ||
      null
    );

    // Prefer method label when type is unknown.
    const derivedType = (
      src?.selected?.method?.label ||
      src?.selected?.method?.code ||
      src?.method?.label ||
      src?.method ||
      null
    );

    // For mining: items are in payload.items; each item carries raw.name and input_scu/output_scu.
    const derivedItems = (
      src?.items ||
      src?.payload?.items ||
      src?.result?.payload?.items ||
      null
    );

    // Compute yield (output SCU) if missing.
    let computedYieldScu = null;
    if (yieldScu == null && Array.isArray(derivedItems) && derivedItems.length) {
      const s = derivedItems.reduce((a,it)=>a+(Number.isFinite(Number(it?.output_scu))?Number(it.output_scu):0),0);
      if (Number.isFinite(s) && s > 0) computedYieldScu = s;
    }
    if (yieldScu == null && computedYieldScu == null && totalsObj && Number.isFinite(Number(totalsObj.input_scu))) {
      computedYieldScu = Number(totalsObj.input_scu);
    }

    // Derive gross/net from totals if absent.
    const derivedGross = (grossAuec==null && totalsObj && totalsObj.gross_auec!=null) ? Number(totalsObj.gross_auec) : null;
    const derivedNet   = (netAuec==null   && totalsObj && totalsObj.net_auec!=null)   ? Number(totalsObj.net_auec)   : null;

    // Derive duration (seconds) from totals.total_time_h if present.
    const derivedDur = (duration==null && totalsObj && Number.isFinite(Number(totalsObj.total_time_h)))
      ? Math.round(Number(totalsObj.total_time_h) * 3600)
      : null;

    return {
      type: String((type !== "—" ? type : (derivedType ?? type))),
      orderId: String(orderId),
      ores: (ores && ores.length) ? ores : normalizeOres(derivedItems),
      yieldScu: (yieldScu==null ? (computedYieldScu==null?null:Number(computedYieldScu)) : Number(yieldScu)),
      grossAuec: (grossAuec==null ? (derivedGross==null?null:derivedGross) : Number(grossAuec)),
      netAuec: (netAuec==null ? (derivedNet==null?null:derivedNet) : Number(netAuec)),
      duration: (duration==null ? derivedDur : duration),
      sold,
      paid,
      parts: (parts==null?null:Number(parts)),
    };
  }

  function renderWorkOrdersPanel(run) {
    const orders = extractWorkOrders(run);
    const total = orders.length;

    const tYield = orders.reduce((a,o)=>a+(Number.isFinite(o.yieldScu)?o.yieldScu:0),0);
    const tGross = orders.reduce((a,o)=>a+(Number.isFinite(o.grossAuec)?o.grossAuec:0),0);
    const tNet   = orders.reduce((a,o)=>a+(Number.isFinite(o.netAuec)?o.netAuec:0),0);

    const rows = total ? orders.map((o) => {
      const ores = (o.ores && o.ores.length)
        ? o.ores.map((x) => `<span class="wo-badge${x.qty!=null ? "" : " wo-badge-muted"}">${escapeHtml(x.name)}</span>`).join("")
        : `<span class="wo-badge wo-badge-muted">—</span>`;

      const sold = (o.sold == null) ? `<span class="wo-pill wo-pill-muted">—</span>`
                 : (o.sold ? `<span class="wo-pill wo-pill-ok">Oui</span>` : `<span class="wo-pill wo-pill-muted">Non</span>`);

      const paid = (o.paid == null) ? `<span class="wo-pill wo-pill-muted">—</span>`
                 : (o.paid ? `<span class="wo-pill wo-pill-ok">Oui</span>` : `<span class="wo-pill wo-pill-muted">Non</span>`);

      const parts = (o.parts == null) ? "" : ` <span style="opacity:.8">/ ${fmtNumber(o.parts)} part${o.parts===1?"":"s"}</span>`;
      const dur = (o.duration == null) ? "—" : fmtHHMM(o.duration);

      return `
        <tr class="wo-row${o.paid ? " is-paid" : ""}">
          <td>${escapeHtml(o.type)}</td>
          <td class="wo-mono">${escapeHtml(o.orderId)}</td>
          <td class="wo-ores">${ores}</td>
          <td class="wo-num">${(Number.isFinite(o.yieldScu)) ? `${fmtNumber(o.yieldScu)} <span class="wo-unit">SCU</span>` : "—"}</td>
          <td class="wo-num">${(Number.isFinite(o.grossAuec)) ? `${fmtNumber(o.grossAuec)} <span class="wo-unit">aUEC</span>` : "—"}</td>
          <td class="wo-num">${(Number.isFinite(o.netAuec)) ? `${fmtNumber(o.netAuec)} <span class="wo-unit">aUEC</span>` : "—"}</td>
          <td class="wo-num">${escapeHtml(dur)}</td>
          <td>${sold}</td>
          <td>${paid}${parts}</td>
        </tr>
      `;
    }).join("") : `
      <tr class="wo-empty">
        <td colspan="9"><div class="wo-emptyBox">Aucun ordre.</div></td>
      </tr>
    `;

    return `
      <section class="wo-panel" id="shogWoPanel" data-hide-paid="0" data-collapsed="0" data-total="${total}">
        <header class="wo-bar">
          <button class="wo-collapse" id="shogWoCollapse" type="button" aria-expanded="true" title="Replier / Déplier">▾</button>
          <div class="wo-title">Ordres de raffinage <span class="wo-count" id="shogWoCount">(${total}/${total})</span></div>

          <label class="wo-toggle" title="Masquer les commandes payées">
            <span class="wo-toggle-label">Masquer payées</span>
            <input id="shogWoHidePaid" type="checkbox" />
            <span class="wo-switch" aria-hidden="true"></span>
          </label>
        </header>

        <div class="wo-tableWrap">
          <table class="wo-table" aria-label="Ordres de raffinage">
            <thead>
              <tr>
                <th class="wo-th">Type</th>
                <th class="wo-th">ID commande</th>
                <th class="wo-th">Minerais</th>
                <th class="wo-th wo-num">Rendement</th>
                <th class="wo-th wo-num">Brut</th>
                <th class="wo-th wo-num">Net</th>
                <th class="wo-th wo-num"><span class="wo-ico" aria-hidden="true">⏱</span>Durée</th>
                <th class="wo-th">Vendu</th>
                <th class="wo-th">Payé / Parts</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="wo-totals">
                <td colspan="3">Totaux</td>
                <td class="wo-num">${total ? `${fmtNumber(tYield)} <span class="wo-unit">SCU</span>` : "—"}</td>
                <td class="wo-num">${total ? `${fmtNumber(tGross)} <span class="wo-unit">aUEC</span>` : "—"}</td>
                <td class="wo-num">${total ? `${fmtNumber(tNet)} <span class="wo-unit">aUEC</span>` : "—"}</td>
                <td class="wo-num">—</td><td>—</td><td>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    `;
  }

  function bindWorkOrdersPanel(detailRoot) {
    const panel = $("#shogWoPanel", detailRoot);
    if (!panel) return;

    const cb = $("#shogWoHidePaid", panel);
    const collapseBtn = $("#shogWoCollapse", panel);
    const countEl = $("#shogWoCount", panel);

    function updateCount() {
      const total = Number(panel.dataset.total || "0");
      const hidePaid = panel.dataset.hidePaid === "1";
      if (!countEl) return;

      if (!hidePaid) { countEl.textContent = `(${total}/${total})`; return; }

      const visible = $$(".wo-row", panel).filter((tr) => !tr.classList.contains("is-paid")).length;
      countEl.textContent = `(${visible}/${total})`;
    }

    if (cb) {
      cb.addEventListener("change", () => {
        panel.dataset.hidePaid = cb.checked ? "1" : "0";
        updateCount();
      });
    }

    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => {
        const isCollapsed = panel.dataset.collapsed === "1";
        panel.dataset.collapsed = isCollapsed ? "0" : "1";
        collapseBtn.setAttribute("aria-expanded", isCollapsed ? "true" : "false");
      });
    }

    updateCount();
  }


  function renderSummaryCards(run) {
    const ship = (run.ship && !/sélectionner\s+un\s+vaisseau/i.test(String(run.ship))) ? escapeHtml(String(run.ship)) : "—";
    const totals = (
      run.totals ||
      run.result?.payload?.totals ||
      run.result?.totals ||
      run.result?.payload?.payload?.totals ||
      null
    );

    const net = (
      totals?.net_total ??
      totals?.net_auec ??
      totals?.net ??
      run.net_total ??
      run.result?.net_total ??
      null
    );

    const perHour = (
      totals?.net_per_hour ??
      totals?.net_per_hour_auec ??
      totals?.per_hour ??
      run.net_per_hour ??
      run.result?.net_per_hour ??
      null
    );

    const itemsCount = (() => {
      const n = run.items_count ?? (Array.isArray(run.items) ? run.items.length : null);
      if (typeof n === "number") return n;
      if (run.inputs && Array.isArray(run.inputs.items)) return run.inputs.items.length;
      return null;
    })();

    const inputsCount = (() => {
      const i = run.inputs;
      if (i && typeof i === "object") {
        if (typeof i.count === "number") return i.count;
        if (Array.isArray(i.items)) return i.items.length;
        if (typeof i.total_input_scu === "number") return null; // not a count
        try { return Object.keys(i).length; } catch { return null; }
      }
      return null;
    })();

    const fields = [
      { k: "Ship", v: ship },
      { k: "Net total", v: (net == null) ? "—" : `${fmtNumber(net)} aUEC` },
      { k: "Net / hour", v: (perHour == null) ? "—" : `${fmtNumber(perHour)} aUEC/h` },
      { k: "Items", v: (itemsCount == null) ? "—" : String(itemsCount) },
      { k: "Inputs", v: (inputsCount == null) ? "—" : String(inputsCount) },
      { k: "Title", v: escapeHtml(run.title || "—") },
    ];

    return fields.map((f) => `
      <div class="shog-runs-card">
        <div class="shog-runs-card-k">${escapeHtml(f.k)}</div>
        <div class="shog-runs-card-v">${f.v}</div>
      </div>
    `).join("");
  }

  // ---------------------------
  // Actions
  // ---------------------------
  async function refreshRuns() {
    if (state.loading) return;
    ensureModal();

    state.loading = true;
    $("#shogRunsListHint").textContent = "Loading…";

    try {
      const list = await apiListRuns(state.module);
      state.runs = Array.isArray(list.runs) ? list.runs : [];

      if (state.selectedId && !state.runs.some(r => r.id === state.selectedId)) {
        state.selectedId = null;
        state.selectedRun = null;
      }
      applyFilterSortRender();
      $("#shogRunsListHint").textContent = "";
    } catch (err) {
      console.error("[runs-ui] list error", err);
      $("#shogRunsList").innerHTML = `<div class="shog-runs-list-empty">Cannot load runs: ${escapeHtml(err.message || String(err))}</div>`;
      $("#shogRunsListHint").textContent = "";
      showToast(err.message || "Error", "error");
    } finally {
      state.loading = false;
    }
  }

  async function selectRun(id) {
    if (!id) return;
    state.selectedId = id;
    renderList();

    try {
      const data = await apiGetRun(state.module, id);
      state.selectedRun = normalizeRun(data.run || null);
      if (state.selectedRun && state.selectedRun.id) {
        const i = state.runs.findIndex(r => r.id === state.selectedRun.id);
        if (i >= 0) state.runs[i] = { ...state.runs[i], ...state.selectedRun };
      }
      renderDetail();
    } catch (err) {
      console.error("[runs-ui] get error", err);
      showToast(err.message || "Error", "error");
      state.selectedRun = state.runs.find(r => r.id === id) || null;
      renderDetail();
    }
  }

  async function onCopyRun(id) {
    try {
      const data = await apiGetRun(state.module, id);
      const ok = await copyToClipboard(JSON.stringify(data.run || data, null, 2));
      showToast(ok ? "Copied" : "Copy failed", ok ? "ok" : "error");
    } catch (err) {
      showToast(err.message || "Error", "error");
    }
  }

  async function onCopySelected() {
    if (!state.selectedRun) return;
    const ok = await copyToClipboard(JSON.stringify(state.selectedRun, null, 2));
    showToast(ok ? "Copied" : "Copy failed", ok ? "ok" : "error");
  }

  function downloadSelected() {
    if (!state.selectedRun) return;
    const id = String(state.selectedRun.id || "run");
    const fn = `shog_${state.module}_run_${id}.json`;
    downloadJson(fn, state.selectedRun);
    showToast("Downloaded", "ok");
  }

  function exportRuns() {
    if (!getDiscordToken()) {
      showToast("Login requis", "error");
      return;
    }

    const module = (state.module || "mining").toLowerCase();
    const runs = (state.filtered && state.filtered.length ? state.filtered : state.runs).slice(0);

    (async () => {
      try {
        showToast("Export en cours…", "info");

        const full = [];
        for (const r of runs) {
          if (!r || !r.id) continue;
          try {
            const data = await apiGetRun(module, r.id);
            const rr = normalizeRun(data.run || null);
            if (rr) full.push(rr);
          } catch (e) {
            full.push(normalizeRun({ ...r }));
          }
        }

        const payload = {
          exported_at: new Date().toISOString(),
          module,
          runs: full
        };

        downloadJson(`shog_${module}_runs_export.json`, payload);
        showToast("Export OK", "ok");
      } catch (e) {
        console.error("[runs-ui] export error", e);
        showToast("Export échoué", "error");
      }
    })();
  }

function setConfirm(show, { title, message, okText, onOk } = {}) {
    const box = $("#shogRunsConfirm");
    if (!box) return;
    if (!show) {
      box.classList.add("is-hidden");
      return;
    }
    $("#shogRunsConfirmTitle").textContent = title || "Confirm";
    $("#shogRunsConfirmMsg").textContent = message || "—";
    $("#shogRunsConfirmOk").textContent = okText || "OK";
    box.classList.remove("is-hidden");

    const okBtn = $("#shogRunsConfirmOk");
    okBtn.onclick = async () => {
      try { if (typeof onOk === "function") await onOk(); }
      finally { setConfirm(false); }
    };
  }

  async function onDeleteRun(id) {
    if (!id) return;
    const target = state.runs.find(r => r.id === id) || state.selectedRun || { id };

    setConfirm(true, {
      title: "Delete run",
      message: `Delete "${target.title || id}"? This cannot be undone.`,
      okText: "Delete",
      onOk: async () => {
        try {
          await apiDeleteRun(state.module, id);
          showToast("Deleted", "ok");
          await refreshRuns();

          if (state.filtered.length) {
            const next = state.filtered[0].id;
            state.selectedId = next;
            await selectRun(next);
          } else {
            state.selectedId = null;
            state.selectedRun = null;
            renderDetail();
          }
        } catch (err) {
          console.error("[runs-ui] delete error", err);
          showToast(err.message || "Delete failed", "error");
        }
      }
    });
  }

  async function onSaveEdit() {
    if (!state.selectedRun) return;

    const runId = state.selectedRun.id;
    const base = state.selectedRun;

    const newTitle = String($("#shogRunsEditTitle").value || "").trim();
    const newNotes = String($("#shogRunsEditNotes").value || "").trim();

    // IMPORTANT: some backends interpret PUT as a full replacement.
    // If we send only {title, notes}, we may wipe all existing run fields.
    // So we PUT the full run merged with the edited fields.
    const patch = {
      title: newTitle || base.title || "Run",
      notes: newNotes || null,
    };

    const payload = { ...base, ...patch };

    try {
      const res = await apiUpdateRun(state.module, runId, payload);
      const updated = (res && res.run) ? res.run : null;

      // Prefer backend-returned run, but keep payload fields to avoid losing local data
      const finalRun = updated ? ({ ...payload, ...updated }) : payload;

      state.selectedRun = finalRun;

      const idx = state.runs.findIndex(r => r.id === runId);
      if (idx >= 0) state.runs[idx] = { ...state.runs[idx], ...finalRun };

      applyFilterSortRender();
      showToast("Saved", "ok");
    } catch (err) {
      console.error("[runs-ui] update error", err);
      showToast(err.message || "Save failed", "error");
    }
  }


  // ---------------------------
  // Save run entrypoints
  // ---------------------------
  async function saveCurrentRun(moduleOverride = null) {
    if (!getDiscordToken()) {
      showToast("Login required", "error");
      return;
    }

    const module = (moduleOverride || state.module || "mining").toLowerCase();

    // Keep state coherent even if save is called from outside the modal.
    state.module = module;

    try {
      // Base payload (module + schema + metadata)
      let payload = buildBasePayload(module);

      // Module snapshot builder (optional).
      // This allows MINING (advanced) / FRET / SALVAGE to inject ship/inputs/config/result.
      try {
        const builders = window.SHOG_RUN_BUILDERS || null;
        const fn = (builders && typeof builders === "object") ? builders[module] : null;

        let extra = null;
        if (typeof fn === "function") {
          extra = fn();
        } else if (typeof window.SHOG_BUILD_RUN_PAYLOAD === "function") {
          extra = window.SHOG_BUILD_RUN_PAYLOAD(module);
        }

        if (extra && typeof extra === "object") {
          payload = { ...payload, ...extra };
        } else if (module === "mining") {
          showToast("Aucune donnée MINAGE (mode avancé) détectée pour ce run.", "info");
        }
      } catch (e) {
        console.warn("[runs-ui] builder merge failed", e);
        if (module === "mining") showToast("Snapshot MINAGE indisponible (mode avancé).", "info");
      }

      const res = await apiCreateRun(module, payload);
      const created = (res && res.run) ? normalizeRun(res.run) : null;

      showToast("Run saved", "ok");
      showModal();

      // OPTIMISTIC: insert locally (listing can lag)
      if (created && created.id) {
        const idx = state.runs.findIndex(r => r.id === created.id);
        if (idx === -1) state.runs.unshift(created);
        else state.runs[idx] = { ...state.runs[idx], ...created };

        state.selectedRun = created;
        applyFilterSortRender();

        try {
          await refreshRuns();
          if (!state.runs.some(r => r.id === created.id)) {
            state.runs.unshift(created);
            applyFilterSortRender();
          }
        } catch (e) {
          console.warn("[runs-ui] refresh after create failed", e);
        }

        try { await selectRun(created.id); } catch (e) { console.warn("[runs-ui] select created failed", e); }
        return;
      }

      await refreshRuns();
      if (state.filtered.length) {
        await selectRun(state.filtered[0].id);
      }
    } catch (err) {
      console.error("[runs-ui] save error", err);
      showToast(err.message || "Save failed", "error");
    }
  }


  // ---------------------------
  // Auth-dependent UI visibility + bindings
  // ---------------------------
  function syncAuthDependentUi() {
    const logged = !!getDiscordToken();

    // Buttons can be implemented with different IDs/classes depending on module versions.
    const saveSelectors = [
      "#btnSaveRun",
      "#btnSaveRunTop",
      "#shogSaveRunBtn",
      "#shogSaveBtn",
      "[data-shog-run-save]",
      ".shog-run-save",
      "button[data-action='save-run']",
    ];

    const runsSelectors = [
      "#btnMyRuns",
      "#btnMyRunsTop",
      "#shogRunsBtn",
      "[data-shog-run-list]",
      ".shog-run-list",
      "button[data-action='open-runs']",
    ];

    const all = [];
    saveSelectors.forEach((sel) => all.push(...$$(sel)));
    runsSelectors.forEach((sel) => all.push(...$$(sel)));

    // De-dupe
    const uniq = Array.from(new Set(all));

    uniq.forEach((el) => {
      try {
        // Preserve original display for restoration
        if (el.dataset && !el.dataset.shogOrigDisplay) {
          const cs = window.getComputedStyle(el);
          el.dataset.shogOrigDisplay = (cs && cs.display && cs.display !== "none") ? cs.display : "";
        }

        if (!logged) {
          el.style.display = "none";
          if (typeof el.disabled === "boolean") el.disabled = true;
          el.setAttribute("aria-disabled", "true");
        } else {
          // Restore
          el.style.display = el.dataset.shogOrigDisplay || "";
          if (typeof el.disabled === "boolean") el.disabled = false;
          el.removeAttribute("aria-disabled");
        }
      } catch (_) {
        // ignore per element
      }
    });

    // When login status changes, rebind clicks (some DOM nodes are replaced by other scripts)
    bindSaveRunsButtons();
  }

  function bindSaveRunsButtons() {
    const saveSelectors = [
      "#btnSaveRun",
      "#btnSaveRunTop",
      "#shogSaveRunBtn",
      "#shogSaveBtn",
      "[data-shog-run-save]",
      ".shog-run-save",
      "button[data-action='save-run']",
    ];

    const runsSelectors = [
      "#btnMyRuns",
      "#btnMyRunsTop",
      "#shogRunsBtn",
      "[data-shog-run-list]",
      ".shog-run-list",
      "button[data-action='open-runs']",
    ];

    const bindOnce = (el, handler) => {
      if (!el || (el.dataset && el.dataset.shogRunsBound === "1")) return;
      if (el.dataset) el.dataset.shogRunsBound = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        handler();
      });
    };

    saveSelectors.forEach((sel) => $$(sel).forEach((el) => bindOnce(el, saveCurrentRun)));
    runsSelectors.forEach((sel) => $$(sel).forEach((el) => bindOnce(el, showModal)));
  }

  function startObserver() {
    const mo = new MutationObserver(() => {
      fixSupportLink();
      syncAuthDependentUi();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function boot() {
    try {
      state.module = detectModule();
      fixSupportLink();
      bindSaveRunsButtons();
      syncAuthDependentUi();
      startObserver();

      // Token watcher: covers logout/login round-trips and bridge flows
      let lastToken = getDiscordToken();
      window.setInterval(() => {
        const t = getDiscordToken();
        if (t !== lastToken) {
          lastToken = t;
          syncAuthDependentUi();
          // If user logs out while modal open, close it
          if (!t) hideModal();
        }
      }, 750);

      window.addEventListener("focus", syncAuthDependentUi);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) syncAuthDependentUi();
      });

      // Expose minimal debug
      window.SHOG_RUNS_UI = {
        version: RUNS_UI_VERSION,
        open: showModal,
        refresh: () => refreshRuns(),
        save: saveCurrentRun,
        sync: syncAuthDependentUi,
      };
    } catch (err) {
      console.error("[runs-ui] boot error", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
  // ---------------------------
  // Normalize run objects (support multiple schemas / nested payloads)
  // ---------------------------
  function normalizeRun(run) {
    if (!run || typeof run !== "object") return run;

    const payload = run.result?.payload || run.result?.data || run.result?.payload?.payload || null;
    const totals = run.totals || payload?.totals || run.result?.totals || null;

    if (!run.totals && totals) run.totals = totals;

    if (totals) {
      if (run.net_total == null && typeof totals.net_auec === "number") run.net_total = totals.net_auec;
      if (run.net_total == null && typeof totals.net_total === "number") run.net_total = totals.net_total;

      if (run.net_per_hour == null && typeof totals.net_per_hour === "number") run.net_per_hour = totals.net_per_hour;
      if (run.net_per_hour == null && typeof totals.net_per_hour_auec === "number") run.net_per_hour = totals.net_per_hour_auec;

      if (run.gross_total == null && typeof totals.gross_auec === "number") run.gross_total = totals.gross_auec;
      if (run.gross_total == null && typeof totals.gross_total === "number") run.gross_total = totals.gross_total;
    }

    if (run.items_count == null) {
      const itemsLen = Array.isArray(payload?.items) ? payload.items.length : null;
      const inputsLen = Array.isArray(run.inputs?.items) ? run.inputs.items.length : null;
      run.items_count = (typeof itemsLen === "number") ? itemsLen : (typeof inputsLen === "number" ? inputsLen : null);
    }

    return run;
  }


