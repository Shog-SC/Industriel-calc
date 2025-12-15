// hauling.js
// Version: V1.0.0
// Hauling page logic.
// Note: This version is intentionally defensive. If UEX routes/prices are not available,
// the UI remains usable (manual prices) and never breaks navigation.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function formatAuec(n) {
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return v.toLocaleString("fr-FR");
  }

  function readNum(id) {
    const el = $(id);
    if (!el) return 0;
    const v = Number(el.value);
    return isFinite(v) ? Math.max(0, v) : 0;
  }

  function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }

  function bindModeToggle() {
    const btns = document.querySelectorAll('.mode-toggle .mode-btn[data-hauling-mode]');
    const beg = $("haulingBeginnerMode");
    const exp = $("haulingExpertMode");
    if (!btns.length || !beg || !exp) return;

    const setMode = (m) => {
      btns.forEach(b => b.classList.toggle("active", b.dataset.haulingMode === m));
      beg.classList.toggle("hidden", m !== "beginner");
      exp.classList.toggle("hidden", m !== "expert");
      try { localStorage.setItem("haulingMode", m); } catch (_) {}
    };

    btns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.haulingMode)));

    let stored = "beginner";
    try { stored = localStorage.getItem("haulingMode") || stored; } catch (_) {}
    setMode(stored === "expert" ? "expert" : "beginner");
  }

  function recalcBeginner() {
    const scu = readNum("haulingBegScuInput");
    const buy = readNum("haulingBegBuyPriceInput");
    const sell = readNum("haulingBegSellPriceInput");
    const mins = readNum("haulingBegTimeMinutesInput");

    const invested = scu * buy;
    const returned = scu * sell;
    const profit = returned - invested;
    const perHour = mins > 0 ? (profit / (mins / 60)) : 0;

    setText("haulingBegProfitRun", formatAuec(profit));
    setText("haulingBegProfitHour", formatAuec(perHour));
    setText("haulingBegRouteProfitRun", formatAuec(profit));
    setText("haulingBegRouteProfitHour", formatAuec(perHour));
  }

  function bindBeginnerLive() {
    ["haulingBegScuInput","haulingBegBuyPriceInput","haulingBegSellPriceInput","haulingBegTimeMinutesInput"]
      .forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("input", recalcBeginner);
        el.addEventListener("change", recalcBeginner);
      });

    const fill = $("haulingBegFillMaxBtn");
    const shipSel = $("haulingBegShipSelect");
    if (fill && shipSel) {
      fill.addEventListener("click", () => {
        const max = Number(shipSel.selectedOptions[0]?.dataset?.scuMax || 0);
        const inp = $("haulingBegScuInput");
        if (inp && isFinite(max) && max > 0) inp.value = String(max);
        recalcBeginner();
      });
    }
  }

  function seedShips() {
    const ships = [
      { name:"C1 Spirit", scu:64 },
      { name:"Cutlass Black", scu:46 },
      { name:"Freelancer MAX", scu:120 },
      { name:"Caterpillar", scu:576 },
      { name:"Hercules C2", scu:696 }
    ];
    const selBeg = $("haulingBegShipSelect");
    const selExp = $("haulingShipSelect");
    [selBeg, selExp].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = "";
      ships.forEach(s => {
        const o = document.createElement("option");
        o.value = s.name;
        o.textContent = `${s.name} (${s.scu} SCU)`;
        o.dataset.scuMax = String(s.scu);
        sel.appendChild(o);
      });
    });
  }

  function init() {
    seedShips();
    bindModeToggle();
    bindBeginnerLive();
    recalcBeginner();

    // If a token exists (admin), you can later wire real UEX calls without impacting stability.
    const status = $("haulingDataStatusBeg");
    if (status) status.textContent = "Mode manuel actif (UEX optionnel).";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once:true });
  } else {
    init();
  }
})();