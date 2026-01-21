/* assets/js/runs-ui.js — V1.0.1 (RUNS_UI_POLISH)
   Runs modal UI (shared FRET / SALVAGE / MINING)
   - 2-pane responsive layout
   - Search + selection + on-demand detail fetch
   - Tabs (Summary / JSON) + Copy JSON
*/

(function(){
  "use strict";

  const RUNS_API_BASE = (window.SHOG_RUNS_API || "https://saveruns.yoyoastico74.workers.dev").replace(/\/$/, "");
  const TOKEN_KEY = "shog.discord.token";

  const state = {
    module: null,
    list: [],
    selectedId: null,
    detailCache: new Map(),
    search: ""
  };

  function getToken(){
    return sessionStorage.getItem(TOKEN_KEY) || null;
  }

  async function authFetch(path, init){
    const t = getToken();
    if(!t){
      const err = new Error("Missing Discord token");
      err.code = "NO_TOKEN";
      throw err;
    }
    const headers = Object.assign({}, (init && init.headers) || {}, {
      "Authorization": "Bearer " + t
    });
    const res = await fetch(RUNS_API_BASE + path, Object.assign({}, init || {}, { headers }));
    return res;
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function truncateId(id){
    const s = String(id || "");
    if(s.length <= 12) return s;
    return s.slice(0,6) + "…" + s.slice(-4);
  }

  function fmtDate(iso){
    if(!iso) return "—";
    try{
      const d = new Date(iso);
      if(isNaN(d.getTime())) return String(iso);
      const pad = (n)=> String(n).padStart(2,"0");
      return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }catch(_){
      return String(iso);
    }
  }

  function ensureModal(){
    if(document.getElementById("shogRunsModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "shogRunsModal";
    overlay.className = "shog-modal-overlay is-hidden";
    overlay.innerHTML = `
      <div class="shog-modal" role="dialog" aria-modal="true" aria-label="My Runs">
        <div class="shog-modal-header">
          <div>
            <div class="shog-modal-title">
              <span>My Runs</span>
              <span class="shog-modal-subtitle" id="shogRunsSub">—</span>
            </div>
          </div>
          <div class="shog-modal-actions">
            <div class="shog-modal-search" title="Search by title / id">
              <input id="shogRunsSearch" type="text" placeholder="Search…" autocomplete="off" />
            </div>
            <button class="shog-btn" id="shogRunsRefreshBtn" type="button">Refresh</button>
            <button class="shog-btn" id="shogRunsCloseBtn" type="button">Close</button>
          </div>
        </div>

        <div class="shog-modal-body">
          <div class="shog-runs-list-pane">
            <div id="shogRunsList" class="shog-runs-list"></div>
          </div>
          <div class="shog-runs-detail-pane">
            <div id="shogRunsDetail" class="shog-runs-detail">
              <div class="shog-empty">Select a run on the left.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close / overlay click
    overlay.addEventListener("click", (e)=>{
      if(e.target === overlay) close();
    });
    document.getElementById("shogRunsCloseBtn").addEventListener("click", close);
    document.getElementById("shogRunsRefreshBtn").addEventListener("click", ()=> {
      if(state.module) open(state.module, { force: true });
    });

    const searchInput = document.getElementById("shogRunsSearch");
    searchInput.addEventListener("input", ()=>{
      state.search = (searchInput.value || "").trim().toLowerCase();
      renderList();
    });

    // ESC to close
    document.addEventListener("keydown", (e)=>{
      if(e.key === "Escape"){
        const el = document.getElementById("shogRunsModal");
        if(el && !el.classList.contains("is-hidden")) close();
      }
    });
  }

  function showOverlay(){
    ensureModal();
    document.getElementById("shogRunsModal").classList.remove("is-hidden");
  }

  function close(){
    const el = document.getElementById("shogRunsModal");
    if(el) el.classList.add("is-hidden");
  }

  async function fetchList(module){
    const res = await authFetch(`/runs/${encodeURIComponent(module)}`);
    const json = await res.json().catch(()=> ({}));
    if(!res.ok){
      const msg = json && (json.message || json.error) ? (json.message || json.error) : ("HTTP " + res.status);
      throw new Error(msg);
    }
    const runs = Array.isArray(json.runs) ? json.runs : (Array.isArray(json.items) ? json.items : []);
    return runs;
  }

  async function fetchDetail(module, id){
    const key = module + "::" + id;
    if(state.detailCache.has(key)) return state.detailCache.get(key);

    const res = await authFetch(`/runs/${encodeURIComponent(module)}/${encodeURIComponent(id)}`);
    const json = await res.json().catch(()=> ({}));
    if(!res.ok){
      const msg = json && (json.message || json.error) ? (json.message || json.error) : ("HTTP " + res.status);
      throw new Error(msg);
    }

    // detail payload can be {run: {...}} or direct object
    const run = json.run || json.item || json || null;
    state.detailCache.set(key, run);
    return run;
  }

  function setSubTitle(text){
    const el = document.getElementById("shogRunsSub");
    if(el) el.textContent = text || "—";
  }

  function renderError(whereEl, message){
    whereEl.innerHTML = `<div class="shog-empty"><b>Error</b><div style="margin-top:6px; opacity:.85;">${escapeHtml(message || "Unknown error")}</div></div>`;
  }

  function renderList(){
    const listEl = document.getElementById("shogRunsList");
    if(!listEl) return;

    const q = state.search;
    const items = (state.list || [])
      .slice()
      .sort((a,b)=> {
        const da = new Date(a.created_at || a.updated_at || 0).getTime() || 0;
        const db = new Date(b.created_at || b.updated_at || 0).getTime() || 0;
        return db - da;
      })
      .filter(it=>{
        if(!q) return true;
        const hay = (String(it.title || "") + " " + String(it.id || "")).toLowerCase();
        return hay.includes(q);
      });

    if(items.length === 0){
      listEl.innerHTML = `<div class="shog-empty">No runs found.</div>`;
      return;
    }

    const html = items.map(it=>{
      const id = it.id || "";
      const title = it.title || ("Run " + (state.module || "—"));
      const created = fmtDate(it.created_at);
      const updated = it.updated_at && it.updated_at !== it.created_at ? fmtDate(it.updated_at) : null;
      const mod = String(it.module || state.module || "").toUpperCase();
      const badgeMod = mod ? `<span class="shog-badge is-accent">${escapeHtml(mod)}</span>` : "";
      const badgeId = id ? `<span class="shog-badge">${escapeHtml(truncateId(id))}</span>` : "";
      const badgeItems = (it.items_count != null) ? `<span class="shog-badge">Items: ${escapeHtml(it.items_count)}</span>` : "";

      const active = (state.selectedId === id) ? "is-active" : "";
      const meta = [
        `<span>${escapeHtml(created)}</span>`,
        updated ? `<span>Updated: ${escapeHtml(updated)}</span>` : ""
      ].filter(Boolean).join(" • ");

      return `
        <button class="shog-run-card ${active}" type="button" data-run-id="${escapeHtml(id)}">
          <div class="shog-run-title">${escapeHtml(title)}</div>
          <div class="shog-run-meta">${meta}</div>
          <div class="shog-run-badges">${badgeMod}${badgeId}${badgeItems}</div>
        </button>
      `;
    }).join("");

    listEl.innerHTML = html;

    // Bind clicks
    listEl.querySelectorAll(".shog-run-card").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-run-id");
        if(!id) return;
        await selectRun(id);
      });
    });
  }

  function renderDetailSkeleton(){
    const detailEl = document.getElementById("shogRunsDetail");
    if(!detailEl) return;
    detailEl.innerHTML = `<div class="shog-empty shog-loading">Loading…</div>`;
  }

  function kv(label, value){
    const v = (value === undefined || value === null || value === "") ? "—" : String(value);
    return `<div class="shog-kv"><div class="shog-k">${escapeHtml(label)}</div><div class="shog-v">${escapeHtml(v)}</div></div>`;
  }

  function renderDetail(run){
    const detailEl = document.getElementById("shogRunsDetail");
    if(!detailEl) return;

    if(!run){
      detailEl.innerHTML = `<div class="shog-empty">No details available.</div>`;
      return;
    }

    const title = run.title || "Run";
    const created = fmtDate(run.created_at);
    const updated = run.updated_at && run.updated_at !== run.created_at ? fmtDate(run.updated_at) : "—";
    const id = run.id || "—";

    const summaryHtml = `
      <div class="shog-kv-grid">
        ${kv("Run ID", id)}
        ${kv("Module", (run.module || state.module || "—").toUpperCase())}
        ${kv("Created", created)}
        ${kv("Updated", updated)}
        ${kv("Ship", run.ship || "—")}
        ${kv("Items count", (run.items_count != null ? run.items_count : "—"))}
        ${kv("App version", run.app_version || "—")}
        ${kv("Worker version", run.worker_version || "—")}
      </div>
    `;

    const raw = JSON.stringify(run, null, 2);

    detailEl.innerHTML = `
      <div class="shog-detail-head">
        <div>
          <h3 class="shog-detail-title">${escapeHtml(title)}</h3>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            ${id && id !== "—" ? `<span class="shog-badge">${escapeHtml(truncateId(id))}</span>` : ""}
            <span class="shog-badge is-accent">${escapeHtml(String((run.module || state.module || "—")).toUpperCase())}</span>
          </div>
        </div>
        <div class="shog-detail-actions">
          <button class="shog-btn" id="shogRunsCopyBtn" type="button">Copy JSON</button>
        </div>
      </div>

      <div class="shog-tabs">
        <button class="shog-tab is-active" id="shogTabSummary" type="button">Summary</button>
        <button class="shog-tab" id="shogTabJson" type="button">JSON</button>
      </div>

      <div id="shogRunsTabContent">
        ${summaryHtml}
        <div class="shog-empty" style="margin-top:10px; opacity:.82;">
          Tip: if some fields are empty (—), save your run after computing results in the tool.
        </div>
      </div>

      <div id="shogRunsJsonPanel" class="shog-json" style="display:none; margin-top:10px;">
        <pre>${escapeHtml(raw)}</pre>
      </div>
    `;

    // Bind tab switches
    const tabSummary = detailEl.querySelector("#shogTabSummary");
    const tabJson = detailEl.querySelector("#shogTabJson");
    const content = detailEl.querySelector("#shogRunsTabContent");
    const jsonPanel = detailEl.querySelector("#shogRunsJsonPanel");

    tabSummary.addEventListener("click", ()=>{
      tabSummary.classList.add("is-active");
      tabJson.classList.remove("is-active");
      if(content) content.style.display = "";
      if(jsonPanel) jsonPanel.style.display = "none";
    });
    tabJson.addEventListener("click", ()=>{
      tabJson.classList.add("is-active");
      tabSummary.classList.remove("is-active");
      if(content) content.style.display = "none";
      if(jsonPanel) jsonPanel.style.display = "";
    });

    // Copy JSON
    const copyBtn = detailEl.querySelector("#shogRunsCopyBtn");
    copyBtn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(raw);
        copyBtn.textContent = "Copied";
        setTimeout(()=>{ copyBtn.textContent = "Copy JSON"; }, 1000);
      }catch(_){
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = raw;
        document.body.appendChild(ta);
        ta.select();
        try{ document.execCommand("copy"); }catch(__){}
        document.body.removeChild(ta);
        copyBtn.textContent = "Copied";
        setTimeout(()=>{ copyBtn.textContent = "Copy JSON"; }, 1000);
      }
    });
  }

  async function selectRun(id){
    state.selectedId = id;
    renderList(); // update active state
    renderDetailSkeleton();

    try{
      const run = await fetchDetail(state.module, id);
      renderDetail(run);
    }catch(err){
      const detailEl = document.getElementById("shogRunsDetail");
      renderError(detailEl, err && err.message ? err.message : String(err));
    }
  }

  async function open(module, opts){
    state.module = module;
    showOverlay();
    setSubTitle(String(module || "—").toUpperCase());

    const listEl = document.getElementById("shogRunsList");
    const detailEl = document.getElementById("shogRunsDetail");
    if(listEl) listEl.innerHTML = `<div class="shog-empty shog-loading">Loading…</div>`;
    if(detailEl) detailEl.innerHTML = `<div class="shog-empty">Select a run on the left.</div>`;

    // If token missing, show helpful message
    if(!getToken()){
      if(listEl) listEl.innerHTML = `<div class="shog-empty"><b>Not logged in</b><div style="margin-top:6px; opacity:.85;">Login with Discord first to access your runs.</div></div>`;
      return;
    }

    try{
      if(opts && opts.force){
        state.detailCache.clear();
      }
      const runs = await fetchList(module);
      state.list = runs || [];
      state.selectedId = null;
      renderList();
      if(state.list.length > 0){
        // auto-select most recent
        const sorted = state.list.slice().sort((a,b)=>{
          const da = new Date(a.created_at || a.updated_at || 0).getTime() || 0;
          const db = new Date(b.created_at || b.updated_at || 0).getTime() || 0;
          return db - da;
        });
        const firstId = sorted[0] && sorted[0].id;
        if(firstId) await selectRun(firstId);
      }
    }catch(err){
      renderError(listEl, err && err.message ? err.message : String(err));
    }
  }

  // Public API
  window.ShogRunsUI = {
    open,
    close
  };
})();
