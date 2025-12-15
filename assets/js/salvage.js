/* salvage.js - Version V1.4.8b
   - Split ships: Salvation / Vulture+Fortune
   - Top ventes: parsing robuste multi-formats (sans casser le script)
   - Garde : prix UEX, aUEC/h, configs, presets

   Notes rendement :
   - Les valeurs "boucle (minutes)" sont des presets modifiables.
     Si tu veux que je colle exactement à la transcription YouTube, envoie-moi le texte ou le lien/timestamp.
*/

(() => {
  const LS_KEY  = "salvage.module.state.v1_4_8b";
  const CFG_KEY = "salvage.module.configs.v1_4_8b";

  // Proxy Worker (UEX)
  const WORKER_URL = "https://salvage-uex-proxy.yoyoastico74.workers.dev/";

  const $ = (id) => document.getElementById(id);

async function copyToClipboard(text){
  const t = String(text || "").trim();
  if(!t) return false;

  try{
    await navigator.clipboard.writeText(t);
    return true;
  }catch(_){
    try{
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    }catch(__){
      return false;
    }
  }
}

  const num = (v) => {
    const x = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const fmt = (n) => `${Math.round(num(n)).toLocaleString("fr-FR")} aUEC`;
  const fmtH = (n) => `${Math.round(num(n)).toLocaleString("fr-FR")} aUEC/h`;

  function setText(id, v){ const el = $(id); if(el) el.textContent = v; }

  // Preset raffinage (mode Débutant)
  let begRefineMode = "refine"; // refine | sell
  let begRefineYield = 0.30;
  let begRefineLabel = "CMR (≈30% après raffinage)";


  // ---------------------------------------------------------------------------
  // Ships (split Salvation vs Vulture/Fortune)
  // ---------------------------------------------------------------------------
  const SHIPS = [
  {
    id:"salvation",
    name:"Salvation",
    note:"Collecte très rapide.",
    beginner:{ loopMin:40, refineMode:"refine", refineYield:0.30 },
    advanced:{ loopMin:40, feesPct:0, refineMode:"refine", refineYield:0.30 }
  },
  {
    id:"vulture_fortune",
    name:"Vulture / Fortune",
    note:"Collecte très rapide.",
    beginner:{ loopMin:55, refineMode:"refine", refineYield:0.30 },
    advanced:{ loopMin:55, feesPct:0, refineMode:"refine", refineYield:0.30 }
  },
  {
    id:"reclaimer",
    name:"Reclaimer",
    note:"Équipage conseillé.",
    beginner:{ loopMin:60, refineMode:"refine", refineYield:0.15 },
    advanced:{ loopMin:60, feesPct:0, refineMode:"refine", refineYield:0.15 }
  },
  {
    id:"custom",
    name:"Custom",
    note:"Tes propres valeurs."
  }
];

  function populateShips(){
    const sel = $("shipSelect");
    if(!sel) return;
    sel.innerHTML = "";
    for(const s of SHIPS){
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    }
  }

  function applyShipPreset(){
    const id = $("shipSelect")?.value || "custom";
    const ship = SHIPS.find(s => s.id === id) || SHIPS[SHIPS.length - 1];

    if($("shipNote")) $("shipNote").textContent = ship.note || "";

    if(ship.beginner?.loopMin && $("begLoopMinutes")) $("begLoopMinutes").value = String(ship.beginner.loopMin);
    if(ship.advanced?.loopMin && $("loopMinutes")) $("loopMinutes").value = String(ship.advanced.loopMin);
    if(ship.advanced?.feesPct != null && $("feesPct")) $("feesPct").value = String(ship.advanced.feesPct);


// Preset raffinage (CMR/CMS -> CMAT)
const presetMode = ship.beginner?.refineMode || ship.advanced?.refineMode;
const presetYield = ship.beginner?.refineYield ?? ship.advanced?.refineYield;

if(presetMode && $("cmatRefineMode")) $("cmatRefineMode").value = presetMode;
if(presetYield != null && $("cmatRefineYield")) {
  const y = Number(presetYield);
  // Backward compatible: old presets used 0.30 / 1.00; UI now expects percent (15, 30, 100)
  $("cmatRefineYield").value = (Number.isFinite(y) && y <= 1.0) ? String(Math.round(y * 100)) : String(y);
}

// Badge profil joueur (Débutant)
const badge = $("shipProfileBadge");
const meta = $("shipMetaHint");
if(badge){
  badge.classList.remove("ship-badge-off","ship-badge-solo","ship-badge-stable","ship-badge-multi");
  let label = "—";
  let metaTxt = "Profil : —";

  if(id === "salvation"){
    label = "SOLO / RAPIDE";
    metaTxt = "Profil : boucle courte, collecte rapide";
    badge.classList.add("ship-badge-solo");
  } else if(id === "vulture_fortune"){
    label = "SOLO STABLE";
    metaTxt = "Profil : solo, rendement régulier";
    badge.classList.add("ship-badge-stable");
  } else if(id === "reclaimer"){
    label = "MULTI / LOGISTIQUE";
    metaTxt = "Profil : équipage conseillé, logistique lourde";
    badge.classList.add("ship-badge-multi");
  } else {
    label = "CUSTOM";
    metaTxt = "Profil : valeurs personnalisées";
    badge.classList.add("ship-badge-off");
  }

  badge.textContent = label;
  if(meta) meta.textContent = metaTxt;
}

    calcBeginner();
    calcAdvanced();
  }

  // ---------------------------------------------------------------------------
  // Status thresholds
  // ---------------------------------------------------------------------------
  function thresholds(){
    const ok = num($("thrOk")?.value);
    const good = num($("thrGood")?.value);
    return { ok: Math.min(ok, good), good: Math.max(ok, good) };
  }

  function setStatus(el, perHour){
    if(!el) return;
    const v = num(perHour);
    const { ok, good } = thresholds();

    el.classList.remove("status-off","status-bad","status-ok","status-good");

    if(v <= 0){
      el.textContent = "—";
      el.classList.add("status-off");
      return;
    }
    if(v >= good){
      el.textContent = "BON";
      el.classList.add("status-good");
      return;
    }
    if(v >= ok){
      el.textContent = "OK";
      el.classList.add("status-ok");
      return;
    }
    el.textContent = "FAIBLE";
    el.classList.add("status-bad");
  }

  // ---------------------------------------------------------------------------
  // Calculs
  // ---------------------------------------------------------------------------
  function calcBeginner(){
    const scuR = num($("scuRmc")?.value);
    const scuC = num($("scuCmat")?.value);
    const pR = num($("priceRmc")?.value);
    const pC = num($("priceCmat")?.value);
    const loopMin = clamp(num($("begLoopMinutes")?.value), 1, 9999);

    const vR = scuR * pR;

    let vC = scuC * pC;
    if(begRefineMode === "refine") vC = vC * begRefineYield;
    const total = vR + vC;

    const hours = loopMin / 60;
    const perHour = hours > 0 ? total / hours : 0;

    setText("outRmc", fmt(vR));
    setText("outCmat", fmt(vC));
    setText("outTotal", fmt(total));
    setText("outPerHour", fmtH(perHour));
    setText("outPerHourBig", fmtH(perHour));
    setStatus($("outStatus"), perHour);

    persist();
  }

  function calcAdvanced(){
    const scuR = num($("advScuRmc")?.value);
    const scuC = num($("advScuCmat")?.value);
    const pR = num($("advPriceRmc")?.value);
    const pC = num($("advPriceCmat")?.value);

    const feesPct = clamp(num($("feesPct")?.value), 0, 100);
    const loopMin = clamp(num($("loopMinutes")?.value), 1, 9999);

    const mode = $("cmatRefineMode")?.value || "sell";
    const yieldInput = clamp(num($("cmatRefineYield")?.value), 0, 100);
    // UI expects percent (15/30/100). Backward compatible with legacy fraction (0.15/0.30/1.0).
    const yieldFactor = (yieldInput <= 1.0) ? yieldInput : (yieldInput / 100);

    const vR = scuR * pR;
    let vC = scuC * pC;
    if(mode === "refine") vC = vC * yieldFactor;

    const gross = vR + vC;
    const net = gross * (1 - feesPct / 100);

    const hours = loopMin / 60;
    const perHour = hours > 0 ? net / hours : 0;

    setText("advValRmc", fmt(vR));
    setText("advValCmat", fmt(vC));
    setText("advGross", fmt(gross));
    setText("advNet", fmt(net));
    setText("advPerHour", fmtH(perHour));

    setText("sumNet", fmt(net));
    setText("sumHours", hours.toFixed(2) + " h");
    setText("sumPerHour", fmtH(perHour));
    setStatus($("sumStatus"), perHour);

    const rb = $("refineBlock");
    if(rb) rb.style.display = (mode === "refine") ? "" : "none";

    persist();
  }

  // ---------------------------------------------------------------------------
  // Top ventes – rendu
  // ---------------------------------------------------------------------------
  function renderTopList(containerId, items, opts){
  const el = $(containerId);
  if(!el) return;
  el.innerHTML = "";

  const o = opts || {};
  const showApply = !!o.showApply;
  const kind = o.kind || ""; // "rmc" | "cmat"

  if(!items || !items.length){
    el.innerHTML = '<div class="panel-note">—</div>';
    return;
  }

  for(const it of items.slice(0,3)){
    const card = document.createElement("div");
    card.className = "sale-item";

    const main = document.createElement("div");
    main.className = "sale-main";

    const term = document.createElement("div");
    term.className = "sale-terminal";
    term.textContent = it.terminal || "Terminal";

    const loc = document.createElement("div");
    loc.className = "sale-location";
    loc.textContent = it.location || "";

    main.appendChild(term);
    main.appendChild(loc);

    const actions = document.createElement("div");
    actions.className = "sale-actions";

    const price = document.createElement("div");
    price.className = "sale-price";
    price.textContent = `${Math.round(num(it.price)).toLocaleString("fr-FR")} aUEC/SCU`;

    actions.appendChild(price);

    if(showApply){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sale-apply";
      btn.textContent = "Appliquer";
      btn.addEventListener("click", () => applyTopSale(kind, it));
      actions.appendChild(btn);
    }

    card.appendChild(main);
    card.appendChild(actions);
    el.appendChild(card);
  }
}


function pickFirst(it, keys){
  for(const k of keys){
    const v = it?.[k];
    if(v == null) continue;
    const s = String(v).trim();
    if(s) return s;
  }
  return "";
}

function formatSalePoint(it){
  // Normalize UEX fields (various naming conventions)
  const terminal = pickFirst(it, ["name","terminal","terminalName","terminal_name","station","stationName","station_name","port","outpost"]);
  const planet   = pickFirst(it, ["location","location_name","planet","planetName","planet_name","body","body_name","system","system_name"]);
  const zone     = pickFirst(it, ["zone", "zoneName", "zone_name", "area", "area_name"]);

  const parts = [terminal, zone, planet].filter(Boolean);

  // If nothing usable, still return a placeholder (so user understands data is missing)
  return parts.length ? parts.join(" • ") : "Point de vente non fourni par UEX";
}

function applyTopSale(kind, it){
  // Mode Avancé uniquement : applique le prix + affiche la source
  const price = Math.round(num(it?.price));
  if(!Number.isFinite(price) || price <= 0) return;

  const term = (it?.terminal || "Terminal").trim();
  const loc  = (it?.location || "").trim();

  if(kind === "rmc"){
    const inp = $("advPriceRmc");
    if(inp) inp.value = String(price);
  } else if(kind === "cmat"){
    const inp = $("advPriceCmat");
    if(inp) inp.value = String(price);
  } else {
    return;
  }

  // Force mode Advanced visible
  setMode("advanced");

  // Recalc
  calcAdvanced();

  // Status line
  const s = $("uexStatusLineAdv");
  if(s){
    const label = (kind === "rmc") ? "RMC" : "CMAT";
    s.textContent = `UEX : appliqué (${label}) — ${term}${loc ? " • " + loc : ""}`;
  }
}

function spotParts(o){
    if(!o || typeof o !== "object") return { terminal:"—", location:"" };

    const terminal = String(o.name || o.terminal || o.terminal_name || o.kiosk || o.trade_terminal || o.location_name || "").trim();
    const area    = String(o.city || o.outpost || o.station || o.zone || o.area || o.location || o.place || "").trim();
    const planet  = String(o.planet || o.planet_name || o.body || o.celestial || "").trim();
    const system  = String(o.system || o.system_name || "").trim();

    const loc = [];
    if(area && area.toLowerCase() !== terminal.toLowerCase()) loc.push(area);
    if(planet && system) loc.push(`${planet} (${system})`);
    else if(planet) loc.push(planet);
    else if(system) loc.push(system);

    return { terminal: terminal || (area || "—"), location: loc.join(" — ") };
  }

  // ---------------------------------------------------------------------------
  // UEX status lines
  // ---------------------------------------------------------------------------
  function setUexLine(which, ok, msg){
    const id = which === "adv" ? "uexStatusLineAdv" : "uexStatusLine";
    const el = $(id);
    if(!el) return;
    el.textContent = msg;
    el.style.opacity = ok ? "1" : "0.85";
  }

  
function setUexLock(isOn){
  const badge = $("uexLockBadge");
  const wrap = $("priceRmc")?.closest(".form-row");
  if(badge) badge.style.display = isOn ? "inline-flex" : "none";
  if(wrap) wrap.classList.toggle("uex-locked", !!isOn);
}

function setUexUpdated(ts){
    const el = $("uexLastUpdate");
    if(!el) return;
    if(!ts){ el.textContent = "Dernière MAJ UEX : —"; return; }
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    el.textContent = `Dernière MAJ UEX : ${hh}:${mm}`;
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
// Top ventes – parsing (payload Worker v6.x : rmc.topTerminals / cmat.topTerminals)
// ---------------------------------------------------------------------------
function isObject(v){ return v && typeof v === "object" && !Array.isArray(v); }

function extractPrice(o){
  if(!o || typeof o !== "object") return 0;
  return num(
    o.sell ?? o.sell_price ?? o.sellPrice ?? o.price ?? o.value ?? o.unit_price ?? o.unitPrice ?? 0
  );
}

function looksLikeTerminalObj(o){
  if(!o || typeof o !== "object") return false;
  const p = extractPrice(o);
  if(!(p > 0)) return false;

  // Worker payload uses "name" + "location" (+ sell)
  const hasName = !!(o.terminal || o.terminal_name || o.kiosk || o.trade_terminal || o.name || o.location_name);
  const hasLoc  = !!(o.location || o.place || o.city || o.station || o.outpost || o.planet || o.system || o.zone || o.area);
  return hasName || hasLoc;
}

function pickTopArray(data, kind){
  // Primary (Worker format)
  const node = (kind === "rmc") ? data?.rmc : data?.cmat;

  if(Array.isArray(node?.topTerminals) && node.topTerminals.length) return node.topTerminals;
  if(Array.isArray(node?.top3) && node.top3.length) return node.top3;
  if(Array.isArray(node?.top) && node.top.length) return node.top;
  if(Array.isArray(node?.best) && node.best.length) return node.best;
  if(Array.isArray(node?.terminals) && node.terminals.length) return node.terminals;

  // Sometimes bestTerminal is a single object
  if(isObject(node?.bestTerminal)) return [node.bestTerminal];

  // Fallback deep scan: first array that resembles terminals
  return deepScanForTop(data);
}

function deepScanForTop(data){
  const seen = new Set();
  const stack = [data];

  while(stack.length){
    const cur = stack.pop();
    if(!cur || typeof cur !== "object") continue;
    if(seen.has(cur)) continue;
    seen.add(cur);

    if(Array.isArray(cur)){
      if(cur.length >= 3 && looksLikeTerminalObj(cur[0])) return cur;
      for(const v of cur) if(v && typeof v === "object") stack.push(v);
      continue;
    }
    for(const k of Object.keys(cur)){
      const v = cur[k];
      if(v && typeof v === "object") stack.push(v);
    }
  }
  return [];
}

function normalizeTopList(arr){
  const items = (Array.isArray(arr) ? arr : []).slice()
    .filter(looksLikeTerminalObj)
    .sort((a,b) => extractPrice(b) - extractPrice(a))
    .slice(0,3)
    .map(o => {
      const p = spotParts(o);
      return { terminal: p.terminal, location: p.location, price: extractPrice(o) };
    });
  return items;
}

  // UEX refresh (prix + top ventes)
  // ---------------------------------------------------------------------------
  
function extractSeries(historyArr){
  if(!Array.isArray(historyArr)) return [];
  const out = [];
  for(const it of historyArr){
    if(!it) continue;
    const v = (it.sell != null) ? Number(it.sell) : ((it.price != null) ? Number(it.price) : NaN);
    if(!Number.isFinite(v)) continue;
    out.push({ v });
  }
  return out;
}

function fmtNum(n){
  try { return Intl.NumberFormat("fr-FR").format(Math.round(n)); } catch(_) { return String(Math.round(n)); }
}

function renderAdvPriceHistoryChart(payload){
  const canvas = $("advPriceHistoryChart");
  const status = $("advChartStatus");
  if(!canvas) return;

  const rmc = payload?.rmc ? extractSeries(payload.rmc.history) : [];
  const cmat = payload?.cmat ? extractSeries(payload.cmat.history) : [];

  if(status){
    const rN = rmc.length, cN = cmat.length;
    status.textContent = (rN || cN) ? `RMC: ${rN} points • CMAT: ${cN} points` : "Aucune donnée d’historique.";
  }

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 260;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.clearRect(0,0,cssW,cssH);
  ctx.fillStyle = "rgba(0,0,0,.08)";
  ctx.fillRect(0,0,cssW,cssH);

  const padL = 46, padR = 14, padT = 14, padB = 28;
  const W = cssW - padL - padR;
  const H = cssH - padT - padB;

  const all = [...rmc.map(x=>x.v), ...cmat.map(x=>x.v)];
  if(all.length === 0){
      lastChartPoints = null;
    ctx.strokeStyle = "rgba(231,236,255,.12)";
    ctx.beginPath();
    ctx.moveTo(padL, padT + H/2);
    ctx.lineTo(padL + W, padT + H/2);
    ctx.stroke();
    return;
  }

  let vMin = Math.min(...all);
  let vMax = Math.max(...all);
  if(vMin === vMax){ vMin = vMin * 0.95; vMax = vMax * 1.05; }

  function yScale(v){
    const t = (v - vMin) / (vMax - vMin);
    return padT + (1 - t) * H;
  }

  // grid (3 ticks)
  ctx.strokeStyle = "rgba(231,236,255,.10)";
  ctx.fillStyle = "rgba(231,236,255,.55)";
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  for(let i=0;i<3;i++){
    const tt = i/2;
    const v = vMax - tt*(vMax-vMin);
    const y = yScale(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + W, y);
    ctx.stroke();
    ctx.fillText(fmtNum(v), 8, y + 4);
  }

  function drawSeries(series, strokeStyle){
    if(series.length < 2) return;
    const n = series.length;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const x = padL + (i/(n-1))*W;
      const y = yScale(series[i].v);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    ctx.fillStyle = strokeStyle;
    for(let i=0;i<n;i++){
      const x = padL + (i/(n-1))*W;
      const y = yScale(series[i].v);
      ctx.beginPath();
      ctx.arc(x,y,2.2,0,Math.PI*2);
      ctx.fill();
    }
  }

  drawSeries(rmc, "rgba(0,229,255,.92)");
  drawSeries(cmat, "rgba(231,236,255,.85)");

  ctx.strokeStyle = "rgba(231,236,255,.14)";
  ctx.beginPath();
  ctx.moveTo(padL, padT + H);
  ctx.lineTo(padL + W, padT + H);
  ctx.stroke();
}

function bindChartHover(){
  const canvas = $("advPriceHistoryChart");
  const tip = $("advChartTooltip");
  if(!canvas || !tip) return;

  function hide(){
    tip.classList.remove("is-on");
    tip.setAttribute("aria-hidden","true");
  }

  function show(x,y,seriesName,val){
    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
    const dotClass = (seriesName === "RMC") ? "lg-rmc" : "lg-cmat";
    const dotColor = (seriesName === "RMC") ? "rgba(0,229,255,.92)" : "rgba(231,236,255,.85)";
    tip.innerHTML = `
      <div class="tt-title"><span class="tt-dot" style="background:${dotColor}"></span>${seriesName}</div>
      <div class="tt-line"><span>Valeur</span><span class="tt-val">${fmtMoney(val)} aUEC</span></div>
    `;
    tip.classList.add("is-on");
    tip.setAttribute("aria-hidden","false");
  }

  canvas.addEventListener("mousemove", (ev) => {
    if(!lastChartPoints) return hide();

    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    const { padL, padT, W, H, vMin, vMax, rmc, cmat } = lastChartPoints;

    function yScale(v){
      const t = (v - vMin) / (vMax - vMin);
      return padT + (1 - t) * H;
    }

    function nearest(series){
      if(!series || series.length < 2) return null;
      const n = series.length;
      const xi = Math.round(((mx - padL) / W) * (n-1));
      if(xi < 0 || xi >= n) return null;
      const x = padL + (xi/(n-1))*W;
      const y = yScale(series[xi].v);
      const dx = mx - x, dy = my - y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      return { xi, x, y, v: series[xi].v, dist };
    }

    const a = nearest(rmc);
    const b = nearest(cmat);
    const best = [a,b].filter(Boolean).sort((p,q)=>p.dist-q.dist)[0];

    // threshold in px
    if(!best || best.dist > 18) return hide();

    const seriesName = (best === a) ? "RMC" : "CMAT";
    show(best.x, best.y, seriesName, best.v);
  });

  canvas.addEventListener("mouseleave", hide);
}

async function refreshUex(){
  try{
    setUexLine("beg", true, "UEX : actualisation…");
    setUexLine("adv", true, "UEX : actualisation…");

    const r = await fetch(WORKER_URL, { cache: "no-store" });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();

    lastUexPayload = data;
    renderAdvPriceHistoryChart(data);
lastUexPayload = data;
    renderAdvPriceHistoryChart(data);

    // ---------------- Prices (Worker format: rmc.price / cmat.price + bestTerminal.sell + history[].sell)
    const rNode = data?.rmc || {};
    const cNode = data?.cmat || {};

    const rHist = Array.isArray(rNode.history) ? rNode.history : [];
    const cHist = Array.isArray(cNode.history) ? cNode.history : [];

    const lastR = rHist.length ? rHist[rHist.length - 1] : null;
    const lastC = cHist.length ? cHist[cHist.length - 1] : null;

    let pR = (typeof rNode.price === "number") ? rNode.price : 0;
    let pC = (typeof cNode.price === "number") ? cNode.price : 0;

    // Prefer explicit bestTerminal.sell if present
    if(typeof rNode?.bestTerminal?.sell === "number") pR = rNode.bestTerminal.sell;
    if(typeof cNode?.bestTerminal?.sell === "number") pC = cNode.bestTerminal.sell;

    // Or last history sell
    if(lastR && typeof lastR.sell === "number") pR = lastR.sell;
    if(lastC && typeof lastC.sell === "number") pC = lastC.sell;

    if($("priceRmc")) $("priceRmc").value = String(pR || 0);
    if($("advPriceRmc")) $("advPriceRmc").value = String(pR || 0);

    if($("priceCmat")) $("priceCmat").value = String(pC || 0);
    if($("advPriceCmat")) $("advPriceCmat").value = String(pC || 0);

    // ---------------- Top ventes
    const topRraw = pickTopArray(data, "rmc");
    const topCraw = pickTopArray(data, "cmat");

    const topR = normalizeTopList(topRraw);
    const topC = normalizeTopList(topCraw);

    renderTopList("topRmc", topR);
    // Mode Avancé (avec bouton Appliquer)
    renderTopList("topRmcAdv", topR, { showApply:true, kind:"rmc" });
    renderTopList("topCmat", topC);
    renderTopList("topCmatAdv", topC, { showApply:true, kind:"cmat" });

    const hasAnyTop = topR.length || topC.length;
    if(hasAnyTop){
      setUexLine("beg", true, "UEX : opérationnel (prix & top ventes)");
    } else {
      setUexLine("beg", true, "UEX : opérationnel (prix) — top ventes indisponible");
    }
    setUexLine("adv", true, "UEX : opérationnel (prix à jour)");
    setUexUpdated(Date.now());

      setUexLock(true);

    calcBeginner();
    calcAdvanced();
  }catch(e){
    setUexLine("beg", false, "UEX : indisponible (saisie manuelle)");
    setUexLine("adv", false, "UEX : indisponible (saisie manuelle)");
    renderTopList("topRmc", []);
      renderTopList("topRmcAdv", [], { showApply:true, kind:"rmc" });
    renderTopList("topCmat", []);
      renderTopList("topCmatAdv", [], { showApply:true, kind:"cmat" });
    setUexUpdated(null);
      setUexLock(false);
    lastUexPayload = null;
    renderAdvPriceHistoryChart(null);
}
}

  // ---------------------------------------------------------------------------
  // Configs
  // ---------------------------------------------------------------------------
  function readConfigs(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY) || "{}") || {}; }catch(_){ return {}; } }
  function writeConfigs(c){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(c || {})); }catch(_){ } }
  function currentSlot(){ return $("configSlot")?.value || "slot1"; }

  function fillConfigMeta(){
    const cfg = readConfigs();
    const s = cfg?.[currentSlot()];
    if($("configName")) $("configName").value = s?.name || "";
  }

  function snapshotState(){
    return {
      mode: $("btnBeginner")?.classList.contains("is-active") ? "beginner" : "advanced",
      beginner: {
        ship: $("shipSelect")?.value || "vulture_fortune",
        loopMin: $("begLoopMinutes")?.value || "45",
        scuRmc: $("scuRmc")?.value || "0",
        scuCmat: $("scuCmat")?.value || "0",
        priceRmc: $("priceRmc")?.value || "0",
        priceCmat: $("priceCmat")?.value || "0",
      },
      advanced: {
        loopMinutes: $("loopMinutes")?.value || "45",
        feesPct: $("feesPct")?.value || "0",
        thrOk: $("thrOk")?.value || "250000",
        thrGood: $("thrGood")?.value || "500000",
        refineMode: $("cmatRefineMode")?.value || "sell",
        refineYield: $("cmatRefineYield")?.value || "1.00",
        scuRmc: $("advScuRmc")?.value || "0",
        scuCmat: $("advScuCmat")?.value || "0",
        priceRmc: $("advPriceRmc")?.value || "0",
        priceCmat: $("advPriceCmat")?.value || "0",
      }
    };
  }

  function applyState(s){
    if(s?.beginner){
      if($("shipSelect")) $("shipSelect").value = s.beginner.ship ?? "vulture_fortune";
      if($("begLoopMinutes")) $("begLoopMinutes").value = s.beginner.loopMin ?? "45";
      if($("scuRmc")) $("scuRmc").value = s.beginner.scuRmc ?? "0";
      if($("scuCmat")) $("scuCmat").value = s.beginner.scuCmat ?? "0";
      if($("priceRmc")) $("priceRmc").value = s.beginner.priceRmc ?? "0";
      if($("priceCmat")) $("priceCmat").value = s.beginner.priceCmat ?? "0";
    }
    if(s?.advanced){
      if($("loopMinutes")) $("loopMinutes").value = s.advanced.loopMinutes ?? "45";
      if($("feesPct")) $("feesPct").value = s.advanced.feesPct ?? "0";
      if($("thrOk")) $("thrOk").value = s.advanced.thrOk ?? "250000";
      if($("thrGood")) $("thrGood").value = s.advanced.thrGood ?? "500000";
      if($("cmatRefineMode")) $("cmatRefineMode").value = s.advanced.refineMode ?? "sell";
      if($("cmatRefineYield")) $("cmatRefineYield").value = s.advanced.refineYield ?? "1.00";
      if($("advScuRmc")) $("advScuRmc").value = s.advanced.scuRmc ?? "0";
      if($("advScuCmat")) $("advScuCmat").value = s.advanced.scuCmat ?? "0";
      if($("advPriceRmc")) $("advPriceRmc").value = s.advanced.priceRmc ?? "0";
      if($("advPriceCmat")) $("advPriceCmat").value = s.advanced.priceCmat ?? "0";
    }
    setMode(s?.mode === "advanced" ? "advanced" : "beginner");
    applyShipPreset();
  }

  function persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(snapshotState())); }catch(_){ } }
  function restore(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      applyState(JSON.parse(raw));
    }catch(_){ }
  }

  function saveConfig(){
    const cfg = readConfigs();
    cfg[currentSlot()] = { name: ($("configName")?.value || "").trim(), ts: Date.now(), state: snapshotState() };
    writeConfigs(cfg);
    fillConfigMeta();
  }

  function loadConfig(){
    const cfg = readConfigs();
    const s = cfg?.[currentSlot()]?.state;
    if(!s) return;
    applyState(s);
    fillConfigMeta();
    calcBeginner();
    calcAdvanced();
  }

  // ---------------------------------------------------------------------------
  // Modes
  // ---------------------------------------------------------------------------
  function setMode(mode){
    const isBeg = mode === "beginner";
    if($("modeBeginner")) $("modeBeginner").style.display = isBeg ? "" : "none";
    if($("modeAdvanced")) $("modeAdvanced").style.display = isBeg ? "none" : "";
    $("btnBeginner")?.classList.toggle("is-active", isBeg);
    $("btnAdvanced")?.classList.toggle("is-active", !isBeg);
    persist();
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  function bind(){
    $("btnBeginner")?.addEventListener("click", () => setMode("beginner"));
    $("btnAdvanced")?.addEventListener("click", () => setMode("advanced"));

    $("shipSelect")?.addEventListener("change", applyShipPreset);

["scuRmc","scuCmat","begLoopMinutes","priceRmc","priceCmat"].forEach(id => {
  $(id)?.addEventListener("input", () => {
    if(id === "priceRmc" || id === "priceCmat") setUexLock(false);
    lastUexPayload = null;
    renderAdvPriceHistoryChart(null);
calcBeginner();
  });
  $(id)?.addEventListener("change", () => {
    if(id === "priceRmc" || id === "priceCmat") setUexLock(false);
    lastUexPayload = null;
    renderAdvPriceHistoryChart(null);
calcBeginner();
  });

// Copie terminal sélectionné (Mode Avancé)
$("btnCopySale")?.addEventListener("click", async () => {
  const t = (lastSelectedSaleText && String(lastSelectedSaleText).trim()) || ($("advSelectedSale")?.textContent || "").trim();
  const ok = await copyToClipboard(t);
  const sum = $("sumStatus");
  if(sum && t){
    sum.textContent = ok ? `Copié : ${t}` : `Copie impossible : ${t}`;
  }

// Recalcul live — Mode Avancé uniquement
["advScuRmc","advScuCmat","advLoopMinutes","advPriceRmc","advPriceCmat","cmatRefineYield"].forEach(id => {
  $(id)?.addEventListener("input", () => { calcAdvanced(); });
});
});
});

    ["advScuRmc","advScuCmat","advPriceRmc","advPriceCmat","feesPct","loopMinutes","thrOk","thrGood","cmatRefineMode","cmatRefineYield"].forEach(id => {
      $(id)?.addEventListener("input", calcAdvanced);
      $(id)?.addEventListener("change", calcAdvanced);
    });

    $("btnRefreshUex")?.addEventListener("click", refreshUex);
    $("btnRefreshUexAdv")?.addEventListener("click", refreshUex);

    // Historique des prix (UEX) — Mode Avancé
    $("btnChartRefreshAdv")?.addEventListener("click", refreshUex);
    window.addEventListener("resize", () => { if(lastUexPayload) renderAdvPriceHistoryChart(lastUexPayload); });

    $("btnSaveConfig")?.addEventListener("click", saveConfig);
    $("btnLoadConfig")?.addEventListener("click", loadConfig);
    $("configSlot")?.addEventListener("change", fillConfigMeta);

    $("btnResetBeginner")?.addEventListener("click", () => {
      if($("shipSelect")) $("shipSelect").value = "vulture_fortune";
      if($("scuRmc")) $("scuRmc").value = "0";
      if($("scuCmat")) $("scuCmat").value = "0";
      if($("begLoopMinutes")) $("begLoopMinutes").value = "45";
      applyShipPreset();
      calcBeginner();
    });

    $("btnResetAdvanced")?.addEventListener("click", () => {
      if($("loopMinutes")) $("loopMinutes").value = "45";
      if($("feesPct")) $("feesPct").value = "0";
      if($("thrOk")) $("thrOk").value = "250000";
      if($("thrGood")) $("thrGood").value = "500000";
      if($("cmatRefineMode")) $("cmatRefineMode").value = "sell";
      if($("cmatRefineYield")) $("cmatRefineYield").value = "1.00";
      if($("advScuRmc")) $("advScuRmc").value = "0";
      if($("advScuCmat")) $("advScuCmat").value = "0";
      calcAdvanced();
    });
  }

  function init(){
    populateShips();
    bind();
    restore();
    fillConfigMeta();

    if($("shipSelect") && !$("shipSelect").value) $("shipSelect").value = "vulture_fortune";
    applyShipPreset();

    calcBeginner();
    calcAdvanced();
    refreshUex();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
