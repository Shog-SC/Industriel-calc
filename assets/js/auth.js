// auth.js - Module d'authentification Discord (Version 1.0.0)
// Centralise le stockage de l'utilisateur Discord et notifie les modules.

const Auth = (() => {
  const STORAGE_KEY = "salvageDiscordUser"; // compatibilité avec l'existant
  let currentUser = null;
  const listeners = [];

  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        currentUser = JSON.parse(raw);
        console.log("[auth.js] Utilisateur chargé depuis le storage :", currentUser);
      }
    } catch (err) {
      console.error("[auth.js] Erreur lors de la lecture du storage :", err);
    }
  }

  function persist(user) {
    currentUser = user;
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error("[auth.js] Erreur lors de l'écriture du storage :", err);
    }
    listeners.forEach((cb) => {
      try { cb(currentUser); } catch (e) { console.error(e); }
    });
  }

  return {
    init,
    getUser() {
      return currentUser;
    },
    isLoggedIn() {
      return !!currentUser;
    },
    onAuthChange(cb) {
      if (typeof cb === "function") {
        listeners.push(cb);
      }
    },
    setUserFromDiscord(userObj) {
      console.log("[auth.js] setUserFromDiscord :", userObj);
      if (!userObj || !userObj.id) {
        console.warn("[auth.js] setUserFromDiscord appelé sans id");
        return;
      }
      persist(userObj);
    },
    logout() {
      console.log("[auth.js] logout");
      persist(null);
    },
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  Auth.init();
});
