/* hub-discord-widget.js
   Version: V1.0.1
   Purpose: HUB-only Discord widget, no dependency on core.js.
   Dependencies: optional assets/js/auth.js (window.ShogAuth)
*/

(() => {
  const STORAGE_KEY = "shog.discord.user";
  const DEFAULT_LOGIN_URL = "https://salvage-auth.yoyoastico74.workers.dev/auth/discord/login";

  function $(id){ return document.getElementById(id); }

  function safeParse(s){
    try { return JSON.parse(s); } catch(_) { return null; }
  }

  function getUser(){
    if (window.ShogAuth && typeof window.ShogAuth.getUser === "function") return window.ShogAuth.getUser();
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? safeParse(raw) : null;
  }

  function getName(u){
    if (!u) return "—";
    if (window.ShogAuth && typeof window.ShogAuth.getDisplayName === "function") return window.ShogAuth.getDisplayName(u) || "—";
    return (u.globalName || u.username || "—");
  }

  function getAvatar(u){
    if (!u) return "";
    if (window.ShogAuth && typeof window.ShogAuth.getAvatarUrl === "function") return window.ShogAuth.getAvatarUrl(u) || "";
    if (u.discordId && u.avatar) return `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64`;
    return "";
  }

  function doLogout(){
    if (window.ShogAuth && typeof window.ShogAuth.logout === "function") {
      window.ShogAuth.logout();
      return;
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch(_) {}
  }

  function render(){
    const root     = $("shogDiscordAuth");
    const loginBtn = $("shogDiscordLoginBtn");
    const userBox  = $("shogDiscordUserBox");
    const avatarEl = $("shogDiscordAvatar");
    const nameEl   = $("shogDiscordUsername");
    const logoutBtn= $("shogDiscordLogoutBtn");

    if (!root || !loginBtn || !userBox) return;

    const loginUrl = (root.dataset && root.dataset.loginUrl) ? root.dataset.loginUrl : DEFAULT_LOGIN_URL;

    const u = getUser();
    const logged = !!(u && u.discordId);

    if (logged){
      userBox.style.display = "flex";
      loginBtn.style.display = "none";

      const display = getName(u);
      if (nameEl) nameEl.textContent = display;

      if (avatarEl){
        const url = getAvatar(u);
        avatarEl.src = url || "assets/img/favicon.ico";
        avatarEl.alt = display;
      }
    } else {
      userBox.style.display = "none";
      loginBtn.style.display = "";
    }

    if (!loginBtn.dataset.bound){
      loginBtn.dataset.bound = "1";
      loginBtn.addEventListener("click", () => { window.location.href = loginUrl; });
    }

    if (logoutBtn && !logoutBtn.dataset.bound){
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", () => {
        doLogout();
        render();
      });
    }
  }

  window.addEventListener("DOMContentLoaded", render);
  window.addEventListener("shog:auth", render);
  window.addEventListener("storage", (e) => { if(e && e.key === STORAGE_KEY) render(); });
})();
