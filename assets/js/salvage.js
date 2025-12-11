/* =============================================================
 * Salvage Module - V7.0.1 (structure only, logic unchanged)
 * Organisation interne :
 *  1. Constantes & configuration globale
 *  2. I18N (textes FR / EN spécifiques Salvage)
 *  3. Utilitaires génériques (formatage, maths simples, helpers)
 *  4. Gestion des prix (UEX / Worker) + Top 3 RMC / CMAT
 *  5. Calculs Salvage (débutant + avancé, RMC / CMAT)
 *  6. Leaderboard Salvage (local + online)
 *  7. Mise à jour UI Salvage (panneaux, tags, graph, messages)
 *  8. Initialisation & gestion des événements (DOMContentLoaded)
 *
 *  NOTE : Cette version ne modifie PAS la logique existante.
 *         Elle ajoute uniquement une structure de commentaires
 *         pour faciliter les futurs refactors, sans risque.
 * ============================================================= */


function toggleMoreInfo() {
  const el = document.getElementById("infoMore");
  if (!el) return;
  el.style.display = (el.style.display === "none" || el.style.display === "") ? "block" : "none";
}

const REND_RECLAIMER = 0.15;
const APP_VERSION = "V6.4.26";
const ACTIVITY_VERSIONS = {
  salvage: { label: "Salvage", version: "V6.4.26" },
  hauling: { label: "Hauling", version: "V1.2.0" },
  mining:  { label: "Mining",  version: "V0.0" },
};


const LEADERBOARD_API_BASE = "https://salvage-leaderboard.yoyoastico74.workers.dev";
const LEADERBOARD_REFRESH_MS = 60000;
const LEADERBOARD_RUN_COOLDOWN_MS = 30000;
let lastOnlineRunTs = Number(localStorage.getItem("salvageCalcLastOnlineRunTs") || 0);
let lastLeaderboardFetch = 0;
let cachedLeaderboardUsers = [];



let antiSpamIntervalId = null;

function updateAntiSpamMessage(remainingMs) {
  const el = document.getElementById("antiSpamMessage");
  if (!el) return;
  if (!remainingMs || remainingMs <= 0) {
    el.textContent = "";
    return;
  }
  const seconds = Math.ceil(remainingMs / 1000);
  el.textContent = `⚠ Anti-Spam : ${seconds}s restantes`;
}

function startAntiSpamCountdown() {
  if (!LEADERBOARD_RUN_COOLDOWN_MS) return;
  if (!lastOnlineRunTs) return;
  if (antiSpamIntervalId) {
    clearInterval(antiSpamIntervalId);
    antiSpamIntervalId = null;
  }
  const target = lastOnlineRunTs + LEADERBOARD_RUN_COOLDOWN_MS;

  function tick() {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      updateAntiSpamMessage(0);
      if (antiSpamIntervalId) {
        clearInterval(antiSpamIntervalId);
        antiSpamIntervalId = null;
      }
      return;
    }
    updateAntiSpamMessage(remaining);
  }

  tick();
  antiSpamIntervalId = setInterval(tick, 1000);
}

let leaderboardSortKey = localStorage.getItem("salvageLbSort") || "profit";
let leaderboardShipFilterKey = localStorage.getItem("salvageLbShipFilter") || "all";

function getFilteredSortedLeaderboardUsers(users) {
  if (!Array.isArray(users)) return [];
  let arr = users.slice();

  const filterKey = (leaderboardShipFilterKey || "all").toLowerCase();
  if (filterKey && filterKey !== "all") {
    arr = arr.filter((u) => {
      const fav = (u.favShip || "").toLowerCase();
      return fav.includes(filterKey);
    });
  }

  arr.sort((a, b) => {
    const profitA = Number(a.totalProfit || 0);
    const profitB = Number(b.totalProfit || 0);
    const runsA = Number(a.totalRuns || 0);
    const runsB = Number(b.totalRuns || 0);
    const nameA = (a.nickname || "").toLowerCase();
    const nameB = (b.nickname || "").toLowerCase();

    switch (leaderboardSortKey) {
      case "runs":
        if (runsB !== runsA) return runsB - runsA;
        if (profitB !== profitA) return profitB - profitA;
        return nameA.localeCompare(nameB);
      case "name":
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        if (profitB !== profitA) return profitB - profitA;
        return runsB - runsA;
      case "profit":
      default:
        if (profitB !== profitA) return profitB - profitA;
        if (runsB !== runsA) return runsB - runsA;
        return nameA.localeCompare(nameB);
    }
  });

  return arr;
}

function rerenderOnlineLeaderboardFromCache() {
  const t = i18n[currentLang] || i18n.fr;
  if (!cachedLeaderboardUsers || !cachedLeaderboardUsers.length) return;
  renderOnlineLeaderboard(cachedLeaderboardUsers, t);
}

let currentLang = localStorage.getItem("salvageCalcLang") || "fr";
let currentTheme = localStorage.getItem("salvageCalcTheme") || "neon";
if (currentTheme === "dark") currentTheme = "neon";

const i18n = {
  fr: {
    titleMain: "SALVAGE CALCULATOR 4.4",
    subText: "Détermine la valeur générée par ton salvage selon la boucle de ton vaisseau (RMC ou CMAT).",
    entriesTitle: "Entrées",
    labelPrixRmc: "Prix RMC (aUEC / SCU)",
    hintPrixRmc: "RMC : matériau recyclé issu du hull scraping.",
    labelPrixCmat: "Prix CMAT (aUEC / SCU)",
    hintPrixCmat: "CMAT : matériaux de construction (Reclaimer → raffinage).",
    sellRmcLabel: "Point de vente RMC :",
    sellCmatLabel: "Point de vente CMAT :",
    labelScuLight: "SCU de salvage traitées – Salvation / Vulture / Fortune (ces vaisseaux ne produisent que du RMC)",
    labelScuReclaimer: "SCU de salvage traitées – Reclaimer (valeur BRUTE récoltée, avant raffinage RMC → CMAT).",
    tagLight: "Vaisseaux légers : hull scraping → RMC uniquement",
    tagReclaimer: "Reclaimer : Hull Scraping → RMC vendable · Construction Salvage → CMAT (~15 %, raffinage obligatoire).",
    smallNote: "Pour chaque SCU saisie:\n- Light ships : RMC uniquement (hull scraping).\n- Reclaimer : RMC pour le hull scraping, CMAT (~15 %) pour le Construction Salvage (raffinage obligatoire, pas de vente directe du RMC CS).",
    apiFetching: "Récupération des prix UEX…",
    apiErrorPrefix: "Erreur API : ",
    apiUpdated: () => "",
    rmcPanelTitle: "Loop RMC – Vendre en Recycled Material Composite",
    cmatPanelTitle: "Loop CMAT – Transformer en Construction Materials",
    rmcLightHead: "Salvation / Vulture / Fortune (RMC uniquement)",
    rmcRecHead: "Reclaimer – Loop Reclaimer : raffinage obligatoire (RMC désactivé)",
    cmatLightHead: "Salvation / Vulture / Fortune",
    cmatRecHead: "Reclaimer (15 % de conversion en CMAT)",
    graphTitle: "Analyse du marché – Historique RMC & CMAT",
    graphSub: "Données issues d’UEX via ton Worker. L’axe X montre les dates (JJ/MM) des dernières mises à jour de prix. Les prix RMC / CMAT peuvent varier fortement selon le marché et les patchs.",
    graphNoData: "Aucune donnée historique disponible.",
    graphError: "Impossible de charger l'historique.",
    langSwitchLabel: "Langue :",
    themeLabel: "Thème :",
    lightShipsInfo: "ℹ Vaisseaux légers : RMC uniquement (pas de CMAT).",
    lightShipsNoCmatText: "Les vaisseaux légers ne génèrent pas de Construction Materials (CMAT). Seul le Reclaimer (et futurs heavy salvage) peuvent produire du CMAT via Construction Salvage.",
    loopCmatBetter: diff => `🟢 Loop CMAT (Construction Materials) plus rentable que RMC (+${diff} aUEC).`,
    loopRmcBetter: diff => `🟢 Loop RMC plus rentable que CMAT (+${diff} aUEC).`,
    loopsEqual: "ℹ Les deux loops rapportent la même chose.",
    rmcLightValues: (sl, rmcVal) => `SCU de salvage utilisées : ${sl} SCU\nValeur si tu vends tout en RMC : ${rmcVal} aUEC`,
    rmcRecValues: () => "Loop Reclaimer : raffinage obligatoire.\nLe Reclaimer peut vendre le RMC issu du hull scraping.\nLe RMC issu du Construction Salvage n’est plus vendable : tu dois le raffiner en CMAT avant la vente.",
    cmatRecValues: (scuCmat, valCmat) => `SCU de salvage converties en CMAT (rendement 15 %) : ${scuCmat} SCU\nValeur si tu vends en CMAT : ${valCmat} aUEC`,
    cmatRecExtra: (scuRec, scuCmat, pctCmat, pctTotal) =>
      `Sur ${scuRec} SCU du Reclaimer, ${scuCmat} SCU partent en CMAT (~${pctCmat}% du salvage Reclaimer, ~${pctTotal}% du total salvage).`,
    leaderboardEmpty: "Aucun joueur dans le leaderboard en ligne pour l'instant.",
    leaderboardLoading: "Chargement du leaderboard en ligne…",
    leaderboardErrorPrefix: "Erreur leaderboard : ",
    leaderboardLine: (nickname, runs, profit, favShip, totalRmc, badgesHtml, isAdmin) =>
      `<span class="leaderboard-line-main">
        ${nickname} – ${profit} aUEC${isAdmin ? " (ADMIN)" : ""} 
        ${badgesHtml ? `<span class="leaderboard-badges">${badgesHtml}</span>` : ""}
      </span>
      <span class="leaderboard-line-meta">
        ${runs} runs · Ship fav : ${favShip} · Total RMC : ${totalRmc} SCU
      </span>`,
        leaderboardYou: "Vous",
    leaderboardSortLabel: "Tri :",
    leaderboardFilterLabel: "Filtre vaisseau :",
    leaderboardSortProfit: "Profit total",
    leaderboardSortRuns: "Nombre de runs",
    leaderboardSortName: "Pseudo",
    leaderboardFilterAll: "Tous les vaisseaux",
    leaderboardFilterVulture: "Vulture",
    leaderboardFilterSalvation: "Salvation",
    leaderboardFilterFortune: "Fortune",
    leaderboardFilterReclaimer: "Reclaimer",
labelShipSelect: "Vaisseau utilisé pour ce run",
    saveRunBtn: "Envoyer ce run au leaderboard en ligne",
    saveRunSuccess: "Run envoyé au leaderboard en ligne.",
    saveRunNoUser: "Crée ou importe un profil avant d'enregistrer un run.",
    saveRunNoScu: "Merci de saisir au moins une SCU de salvage avant d'enregistrer un run.",
    clearMyRunsBtn: "Supprimer mes runs",
    clearAllRunsBtn: "Reset de mes données locales",
    clearMyRunsNoUser: "Aucun profil chargé. Crée ou importe un profil pour supprimer uniquement tes runs.",
    clearMyRunsDone: "Tes runs locaux ont été supprimés de cette liste (leaderboard en ligne non modifié).",
    clearAllRunsDone: "Toutes tes données locales ont été réinitialisées (leaderboard en ligne non modifié).",
    leaderboardAdminOnly: "Action réservée à l'admin.",
    leaderboardResetLoading: "Reset du leaderboard en ligne en cours…",
    leaderboardResetDone: (count) => `Leaderboard en ligne nettoyé (${count} profil(s) supprimé(s)).`,
    leaderboardResetError: "Erreur pendant le reset du leaderboard en ligne.",
    myRunsBtn: "Voir mes runs détaillés",
    myRunsTitle: "Mes runs enregistrés",
    myRunsActiveTitle: "En attente de vente",
    myRunsSoldTitle: "Runs vendus",
    myRunsActiveEmpty: "Aucun run en attente de vente.",
    myRunsSoldEmpty: "Aucun run vendu pour l'instant.",
    myRunsNoUser: "Crée ou importe un profil pour voir tes runs détaillés.",
    myRunsSoldLabel: "Vente validée",
    myRunsLine: (index, ship, scuText, rmcText, cmatText, profitText, dateStr) => {
      let parts = [`#${index} – ${dateStr}`, ship];
      if (scuText) parts.push(scuText);
      if (rmcText) parts.push(rmcText);
      if (cmatText) parts.push(cmatText);
      if (profitText) parts.push(profitText);
      return parts.join(" · ");
    }
  },
  en: {
    titleMain: "SALVAGE CALCULATOR 4.4",
    subText: "Determine the value generated by your salvage depending on your ship’s loop (RMC or CMAT).",
    entriesTitle: "Inputs",
    labelPrixRmc: "RMC price (aUEC / SCU)",
    hintPrixRmc: "RMC : matériau recyclé issu du hull scraping.",
    labelPrixCmat: "CMAT price (aUEC / SCU)",
    hintPrixCmat: "CMAT : matériaux de construction (Reclaimer → raffinage).",
    sellRmcLabel: "RMC sell point:",
    sellCmatLabel: "CMAT sell point:",
    labelScuLight: "Processed salvage SCU – Salvation / Vulture / Fortune (these ships only produce RMC)",
    labelScuReclaimer: "Processed salvage SCU – Reclaimer (RAW amount harvested, before refining RMC → CMAT).",
    tagLight: "Light salvage ships: hull scraping → RMC only",
    tagReclaimer: "Reclaimer: Hull Scraping → sellable RMC · Construction Salvage → CMAT (~15%, refining required).",
    smallNote: "For each SCU value:\n- Light ships: RMC only (hull scraping).\n- Reclaimer: RMC for hull scraping, CMAT (~15%) for Construction Salvage (refining required, no direct sale of CS RMC).",
    apiFetching: "Fetching UEX prices…",
    apiErrorPrefix: "API error: ",
    apiUpdated: () => "",
    rmcPanelTitle: "RMC loop – Selling as Recycled Material Composite",
    cmatPanelTitle: "CMAT loop – Processing into Construction Materials",
    rmcLightHead: "Salvation / Vulture / Fortune (RMC only)",
    rmcRecHead: "Reclaimer – Reclaimer loop: refining only (RMC disabled)",
    cmatLightHead: "Salvation / Vulture / Fortune",
    cmatRecHead: "Reclaimer (15% conversion to CMAT)",
    graphTitle: "Market analysis – RMC & CMAT history",
    graphSub: "Data from UEX via your Worker. X-axis shows dates (DD/MM) of the latest price updates. RMC / CMAT prices can vary significantly with the market and patches.",
    graphNoData: "No historical data available.",
    graphError: "Unable to load history.",
    langSwitchLabel: "Language:",
    themeLabel: "Theme:",
    lightShipsInfo: "ℹ Light ships: RMC only (no CMAT).",
    lightShipsNoCmatText: "Light ships do not generate Construction Materials (CMAT). Only the Reclaimer (and future heavy salvage) can produce CMAT via Construction Salvage.",
    loopCmatBetter: diff => `🟢 CMAT loop (Construction Materials) is more profitable than RMC (+${diff} aUEC).`,
    loopRmcBetter: diff => `🟢 RMC loop is more profitable than CMAT (+${diff} aUEC).`,
    loopsEqual: "ℹ Both loops yield the same profit.",
    rmcLightValues: (sl, rmcVal) => `Salvage SCU used: ${sl} SCU\nValue if sold entirely as RMC: ${rmcVal} aUEC`,
    rmcRecValues: () => "Reclaimer loop: refining is mandatory.\nThe Reclaimer can sell RMC obtained from hull scraping.\nRMC from Construction Salvage is no longer sellable: you must refine it into CMAT before selling.",
    cmatRecValues: (scuCmat, valCmat) => `Salvage SCU converted to CMAT (15% yield): ${scuCmat} SCU\nValue if sold as CMAT: ${valCmat} aUEC`,
    cmatRecExtra: (scuRec, scuCmat, pctCmat, pctTotal) =>
      `Out of ${scuRec} Reclaimer SCU, ${scuCmat} SCU become CMAT (~${pctCmat}% of Reclaimer salvage, ~${pctTotal}% of total salvage).`,
    leaderboardEmpty: "No player in the online leaderboard yet.",
    leaderboardLoading: "Loading online leaderboard…",
    leaderboardErrorPrefix: "Leaderboard error: ",
    leaderboardLine: (nickname, runs, profit, favShip, totalRmc, isAdmin) =>
      `<span class="leaderboard-line-main">${nickname} – ${profit} aUEC</span><span class="leaderboard-line-meta">${runs} runs · Fav ship: ${favShip} · Total RMC: ${totalRmc} SCU</span>`,
        leaderboardYou: "You",
    leaderboardSortLabel: "Sort:",
    leaderboardFilterLabel: "Ship filter:",
    leaderboardSortProfit: "Total profit",
    leaderboardSortRuns: "Run count",
    leaderboardSortName: "Nickname",
    leaderboardFilterAll: "All ships",
    leaderboardFilterVulture: "Vulture",
    leaderboardFilterSalvation: "Salvation",
    leaderboardFilterFortune: "Fortune",
    leaderboardFilterReclaimer: "Reclaimer",
labelShipSelect: "Ship used for this run",
    saveRunBtn: "Send this run to the online leaderboard",
    saveRunSuccess: "Run sent to the online leaderboard.",
    saveRunNoUser: "Please create/import a profile before saving a run.",
    saveRunNoScu: "Please enter at least one salvage SCU before saving a run.",
    clearMyRunsBtn: "Delete my runs",
    clearAllRunsBtn: "Reset my local data",
    clearMyRunsNoUser: "No profile loaded. Create or import a profile to delete only your runs.",
    clearMyRunsDone: "Your local runs have been removed from this list (online leaderboard unchanged).",
    clearAllRunsDone: "All your local data has been reset (online leaderboard unchanged).",
    leaderboardAdminOnly: "This action is reserved for admin.",
    leaderboardResetLoading: "Resetting online leaderboard…",
    leaderboardResetDone: (count) => `Online leaderboard cleared (${count} profile(s) removed).`,
    leaderboardResetError: "Error while resetting the online leaderboard.",
    myRunsBtn: "View my detailed runs",
    myRunsTitle: "My saved runs",
    myRunsActiveTitle: "Pending sale",
    myRunsSoldTitle: "Sold runs",
    myRunsActiveEmpty: "No pending run.",
    myRunsSoldEmpty: "No sold run yet.",
    myRunsNoUser: "Create or import a profile to see your detailed runs.",
    myRunsSoldLabel: "Sale confirmed",
    myRunsLine: (index, ship, scuText, rmcText, cmatText, profitText, dateStr) => {
      let parts = [`#${index} – ${dateStr}`, ship];
      if (scuText) parts.push(scuText);
      if (rmcText) parts.push(rmcText);
      if (cmatText) parts.push(cmatText);
      if (profitText) parts.push(profitText);
      return parts.join(" · ");
    }
  }
};

const prixRmcInput  = document.getElementById("prixRmc");
const prixCmatInput = document.getElementById("prixCmat");
const scuLightInput = document.getElementById("scuLight");
const scuRecInput   = document.getElementById("scuReclaimer");
const apiStatusEl   = document.getElementById("apiStatus");
const rmcLightValuesEl = document.getElementById("rmcLightValues");
const rmcLightExtraEl = document.getElementById("rmcLightExtra");
const rmcLightDecisionEl = document.getElementById("rmcLightDecision");
const rmcRecValuesEl = document.getElementById("rmcRecValues");
const rmcRecExtraEl = document.getElementById("rmcRecExtra");
const rmcRecDecisionEl = document.getElementById("rmcRecDecision");
const cmatLightValuesEl = document.getElementById("cmatLightValues");
const cmatLightExtraEl = document.getElementById("cmatLightExtra");
const cmatLightDecisionEl = document.getElementById("cmatLightDecision");
const cmatRecValuesEl = document.getElementById("cmatRecValues");
const cmatRecExtraEl = document.getElementById("cmatRecExtra");
const cmatRecDecisionEl = document.getElementById("cmatRecDecision");
const graphMessage  = document.getElementById("graphMessage");
const chartCanvas   = document.getElementById("cmatChart");
const rmcTerminalEl = document.getElementById("rmcTerminal");
const cmatTerminalEl = document.getElementById("cmatTerminal");
const debTopRmcLabelEl = document.getElementById("debTopRmcLabel");
const debTopCmatLabelEl = document.getElementById("debTopCmatLabel");
const debTopRmcEl = document.getElementById("debTopRmc");
const debTopCmatEl = document.getElementById("debTopCmat");
const top3RmcTitleEl = document.getElementById("top3RmcTitle");
const top3CmatTitleEl = document.getElementById("top3CmatTitle");
const top3RmcListEl = document.getElementById("top3RmcList");
const top3CmatListEl = document.getElementById("top3CmatList");
const marketTop3RmcTitleEl = document.getElementById("marketTop3RmcTitle");
const marketTop3CmatTitleEl = document.getElementById("marketTop3CmatTitle");
const marketTop3RmcListEl = document.getElementById("marketTop3RmcList");
const marketTop3CmatListEl = document.getElementById("marketTop3CmatList");

const titleMainEl = document.getElementById("titleMain");
const subTextEl = document.getElementById("subText");
const entriesTitleEl = document.getElementById("entriesTitle");
const labelPrixRmcEl = document.getElementById("labelPrixRmc");
const hintPrixRmcEl = document.getElementById("hintPrixRmc");
const labelPrixCmatEl = document.getElementById("labelPrixCmat");
const hintPrixCmatEl = document.getElementById("hintPrixCmat");
const sellRmcLabelEl = document.getElementById("sellRmcLabel");
const sellCmatLabelEl = document.getElementById("sellCmatLabel");
const labelScuLightEl = document.getElementById("labelScuLight");
const labelScuReclaimerEl = document.getElementById("labelScuReclaimer");
const tagLightEl = document.getElementById("tagLight");
const tagReclaimerEl = document.getElementById("tagReclaimer");
const smallNoteEl = document.getElementById("smallNote");
const rmcPanelTitleEl = document.getElementById("rmcPanelTitle");
const cmatPanelTitleEl = document.getElementById("cmatPanelTitle");
const rmcLightHeadEl = document.getElementById("rmcLightHead");
const rmcRecHeadEl = document.getElementById("rmcRecHead");
const cmatLightHeadEl = document.getElementById("cmatLightHead");
const cmatRecHeadEl = document.getElementById("cmatRecHead");
const graphTitleEl = document.getElementById("graphTitle");
const graphSubEl = document.getElementById("graphSub");
const langSwitchLabelEl = document.getElementById("langSwitchLabel");
const themeSelectEl = document.getElementById("themeSelect");
const langSelectEl = document.getElementById("langSelect");
const appVersionEl = document.getElementById("appVersion");

const leaderboardListEl = document.getElementById("leaderboardList");
const leaderboardEmptyEl = document.getElementById("leaderboardEmpty");
const openOnlineLeaderboardBtnEl = document.getElementById("openOnlineLeaderboardBtn");
const onlineLeaderboardModalEl = document.getElementById("onlineLeaderboardModal");
const onlineLeaderboardFullListEl = document.getElementById("onlineLeaderboardFullList");
const onlineLeaderboardFullEmptyEl = document.getElementById("onlineLeaderboardFullEmpty");
const onlineLeaderboardCloseBtnEl = document.getElementById("onlineLeaderboardCloseBtn");
const clearMyRunsBtnEl = document.getElementById("clearMyRunsBtn");
const clearAllRunsBtnEl = document.getElementById("clearAllRunsBtn");
const resetOnlineBtnEl = document.getElementById("resetOnlineBtn");
const leaderboardActionMsgEl = document.getElementById("leaderboardActionMsg");
const leaderboardSubEl = document.getElementById("leaderboardSub");
const leaderboardSortSelectEl = document.getElementById("leaderboardSortSelect");
const leaderboardShipFilterEl = document.getElementById("leaderboardShipFilter");
const leaderboardSortLabelEl = document.getElementById("leaderboardSortLabel");
const leaderboardShipFilterLabelEl = document.getElementById("leaderboardShipFilterLabel");

const toggleMyRunsBtnEl = document.getElementById("toggleMyRunsBtn");
const myRunsPanelEl = document.getElementById("myRunsPanel");
const myRunsActiveListEl = document.getElementById("myRunsActiveList");
const myRunsSoldListEl = document.getElementById("myRunsSoldList");
const myRunsActiveEmptyEl = document.getElementById("myRunsActiveEmpty");
const myRunsSoldEmptyEl = document.getElementById("myRunsSoldEmpty");
const myRunsTitleEl = document.getElementById("myRunsTitle");
const myRunsActiveTitleEl = document.getElementById("myRunsActiveTitle");
const myRunsSoldTitleEl = document.getElementById("myRunsSoldTitle");

const userInfoEl = document.getElementById("userInfo");
const changeUserBtn = document.getElementById("changeUserBtn");
const discordLoginBtn = document.getElementById("discordLoginBtn");

const profileModal = document.getElementById("profileModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const tabCreateProfile = document.getElementById("tabCreateProfile");
const tabImportProfile = document.getElementById("tabImportProfile");
const modalCreateSection = document.getElementById("modalCreateSection");
const modalImportSection = document.getElementById("modalImportSection");
const createNicknameInput = document.getElementById("createNickname");
const createProfileBtn = document.getElementById("createProfileBtn");
const createdKeyDisplay = document.getElementById("createdKeyDisplay");
const importNicknameInput = document.getElementById("importNickname");
const importSecretInput = document.getElementById("importSecret");
const importProfileBtn = document.getElementById("importProfileBtn");
const modalMessageEl = document.getElementById("modalMessage");

const shipSelectEl = document.getElementById("shipSelect");
const saveRunBtnEl = document.getElementById("saveRunBtn");
const saveRunMessageEl = document.getElementById("saveRunMessage");
const labelShipSelectEl = document.getElementById("labelShipSelect");
const advancedScuLightGroupEl = document.getElementById("advancedScuLightGroup");
const advancedScuReclaimerGroupEl = document.getElementById("advancedScuReclaimerGroup");
const loopRmcLightPanelEl = document.getElementById("loopRmcLightPanel");
const loopRmcReclaimerPanelEl = document.getElementById("loopRmcReclaimerPanel");
const loopCmatLightPanelEl = document.getElementById("loopCmatLightPanel");
const loopCmatReclaimerPanelEl = document.getElementById("loopCmatReclaimerPanel");
const debShipSelectEl = document.getElementById("debShipSelect");
const labelScuHullDebEl = document.getElementById("labelScuHullDeb");
const fieldScuHullDebEl = document.getElementById("fieldScuHullDeb");
const labelScuCsDebEl = document.getElementById("labelScuCsDeb");
const fieldScuCsDebEl = document.getElementById("fieldScuCsDeb");
const hintScuCsDebEl = document.getElementById("hintScuCsDeb");

let currentUser = null;

// Admin
const ADMIN_NICKNAME = "Shog";
const ADMIN_SECRET = "130890";

function isAdminUser(user) {
  return !!user && user.nickname === ADMIN_NICKNAME && user.secret === ADMIN_SECRET;
}

function updateAdminUI() {
  const isAdmin = isAdminUser(currentUser);

  if (clearAllRunsBtnEl) {
    clearAllRunsBtnEl.style.display = isAdmin ? "block" : "none";
  }

  if (resetOnlineBtnEl) {
    resetOnlineBtnEl.style.display = isAdmin ? "block" : "none";
  }

  if (userInfoEl && currentUser && isAdmin) {
    if (!userInfoEl.querySelector(".admin-badge-inline")) {
      const badge = document.createElement("span");
      badge.className = "admin-badge-inline";
      badge.textContent = "ADMIN";
      userInfoEl.appendChild(badge);
    }
  }
}

function generateSecret() {
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, "0");
}

function computeUserId(nickname, secret) {
  const base = (nickname || "").trim() + "#" + secret;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return "user_" + hash.toString(16);
}

function loadUserProfile() {
  try {
    const raw = localStorage.getItem("salvageCalcUser");
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || !u.id || !u.nickname || !u.secret) return null;
    return u;
  } catch (_) {
    return null;
  }
}

function saveUserProfile(user) {
  currentUser = user;
  try {
    localStorage.setItem("salvageCalcUser", JSON.stringify(user));
  } catch (_) {}
  updateUserUI();
  updateAdminUI();
  updateLocalLeaderboard();
  buildMyRunsList();
}

function updateUserUI() {
  let discordUser = null;

  // On privilégie le module Auth si disponible
  if (window.Auth && typeof Auth.getUser === "function") {
    discordUser = Auth.getUser();
  } else {
    // Fallback : tentative de récupération via le localStorage (compatibilité)
    try {
      const rawDiscord = localStorage.getItem("salvageDiscordUser");
      if (rawDiscord) {
        discordUser = JSON.parse(rawDiscord);
      }
    } catch (_) {
      // ignore storage / JSON errors
    }
  }

  const discordBtn = typeof discordLoginBtn !== "undefined" ? discordLoginBtn : null;

  if (discordUser && discordUser.nickname) {
    // Affichage dans la zone profil (si présent dans le DOM)
    if (userInfoEl) {
      userInfoEl.textContent = "Connecté via Discord : " + discordUser.nickname;
    }

    // Mise à jour du bouton dans la top-bar (reste cliquable pour permettre la déconnexion)
    if (discordBtn) {
      discordBtn.textContent = "Connecté via Discord";
      discordBtn.classList.add("connected");
      discordBtn.disabled = false;
    }
    return;
  }

  // Si pas d'utilisateur Discord, on remet le bouton en mode connexion
  if (discordBtn) {
    discordBtn.textContent = "Connexion Discord";
    discordBtn.classList.remove("connected");
    discordBtn.disabled = false;
  }

  // Fallback : ancien système de profil local, uniquement si la zone profil existe
  if (!userInfoEl) return;

  if (!currentUser) {
    userInfoEl.textContent = "Profil : —";
  } else {
    userInfoEl.textContent =
      "Profil : " + currentUser.nickname + " (clé : " + currentUser.secret + ")";
  }
}
function setActiveModalTab(tab) {
  if (tab === "import") {
    tabImportProfile.classList.add("active");
    tabCreateProfile.classList.remove("active");
    modalImportSection.classList.add("active");
    modalCreateSection.classList.remove("active");
  } else {
    tabCreateProfile.classList.add("active");
    tabImportProfile.classList.remove("active");
    modalCreateSection.classList.add("active");
    modalImportSection.classList.remove("active");
  }
  modalMessageEl.textContent = "";
}

function openProfileModal(initialTab) {
  if (!profileModal) return;
  profileModal.classList.add("open");
  createdKeyDisplay.style.display = "none";
  createdKeyDisplay.textContent = "";
  modalMessageEl.textContent = "";
  createNicknameInput.value = currentUser ? currentUser.nickname : "";
  importNicknameInput.value = "";
  importSecretInput.value = "";
  setActiveModalTab(initialTab === "import" ? "import" : "create");
}

function closeProfileModal() {
  if (!profileModal) return;
  profileModal.classList.remove("open");
}

function ensureUserProfile() {
  const existing = loadUserProfile();
  if (existing) {
    currentUser = existing;
    updateUserUI();
    updateAdminUI();
    return;
  }
}

function handleCreateProfile() {
  const t = i18n[currentLang] || i18n.fr;
  let nickname = (createNicknameInput.value || "").trim();
  if (!nickname) nickname = "Salvager";
  const secret = generateSecret();
  const id = computeUserId(nickname, secret);
  const user = { id, nickname, secret };
  saveUserProfile(user);
  createdKeyDisplay.style.display = "block";
  createdKeyDisplay.textContent =
    "Profil créé !\nPseudo : " + nickname +
    "\nClé privée : " + secret +
    "\n\nNote bien cette clé pour récupérer ton profil sur un autre navigateur.";
  modalMessageEl.textContent = "";
}

function handleImportProfile() {
  const t = i18n[currentLang] || i18n.fr;
  const nickname = (importNicknameInput.value || "").trim();
  const secret = (importSecretInput.value || "").trim();

  if (!nickname) {
    modalMessageEl.textContent = "Merci de renseigner un pseudo.";
    return;
  }
  if (!/^[0-9]{6}$/.test(secret)) {
    modalMessageEl.textContent = "La clé doit contenir exactement 6 chiffres.";
    return;
  }

  const id = computeUserId(nickname, secret);
  const user = { id, nickname, secret };
  saveUserProfile(user);
  modalMessageEl.textContent = "Profil importé avec succès.";
}

function getRuns() {
  try {
    return JSON.parse(localStorage.getItem("salvageCalcRuns") || "[]");
  } catch (_) {
    return [];
  }
}

function saveRuns(runs) {
  try {
    localStorage.setItem("salvageCalcRuns", JSON.stringify(runs));
  } catch (_) {}
}

function format(val) {
  if (val == null || isNaN(val)) return "0";
  return Number(val).toLocaleString(currentLang === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 0
  });
}

async function updateLocalLeaderboard(force = false) {
  const t = i18n[currentLang] || i18n.fr;
  if (!leaderboardListEl || !leaderboardEmptyEl) return;

  const now = Date.now();
  if (!force && cachedLeaderboardUsers.length && (now - lastLeaderboardFetch) < LEADERBOARD_REFRESH_MS) {
    renderOnlineLeaderboard(cachedLeaderboardUsers, t);
    return;
  }

  leaderboardEmptyEl.style.display = "block";
  leaderboardEmptyEl.textContent = t.leaderboardLoading || "Chargement du leaderboard en ligne…";

  try {
    const resp = await fetch(LEADERBOARD_API_BASE + "/api/leaderboard", {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    const data = await resp.json();
    const users = Array.isArray(data.users) ? data.users : [];
    cachedLeaderboardUsers = users;
    lastLeaderboardFetch = Date.now();
    renderOnlineLeaderboard(users, t);
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    leaderboardListEl.innerHTML = "";
    leaderboardEmptyEl.style.display = "block";
    const prefix = t.leaderboardErrorPrefix || "Erreur leaderboard : ";
    leaderboardEmptyEl.textContent = prefix + String(err.message || err);
  }
}


function computeBadges(user) {
  if (!user) return [];
  const badges = [];
  const totalProfit = user.totalProfit || 0;
  const runs = user.totalRuns || 0;
  const favShip = (user.favShip || "").toLowerCase();

  // Profit-based badges
  if (totalProfit >= 500000000) {
    badges.push("🚀 Galactic Salvager");
  } else if (totalProfit >= 100000000) {
    badges.push("💎 Platinum Salvager");
  } else if (totalProfit >= 50000000) {
    badges.push("🥇 Gold Salvager");
  } else if (totalProfit >= 10000000) {
    badges.push("🥈 Silver Salvager");
  } else if (totalProfit >= 1000000) {
    badges.push("🥉 Bronze Salvager");
  }

  // Runs-based badges
  if (runs >= 500) {
    badges.push("🏭 Mega Salvager");
  } else if (runs >= 250) {
    badges.push("🚨 Industrial Scrapper");
  } else if (runs >= 100) {
    badges.push("🛠️ Salvage Engineer");
  } else if (runs >= 25) {
    badges.push("⚙️ Senior Operator");
  } else if (runs >= 5) {
    badges.push("🔧 Junior Operator");
  }

  // Favourite ship badges
  if (favShip.includes("vulture")) {
    badges.push("🦅 Vulture Master");
  } else if (favShip.includes("salvation")) {
    badges.push("☀️ Salvation Specialist");
  } else if (favShip.includes("fortune")) {
    badges.push("🌀 Fortune Operator");
  } else if (favShip.includes("reclaimer")) {
    badges.push("👑 Reclaimer Commander");
  }

  return badges;
}

function computeBadgesHtml(user) {
  const badges = computeBadges(user);
  if (!badges || !badges.length) return "";
  return badges.map(label => `<span class="lb-badge">${label}</span>`).join(" ");
}

function renderOnlineLeaderboard(users, t) {
  if (!leaderboardListEl || !leaderboardEmptyEl) return;

  // Top 3 + liste complète dans la modale
  const hasUsers = Array.isArray(users) && users.length > 0;

  // Gère les états "vide" côté Top 3
  if (!hasUsers) {
    leaderboardListEl.innerHTML = "";
    leaderboardEmptyEl.style.display = "block";
    leaderboardEmptyEl.textContent = t.leaderboardEmpty;
    if (onlineLeaderboardFullListEl && onlineLeaderboardFullEmptyEl) {
      onlineLeaderboardFullListEl.innerHTML = "";
      onlineLeaderboardFullEmptyEl.style.display = "block";
      onlineLeaderboardFullEmptyEl.textContent = t.leaderboardEmpty;
    }
    return;
  }

  leaderboardEmptyEl.style.display = "none";
  if (onlineLeaderboardFullEmptyEl) {
    onlineLeaderboardFullEmptyEl.style.display = "none";
  }

  const sorted = getFilteredSortedLeaderboardUsers(users);

  // --- TOP 3 (page principale) ---
  leaderboardListEl.innerHTML = "";
  const top3 = sorted.slice(0, 3);
  top3.forEach((u, index) => {
    const profitStr = format(u.totalProfit);
    const totalRmcStr = format(u.totalRmcScu || 0);
    const favShip = u.favShip || "N/A";

    const isCurrent =
      currentUser &&
      currentUser.nickname &&
      u.nickname &&
      u.nickname.toLowerCase() === currentUser.nickname.toLowerCase();

    const rank = index + 1;

    let html = "";
    if (isCurrent) {
      html += `<span class="leaderboard-badge-you">${t.leaderboardYou}</span> `;
    }

    html += `<span class="leaderboard-rank">#${rank}</span>`;
    html += t.leaderboardLine(
      u.nickname || "Unknown",
      u.totalRuns || 0,
      profitStr,
      favShip,
      totalRmcStr,
      computeBadgesHtml(u),
      false
    );

    const li = document.createElement("li");
    li.innerHTML = html;

    if (isCurrent) {
      li.classList.add("leaderboard-item-current");
    }

    leaderboardListEl.appendChild(li);
  });

  // --- LISTE COMPLÈTE dans la modale ---
  if (onlineLeaderboardFullListEl) {
    onlineLeaderboardFullListEl.innerHTML = "";
    sorted.slice(0, 20).forEach((u, index) => {
      const profitStr = format(u.totalProfit);
      const totalRmcStr = format(u.totalRmcScu || 0);
      const favShip = u.favShip || "N/A";

      const isCurrent =
        currentUser &&
        currentUser.nickname &&
        u.nickname &&
        u.nickname.toLowerCase() === currentUser.nickname.toLowerCase();

      const rank = index + 1;

      let html = "";
      if (isCurrent) {
        html += `<span class="leaderboard-badge-you">${t.leaderboardYou}</span> `;
      }

      html += `<span class="leaderboard-rank">#${rank}</span>`;
      html += t.leaderboardLine(
        u.nickname || "Unknown",
        u.totalRuns || 0,
        profitStr,
        favShip,
        totalRmcStr,
        computeBadgesHtml(u),
        false
      );

      const li = document.createElement("li");
      li.innerHTML = html;

      if (isCurrent) {
        li.classList.add("leaderboard-item-current");
      }

      onlineLeaderboardFullListEl.appendChild(li);
    });
  }
}



async function pushRunToOnlineLeaderboard(run) {
  try {
    if (!run || !run.nickname || !run.ship) return;

    const now = Date.now();
    if (LEADERBOARD_RUN_COOLDOWN_MS > 0 && lastOnlineRunTs && (now - lastOnlineRunTs) < LEADERBOARD_RUN_COOLDOWN_MS) {
      const t = i18n[currentLang] || i18n.fr;
      if (saveRunMessageEl) {
        saveRunMessageEl.textContent = t.saveRunCooldown || "Tu viens d'envoyer un run. Merci d'attendre quelques secondes avant de renvoyer un nouveau run.";
      }
      startAntiSpamCountdown();
      return;
    }

    lastOnlineRunTs = now;
    try {
      localStorage.setItem("salvageCalcLastOnlineRunTs", String(lastOnlineRunTs));
    } catch (e) {
      // ignore storage errors
    }
    startAntiSpamCountdown();

    const payload = {
      nickname: run.nickname,
      ship: run.ship,
      profit: Math.round(Number(run.profit) || 0),
      rmcScu: Math.round(Number(run.rmc) || 0),
      totalScu: Math.round((Number(run.scuLight) || 0) + (Number(run.scuRec) || 0))
    };

    const resp = await fetch(LEADERBOARD_API_BASE + "/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = i18n[currentLang] || i18n.fr;
      if (saveRunMessageEl) {
        saveRunMessageEl.textContent = t.saveRunError || "Erreur lors de l'envoi au leaderboard en ligne.";
      }
      console.error("pushRunToOnlineLeaderboard HTTP error:", resp.status, await resp.text());
      return;
    }

    // Refresh leaderboard cache after a new run is sent
    updateLocalLeaderboard(true);
  } catch (err) {
    console.error("pushRunToOnlineLeaderboard error:", err);
    const t = i18n[currentLang] || i18n.fr;
    if (saveRunMessageEl) {
      saveRunMessageEl.textContent = t.saveRunError || "Erreur lors de l'envoi au leaderboard en ligne.";
    }
  }
}


function openOnlineLeaderboardModal() {
  if (!onlineLeaderboardModalEl) return;
  onlineLeaderboardModalEl.classList.add("open");
}

function closeOnlineLeaderboardModal() {
  if (!onlineLeaderboardModalEl) return;
  onlineLeaderboardModalEl.classList.remove("open");
}


function updateScuAdvancedVisibility() {
  // Partie avancée : basée sur le sélecteur de vaisseau principal
  let isReclaimerAdv = false;
  if (shipSelectEl) {
    const ship = (shipSelectEl.value || "").toLowerCase();
    isReclaimerAdv = ship.includes("reclaimer");
  }

  // Partie débutant : basée sur le sélecteur dédié
  let isReclaimerDeb = false;
  if (debShipSelectEl) {
    const v = (debShipSelectEl.value || "").toLowerCase();
    isReclaimerDeb = v === "reclaimer";
  }

  // Mode avancé : SCU et panneaux détaillés
  if (advancedScuLightGroupEl) {
    advancedScuLightGroupEl.style.display = isReclaimerAdv ? "none" : "";
  }
  if (advancedScuReclaimerGroupEl) {
    advancedScuReclaimerGroupEl.style.display = isReclaimerAdv ? "" : "none";
  }

  if (loopRmcLightPanelEl) {
    loopRmcLightPanelEl.style.display = isReclaimerAdv ? "none" : "";
  }
  if (loopRmcReclaimerPanelEl) {
    loopRmcReclaimerPanelEl.style.display = isReclaimerAdv ? "" : "none";
  }
  if (loopCmatLightPanelEl) {
    loopCmatLightPanelEl.style.display = isReclaimerAdv ? "none" : "";
  }
  if (loopCmatReclaimerPanelEl) {
    loopCmatReclaimerPanelEl.style.display = isReclaimerAdv ? "" : "none";
  }

  // Mode débutant : champs SCU simplifiés
  if (labelScuHullDebEl && fieldScuHullDebEl) {
    const showLight = !isReclaimerDeb;
    labelScuHullDebEl.style.display = showLight ? "" : "none";
    fieldScuHullDebEl.style.display = showLight ? "" : "none";
  }
  if (labelScuCsDebEl && fieldScuCsDebEl && hintScuCsDebEl) {
    labelScuCsDebEl.style.display = isReclaimerDeb ? "" : "none";
    fieldScuCsDebEl.style.display = isReclaimerDeb ? "" : "none";
    hintScuCsDebEl.style.display = isReclaimerDeb ? "" : "none";
  }
}

function handleSaveRun() {
  const t = i18n[currentLang] || i18n.fr;

  if (!currentUser) {
    saveRunMessageEl.textContent = t.saveRunNoUser;
    return;
  }

  const prixRMC  = Number(prixRmcInput.value)  || 0;
  const prixCMAT = Number(prixCmatInput.value) || 0;
  const sl = Number(scuLightInput.value) || 0;
  const sr = Number(scuRecInput.value)   || 0;

  if (sl <= 0 && sr <= 0) {
    saveRunMessageEl.textContent = t.saveRunNoScu;
    return;
  }

  const ship = shipSelectEl.value || (sr > 0 ? "Reclaimer" : "Vulture");
  localStorage.setItem("salvageCalcLastShip", ship);

  const rmcLightVal = sl * prixRMC;
  const rmcRecVal   = sr * prixRMC;
  const cmatRecScu  = sr * REND_RECLAIMER;
  const cmatRecVal  = cmatRecScu * prixCMAT;

  // Profit logic:
  // - Light ships: RMC value.
  // - Reclaimer (or any run with Reclaimer SCU): CMAT-only (RMC disabled).
  let profit = 0;
  if (ship === "Reclaimer" || sr > 0) {
    profit = cmatRecVal;
  } else {
    profit = rmcLightVal;
  }

  const totalRmcScu = sl + sr;

  const newRun = {
    userId: currentUser.id,
    nickname: currentUser.nickname,
    profit,
    rmc: totalRmcScu,
    ship,
    ts: Date.now(),
    scuLight: sl,
    scuRec: sr,
    prixRMC: prixRMC,
    prixCMAT: prixCMAT,
    rmcLightVal: rmcLightVal,
    rmcRecVal: rmcRecVal,
    cmatRecVal: cmatRecVal,
    cmatScu: cmatRecScu,
    isAdmin: isAdminUser(currentUser),
    sold: false
  };

  const runs = getRuns();
  runs.push(newRun);
  saveRuns(runs);
  buildMyRunsList();
  pushRunToOnlineLeaderboard(newRun);

  saveRunMessageEl.textContent = t.saveRunSuccess;
  saveRunMessageEl.style.opacity = "1";
  setTimeout(() => {
    saveRunMessageEl.style.transition = "opacity 0.4s ease-out";
    saveRunMessageEl.style.opacity = "0";
    setTimeout(() => {
      saveRunMessageEl.textContent = "";
      saveRunMessageEl.style.transition = "";
      saveRunMessageEl.style.opacity = "";
    }, 400);
  }, 2500);
}

function clearMyRuns() {
  const t = i18n[currentLang] || i18n.fr;
  leaderboardActionMsgEl.textContent = "";

  if (!currentUser) {
    leaderboardActionMsgEl.textContent = t.clearMyRunsNoUser;
    return;
  }

  const stored = getRuns();
  const filtered = stored.filter(r => r.userId !== currentUser.id);
  saveRuns(filtered);
  updateLocalLeaderboard();
  buildMyRunsList();
  leaderboardActionMsgEl.textContent = t.clearMyRunsDone;
}

function clearAllRuns() {
  const t = i18n[currentLang] || i18n.fr;
  leaderboardActionMsgEl.textContent = "";
  saveRuns([]);
  updateLocalLeaderboard();
  buildMyRunsList();
  leaderboardActionMsgEl.textContent = t.clearAllRunsDone;
}


async function resetOnlineLeaderboard() {
  const t = i18n[currentLang] || i18n.fr;

  if (!currentUser || !isAdminUser(currentUser)) {
    leaderboardActionMsgEl.textContent =
      t.leaderboardAdminOnly || "Action réservée à l'admin.";
    return;
  }

  leaderboardActionMsgEl.textContent =
    t.leaderboardResetLoading || "Reset du leaderboard en ligne en cours…";

  try {
    const res = await fetch(`${LEADERBOARD_API_BASE}/api/admin/reset-leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileKey: currentUser.secret,
      }),
    });

    const data = await res.json().catch(() => null);

    // Cas quota Cloudflare atteint (ex: "KV put() limit exceeded for the day.")
    if (data && typeof data.details === "string" &&
        data.details.toLowerCase().includes("limit exceeded")) {
      if (currentLang === "en") {
        leaderboardActionMsgEl.textContent =
          "⚠️ Cloudflare daily write limit reached. The reset will be available again tomorrow.";
      } else {
        leaderboardActionMsgEl.textContent =
          "⚠️ Limite Cloudflare atteinte aujourd’hui. Le reset sera possible demain.";
      }
      return;
    }

    if (!res.ok || !data || !data.ok) {
      const errText = (data && data.error) ? data.error : "Erreur inconnue";
      leaderboardActionMsgEl.textContent =
        (t.leaderboardResetError || "Erreur pendant le reset du leaderboard en ligne.") +
        ` (${errText})`;
      return;
    }

    const count = data.deleted || 0;
    if (t.leaderboardResetDone) {
      leaderboardActionMsgEl.textContent = t.leaderboardResetDone(count);
    } else {
      leaderboardActionMsgEl.textContent =
        `Leaderboard en ligne nettoyé (${count} profil(s) supprimé(s)).`;
    }

    // Rafraîchit le leaderboard global
    cachedLeaderboardUsers = [];
    lastLeaderboardFetch = 0;
    if (typeof refreshLeaderboard === "function") {
      refreshLeaderboard();
    }
  } catch (e) {
    console.error(e);
    const msg = String(e && e.message ? e.message : e || "");
    if (msg.toLowerCase().includes("limit exceeded")) {
      if (currentLang === "en") {
        leaderboardActionMsgEl.textContent =
          "⚠️ Cloudflare daily write limit reached. The reset will be available again tomorrow.";
      } else {
        leaderboardActionMsgEl.textContent =
          "⚠️ Limite Cloudflare atteinte aujourd’hui. Le reset sera possible demain.";
      }
    } else {
      leaderboardActionMsgEl.textContent =
        t.leaderboardResetError || "Erreur réseau pendant le reset du leaderboard en ligne.";
    }
  }
}

function updateRunSold(ts, sold) {
  const runs = getRuns();
  let changed = false;
  runs.forEach(r => {
    if (r.ts === ts) {
      r.sold = !!sold;
      changed = true;
    }
  });
  if (changed) {
    saveRuns(runs);
    updateLocalLeaderboard();
  }
}

function buildMyRunsList() {
  const t = i18n[currentLang] || i18n.fr;
  if (!myRunsPanelEl ||
      !myRunsActiveListEl || !myRunsSoldListEl ||
      !myRunsActiveEmptyEl || !myRunsSoldEmptyEl) return;

  myRunsActiveListEl.innerHTML = "";
  myRunsSoldListEl.innerHTML = "";

  if (!currentUser) {
    myRunsActiveEmptyEl.style.display = "block";
    myRunsSoldEmptyEl.style.display = "none";
    myRunsActiveEmptyEl.textContent = t.myRunsNoUser;
    return;
  }

  const stored = getRuns();
  const mine = stored
    .filter(r => r.userId === currentUser.id)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const active = mine.filter(r => !r.sold);
  const sold = mine.filter(r => r.sold);
  const maxToShow = 20;

  if (!active.length) {
    myRunsActiveEmptyEl.style.display = "block";
    myRunsActiveEmptyEl.textContent = t.myRunsActiveEmpty;
  } else {
    myRunsActiveEmptyEl.style.display = "none";
    active.slice(0, maxToShow).forEach((r, idx) => {
      const li = document.createElement("li");
      const main = document.createElement("div");
      main.className = "my-run-mainline";

      const profitStr = format(Number(r.profit) || 0);

      const scuLight = Number(r.scuLight || 0);
      const scuRec = Number(r.scuRec || 0);
      const scuTotal = scuLight || scuRec ? (scuLight + scuRec) : null;

      const rmcValRaw = (r.rmcLightVal || 0) + (r.rmcRecVal || 0);
      const rmcValStr = rmcValRaw ? format(rmcValRaw) : "";
      const cmatValRaw = r.cmatRecVal || 0;
      const cmatValStr = cmatValRaw ? format(cmatValRaw) : "";
      const cmatScu = r.cmatScu || 0;

      const scuTotalStr = scuTotal != null ? format(scuTotal) : "";
      const scuLightStr = scuTotal != null ? format(scuLight) : "";
      const scuRecStr = scuTotal != null ? format(scuRec) : "";

      const d = r.ts ? new Date(r.ts) : null;
      const dateStr = d
        ? d.toLocaleString(currentLang === "fr" ? "fr-FR" : "en-US", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "-";

      const scuText = scuTotalStr
        ? `SCU: ${scuTotalStr} (L: ${scuLightStr} / R: ${scuRecStr})`
        : "";
      const rmcText = rmcValStr ? `RMC: ${rmcValStr} aUEC` : "";
      const cmatText = cmatValStr ? `CMAT: ${cmatValStr} aUEC` : "";
      const profitText = profitStr ? `Profit: ${profitStr} aUEC` : "";

      main.textContent = t.myRunsLine(
        idx + 1,
        r.ship || "?",
        scuText,
        rmcText,
        cmatText,
        profitText,
        dateStr
      );

      const toggle = document.createElement("label");
      toggle.className = "my-run-sold-toggle";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!r.sold;
      cb.addEventListener("change", () => {
        updateRunSold(r.ts, cb.checked);
        buildMyRunsList();
      });
      const span = document.createElement("span");
      span.textContent = t.myRunsSoldLabel;

      toggle.appendChild(cb);
      toggle.appendChild(span);

      li.appendChild(main);
      li.appendChild(toggle);

      myRunsActiveListEl.appendChild(li);
    });
  }

  if (!sold.length) {
    myRunsSoldEmptyEl.style.display = "block";
    myRunsSoldEmptyEl.textContent = t.myRunsSoldEmpty;
  } else {
    myRunsSoldEmptyEl.style.display = "none";
    sold.slice(0, maxToShow).forEach((r, idx) => {
      const li = document.createElement("li");
      li.classList.add("my-run-row-sold");

      const main = document.createElement("div");
      main.className = "my-run-mainline";

      const profitStr = format(Number(r.profit) || 0);

      const scuLight = Number(r.scuLight || 0);
      const scuRec = Number(r.scuRec || 0);
      const scuTotal = scuLight || scuRec ? (scuLight + scuRec) : null;

      const rmcValRaw = (r.rmcLightVal || 0) + (r.rmcRecVal || 0);
      const rmcValStr = rmcValRaw ? format(rmcValRaw) : "";
      const cmatValRaw = r.cmatRecVal || 0;
      const cmatValStr = cmatValRaw ? format(cmatValRaw) : "";
      const cmatScu = r.cmatScu || 0;

      const scuTotalStr = scuTotal != null ? format(scuTotal) : "";
      const scuLightStr = scuTotal != null ? format(scuLight) : "";
      const scuRecStr = scuTotal != null ? format(scuRec) : "";

      const d = r.ts ? new Date(r.ts) : null;
      const dateStr = d
        ? d.toLocaleString(currentLang === "fr" ? "fr-FR" : "en-US", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "-";

      const scuText = scuTotalStr
        ? `SCU: ${scuTotalStr} (L: ${scuLightStr} / R: ${scuRecStr})`
        : "";
      const rmcText = rmcValStr ? `RMC: ${rmcValStr} aUEC` : "";
      const cmatText = cmatValStr ? `CMAT: ${cmatValStr} aUEC` : "";
      const profitText = profitStr ? `Profit: ${profitStr} aUEC` : "";

      main.textContent = t.myRunsLine(
        idx + 1,
        r.ship || "?",
        scuText,
        rmcText,
        cmatText,
        profitText,
        dateStr
      );

      const toggle = document.createElement("label");
      toggle.className = "my-run-sold-toggle";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!r.sold;
      cb.addEventListener("change", () => {
        updateRunSold(r.ts, cb.checked);
        buildMyRunsList();
      });
      const span = document.createElement("span");
      span.textContent = t.myRunsSoldLabel;

      toggle.appendChild(cb);
      toggle.appendChild(span);

      li.appendChild(main);
      li.appendChild(toggle);

      myRunsSoldListEl.appendChild(li);
    });
  }
}

function toggleMyRunsPanel() {
  if (!myRunsPanelEl) return;
  const isOpen = myRunsPanelEl.classList.contains("open");
  if (!isOpen) {
    myRunsPanelEl.classList.add("open");
    buildMyRunsList();
  } else {
    myRunsPanelEl.classList.remove("open");
  }
}

function applyTheme() {
  const body = document.body;
  body.classList.remove("theme-neon", "theme-light");
  if (currentTheme === "dark") {
    body.classList.add("theme-dark");
  } else if (currentTheme === "light") {
    body.classList.add("theme-light");
  } else {
    body.classList.add("theme-neon");
    currentTheme = "neon";
  }
  if (themeSelectEl) themeSelectEl.value = currentTheme;
}

function applyLanguage() {
  const t = i18n[currentLang] || i18n.fr;
  document.documentElement.lang = currentLang;

  titleMainEl.textContent = t.titleMain;
  subTextEl.innerHTML = t.subText;
  entriesTitleEl.textContent = t.entriesTitle;
  labelPrixRmcEl.textContent = t.labelPrixRmc;
  hintPrixRmcEl.textContent = t.hintPrixRmc;
  labelPrixCmatEl.textContent = t.labelPrixCmat;
  hintPrixCmatEl.textContent = t.hintPrixCmat;
  sellRmcLabelEl.textContent = t.sellRmcLabel;
  sellCmatLabelEl.textContent = t.sellCmatLabel;
  labelScuLightEl.textContent = t.labelScuLight;
  labelScuReclaimerEl.textContent = t.labelScuReclaimer;
  tagLightEl.textContent = t.tagLight;
  tagReclaimerEl.textContent = t.tagReclaimer;
  smallNoteEl.textContent = t.smallNote;
  rmcPanelTitleEl.textContent = t.rmcPanelTitle;
  cmatPanelTitleEl.textContent = t.cmatPanelTitle;
  rmcLightHeadEl.textContent = t.rmcLightHead;
  rmcRecHeadEl.textContent = t.rmcRecHead;
  cmatLightHeadEl.textContent = t.cmatLightHead;
  cmatRecHeadEl.textContent = t.cmatRecHead;
  graphTitleEl.textContent = t.graphTitle;
  graphSubEl.textContent = t.graphSub;
  langSwitchLabelEl.textContent = t.langSwitchLabel;
  labelShipSelectEl.textContent = t.labelShipSelect;
  leaderboardEmptyEl.textContent = t.leaderboardEmpty;
  if (saveRunBtnEl) saveRunBtnEl.textContent = t.saveRunBtn;
  clearMyRunsBtnEl.textContent = t.clearMyRunsBtn;
  clearAllRunsBtnEl.textContent = t.clearAllRunsBtn;

  if (leaderboardSortLabelEl) {
    leaderboardSortLabelEl.textContent = t.leaderboardSortLabel;
  }
  if (leaderboardShipFilterLabelEl) {
    leaderboardShipFilterLabelEl.textContent = t.leaderboardFilterLabel;
  }

  if (leaderboardSortSelectEl) {
    const optProfit = leaderboardSortSelectEl.querySelector('option[value="profit"]');
    const optRuns = leaderboardSortSelectEl.querySelector('option[value="runs"]');
    const optName = leaderboardSortSelectEl.querySelector('option[value="name"]');
    if (optProfit) optProfit.textContent = t.leaderboardSortProfit;
    if (optRuns) optRuns.textContent = t.leaderboardSortRuns;
    if (optName) optName.textContent = t.leaderboardSortName;
    leaderboardSortSelectEl.value = leaderboardSortKey;
  }

  if (leaderboardShipFilterEl) {
    const optAll = leaderboardShipFilterEl.querySelector('option[value="all"]');
    const optVulture = leaderboardShipFilterEl.querySelector('option[value="vulture"]');
    const optSalvation = leaderboardShipFilterEl.querySelector('option[value="salvation"]');
    const optFortune = leaderboardShipFilterEl.querySelector('option[value="fortune"]');
    const optReclaimer = leaderboardShipFilterEl.querySelector('option[value="reclaimer"]');
    if (optAll) optAll.textContent = t.leaderboardFilterAll;
    if (optVulture) optVulture.textContent = t.leaderboardFilterVulture;
    if (optSalvation) optSalvation.textContent = t.leaderboardFilterSalvation;
    if (optFortune) optFortune.textContent = t.leaderboardFilterFortune;
    if (optReclaimer) optReclaimer.textContent = t.leaderboardFilterReclaimer;
    leaderboardShipFilterEl.value = leaderboardShipFilterKey;
  }

  if (leaderboardSubEl) {
    leaderboardSubEl.textContent = t.leaderboardSub;
  }
  if (toggleMyRunsBtnEl) {
    toggleMyRunsBtnEl.textContent = t.myRunsBtn;
  }
  if (myRunsTitleEl) {
    myRunsTitleEl.textContent = t.myRunsTitle;
  }
  if (myRunsActiveTitleEl) {
    myRunsActiveTitleEl.textContent = t.myRunsActiveTitle;
  }
  if (myRunsSoldTitleEl) {
    myRunsSoldTitleEl.textContent = t.myRunsSoldTitle;
  }
  if (myRunsActiveEmptyEl) {
    myRunsActiveEmptyEl.textContent = t.myRunsActiveEmpty;
  }
  if (myRunsSoldEmptyEl) {
    myRunsSoldEmptyEl.textContent = t.myRunsSoldEmpty;
  }

  if (appVersionEl) {
    const span = appVersionEl.querySelector("span") || appVersionEl;
    span.textContent = "Version " + APP_VERSION;
  }

  updateAdminUI();
  recalc();
  updateLocalLeaderboard();
  buildMyRunsList();
}

function saveState() {
  const state = {
    scuLight: Number(scuLightInput.value) || 0,
    scuReclaimer: Number(scuRecInput.value) || 0
  };
  localStorage.setItem("salvageCalcState", JSON.stringify(state));
  localStorage.setItem("salvageCalcLang", currentLang);
  localStorage.setItem("salvageCalcTheme", currentTheme);
}

function updateComparison(rmcValue, cmatValue, rmcDecEl, cmatDecEl) {
  const t = i18n[currentLang] || i18n.fr;
  const diff = Math.abs(cmatValue - rmcValue);
  const diffStr = format(diff);

  if (rmcValue === 0 && cmatValue === 0) {
    rmcDecEl.textContent = "";
    cmatDecEl.textContent = "";
    rmcDecEl.className = "decision";
    cmatDecEl.className = "decision";
    return;
  }

  if (cmatValue > rmcValue) {
    const text = t.loopCmatBetter(diffStr);
    rmcDecEl.textContent = text;
    cmatDecEl.textContent = text;
    rmcDecEl.className = "decision bad";
    cmatDecEl.className = "decision good";
  } else if (rmcValue > cmatValue) {
    const text = t.loopRmcBetter(diffStr);
    rmcDecEl.textContent = text;
    cmatDecEl.textContent = text;
    rmcDecEl.className = "decision good";
    cmatDecEl.className = "decision bad";
  } else {
    const text = t.loopsEqual;
    rmcDecEl.textContent = text;
    cmatDecEl.textContent = text;
    rmcDecEl.className = "decision";
    cmatDecEl.className = "decision";
  }
}

function resetDecision(el) {
  if (!el) return;
  el.textContent = "";
  el.className = "decision";
}

function updateLightShipsLoop(t, prixRMC, prixCMAT, sl) {
  // Light ships: RMC loop
  const rmcLightVal = sl * prixRMC;
  rmcLightValuesEl.textContent = t.rmcLightValues(format(sl), format(rmcLightVal));
  rmcLightExtraEl.textContent = sl > 0 ? t.lightShipsInfo : "";
  resetDecision(rmcLightDecisionEl);

  // Light ships: no CMAT loop
  cmatLightValuesEl.textContent = t.lightShipsNoCmatText;
  cmatLightExtraEl.textContent = "";
  resetDecision(cmatLightDecisionEl);
}

function updateReclaimerLoop(t, prixCMAT, sl, sr) {
  // Reclaimer: RMC sale disabled – informational block only
  rmcRecValuesEl.textContent = t.rmcRecValues();
  rmcRecExtraEl.textContent = "";
  resetDecision(rmcRecDecisionEl);

  // Reclaimer: CMAT loop (15% yield)
  const cmatRecScu = sr * REND_RECLAIMER;
  const cmatRecVal = cmatRecScu * prixCMAT;
  cmatRecValuesEl.textContent = t.cmatRecValues(
    format(cmatRecScu),
    format(cmatRecVal)
  );

  const totalScu = sl + sr;
  const pctCmatReclaimer = sr > 0 ? (cmatRecScu / sr) * 100 : 0;
  const pctCmatTotal = totalScu > 0 ? (cmatRecScu / totalScu) * 100 : 0;

  if (sr > 0) {
    cmatRecExtraEl.textContent = t.cmatRecExtra(
      format(sr),
      format(cmatRecScu),
      pctCmatReclaimer.toFixed(1),
      pctCmatTotal.toFixed(1)
    );
  } else {
    cmatRecExtraEl.textContent = "";
  }

  // No explicit RMC vs CMAT decision for Reclaimer in 4.4+
  resetDecision(cmatRecDecisionEl);
}

function recalc() {
  const t = i18n[currentLang] || i18n.fr;
  const prixRMC  = Number(prixRmcInput.value)  || 0;
  const prixCMAT = Number(prixCmatInput.value) || 0;

  const sl = Number(scuLightInput.value) || 0;
  const sr = Number(scuRecInput.value)   || 0;

  updateLightShipsLoop(t, prixRMC, prixCMAT, sl);
  updateReclaimerLoop(t, prixCMAT, sl, sr);
}


[scuLightInput, scuRecInput].forEach(el =>
  el.addEventListener("input", () => {
    recalc();
    saveState();
  })
);

langSelectEl.addEventListener("change", () => {
  currentLang = langSelectEl.value || "fr";
  saveState();
  applyLanguage();
  myRunsPanelEl.classList.remove("open");
});

if (themeSelectEl) {
  themeSelectEl.addEventListener("change", () => {
  currentTheme = themeSelectEl.value || "neon";
  if (currentTheme === "dark") currentTheme = "neon";
  applyTheme();
  saveState();
});
}

if (changeUserBtn) {
  changeUserBtn.addEventListener("click", () => openProfileModal("create"));
}

if (discordLoginBtn) {
  discordLoginBtn.addEventListener("click", () => {
    // Si le module Auth est disponible, on délègue entièrement la logique Discord
    if (window.Auth && typeof Auth.isLoggedIn === "function" &&
        typeof Auth.logout === "function" &&
        typeof Auth.loginWithDiscord === "function") {
      if (Auth.isLoggedIn()) {
        // Déconnexion via le module Auth
        Auth.logout();
        updateUserUI();
      } else {
        // Connexion via le module Auth (flow OAuth classique)
        Auth.loginWithDiscord();
      }
      return;
    }

    // Fallback : ancien comportement basé directement sur le localStorage
    let hasDiscord = false;
    try {
      const rawDiscord = localStorage.getItem("salvageDiscordUser");
      if (rawDiscord) {
        const du = JSON.parse(rawDiscord);
        if (du && du.id) {
          hasDiscord = true;
        }
      }
    } catch (_) {
      hasDiscord = false;
    }

    if (hasDiscord) {
      // Déconnexion Discord : on supprime l'entrée et on met à jour l'UI
      localStorage.removeItem("salvageDiscordUser");
      updateUserUI();
      return;
    }

    // Pas encore connecté : on lance le flow Discord
    window.location.href = "https://salvage-auth.yoyoastico74.workers.dev/auth/discord/login";
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeProfileModal);
}

if (profileModal) {
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) {
      closeProfileModal();
    }
  });
}

tabCreateProfile.addEventListener("click", () => setActiveModalTab("create"));
tabImportProfile.addEventListener("click", () => setActiveModalTab("import"));

createProfileBtn.addEventListener("click", handleCreateProfile);
importProfileBtn.addEventListener("click", handleImportProfile);

if (saveRunBtnEl) {
  saveRunBtnEl.addEventListener("click", handleSaveRun);
}

if (toggleMyRunsBtnEl) {
  toggleMyRunsBtnEl.addEventListener("click", toggleMyRunsPanel);
}

if (clearMyRunsBtnEl) {
  clearMyRunsBtnEl.addEventListener("click", clearMyRuns);
}

if (clearAllRunsBtnEl) {
  clearAllRunsBtnEl.addEventListener("click", clearAllRuns);
}

if (resetOnlineBtnEl) {
  resetOnlineBtnEl.addEventListener("click", resetOnlineLeaderboard);
}

let cmatChart = null;

function renderChart(rmcHist, cmatHist) {
  const maxLen = Math.max(rmcHist.length, cmatHist.length);
  const labels = [];
  const rmcValues = [];
  const cmatValues = [];

  for (let i = 0; i < maxLen; i++) {
    const rEntry = rmcHist[i] || null;
    const cEntry = cmatHist[i] || null;
    const src = cEntry || rEntry;

    if (src && src.date) {
      let d;
      if (typeof src.date === "number") {
        d = new Date(src.date * 1000);
      } else {
        d = new Date(src.date);
      }
      const label = d.toLocaleDateString(
        currentLang === "fr" ? "fr-FR" : "en-GB",
        { day: "2-digit", month: "2-digit" }
      );
      labels.push(label);
    } else {
      labels.push(`P${i + 1}`);
    }

    rmcValues.push(rEntry ? rEntry.sell : null);
    cmatValues.push(cEntry ? cEntry.sell : null);
  }

  if (cmatChart) cmatChart.destroy();

  cmatChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "CMAT (aUEC / SCU)",
          data: cmatValues,
          borderWidth: 2,
          spanGaps: true
        },
        {
          label: "RMC (aUEC / SCU)",
          data: rmcValues,
          borderWidth: 2,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text-main") || "#e9fbff",
            font: { size: 11 }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--accent-strong") || "#00f0ff",
            maxRotation: 60,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--accent-strong") || "#00f0ff"
          },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}


let lastTop3Rmc = [];
let lastTop3Cmat = [];

function classifyTerminalType(terminal) {
  const typeRaw = (terminal && terminal.type ? String(terminal.type) : "").toLowerCase();
  const locRaw = (terminal && terminal.location ? String(terminal.location) : "").toLowerCase();
  let icon = "📍";
  let cssClass = "terminal-generic";

  if (typeRaw.includes("commodity")) {
    icon = "📦";
    cssClass = "terminal-commodity";
  } else if (typeRaw.includes("refinery")) {
    icon = "🏭";
    cssClass = "terminal-refinery";
  } else if (typeRaw.includes("admin")) {
    icon = "🏢";
    cssClass = "terminal-admin";
  } else if (typeRaw.includes("outpost") || typeRaw.includes("mining") || locRaw.includes("outpost")) {
    icon = "⛏️";
    cssClass = "terminal-outpost";
  }

  return { icon, cssClass };
}

function renderTop3List(listEl, items) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!items || !items.length) {
    const li = document.createElement("li");
    li.className = "top3-item";
    li.textContent = "—";
    listEl.appendChild(li);
    return;
  }

  items.slice(0, 3).forEach((terminal, idx) => {
    const li = document.createElement("li");
    const info = classifyTerminalType(terminal);
    li.className = "top3-item " + info.cssClass;

    const row = document.createElement("div");
    row.className = "top3-row-inner";

    const left = document.createElement("div");
    left.className = "top3-main";

    const iconSpan = document.createElement("span");
    iconSpan.className = "top3-icon";
    iconSpan.textContent = info.icon;

    const rankSpan = document.createElement("span");
    rankSpan.className = "top3-rank";
    rankSpan.textContent = (idx + 1) + ".";

    const nameSpan = document.createElement("span");
    nameSpan.className = "top3-name";
    nameSpan.textContent = terminal.name || "—";

    const mainLine = document.createElement("div");
    mainLine.className = "top3-name-line";
    mainLine.appendChild(rankSpan);
    mainLine.appendChild(nameSpan);

    if (terminal.location) {
      const locSpan = document.createElement("div");
      locSpan.className = "top3-location";
      locSpan.textContent = terminal.location;
      left.appendChild(locSpan);
    }

    left.insertBefore(mainLine, left.firstChild);

    const priceDiv = document.createElement("div");
    priceDiv.className = "top3-meta";
    const sellVal = typeof terminal.sell === "number" ? terminal.sell : 0;
    priceDiv.textContent = sellVal ? (format(sellVal) + " aUEC / SCU") : "—";

    left.insertBefore(iconSpan, left.firstChild);
    row.appendChild(left);
    row.appendChild(priceDiv);

    li.appendChild(row);
    listEl.appendChild(li);
  });
}

function updateTop3UIFromData(data) {
  const rmcTop = (data && data.rmc && Array.isArray(data.rmc.topTerminals))
    ? data.rmc.topTerminals.slice(0, 3)
    : [];
  const cmatTop = (data && data.cmat && Array.isArray(data.cmat.topTerminals))
    ? data.cmat.topTerminals.slice(0, 3)
    : [];

  lastTop3Rmc = rmcTop;
  lastTop3Cmat = cmatTop;

  if (top3RmcListEl) renderTop3List(top3RmcListEl, rmcTop);
  if (top3CmatListEl) renderTop3List(top3CmatListEl, cmatTop);
  if (marketTop3RmcListEl) renderTop3List(marketTop3RmcListEl, rmcTop);
  if (marketTop3CmatListEl) renderTop3List(marketTop3CmatListEl, cmatTop);

  if (debTopRmcEl) {
    if (rmcTop.length > 0) {
      const t1 = rmcTop[0];
      debTopRmcEl.textContent = t1.name || "—";
    } else {
      debTopRmcEl.textContent = "—";
    }
  }

  if (debTopCmatEl) {
    if (cmatTop.length > 0) {
      const t1 = cmatTop[0];
      debTopCmatEl.textContent = t1.name || "—";
    } else {
      debTopCmatEl.textContent = "—";
    }
  }
}

async function fetchUexPrices() {
  const t = i18n[currentLang] || i18n.fr;
  try {
    apiStatusEl.textContent = t.apiFetching;
    const url = "https://salvage-uex-proxy.yoyoastico74.workers.dev/";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Worker non accessible");
    const data = await res.json();

    const rmcHist  = data.rmc.history  ?? [];
    const cmatHist = data.cmat.history ?? [];

    let rmcPrice  = data.rmc.price  ?? 0;
    let cmatPrice = data.cmat.price ?? 0;

    if (rmcHist.length && typeof rmcHist[rmcHist.length - 1].sell === "number") {
      rmcPrice = rmcHist[rmcHist.length - 1].sell;
    }
    if (cmatHist.length && typeof cmatHist[cmatHist.length - 1].sell === "number") {
      cmatPrice = cmatHist[cmatHist.length - 1].sell;
    }

    prixRmcInput.value  = rmcPrice;
    prixCmatInput.value = cmatPrice;

    rmcTerminalEl.textContent  = data.rmc.bestTerminal?.name  ?? "N/A";
    cmatTerminalEl.textContent = data.cmat.bestTerminal?.name ?? "N/A";

    updateTop3UIFromData(data);

    if (!rmcHist.length && !cmatHist.length) {
      graphMessage.textContent = t.graphNoData;
    } else {
      graphMessage.textContent = "";
      renderChart(rmcHist, cmatHist);
    }

    apiStatusEl.textContent = t.apiUpdated(
      data.rmc.bestTerminal?.name ?? "N/A",
      data.cmat.bestTerminal?.name ?? "N/A"
    );

    recalc();
  } catch (err) {
    const tt = i18n[currentLang] || i18n.fr;
    apiStatusEl.textContent = tt.apiErrorPrefix + err.message;
    apiStatusEl.classList.add("error");
    graphMessage.textContent = tt.graphError;
  }
}

window.addEventListener("load", () => {
  try {
    const saved = JSON.parse(localStorage.getItem("salvageCalcState") || "{}");
    if (typeof saved.scuLight === "number") {
      scuLightInput.value = saved.scuLight;
    }
    if (typeof saved.scuReclaimer === "number") {
      scuRecInput.value = saved.scuReclaimer;
    }
  } catch (_) {}

  const savedLastShip = localStorage.getItem("salvageCalcLastShip");
  if (savedLastShip && shipSelectEl.querySelector(`option[value="${savedLastShip}"]`)) {
    shipSelectEl.value = savedLastShip;
  }

  updateScuAdvancedVisibility();
  currentLang = localStorage.getItem("salvageCalcLang") || currentLang;
  currentTheme = localStorage.getItem("salvageCalcTheme") || currentTheme;

  langSelectEl.value = currentLang;
  if (themeSelectEl) themeSelectEl.value = currentTheme;

  applyTheme();
  ensureUserProfile();
  updateUserUI();
  updateAdminUI();

  applyLanguage();
  updateLocalLeaderboard();
  buildMyRunsList();

  fetchUexPrices();
});

function setModeDebutant(isDeb) {
  const deb = document.getElementById("modeDebutant");
  const adv = document.getElementById("modeAvance");
  const btnDeb = document.getElementById("btnModeDebutant");
  const btnAdv = document.getElementById("btnModeAvance");
  if (!deb || !adv || !btnDeb || !btnAdv) return;
  if (isDeb) {
    deb.classList.remove("hidden");
    adv.classList.add("hidden");
    btnDeb.classList.add("active");
    btnAdv.classList.remove("active");
  } else {
    deb.classList.add("hidden");
    adv.classList.remove("hidden");
    btnDeb.classList.remove("active");
    btnAdv.classList.add("active");
  }
}

function refreshDebutantPrices() {
  if (typeof prixRmcInput === "undefined" || typeof prixCmatInput === "undefined") return;
  const prixRMC  = Number(prixRmcInput.value)  || 0;
  const prixCMAT = Number(prixCmatInput.value) || 0;
  const debPrixRmcEl  = document.getElementById("debPrixRmc");
  const debPrixCmatEl = document.getElementById("debPrixCmat");
  if (debPrixRmcEl)  debPrixRmcEl.textContent  = prixRMC ? format(prixRMC) : "–";
  if (debPrixCmatEl) debPrixCmatEl.textContent = prixCMAT ? format(prixCMAT) : "–";

  const srcRmcTerminal  = document.getElementById("rmcTerminal");
  const srcCmatTerminal = document.getElementById("cmatTerminal");
  const debRmcTermEl    = document.getElementById("debRmcTerminal");
  const debCmatTermEl   = document.getElementById("debCmatTerminal");

  if (debRmcTermEl && srcRmcTerminal) {
    debRmcTermEl.textContent = srcRmcTerminal.textContent || "—";
  }
  if (debCmatTermEl && srcCmatTerminal) {
    debCmatTermEl.textContent = srcCmatTerminal.textContent || "—";
  }
}


function calcDebutant() {
  const hullEl = document.getElementById("scuHullDeb");
  const csEl   = document.getElementById("scuCsDeb");
  const scuHull = hullEl ? Number(hullEl.value) || 0 : 0;
  const scuCs   = csEl ? Number(csEl.value) || 0 : 0;

  if (typeof prixRmcInput === "undefined" || typeof prixCmatInput === "undefined") return;
  const prixRMC  = Number(prixRmcInput.value)  || 0;
  const prixCMAT = Number(prixCmatInput.value) || 0;

  refreshDebutantPrices();

  const valRmc   = scuHull * prixRMC;
  const cmatScu  = scuCs * REND_RECLAIMER;
  const valCmat  = cmatScu * prixCMAT;
  const total    = valRmc + valCmat;

  const debResRmcEl   = document.getElementById("debResRmc");
  const debResCmatEl  = document.getElementById("debResCmat");
  const debResTotalEl = document.getElementById("debResTotal");

  if (debResRmcEl)   debResRmcEl.textContent   = format(valRmc);
  if (debResCmatEl)  debResCmatEl.textContent  = format(valCmat);
  if (debResTotalEl) debResTotalEl.textContent = format(total);

  // Synchronise avec le mode avancé
  if (typeof scuLightInput !== "undefined" && scuLightInput) {
    scuLightInput.value = String(scuHull);
  }
  if (typeof scuRecInput !== "undefined" && scuRecInput) {
    scuRecInput.value = String(scuCs);
  }
  if (typeof recalc === "function") {
    recalc();
  }
}

document.addEventListener("DOMContentLoaded", () => {

  const activitySalvageBtn = document.getElementById("activitySalvageBtn");
  const activityHaulingBtn = document.getElementById("activityHaulingBtn");
  const activityMiningBtn = document.getElementById("activityMiningBtn");
  const activityPanels = document.querySelectorAll(".activity-panel");
  const activityPills = document.querySelectorAll(".activity-pill");

  function setActivity(activityKey) {
  activityPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `activity-${activityKey}`);
  });
  activityPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.activity === activityKey);
  });

  // Show main Salvage header & intro only on Salvage activity
  const titleEl = document.getElementById("titleMain");
  const subEl = document.getElementById("subText");
  if (titleEl && subEl) {
    if (activityKey === "salvage") {
      const t = i18n[currentLang] || i18n.fr;
      titleEl.textContent = t.titleMain || "SALVAGE CALCULATOR 4.4";
      subEl.textContent =
        t.subText ||
        "Détermine la valeur générée par ton salvage selon la boucle de ton vaisseau (RMC ou CMAT).";
      titleEl.style.display = "";
      subEl.style.display = "";
    } else {
      titleEl.style.display = "none";
      subEl.style.display = "none";
    }
  }

  // Update version display per activity
  const versionInfo =
    ACTIVITY_VERSIONS[activityKey] || ACTIVITY_VERSIONS.salvage;
  const versionText = `VERSION ${versionInfo.label.toUpperCase()} ${versionInfo.version}`;
  const verPill = document.getElementById("app-version-pill");
  if (verPill) {
    verPill.textContent = versionText;
  }
  const footerSpan = document.querySelector("#appVersion span");
  if (footerSpan) {
    footerSpan.textContent = versionText;
  }

  // Affiche le graphique RMC / CMAT uniquement sur l'onglet Recyclage
  const marketPanel = document.querySelector(".market-panel");
  if (marketPanel) {
    if (activityKey === "salvage") {
      marketPanel.classList.remove("hidden");
    } else {
      marketPanel.classList.add("hidden");
    }
  }

  try {
    localStorage.setItem("scActivity", activityKey);
  } catch (err) {
    console.warn("Unable to persist activity selection", err);
  }
}
let initialActivity = "salvage";
  try {
    const stored = localStorage.getItem("scActivity");
    if (stored === "salvage" || stored === "hauling" || stored === "mining") {
      initialActivity = stored;
    }
  } catch (err) {}

  setActivity(initialActivity);

  // Anti-spam UI restore on reload
  if (LEADERBOARD_RUN_COOLDOWN_MS > 0 && lastOnlineRunTs) {
    const remaining = LEADERBOARD_RUN_COOLDOWN_MS - (Date.now() - lastOnlineRunTs);
    if (remaining > 0) {
      updateAntiSpamMessage(remaining);
      startAntiSpamCountdown();
    }
  }

  if (activitySalvageBtn) {
    activitySalvageBtn.addEventListener("click", () => setActivity("salvage"));
  }
  if (activityHaulingBtn) {
    activityHaulingBtn.addEventListener("click", () => setActivity("hauling"));
  }
  if (activityMiningBtn) {
    activityMiningBtn.addEventListener("click", () => setActivity("mining"));
  }

  const btnDeb = document.getElementById("btnModeDebutant");
  const btnAdv = document.getElementById("btnModeAvance");
  const btnCalcDeb = document.getElementById("btnCalcDebutant");

  if (btnDeb && btnAdv) {
    btnDeb.addEventListener("click", () => setModeDebutant(true));
    btnAdv.addEventListener("click", () => setModeDebutant(false));
  }
  if (btnCalcDeb) {
    btnCalcDeb.addEventListener("click", calcDebutant);
  }

  
    if (shipSelectEl) {
    shipSelectEl.addEventListener("change", () => {
      updateScuAdvancedVisibility();
    });
  }


  if (debShipSelectEl) {
    debShipSelectEl.addEventListener("change", () => {
      updateScuAdvancedVisibility();
    });
  }

if (openOnlineLeaderboardBtnEl && onlineLeaderboardModalEl) {
    openOnlineLeaderboardBtnEl.addEventListener("click", () => {
      openOnlineLeaderboardModal();
    });
  }

  if (onlineLeaderboardCloseBtnEl && onlineLeaderboardModalEl) {
    onlineLeaderboardCloseBtnEl.addEventListener("click", () => {
      closeOnlineLeaderboardModal();
    });

    onlineLeaderboardModalEl.addEventListener("click", (e) => {
      if (e.target === onlineLeaderboardModalEl) {
        closeOnlineLeaderboardModal();
      }
    });
  }


  if (leaderboardSortSelectEl) {
    leaderboardSortSelectEl.addEventListener("change", () => {
      leaderboardSortKey = leaderboardSortSelectEl.value || "profit";
      localStorage.setItem("salvageLbSort", leaderboardSortKey);
      rerenderOnlineLeaderboardFromCache();
    });
  }
  if (leaderboardShipFilterEl) {
    leaderboardShipFilterEl.addEventListener("change", () => {
      leaderboardShipFilterKey = leaderboardShipFilterEl.value || "all";
      localStorage.setItem("salvageLbShipFilter", leaderboardShipFilterKey);
      rerenderOnlineLeaderboardFromCache();
    });
  }

const verPill = document.getElementById("app-version-pill");
  if (verPill) {
    verPill.textContent = `VERSION ${APP_VERSION}`;
  }

  // Démarre en mode débutant
  setModeDebutant(true);
  updateScuAdvancedVisibility();
  refreshDebutantPrices();
});