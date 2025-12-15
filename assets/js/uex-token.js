// uex-token.js
// Version: V1.1.0
// Token UEX (admin only):
// - Stockage: localStorage["uexToken"]
// - Helper: window.UEX.getToken(), window.UEX.fetch(url, opts)
// - Emits: window event "uex:tokenChanged"

(function () {
  "use strict";

  const STORAGE_KEY = "uexToken";
  const BTN_ID = "uexSettingsBtn";

  function getToken() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (_) { return ""; }
  }
  function setToken(token) {
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("uex:tokenChanged", { detail: { hasToken: !!token } }));
  }

  async function uexFetch(url, opts) {
    const token = getToken();
    const headers = new Headers((opts && opts.headers) || {});
    // Do not attach token if none
    if (token) headers.set("Authorization", `Bearer ${token}`);
    // Default JSON accept
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const res = await fetch(url, { ...(opts || {}), headers, cache: "no-store" });
    return res;
  }

  function bindButton() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;

    // Safety: only admins should see/click it.
    // Visibility is already handled by [data-admin-only="1"], but keep a guard.
    const isAdm = window.SC_CORE && typeof window.SC_CORE.isAdmin === "function" ? window.SC_CORE.isAdmin() : false;
    if (!isAdm) {
      btn.style.display = "none";
      return;
    }

    const updateText = () => {
      const has = !!getToken();
      btn.textContent = has ? "UEX: Token OK" : "UEX: Configurer";
      btn.title = has ? "Token UEX présent (localStorage)" : "Aucun token UEX";
    };
    updateText();

    btn.addEventListener("click", () => {
      const current = getToken();
      const input = window.prompt(
        "Token UEX (coller ici). Laisser vide et valider pour supprimer.",
        current || ""
      );
      if (input === null) return; // cancel
      const cleaned = String(input).trim();
      setToken(cleaned);
      updateText();
      alert(cleaned ? "Token UEX enregistré localement." : "Token UEX supprimé.");
    });

    window.addEventListener("uex:tokenChanged", updateText);
  }

  // Expose API
  window.UEX = Object.freeze({
    getToken,
    setToken,
    fetch: uexFetch
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButton, { once: true });
  } else {
    bindButton();
  }
})();