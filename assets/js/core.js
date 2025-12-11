// core.js - Salvage Calculator modular core
// Version: V1.0.0
// Gère le switch d'activité (Recyclage / Fret / Mining).

document.addEventListener("DOMContentLoaded", () => {
  console.log("[core.js] Initialisation du noyau modulaire");

  const pills = document.querySelectorAll(".activity-pill");
  const panels = document.querySelectorAll(".activity-panel");

  pills.forEach((btn) => {
    btn.addEventListener("click", () => {
      const activity = btn.getAttribute("data-activity");
      pills.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => {
        const isActive = p.id === `activity-${activity}`;
        p.classList.toggle("active", isActive);
      });
    });
  });
});
