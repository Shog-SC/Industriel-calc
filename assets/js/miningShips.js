/* assets/js/miningShips.js — Version V1.0.2
Source de vérité : /assets/data/ships_v2.json
Rôle :
- fournir la liste des vaisseaux taggés "Mining" (mineurs)
- fournir la capacité SCU d'un vaisseau par son nom (pour l'UI)

Notes :
- Compatible <script> classique (pas de import/export)
- Expose getMiningShips() et getShipCapacity() sur window
*/

(function(){
  "use strict";

  const SHIPS_URL = "/assets/data/ships_v2.json";

  // Basic normalization to match names robustly
  function normName(s){
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 \-]/g, "")
      .replace(/\s/g, "");
  }

  async function loadShips(){
    const res = await fetch(SHIPS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("ships_v2.json introuvable (" + res.status + ")");
    return await res.json();
  }

  async function getMiningShips(){
    const ships = await loadShips();
    return ships
      .filter(s => Array.isArray(s.tags) && s.tags.includes("Mining"))
      .map(s => ({
        id: s.id,
        name: s.name,
        manufacturer: s.manufacturer,
        scu: Number(s.scu ?? 0) || 0
      }));
  }

  async function getShipCapacity(shipName){
    if (!shipName) return null;
    const target = normName(shipName);
    if (!target) return null;

    const ships = await loadShips();

    // match by normalized name
    const found = ships.find(s => normName(s.name) === target)
      || ships.find(s => normName(s.name).includes(target) || target.includes(normName(s.name)));

    if (!found) return null;

    const cap = Number(found.scu ?? 0);
    return (Number.isFinite(cap) && cap > 0) ? cap : null;
  }

  window.getMiningShips = getMiningShips;
  window.getShipCapacity = getShipCapacity;
})();
