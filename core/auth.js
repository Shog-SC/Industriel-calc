// ============================================================================
//  core/auth.js - Gestion centralisée de l'authentification Discord
//  Version : V7.0.0
//  - Stocke l'utilisateur Discord dans localStorage (clé: "salvageDiscordUser")
//  - Fournit une API simple : Auth.getUser(), Auth.isLoggedIn(), Auth.loginWithDiscord(), Auth.logout()
//  - Notifie les écouteurs enregistrés via Auth.onAuthChange()
// ============================================================================

const Auth = (() => {
  const STORAGE_KEY = "salvageDiscordUser";
  let currentUser = null;
  const listeners = [];

  function notify() {
    for (const cb of listeners) {
      try {
        cb(currentUser);
      } catch (e) {
        console.error("[Auth] Erreur dans un listener onAuthChange :", e);
      }
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        currentUser = null;
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        currentUser = parsed;
      } else {
        currentUser = null;
      }
    } catch (e) {
      console.warn("[Auth] Impossible de lire le stockage Discord :", e);
      currentUser = null;
    }
  }

  function saveToStorage(user) {
    currentUser = user;
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn("[Auth] Impossible d'écrire dans le stockage Discord :", e);
    }
    notify();
  }

  return {
    // Appelé au chargement de la page
    init() {
      loadFromStorage();
      notify();
    },

    // Renvoie l'objet utilisateur Discord ou null
    getUser() {
      return currentUser;
    },

    // true si un utilisateur Discord est stocké
    isLoggedIn() {
      return !!currentUser;
    },

    // Permet aux autres modules de réagir aux changements d'état
    onAuthChange(callback) {
      if (typeof callback === "function") {
        listeners.push(callback);
        // On appelle aussi immédiatement avec la valeur courante
        try {
          callback(currentUser);
        } catch (e) {
          console.error("[Auth] Erreur lors de l'appel immédiat onAuthChange :", e);
        }
      }
    },

    // Utilisé par discord-bridge.html lorsque le Worker renvoie un user
    setUserFromDiscord(userObj) {
      console.log("[Auth] Connexion Discord reçue :", userObj);
      saveToStorage(userObj || null);
    },

    // Lance le flow OAuth Discord via ton Worker
    loginWithDiscord() {
      const url = "https://salvage-auth.yoyoastico74.workers.dev/auth/discord/login";
      window.location.href = url;
    },

    // Déconnexion : efface l'utilisateur
    logout() {
      console.log("[Auth] Déconnexion Discord demandée");
      saveToStorage(null);
    }
  };
})();

// Initialisation automatique dès que le DOM est prêt
document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.init === "function") {
    Auth.init();
  }
});
