/* auth.js — Discord session helper (front-only)
   Version: V1.0.0
   Storage: localStorage (shared across all pages on the same domain)
*/

(() => {
  const STORAGE_KEY = "shog.discord.user";

  function safeJsonParse(s){
    try { return JSON.parse(s); } catch(_) { return null; }
  }

  function getUser(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const u = raw ? safeJsonParse(raw) : null;
    return u && typeof u === "object" ? u : null;
  }

  function isLoggedIn(){
    const u = getUser();
    return !!(u && u.discordId && (u.username || u.globalName));
  }

  function getDisplayName(u){
    if(!u) return "";
    return (u.globalName && String(u.globalName).trim()) || (u.username && String(u.username).trim()) || "";
  }

  function getAvatarUrl(u){
    if(!u || !u.discordId || !u.avatar) return "";
    // Discord CDN
    return `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64`;
  }

  function logout(){
    localStorage.removeItem(STORAGE_KEY);
    notify();
  }

  function notify(){
    try {
      window.dispatchEvent(new CustomEvent("shog:auth", { detail: { user: getUser(), loggedIn: isLoggedIn() } }));
    } catch(_) {}
  }

  // Expose minimal API
  window.ShogAuth = {
    STORAGE_KEY,
    getUser,
    isLoggedIn,
    getDisplayName,
    getAvatarUrl,
    logout,
    notify,
  };

  // Notify once on load
  notify();

  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if(e && e.key === STORAGE_KEY) notify();
  });
})();
