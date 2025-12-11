/* =============================================================
 * core/events.js - V7.0.2
 * Gestion des onglets d'activité (Salvage / Hauling / Mining)
 * + affichage du panneau de marché uniquement pour Salvage.
 * ============================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const pills = document.querySelectorAll(".activity-pill");
  const panels = document.querySelectorAll(".activity-panel");
  const marketPanel = document.querySelector(".market-panel");

  function setActiveActivity(activity) {
    // Boutons
    pills.forEach((btn) => {
      const btnActivity = btn.getAttribute("data-activity");
      btn.classList.toggle("active", btnActivity === activity);
    });

    // Panneaux
    panels.forEach((panel) => {
      const panelId = panel.id || "";
      // On s'attend à des IDs du type "activity-salvage", "activity-hauling", "activity-mining"
      const panelActivity = panelId.startsWith("activity-")
        ? panelId.replace("activity-", "")
        : null;

      panel.classList.toggle("active", panelActivity === activity);
    });

    // Affichage du panneau de marché (graphique RMC / CMAT)
    if (marketPanel) {
      if (activity === "salvage") {
        marketPanel.classList.remove("hidden");
      } else {
        marketPanel.classList.add("hidden");
      }
    }

    console.log("[core/events] Activité active :", activity);
  }

  // Clics sur les pills
  pills.forEach((btn) => {
    btn.addEventListener("click", () => {
      const activity = btn.getAttribute("data-activity") || "salvage";
      setActiveActivity(activity);
    });
  });

  // Activation initiale
  setActiveActivity("salvage");
});
