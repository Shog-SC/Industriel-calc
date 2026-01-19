/* auth.js — Discord session helper (front-only)
   Version: V1.1.0 (UNIFIED_USER_KEYS + OPTIONAL_TOKEN)

   Goals:
   - Unify Discord user storage across the HUB and modules.
   - Keep backward compatibility with legacy keys.
   - Optionally store a Discord OAuth access_token (sessionStorage) when available.

   Storage:
   - User (primary): localStorage["shog.discord.user"]
   - User (legacy):  localStorage["salvageDiscordUser"], localStorage["salvage.discord.user"]
   - Token:          sessionStorage["shog.discord.token"] (optional)

   Security note:
   - The Runs Vault API should authenticate using a token (Bearer). This helper only stores it;
     obtaining the token depends on your OAuth flow (e.g., discord-bridge.html).
*/

(() => {
  "use strict";

  const USER_KEY_PRIMARY = "shog.discord.user";
  const USER_KEYS_LEGACY = ["salvageDiscordUser", "salvage.discord.user"];

  const TOKEN_KEY = "shog.discord.token";
  const TOKEN_META_KEY = "shog.discord.token.meta"; // JSON {token_type, scope, expires_at}

  function safeJsonParse(s){
    try { return JSON.parse(s); } catch(_) { return null; }
  }

  function safeJsonStringify(v){
    try { return JSON.stringify(v); } catch(_) { return ""; }
  }

  function nowMs(){ return Date.now(); }

  function normalizeUser(u){
    if (!u || typeof u !== "object") return null;

    const discordId = String(u.discordId || u.id || u.userId || "").trim();
    const username  = String(u.username || u.name || "").trim();
    const globalName= String(u.globalName || u.global_name || u.displayName || u.display_name || "").trim();
    const avatar    = String(u.avatar || u.avatarHash || u.avatar_hash || "").trim();

    if (!discordId) return null;

    return {
      discordId,
      username: username || "",
      globalName: globalName || "",
      avatar: avatar || "",
      ts: Number(u.ts || u.timestamp || nowMs()) || nowMs(),
    };
  }

  function readAnyUser(){
    // Primary
    const rawP = localStorage.getItem(USER_KEY_PRIMARY);
    const uP = normalizeUser(rawP ? safeJsonParse(rawP) : null);
    if (uP) return uP;

    // Legacy
    for (const k of USER_KEYS_LEGACY){
      const raw = localStorage.getItem(k);
      const u = normalizeUser(raw ? safeJsonParse(raw) : null);
      if (u) return u;
    }

    return null;
  }

  function writeUser(u){
    const nu = normalizeUser(u);
    if (!nu) return false;

    const payload = safeJsonStringify(nu);
    if (!payload) return false;

    localStorage.setItem(USER_KEY_PRIMARY, payload);
    // Also mirror to legacy keys to keep old modules alive
    for (const k of USER_KEYS_LEGACY) {
      try { localStorage.setItem(k, payload); } catch(_) {}
    }
    notify();
    return true;
  }

  function clearUser(){
    try { localStorage.removeItem(USER_KEY_PRIMARY); } catch(_) {}
    for (const k of USER_KEYS_LEGACY) {
      try { localStorage.removeItem(k); } catch(_) {}
    }
    notify();
  }

  function getUser(){
    return readAnyUser();
  }

  function isLoggedIn(){
    const u = getUser();
    return !!(u && u.discordId && (u.username || u.globalName));
  }

  function getDisplayName(u){
    const nu = normalizeUser(u) || getUser();
    if (!nu) return "";
    return (nu.globalName && nu.globalName.trim()) || (nu.username && nu.username.trim()) || "";
  }

  function getAvatarUrl(u){
    const nu = normalizeUser(u) || getUser();
    if (!nu || !nu.discordId || !nu.avatar) return "";
    return `https://cdn.discordapp.com/avatars/${nu.discordId}/${nu.avatar}.png?size=64`;
  }

  function setAccessToken(token, meta){
    const t = String(token || "").trim();
    if (!t) return false;

    try { sessionStorage.setItem(TOKEN_KEY, t); } catch(_) { return false; }

    if (meta && typeof meta === "object") {
      const m = {
        token_type: String(meta.token_type || meta.tokenType || "Bearer").trim() || "Bearer",
        scope: String(meta.scope || "").trim() || "",
        expires_at: Number(meta.expires_at || meta.expiresAt || 0) || 0,
      };
      try { sessionStorage.setItem(TOKEN_META_KEY, safeJsonStringify(m)); } catch(_) {}
    }

    notify();
    return true;
  }

  function getAccessToken(){
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      return t ? String(t) : null;
    } catch(_) {
      return null;
    }
  }

  function getAccessTokenMeta(){
    try {
      const raw = sessionStorage.getItem(TOKEN_META_KEY);
      return raw ? safeJsonParse(raw) : null;
    } catch(_) {
      return null;
    }
  }

  function clearAccessToken(){
    try { sessionStorage.removeItem(TOKEN_KEY); } catch(_) {}
    try { sessionStorage.removeItem(TOKEN_META_KEY); } catch(_) {}
    notify();
  }

  function logout(){
    clearUser();
    clearAccessToken();
  }

  function notify(){
    try {
      window.dispatchEvent(new CustomEvent("shog:auth", {
        detail: {
          user: getUser(),
          loggedIn: isLoggedIn(),
          hasToken: !!getAccessToken(),
          tokenMeta: getAccessTokenMeta(),
        }
      }));
    } catch(_) {}
  }

  // Public API (preferred)
  window.ShogAuth = {
    VERSION: "V1.1.0",

    // User
    STORAGE_KEY: USER_KEY_PRIMARY,
    LEGACY_KEYS: USER_KEYS_LEGACY.slice(),
    getUser,
    setUser: writeUser,
    clearUser,
    isLoggedIn,
    getDisplayName,
    getAvatarUrl,

    // Token
    TOKEN_KEY,
    getAccessToken,
    setAccessToken,
    clearAccessToken,
    getAccessTokenMeta,

    // Actions
    logout,
    notify,
  };

  // Backward compatibility
  window.Auth = window.ShogAuth;

  // Notify once on load
  notify();

  // Cross-tab sync: refresh UI when localStorage user changes
  window.addEventListener("storage", (e) => {
    if (!e) return;
    if (e.key === USER_KEY_PRIMARY || USER_KEYS_LEGACY.includes(e.key)) notify();
  });
})();
