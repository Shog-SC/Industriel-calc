/* hub-discord-widget.js — Discord login widget (HUB + modules)
   Version: V1.0.7 (ALL_PAGES + RETURN_TO + TOKEN_AWARE)

   What this does:
   - Renders the Discord login button / userbox based on localStorage user.
   - Works on any page (HUB + /pages/*) as long as this script is loaded.
   - Before redirecting to the OAuth worker, stores the current page URL in:
       sessionStorage["shog.returnTo"]
     so discord-bridge.html can send the user back to the initiating page.
   - Uses ShogAuth (auth.js) if present for logout + user reads.

   Dependencies:
   - Optional: auth.js (recommended). If absent, falls back to raw localStorage keys.
   - Requires a bridge page that stores payload, including optional token:
       /discord-bridge.html (V1.2.1+ TOKEN_SUPPORT)

   Storage keys:
   - User:  localStorage["shog.discord.user"]
   - Token: sessionStorage["shog.discord.token"] (optional)
   - ReturnTo (for bridge): sessionStorage["shog.returnTo"]
*/

(() => {
  "use strict";

  const VERSION = "V1.0.7 (ALL_PAGES + RETURN_TO + TOKEN_AWARE)";

  // OAuth Worker login endpoint (can be overridden by data-login-url on the mount element)
  const DEFAULT_LOGIN_URL = "https://shog-salvage-auth.yoyoastico74.workers.dev/auth/discord/login";

  // GitHub Pages bridge URL (receives ?d=... and optional ?t=... and stores it)
  const BRIDGE_URL = "https://shog-sc.github.io/Industriel-calc/discord-bridge.html";

  // Keys
  const USER_KEY = "shog.discord.user";
  const TOKEN_KEY = "shog.discord.token";
  const RETURN_TO_KEY = "shog.returnTo";

  // DOM ids (kept stable)
  const IDS = {
    root: "shogDiscordAuth",
    loginBtn: "shogDiscordLoginBtn",
    userBox: "shogDiscordUserBox",
    avatar: "shogDiscordAvatar",
    username: "shogDiscordUsername",
    logoutBtn: "shogDiscordLogoutBtn",
  };

  function safeJsonParse(s){
    try { return JSON.parse(s); } catch(_) { return null; }
  }

  function getAppBase(){
    // 1) explicit meta for custom domains:
    //    <meta name="shog-base" content="/Industriel-calc/">
    const meta = document.querySelector('meta[name="shog-base"]');
    if (meta && meta.content) {
      const v = String(meta.content).trim();
      if (v) return v.endsWith("/") ? v : (v + "/");
    }

    // 2) GitHub Pages heuristic: first path segment is the repo name
    //    /<repo>/pages/mining.html -> "/<repo>/"
    const parts = String(location.pathname || "").split("/").filter(Boolean);
    if (parts.length >= 1) return `/${parts[0]}/`;

    // 3) fallback
    return "/";
  }

  function getFallbackAvatarUrl(){
    const base = getAppBase();
    return `${location.origin}${base}assets/img/favicon.ico`;
  }

  function readUser(){
    // Prefer unified helper if present
    if (window.ShogAuth && typeof window.ShogAuth.getUser === "function") {
      return window.ShogAuth.getUser();
    }
    const raw = localStorage.getItem(USER_KEY);
    return raw ? safeJsonParse(raw) : null;
  }

  function readToken(){
    if (window.ShogAuth && typeof window.ShogAuth.getAccessToken === "function") {
      return window.ShogAuth.getAccessToken();
    }
    try { return sessionStorage.getItem(TOKEN_KEY); } catch(_) { return null; }
  }

  function isLoggedIn(u){
    return !!(u && (u.discordId || u.id) && ((u.username && String(u.username).trim()) || (u.globalName && String(u.globalName).trim())));
  }

  function getDisplayName(u){
    if (!u) return "";
    const g = (u.globalName || u.global_name || "");
    const n = (u.username || u.name || "");
    return String(g).trim() || String(n).trim() || "";
  }

  function getAvatarUrl(u){
    const discordId = String(u?.discordId || u?.id || "").trim();
    const avatar = String(u?.avatar || "").trim();
    if (!discordId || !avatar) return "";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64`;
  }

  function withReturnUrl(loginUrl){
    // salvage-auth supports ?return=... (stored in OAuth state)
    // We always return to the BRIDGE_URL, and the bridge sends the user back to sessionStorage[RETURN_TO_KEY].
    const u = new URL(loginUrl);
    u.searchParams.set("return", BRIDGE_URL);
    return u.toString();
  }

  function setReturnToHere(){
    try {
      // Strip hash (optional) to keep URLs clean
      const clean = String(location.href || "").split("#")[0];
      sessionStorage.setItem(RETURN_TO_KEY, clean);
    } catch(_) {}
  }

  function doLogin(rootEl){
    const loginUrl = (rootEl && rootEl.dataset && rootEl.dataset.loginUrl) ? String(rootEl.dataset.loginUrl).trim() : "";
    const target = withReturnUrl(loginUrl || DEFAULT_LOGIN_URL);
    setReturnToHere();
    window.location.href = target;
  }

  function doLogout(){
    if (window.ShogAuth && typeof window.ShogAuth.logout === "function") {
      window.ShogAuth.logout();
      return;
    }
    try { localStorage.removeItem(USER_KEY); } catch(_) {}
    try { sessionStorage.removeItem(TOKEN_KEY); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent("shog:auth", { detail: { user: null, loggedIn: false, hasToken: false } })); } catch(_) {}
  }

  function ensureMount(){
    // If user already inserted the widget markup, use it.
    let root = document.getElementById(IDS.root);
    if (root) return root;

    // Try to mount into a header container (preferred)
    const host =
      document.querySelector(".header-actions") ||
      document.querySelector(".top-actions") ||
      document.querySelector("header") ||
      document.body;

    // Create minimal widget markup
    root = document.createElement("div");
    root.id = IDS.root;
    root.className = "shog-discord-auth";
    root.dataset.loginUrl = DEFAULT_LOGIN_URL;

    const loginBtn = document.createElement("button");
    loginBtn.id = IDS.loginBtn;
    loginBtn.textContent = "Login";

    const userBox = document.createElement("div");
    userBox.id = IDS.userBox;
    userBox.className = "shog-discord-userbox";
    userBox.style.display = "none";

    const avatar = document.createElement("img");
    avatar.id = IDS.avatar;
    avatar.className = "shog-discord-avatar";
    avatar.alt = "Discord";

    const userText = document.createElement("div");
    userText.className = "shog-discord-usertext";

    const label = document.createElement("div");
    label.className = "shog-discord-userlabel";
    label.textContent = "Discord";

    const username = document.createElement("div");
    username.id = IDS.username;
    username.className = "shog-discord-username";
    username.textContent = "—";

    userText.appendChild(label);
    userText.appendChild(username);

    const logoutBtn = document.createElement("button");
    logoutBtn.id = IDS.logoutBtn;
    logoutBtn.textContent = "Logout";

    userBox.appendChild(avatar);
    userBox.appendChild(userText);
    userBox.appendChild(logoutBtn);

    root.appendChild(loginBtn);
    root.appendChild(userBox);

    host.appendChild(root);
    return root;
  }

  function render(){
    const root = ensureMount();

    const loginBtn = document.getElementById(IDS.loginBtn);
    const userBox = document.getElementById(IDS.userBox);
    const avatar = document.getElementById(IDS.avatar);
    const username = document.getElementById(IDS.username);
    const logoutBtn = document.getElementById(IDS.logoutBtn);

    if (!root || !loginBtn || !userBox || !avatar || !username || !logoutBtn) return;

    const u = readUser();
    const logged = isLoggedIn(u);

    if (!logged) {
      loginBtn.style.display = "inline-flex";
      userBox.style.display = "none";

      loginBtn.onclick = () => doLogin(root);
      return;
    }

    // Logged in
    loginBtn.style.display = "none";
    userBox.style.display = "inline-flex";

    const display = getDisplayName(u) || "Connecté";
    username.textContent = display;

    const av = getAvatarUrl(u) || getFallbackAvatarUrl();
    avatar.src = av;

    logoutBtn.onclick = () => doLogout();

    // Optional: expose token presence (debug only)
    const token = readToken();
    root.dataset.hasToken = token ? "1" : "0";
  }

  // Initial
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }

  // React to auth changes
  window.addEventListener("shog:auth", () => render());

  // Public debug handle
  window.ShogDiscordWidget = { VERSION, render };
})();
