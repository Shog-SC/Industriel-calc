// core.js
// Version: V1.0.2
// Shared UI wiring (lang switch, Discord button state, admin gating).

(function () {
  "use strict";

  const ADMIN_DISCORD_ID = "225963749364727809";
  const LS_USER_ID_KEY = "discordUserId";
  const LS_USER_NAME_KEY = "discordUserName";

  function qs(id) { return document.getElementById(id); }

  function getDiscordUserId() {
    try { return localStorage.getItem(LS_USER_ID_KEY) || ""; } catch (_) { return ""; }
  }
  function getDiscordUserName() {
    try { return localStorage.getItem(LS_USER_NAME_KEY) || ""; } catch (_) { return ""; }
  }

  function isAdmin() {
    return getDiscordUserId() === ADMIN_DISCORD_ID;
  }

  function updateDiscordBtn() {
    const btn = qs("discordLoginBtn");
    if (!btn) return;

    const uid = getDiscordUserId();
    const name = getDiscordUserName();

    if (uid) {
      btn.classList.add("connected");
      btn.textContent = name ? `Connecté: ${name}` : "Connecté";
      btn.title = `Discord ID: ${uid}`;
    } else {
      btn.classList.remove("connected");
      btn.textContent = "Connexion Discord";
      btn.title = "";
    }

    // Optional: click redirects to bridge (login)
    btn.addEventListener("click", () => {
      // Keep it simple: always go through bridge
      window.location.href = "../discord-bridge.html";
    }, { once: true });
  }

  function bindLangSwitch() {
    const sel = qs("langSelect");
    if (!sel) return;

    // If you already manage i18n elsewhere, this is harmless.
    try {
      const stored = localStorage.getItem("scLang");
      if (stored) sel.value = stored;
    } catch (_) {}

    sel.addEventListener("change", () => {
      try { localStorage.setItem("scLang", sel.value); } catch (_) {}
      // You likely already do translations in module JS; we just trigger a reload safely.
      window.dispatchEvent(new CustomEvent("sc:langChanged", { detail: { lang: sel.value } }));
    });
  }

  function gateAdminOnlyControls() {
    // Any element with [data-admin-only="1"] is hidden unless admin.
    const isAdm = isAdmin();
    document.querySelectorAll('[data-admin-only="1"]').forEach(el => {
      el.style.display = isAdm ? "" : "none";
    });
  }

  function markActiveNav() {
    const path = (location.pathname || "").toLowerCase();
    document.querySelectorAll(".nav a").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (!href) return;
      const active = path.endsWith(href.replace("./","").replace("../","")) || path.endsWith(href);
      if (active) a.classList.add("active"); else a.classList.remove("active");
    });
  }

  function init() {
    updateDiscordBtn();
    bindLangSwitch();
    gateAdminOnlyControls();
    markActiveNav();
  }

  if (document.readyState === "loading") {
    
function setActiveNavLinks(){
  try{
    const path = (location.pathname || "").toLowerCase();
    document.querySelectorAll(".nav a").forEach(a => a.classList.remove("active"));

    // Match by href ending (./salvage.html etc.)
    const candidates = Array.from(document.querySelectorAll(".nav a"));
    const match = candidates.find(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (!href) return false;
      return path.endsWith(href.replace("./","/"));
    });

    if (match) match.classList.add("active");
  } catch(e){
    // no-op
  }
}

document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Expose small helpers for module JS
  window.SC_CORE = Object.freeze({
    isAdmin,
    getDiscordUserId,
    getDiscordUserName
  });
})();