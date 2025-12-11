/* =============================================================
 * Hauling Module - V1.4.0
 * Fret avec :
 *  - Mode Débutant : choix de vaisseau + SCU + prix + durée
 *  - Mode Avancé   : vaisseau + SCU + prix + durée, détails complets
 *  - Top 3 routes  : UEX via Worker, triées par ROI, filtrables par marchandise
 *    + affichage de l'investissement requis par route.
 *
 * Worker utilisé : https://salvage-uex-proxy.yoyoastico74.workers.dev/
 * ============================================================= */

(function () {
  "use strict";

  const WORKER_URL = "https://salvage-uex-proxy.yoyoastico74.workers.dev/";

  // Capacités théoriques (SCU) de cargos typiques
  const SHIP_SCUS = {
    // Light / small freight
    cutter: 4,
    mustang_alpha: 4,
    mpu_cargo: 2,
    nomad: 24,

    // Medium freight
    freelancer: 66,
    freelancer_max: 120,
    cutlass_black: 46,
    mercury: 114,
    raft: 192,
    constellation_andromeda: 96,
    constellation_taurus: 174,

    // Heavy / large freight
    c2: 696,
    m2: 522,
    caterpillar: 576,
    hull_a: 64,
    hull_b: 384,
    hull_c: 4608,
    merchantman: 2880,

    // Fallback
    other: 0,
  };

  // Cache des routes calculées pour le Top 3
  let haulingRoutesCache = [];

  /* ==========================
   * Helpers
   * ========================== */

  function parseNumber(inputEl) {
    if (!inputEl) return 0;
    const raw = (inputEl.value || "")
      .toString()
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return "–";
    return Math.round(n).toLocaleString("fr-FR");
  }

  function formatPercent(p) {
    if (!Number.isFinite(p)) return "–";
    return p.toFixed(1).replace(".", ",");
  }

  /**
   * Calcul commun aux deux modes.
   */
  function computeCoreProfit(scu, buyPrice, sellPrice, timeMinutes) {
    const invested = scu * buyPrice;
    const returned = scu * sellPrice;
    const profitTotal = returned - invested;
    const profitPerScu = scu > 0 ? profitTotal / scu : 0;
    const profitPerHour = timeMinutes > 0 ? profitTotal * (60 / timeMinutes) : 0;
    const roi = invested > 0 ? (profitTotal / invested) * 100 : 0;

    return {
      invested,
      returned,
      profitTotal,
      profitPerScu,
      profitPerHour,
      roi,
    };
  }

  /* =============================================================
   * MODE DÉBUTANT
   * ============================================================= */

  function updateBegShipCapacityHint() {
    const select = document.getElementById("haulingBegShipSelect");
    const capSpan = document.getElementById("haulingBegShipCapacityValue");
    if (!select || !capSpan) return;

    const key = select.value;
    const cap = SHIP_SCUS[key] || 0;
    capSpan.textContent = cap > 0 ? cap : "—";

    const scuInput = document.getElementById("haulingBegScuInput");
    if (scuInput) {
      const current = parseNumber(scuInput);
      if (!current && cap > 0) {
        scuInput.value = cap;
      }
    }
  }

  function fillBegScuWithMax() {
    const select = document.getElementById("haulingBegShipSelect");
    const scuInput = document.getElementById("haulingBegScuInput");
    if (!select || !scuInput) return;

    const key = select.value;
    const cap = SHIP_SCUS[key] || 0;
    if (cap > 0) {
      scuInput.value = cap;
    }
  }

  function calculateHaulingBeginner() {
    const scu = parseNumber(document.getElementById("haulingBegScuInput"));
    const buyPrice = parseNumber(document.getElementById("haulingBegBuyPriceInput"));
    const sellPrice = parseNumber(document.getElementById("haulingBegSellPriceInput"));
    const timeMinutes = parseNumber(document.getElementById("haulingBegTimeMinutesInput"));

    const result = computeCoreProfit(scu, buyPrice, sellPrice, timeMinutes);

    const runSpan = document.getElementById("haulingBegProfitRun");
    const perHourSpan = document.getElementById("haulingBegProfitPerHour");
    const roiSpan = document.getElementById("haulingBegRoi");

    if (runSpan) runSpan.textContent = formatNumber(result.profitTotal);
    if (perHourSpan) perHourSpan.textContent = formatNumber(result.profitPerHour);
    if (roiSpan) roiSpan.textContent = formatPercent(result.roi);
  }

  /* =============================================================
   * MODE AVANCÉ
   * ============================================================= */

  function updateShipCapacityHint() {
    const select = document.getElementById("haulingShipSelect");
    const capSpan = document.getElementById("haulingShipCapacityValue");
    if (!select || !capSpan) return;

    const key = select.value;
    const cap = SHIP_SCUS[key] || 0;
    capSpan.textContent = cap > 0 ? cap : "—";
  }

  function fillScuWithMax() {
    const select = document.getElementById("haulingShipSelect");
    const scuInput = document.getElementById("haulingScuInput");
    if (!select || !scuInput) return;

    const key = select.value;
    const cap = SHIP_SCUS[key] || 0;
    if (cap > 0) {
      scuInput.value = cap;
    }
  }

  function calculateHaulingExpert() {
    const scu = parseNumber(document.getElementById("haulingScuInput"));
    const buyPrice = parseNumber(document.getElementById("haulingBuyPriceInput"));
    const sellPrice = parseNumber(document.getElementById("haulingSellPriceInput"));
    const timeMinutes = parseNumber(document.getElementById("haulingTimeMinutesInput"));

    const r = computeCoreProfit(scu, buyPrice, sellPrice, timeMinutes);

    const investedSpan = document.getElementById("haulingInvested");
    const returnedSpan = document.getElementById("haulingReturned");
    const profitTotalSpan = document.getElementById("haulingProfitTotal");
    const profitPerScuSpan = document.getElementById("haulingProfitPerScu");
    const profitPerHourSpan = document.getElementById("haulingProfitPerHour");
    const roiSpan = document.getElementById("haulingExpertRoi");

    if (investedSpan) investedSpan.textContent = formatNumber(r.invested);
    if (returnedSpan) returnedSpan.textContent = formatNumber(r.returned);

    if (profitTotalSpan) {
      profitTotalSpan.textContent = formatNumber(r.profitTotal);
      const totalContainer = profitTotalSpan.parentElement;
      if (totalContainer && totalContainer.classList.contains("neon-total")) {
        totalContainer.classList.remove("is-negative");
        if (Number.isFinite(r.profitTotal) && r.profitTotal < 0) {
          totalContainer.classList.add("is-negative");
        }
      }
    }

    if (profitPerScuSpan) profitPerScuSpan.textContent = formatNumber(r.profitPerScu);
    if (profitPerHourSpan) profitPerHourSpan.textContent = formatNumber(r.profitPerHour);
    if (roiSpan) roiSpan.textContent = formatPercent(r.roi);
  }

  /* =============================================================
   * TOGGLE DÉBUTANT / AVANCÉ
   * ============================================================= */

  function setHaulingMode(mode) {
    const beginnerSection = document.getElementById("haulingBeginnerMode");
    const expertSection = document.getElementById("haulingExpertMode");

    if (beginnerSection) {
      beginnerSection.classList.toggle("active", mode === "beginner");
    }
    if (expertSection) {
      expertSection.classList.toggle("active", mode === "expert");
    }

    const buttons = document.querySelectorAll(".hauling-mode-toggle .mode-btn");
    buttons.forEach((btn) => {
      const btnMode = btn.getAttribute("data-hauling-mode");
      btn.classList.toggle("active", btnMode === mode);
    });

    try {
      localStorage.setItem("haulingMode", mode);
    } catch (err) {
      console.warn("[hauling] Impossible de stocker le mode hauling", err);
    }
  }

  /* =============================================================
   * TOP 3 ROUTES (ROI) + FILTRE MARCHANDISE
   * ============================================================= */

  async function fetchTradeData() {
    try {
      const resp = await fetch(WORKER_URL, { method: "GET" });
      if (!resp.ok) {
        console.warn("[hauling] Worker UEX a renvoyé un statut non OK :", resp.status);
        return null;
      }
      const data = await resp.json();
      return data;
    } catch (err) {
      console.warn("[hauling] Erreur lors de l'appel au Worker UEX :", err);
      return null;
    }
  }

  function buildRoutesFromTradeData(tradeData) {
    let routes = [];

    if (tradeData && Array.isArray(tradeData.routes)) {
      routes = tradeData.routes.map((r) => {
        const invested = Number(r.invested) || 0;
        const profitPerRun = Number(r.profitPerRun) || 0;
        const roi = invested > 0 ? (profitPerRun / invested) * 100 : 0;

        return {
          type: r.type || "simple",
          from: r.from || "—",
          to: r.to || "—",
          via: r.via || null,
          commodity: r.commodity || "Marchandise",
          profitPerRun,
          profitPerHour: Number(r.profitPerHour) || 0,
          invested,
          durationMinutes: Number(r.durationMinutes) || 0,
          roi,
        };
      });
    } else {
      // Fallback : routes d'exemple
      routes = [
        {
          type: "simple",
          from: "Hurston",
          to: "ArcCorp",
          via: null,
          commodity: "Laranite",
          profitPerRun: 120000,
          profitPerHour: 480000,
          invested: 400000,
          durationMinutes: 15,
          roi: (120000 / 400000) * 100,
        },
        {
          type: "multistop",
          from: "MicroTech",
          to: "Crusader",
          via: "Hurston",
          commodity: "Agricium / Distilled Spirits",
          profitPerRun: 180000,
          profitPerHour: 520000,
          invested: 650000,
          durationMinutes: 22,
          roi: (180000 / 650000) * 100,
        },
        {
          type: "intersystem",
          from: "Stanton",
          to: "Pyro",
          via: null,
          commodity: "High-value cargo",
          profitPerRun: 260000,
          profitPerHour: 540000,
          invested: 900000,
          durationMinutes: 30,
          roi: (260000 / 900000) * 100,
        },
      ];
    }

    routes.sort((a, b) => b.roi - a.roi);
    return routes;
  }

  function updateTopRoutesUI(routes) {
    const container = document.getElementById("haulingTopRoutesList");
    if (!container) return;

    container.innerHTML = "";

    if (!routes || routes.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "route-entry empty";
      emptyEl.textContent = "Aucune route disponible pour le moment.";
      container.appendChild(emptyEl);
      return;
    }

    const toShow = routes.slice(0, 3);

    toShow.forEach((r, i) => {
      const entry = document.createElement("div");
      entry.className = "route-entry";

      const typeLabel =
        r.type === "multistop"
          ? "Route multi-stop"
          : r.type === "intersystem"
          ? "Route intersystème"
          : "Route simple";

      const steps = r.via ? `${r.from} → ${r.via} → ${r.to}` : `${r.from} → ${r.to}`;

      entry.innerHTML = `
        <div class="route-rank">Route ${i + 1} — ${typeLabel}</div>
        <div class="route-steps">${steps}</div>
        <div class="route-commodity">Marchandises : <span>${r.commodity}</span></div>
        <div class="route-metrics">
          <span>Investissement : <strong>${formatNumber(r.invested)}</strong> aUEC</span>
          <span>Profit / run : <strong>${formatNumber(r.profitPerRun)}</strong> aUEC</span>
          <span>Profit / h : <strong>${formatNumber(r.profitPerHour)}</strong> aUEC / h</span>
          <span>ROI : <strong>${formatPercent(r.roi)}</strong> %</span>
        </div>
      `;
      container.appendChild(entry);
    });
  }

  function initCommodityFilter() {
    const select = document.getElementById("haulingCommodityFilter");
    if (!select) return;

    select.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__all__";
    optAll.textContent = "Toutes marchandises";
    select.appendChild(optAll);

    const commodities = new Set();
    haulingRoutesCache.forEach((r) => {
      if (r.commodity) commodities.add(r.commodity);
    });

    Array.from(commodities).forEach((com) => {
      const opt = document.createElement("option");
      opt.value = com;
      opt.textContent = com;
      select.appendChild(opt);
    });

    select.addEventListener("change", applyCommodityFilterAndRender);
  }

  function applyCommodityFilterAndRender() {
    const select = document.getElementById("haulingCommodityFilter");
    if (!select) {
      updateTopRoutesUI(haulingRoutesCache);
      return;
    }

    const value = select.value || "__all__";

    if (value === "__all__") {
      updateTopRoutesUI(haulingRoutesCache);
      return;
    }

    const filtered = haulingRoutesCache.filter((r) => r.commodity === value);
    updateTopRoutesUI(filtered);
  }

  async function initTopRoutes() {
    const data = await fetchTradeData();
    haulingRoutesCache = buildRoutesFromTradeData(data);
    initCommodityFilter();
    applyCommodityFilterAndRender();
  }

  /* =============================================================
   * INIT PRINCIPAL
   * ============================================================= */

  function initHaulingModule() {
    const panel = document.getElementById("activity-hauling");
    if (!panel) {
      console.warn("[hauling] Panneau #activity-hauling introuvable, module non initialisé.");
      return;
    }

    console.log("[Hauling] Initialisation V1.4.0");

    // Mode Débutant
    const begBtn = document.getElementById("haulingBegCalcBtn");
    if (begBtn) begBtn.addEventListener("click", calculateHaulingBeginner);

    const begShipSelect = document.getElementById("haulingBegShipSelect");
    if (begShipSelect) {
      begShipSelect.addEventListener("change", updateBegShipCapacityHint);
      updateBegShipCapacityHint();
    }

    const begFillBtn = document.getElementById("haulingBegFillMaxBtn");
    if (begFillBtn) begFillBtn.addEventListener("click", fillBegScuWithMax);

    // Mode Avancé
    const expertBtn = document.getElementById("haulingCalcBtn");
    if (expertBtn) expertBtn.addEventListener("click", calculateHaulingExpert);

    const shipSelect = document.getElementById("haulingShipSelect");
    if (shipSelect) {
      shipSelect.addEventListener("change", updateShipCapacityHint);
      updateShipCapacityHint();
    }

    const fillMaxBtn = document.getElementById("haulingFillMaxBtn");
    if (fillMaxBtn) fillMaxBtn.addEventListener("click", fillScuWithMax);

    // Toggle de mode (boutons comme Recyclage, mais scoppés FRET)
    const modeButtons = document.querySelectorAll(".hauling-mode-toggle .mode-btn");
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-hauling-mode") === "expert" ? "expert" : "beginner";
        setHaulingMode(mode);
      });
    });

    let initialMode = "beginner";
    try {
      const stored = localStorage.getItem("haulingMode");
      if (stored === "expert" || stored === "beginner") initialMode = stored;
    } catch (err) {
      console.warn("[hauling] Impossible de lire haulingMode depuis localStorage", err);
    }
    setHaulingMode(initialMode);

    // Top 3 routes
    initTopRoutes();
  }

  document.addEventListener("DOMContentLoaded", initHaulingModule);
})();
