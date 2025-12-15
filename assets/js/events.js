/* =========================================================
   events.js — V7.0.7
   - Router d'activités: Recyclage ↔ Fret ↔ Minage
   - Gestion des titres (SALVAGE vs HAULING)
   - Fix BFCache / pageshow
   ========================================================= */

(() => {
  "use strict";

  const { qs, qsa, onReady, safeGet, safeSet } = window.SC_CORE || {};

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function setActivity(activityKey) {
    const panels = qsa ? qsa(".activity-panel") : Array.from(document.querySelectorAll(".activity-panel"));
    const pills  = qsa ? qsa(".activity-pill") : Array.from(document.querySelectorAll(".activity-pill"));

    panels.forEach((p) => p.classList.toggle("active", p.id === `activity-${activityKey}`));
    pills.forEach((b) => b.classList.toggle("active", b.dataset.activity === activityKey));

    // Title & subtitle for each activity
    const titleEl = document.getElementById("titleMain");
    const subEl   = document.getElementById("subText");

    if (titleEl && subEl) {
      if (activityKey === "hauling") {
        titleEl.textContent = "HAULING CALCULATOR 4.4";
        subEl.textContent   = "Détermine la rentabilité de ton run de fret (achat → transport → vente) selon ton vaisseau, la marchandise et la durée.";
        titleEl.style.display = "";
        subEl.style.display = "";
      } else if (activityKey === "salvage") {
        titleEl.textContent = "SALVAGE CALCULATOR 4.4";
        subEl.textContent   = "Détermine la valeur générée par ton salvage selon la boucle de ton vaisseau (RMC ou CMAT).";
        titleEl.style.display = "";
        subEl.style.display = "";
      } else {
        titleEl.textContent = "MINING CALCULATOR 4.4";
        subEl.textContent   = "Module en préparation (ROC, vaisseaux de minage, raffinage).";
        titleEl.style.display = "";
        subEl.style.display = "";
      }
    }

    // Market panel only for Salvage
    const marketPanel = document.querySelector(".market-panel");
    if (marketPanel) marketPanel.style.display = (activityKey === "salvage") ? "block" : "none";

    // Hide leaderboard side-tab only in hauling (optional UX)
    const lbSide = document.getElementById("leaderboardSideTab");
    if (lbSide) lbSide.style.display = (activityKey === "hauling") ? "none" : "block";

    try { safeSet ? safeSet("scActivity", activityKey) : localStorage.setItem("scActivity", activityKey); } catch (_) {}
    window.dispatchEvent(new CustomEvent("sc:activity-changed", { detail: { activity: activityKey } }));
  }

  function getInitialActivity() {
    try {
      const stored = safeGet ? safeGet("scActivity") : localStorage.getItem("scActivity");
      if (stored === "salvage" || stored === "hauling" || stored === "mining") return stored;
    } catch (_) {}
    return "salvage";
  }

  function bindClicks() {
    // Delegation: works even if buttons are re-rendered later
    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".activity-pill") : null;
      if (!btn) return;
      const key = btn.dataset.activity;
      if (key) setActivity(key);
    });
  }

  function init() {
    bindClicks();
    setActivity(getInitialActivity());
  }

  (onReady || ((fn)=>document.addEventListener("DOMContentLoaded", fn, { once:true })))(init);

  // BFCache restore
  window.addEventListener("pageshow", () => {
    requestAnimationFrame(() => setActivity(getInitialActivity()));
  });

  // Expose (debug)
  window.setActivity = setActivity;
})();
