// assets/js/advanced_goods.js — V1_0_0
// Mode Avancé — Étape 1 : Comparateur de marchandises (sans routes)
// UX-first : Top 3 en cards horizontales + liste complète.
// UEX API 2.0 : nécessite un Bearer token (stocké en localStorage).

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat("fr-FR");

  // Context
  const shipBtn = $("advShipPickerBtn");
  const shipLabel = $("advShipPickerLabel");
  const shipMenu = $("advShipPickerMenu");
  const shipSearch = $("advShipSearch");
  const shipList = $("advShipList");

  const cargoScu = $("advCargoScu");
  const scuMode = $("advScuMode");
  const loopMax = $("advLoopMax");
  const chip20 = $("advLoopChip20");
  const chip30 = $("advLoopChip30");
  const chip45 = $("advLoopChip45");
  const riskLow = $("advRiskLow");
  const riskNormal = $("advRiskNormal");
  const riskHigh = $("advRiskHigh");
  const targetPH = $("advTargetProfitHour");
  const resetBtn = $("advReset");

  const tokenInput = $("advUexToken");

  // Goods UI
  const modeToggle = $("advModeToggle");
  const refreshBtn = $("advRefreshBtn");
  const lastUpdate = $("advLastUpdate");
  const uexStatus = $("advUexStatus");

  const topPicks = $("advTopPicks");
  const goodsSearch = $("advGoodsSearch");
  const filterStable = $("advFilterStable");
  const filterVariable = $("advFilterVariable");
  const filterVolatile = $("advFilterVolatile");
  const stockOnly = $("advStockOnly");
  const goodsList = $("advGoodsList");

  // Manual block (prepared, not active yet)
  const manualBlock = $("advManualBlock");

  // Data (ships from local file to stay consistent with Beginner)
  let ALL_SHIPS = [];
  let selectedShipIdx = null;
  let manualCargo = false;

  // Placeholder goods dataset until UEX adapter is wired
  // (This prevents empty UI, and keeps us iteration-friendly.)
  let GOODS = [
    { name:"Titanium", margin: 1.8, stability:"Stable", stock:"OK", risk:1, verdict:"Acceptable" },
    { name:"Beryl", margin: 2.4, stability:"Variable", stock:"OK", risk:2, verdict:"Recommandée" },
    { name:"Quantanium", margin: 4.7, stability:"Volatile", stock:"Faible", risk:3, verdict:"À éviter" },
    { name:"Agricium", margin: 2.1, stability:"Stable", stock:"OK", risk:1, verdict:"Acceptable" },
    { name:"Gold", margin: 3.1, stability:"Variable", stock:"OK", risk:2, verdict:"Recommandée" },
  ];

  const STORAGE_KEY = "hauling_advanced_v1";

  function openMenu(menu, btn){
    menu?.classList.remove("is-hidden");
    btn?.setAttribute("aria-expanded","true");
  }
  function closeMenu(menu, btn){
    menu?.classList.add("is-hidden");
    btn?.setAttribute("aria-expanded","false");
  }
  function toggleMenu(menu, btn){
    if (!menu) return;
    const hidden = menu.classList.contains("is-hidden");
    hidden ? openMenu(menu, btn) : closeMenu(menu, btn);
  }

  function setActiveChip(minutes){
    [chip20, chip30, chip45].forEach(c => c?.classList.remove("is-active"));
    if (minutes === 20) chip20?.classList.add("is-active");
    if (minutes === 30) chip30?.classList.add("is-active");
    if (minutes === 45) chip45?.classList.add("is-active");
  }

  function setRisk(level){
    [riskLow, riskNormal, riskHigh].forEach(b => b?.classList.remove("is-active"));
    if (level === "low") riskLow?.classList.add("is-active");
    if (level === "normal") riskNormal?.classList.add("is-active");
    if (level === "high") riskHigh?.classList.add("is-active");
  }

  function getRisk(){
    if (riskLow?.classList.contains("is-active")) return "low";
    if (riskHigh?.classList.contains("is-active")) return "high";
    return "normal";
  }

  function getLoopMax(){
    const free = Number(loopMax?.value || 0) || 0;
    if (free > 0) return free;
    if (chip20?.classList.contains("is-active")) return 20;
    if (chip30?.classList.contains("is-active")) return 30;
    return 45;
  }

  function readToken(){
    const k = "uex_token";
    const fromInput = (tokenInput?.value || "").trim();
    if (fromInput) {
      try { localStorage.setItem(k, fromInput); } catch(_){}
      return fromInput;
    }
    try { return (localStorage.getItem(k) || "").trim(); } catch(_){}
    return "";
  }

  function setUexStatus(){
    const t = readToken();
    if (!t){
      if (uexStatus) uexStatus.textContent = "UEX : token requis pour charger les marchandises.";
      return false;
    }
    if (uexStatus) uexStatus.textContent = "UEX : prêt (chargement UEX à intégrer).";
    return true;
  }

  function loadShips(){
    const urls = [
      "/assets/data/ships_v2.json",
      "../assets/data/ships_v2.json",
      "assets/data/ships_v2.json",
    ];
    return (async () => {
      for (const u of urls){
        try{
          const res = await fetch(u, { cache:"no-store" });
          if (!res.ok) continue;
          const data = JSON.parse(await res.text());
          const list = Array.isArray(data) ? data : (data?.ships || []);
          ALL_SHIPS = list
            .map(x => ({ name: String(x?.name || x?.title || "").trim(), scu: Number(x?.scu || x?.cargo || 0) || 0 }))
            .filter(x => x.name)
            .sort((a,b) => a.name.localeCompare(b.name,"fr"));
          return;
        }catch(_){}
      }
      ALL_SHIPS = [];
    })();
  }

  function renderShipList(q=""){
    if (!shipList) return;
    shipList.innerHTML = "";
    const query = (q || "").trim().toLowerCase();

    const items = ALL_SHIPS
      .map((s, idx) => ({...s, idx}))
      .filter(s => !query || s.name.toLowerCase().includes(query));

    const makeBtn = (name, scuTxt, idx) => {
      const b = document.createElement("button");
      b.type="button";
      b.className="ship-item";
      b.innerHTML = `<span class="ship-name">${name}</span><span class="ship-scu">${scuTxt}</span>`;
      b.addEventListener("click", () => selectShip(idx));
      return b;
    };

    if (items.length === 0){
      const empty = document.createElement("div");
      empty.className="ship-empty";
      empty.textContent="Aucun résultat.";
      shipList.appendChild(empty);
      return;
    }

    for (const s of items){
      const scuTxt = s.scu > 0 ? `${fmt.format(s.scu)} SCU` : "SCU ?";
      shipList.appendChild(makeBtn(s.name, scuTxt, s.idx));
    }
  }

  function selectShip(idx){
    selectedShipIdx = idx;
    const ship = ALL_SHIPS[idx];
    shipLabel.textContent = ship?.name || "—";

    // Auto-SCU unless manual
    if (!manualCargo && cargoScu && ship?.scu > 0){
      cargoScu.value = String(ship.scu);
      if (scuMode) scuMode.textContent = "Auto";
    }
    closeMenu(shipMenu, shipBtn);
    renderGoods();
    saveState();
  }

  function renderTopPicks(list){
    if (!topPicks) return;
    topPicks.innerHTML = "";
    const top = list.slice(0,3);
    for (const g of top){
      const card = document.createElement("div");
      card.className = "top-pick-card";
      const riskPill = g.risk >= 3 ? `<span class="pill">⚠ Risque</span>` : "";
      card.innerHTML = `
        <div class="top-pick-title">
          <span>${g.name}</span>
          <span class="kpi-cyan">+${g.margin.toFixed(1)} / SCU</span>
        </div>
        <div class="pick-meta">
          <span class="pill">${g.stability}</span>
          <span class="pill">Stock: ${g.stock}</span>
          ${riskPill}
        </div>
      `;
      topPicks.appendChild(card);
    }
  }

  function renderGoodsList(list){
    if (!goodsList) return;
    goodsList.innerHTML = "";
    for (const g of list){
      const pillClass = g.verdict === "Recommandée" ? "verdict-pill is-rec" : "verdict-pill";
      const risk = g.risk >= 3 ? `<span class="pill">⚠ Risque</span>` : "";
      const card = document.createElement("div");
      card.className = "good-card";
      card.innerHTML = `
        <div class="good-header">
          <span>${g.name}</span>
          <span class="${pillClass}">${g.verdict}</span>
        </div>
        <div class="good-kpis">
          <div><span class="kpi-cyan">+${g.margin.toFixed(1)} / SCU</span></div>
          <div>Stabilité : ${g.stability}</div>
          <div>Stock : ${g.stock}</div>
          <div>Risque : ${"⚠".repeat(g.risk)}</div>
        </div>
        <div class="good-badges">
          ${risk}
        </div>
      `;
      goodsList.appendChild(card);
    }
  }

  function passesFilters(g){
    const q = (goodsSearch?.value || "").trim().toLowerCase();
    if (q && !g.name.toLowerCase().includes(q)) return false;

    const s = g.stability;
    const okStable = filterStable?.checked ?? true;
    const okVar = filterVariable?.checked ?? true;
    const okVol = filterVolatile?.checked ?? true;

    if (s === "Stable" && !okStable) return false;
    if (s === "Variable" && !okVar) return false;
    if (s === "Volatile" && !okVol) return false;

    if (stockOnly?.checked && g.stock !== "OK") return false;

    // Risk tolerance filter (simple mapping)
    const tol = getRisk();
    const riskLevel = g.risk; // 1..3
    if (tol === "low" && riskLevel >= 2) return false;
    if (tol === "normal" && riskLevel >= 3) return false;

    return true;
  }

  function computeVerdict(g){
    // Placeholder: in Step 1, we estimate verdict by risk tolerance + margin.
    const tol = getRisk();
    if (tol === "low" && g.risk >= 2) return "À éviter";
    if (tol === "normal" && g.risk >= 3) return "À éviter";
    if (g.margin >= 3.0 && g.risk <= 2) return "Recommandée";
    if (g.margin >= 2.0) return "Acceptable";
    return "À éviter";
  }

  function renderGoods(){
    // Until UEX is integrated, we show local placeholder data.
    setUexStatus();

    const list = GOODS
      .map(g => ({...g, verdict: computeVerdict(g)}))
      .filter(passesFilters)
      .sort((a,b) => b.margin - a.margin);

    renderTopPicks(list);
    renderGoodsList(list);

    if (lastUpdate) {
      const d = new Date();
      lastUpdate.textContent = `MAJ: ${d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`;
    }
  }

  function saveState(){
    try{
      const state = {
        selectedShipIdx,
        cargoScu: Number(cargoScu?.value || 0) || 0,
        manualCargo,
        loopMax: Number(loopMax?.value || 0) || 0,
        loopChip: getLoopMax(),
        risk: getRisk(),
        target: Number(targetPH?.value || 0) || 0
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(_){}
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);

      selectedShipIdx = (Number.isFinite(s.selectedShipIdx) ? s.selectedShipIdx : null);
      if (cargoScu) cargoScu.value = String(Number(s.cargoScu || 0) || 0);
      manualCargo = Boolean(s.manualCargo);
      if (scuMode) scuMode.textContent = manualCargo ? "Manuel" : "Auto";

      const chip = Number(s.loopChip || 20) || 20;
      setActiveChip(chip);
      if (loopMax) loopMax.value = String(Number(s.loopMax || 0) || 0);

      setRisk(s.risk || "normal");
      if (targetPH) targetPH.value = String(Number(s.target || 80000) || 80000);

      // token
      const t = readToken();
      if (tokenInput && t) tokenInput.value = t;
    }catch(_){}
  }

  function reset(){
    selectedShipIdx = null;
    shipLabel.textContent = "—";
    manualCargo = false;
    if (scuMode) scuMode.textContent = "Auto";
    if (cargoScu) cargoScu.value = "0";
    setActiveChip(20);
    if (loopMax) loopMax.value = "";
    setRisk("normal");
    if (targetPH) targetPH.value = "80000";
    if (goodsSearch) goodsSearch.value = "";
    if (filterStable) filterStable.checked = true;
    if (filterVariable) filterVariable.checked = true;
    if (filterVolatile) filterVolatile.checked = true;
    if (stockOnly) stockOnly.checked = false;
    saveState();
    renderGoods();
  }

  function init(){
    // Ship picker
    shipBtn?.addEventListener("click", (e)=>{ e.preventDefault(); toggleMenu(shipMenu, shipBtn); setTimeout(()=>shipSearch?.focus(),0); });
    shipSearch?.addEventListener("input", ()=>renderShipList(shipSearch.value));
    document.addEventListener("click", (e)=>{
      const t = e.target;
      if (shipMenu && shipBtn){
        const inside = shipMenu.contains(t) || shipBtn.contains(t);
        if (!inside) closeMenu(shipMenu, shipBtn);
      }
    });

    // SCU manual override
    cargoScu?.addEventListener("input", ()=>{
      manualCargo = true;
      if (scuMode) scuMode.textContent = "Manuel";
      saveState();
      renderGoods();
    });

    // Chips
    chip20?.addEventListener("click", ()=>{ setActiveChip(20); if (loopMax) loopMax.value=""; saveState(); renderGoods(); });
    chip30?.addEventListener("click", ()=>{ setActiveChip(30); if (loopMax) loopMax.value=""; saveState(); renderGoods(); });
    chip45?.addEventListener("click", ()=>{ setActiveChip(45); if (loopMax) loopMax.value=""; saveState(); renderGoods(); });
    loopMax?.addEventListener("input", ()=>{ saveState(); renderGoods(); });

    // Risk
    riskLow?.addEventListener("click", ()=>{ setRisk("low"); saveState(); renderGoods(); });
    riskNormal?.addEventListener("click", ()=>{ setRisk("normal"); saveState(); renderGoods(); });
    riskHigh?.addEventListener("click", ()=>{ setRisk("high"); saveState(); renderGoods(); });

    targetPH?.addEventListener("input", ()=>{ saveState(); renderGoods(); });

    // Goods filters
    goodsSearch?.addEventListener("input", renderGoods);
    [filterStable, filterVariable, filterVolatile, stockOnly].forEach(el=>el?.addEventListener("change", renderGoods));

    // Mode toggle (Assisté/Manuel) - manual block is prepared, not fully wired yet.
    modeToggle?.addEventListener("click", ()=>{
      const mode = modeToggle.dataset.mode === "assisted" ? "manual" : "assisted";
      modeToggle.dataset.mode = mode;
      modeToggle.textContent = (mode === "assisted") ? "Assisté" : "Manuel";
      manualBlock?.classList.toggle("is-hidden", mode === "assisted");
      saveState();
    });

    refreshBtn?.addEventListener("click", ()=>{
      // Step 1: refresh simply re-renders (UEX adapter will later fetch).
      renderGoods();
    });

    resetBtn?.addEventListener("click", reset);

    // Token
    tokenInput?.addEventListener("input", ()=>{
      setUexStatus();
    });

    loadState();
    setUexStatus();

    loadShips().then(()=>{
      renderShipList("");
      // restore selected ship label if possible
      if (selectedShipIdx !== null && ALL_SHIPS[selectedShipIdx]){
        shipLabel.textContent = ALL_SHIPS[selectedShipIdx].name;
        if (!manualCargo && ALL_SHIPS[selectedShipIdx].scu > 0){
          cargoScu.value = String(ALL_SHIPS[selectedShipIdx].scu);
          if (scuMode) scuMode.textContent = "Auto";
        }
      }
      renderGoods();
    }).catch(()=>{
      renderGoods();
    });
  }

  init();
})();
