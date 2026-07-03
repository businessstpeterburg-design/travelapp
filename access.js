const KM = (function() {
  const firebaseConfig = {
    apiKey: "PASTE_FIREBASE_API_KEY_HERE",
    authDomain: "PASTE_FIREBASE_AUTH_DOMAIN_HERE",
    projectId: "PASTE_FIREBASE_PROJECT_ID_HERE",
    storageBucket: "PASTE_FIREBASE_STORAGE_BUCKET_HERE",
    messagingSenderId: "PASTE_FIREBASE_MESSAGING_SENDER_ID_HERE",
    appId: "PASTE_FIREBASE_APP_ID_HERE"
  };

  const params = new URLSearchParams(window.location.search);
  const userId =
    params.get("tgid") ||
    params.get("userId") ||
    params.get("id") ||
    localStorage.getItem("tgid");

  let db = null;
  let currentUserId = userId ? String(userId) : "";
  let refreshInterval = null;

  function hasFirebaseConfig() {
    return Boolean(
      firebaseConfig.apiKey &&
      !firebaseConfig.apiKey.includes("PASTE_") &&
      firebaseConfig.projectId &&
      !firebaseConfig.projectId.includes("PASTE_")
    );
  }

  function normalizeDate(value) {
    if (!value) return null;

    if (value && typeof value.toDate === "function") {
      return value.toDate();
    }

    if (typeof value === "object" && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateRu(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh"
    });
  }

  function getUserId() {
    return currentUserId;
  }

  function goTo(url) {
    const page = document.getElementById("app");

    if (page) page.classList.add("isLeaving");

    setTimeout(function() {
      window.location.href = url;
    }, 220);
  }

  function setLoading(isLoading) {
    const page = document.getElementById("app");
    const buttons = document.querySelectorAll("[data-action]");

    if (page) page.classList.toggle("isLoading", isLoading);

    buttons.forEach(function(button) {
      button.disabled = isLoading;
    });
  }

  function showAccessMessage(message, canRetry) {
    const page = document.getElementById("app");
    const notice = document.getElementById("accessNotice");
    const text = document.getElementById("accessMessage");

    if (page) page.classList.toggle("canRetry", Boolean(canRetry));
    if (notice) notice.classList.add("show");
    if (text) text.textContent = message;
  }

  function hideAccessMessage() {
    const page = document.getElementById("app");
    const notice = document.getElementById("accessNotice");

    if (page) page.classList.remove("canRetry");
    if (notice) notice.classList.remove("show");
  }

  async function readUser() {
    const doc = await db.collection("tg_users").doc(String(currentUserId)).get();

    if (!doc.exists) {
      return { ok: false, message: "Профиль не найден" };
    }

    const data = doc.data() || {};
    const accessUntil = normalizeDate(data.access_until);

    if (!accessUntil) {
      return { ok: false, message: "Доступ не найден", data };
    }

    if (data.premium === false || accessUntil.getTime() <= Date.now()) {
      return {
        ok: false,
        expired: true,
        message: "Доступ закончился",
        data,
        accessUntil
      };
    }

    return { ok: true, data, accessUntil };
  }

  async function initProtectedPage(options) {
    const settings = options || {};

    setLoading(true);
    hideAccessMessage();

    if (!currentUserId) {
      setLoading(false);
      showAccessMessage("Не удалось определить пользователя", true);
      return;
    }

    localStorage.setItem("tgid", currentUserId);

    if (!hasFirebaseConfig()) {
      setLoading(false);
      showAccessMessage("Доступ временно недоступен", true);
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      db = firebase.firestore();
      const result = await readUser();

      setLoading(false);

      if (!result.ok) {
        showAccessMessage(result.message, true);

        if (result.expired) {
          const renew = document.querySelector('[data-action="renew-access"]');
          if (renew) renew.style.display = "flex";
        }

        if (typeof settings.onBlocked === "function") {
          settings.onBlocked(result);
        }

        return;
      }

      hideAccessMessage();

      if (typeof settings.onReady === "function") {
        settings.onReady({
          userId: currentUserId,
          data: result.data,
          accessUntil: result.accessUntil,
          accessUntilText: formatDateRu(result.accessUntil)
        });
      }

      if (!refreshInterval) {
        refreshInterval = setInterval(function() {
          initProtectedPage(settings).catch(function(error) {
            console.warn("Access refresh failed", error);
          });
        }, 5 * 60 * 1000);
      }
    } catch (error) {
      console.warn("Access load failed", error);
      setLoading(false);
      showAccessMessage("Не удалось подключиться к серверу. Попробуйте ещё раз через несколько секунд.", true);
    }
  }

  document.addEventListener("click", function(event) {
    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) return;

    const tgid = encodeURIComponent(currentUserId || "");
    const action = button.dataset.action;

    if (action === "route") goTo(`route.html?tgid=${tgid}`);
    if (action === "places") goTo(`places.html?tgid=${tgid}`);
    if (action === "lifehacks") goTo(`lifehacks.html?tgid=${tgid}`);
    if (action === "sos") goTo(`sos.html?tgid=${tgid}`);
    if (action === "profile") goTo(`profile.html?tgid=${tgid}`);
    if (action === "guide") goTo(`guidepage.html?tgid=${tgid}`);
    if (action === "renew-access") goTo(`index.html?tgid=${tgid}`);
    if (action === "retry") initProtectedPage(window.KMPageOptions || {});
  });

  return {
    initProtectedPage,
    normalizeDate,
    formatDateRu,
    getUserId,
    goTo
  };
})();
