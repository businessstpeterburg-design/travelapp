const KM = (function() {
  const firebaseConfig = {
    apiKey: "AIzaSyAUzz_K-yhh1W2aEfzMiWeOe_AMb22ENpw",
  authDomain: "kak-mestniy.firebaseapp.com",
  projectId: "kak-mestniy",
  storageBucket: "kak-mestniy.firebasestorage.app",
  messagingSenderId: "1000266473398",
  appId: "1:1000266473398:web:ba1f6bba5248ff517b6b17",
  measurementId: "G-M4KB2PFWKG"
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
  let lastReadyPayload = null;

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

  function getActionButtons() {
    return Array.from(document.querySelectorAll("[data-action]"));
  }

  function setButtonsDisabled(disabled) {
    getActionButtons().forEach(function(button) {
      button.disabled = disabled;
    });
  }

  function setPaidButtonsDisabled(disabled) {
    getActionButtons().forEach(function(button) {
      const action = button.dataset.action;

      if (action !== "retry" && action !== "renew-access") {
        button.disabled = disabled;
      }
    });
  }

  function showAccessNotice(message, canRetry = true) {
    const page = document.getElementById("app");
    const notice = document.getElementById("accessNotice");
    const text = document.getElementById("accessMessage");
    const retry = document.querySelector('[data-action="retry"]');

    if (page) {
      page.classList.add("errorState");
      page.classList.toggle("canRetry", Boolean(canRetry));
    }

    if (notice) notice.classList.add("show");
    if (text) text.textContent = message;
    if (retry) retry.disabled = !canRetry;
  }

  function hideAccessNotice() {
    const page = document.getElementById("app");
    const notice = document.getElementById("accessNotice");

    if (page) {
      page.classList.remove("errorState", "canRetry");
    }

    if (notice) notice.classList.remove("show");
  }

  function setLoading(isLoading) {
    const page = document.getElementById("app");

    if (page) page.classList.toggle("isLoading", isLoading);
    setButtonsDisabled(isLoading);
  }

  function lockPaidContentForError(result) {
    const renew = document.querySelector('[data-action="renew-access"]');
    const retry = document.querySelector('[data-action="retry"]');

    setPaidButtonsDisabled(true);

    if (retry) retry.disabled = false;

    if (renew && result && result.expired) {
      renew.style.display = "flex";
      renew.disabled = false;
    }
  }

  async function readUser() {
    const doc = await db.collection("tg_users").doc(String(currentUserId)).get();

    if (!doc.exists) {
      console.warn("User document not found");
      return { ok: false, message: "Профиль не найден" };
    }

    const data = doc.data() || {};
    const accessUntil = normalizeDate(data.access_until);

    if (!accessUntil) {
      console.warn("Access date missing");
      return { ok: false, message: "Доступ не найден", data };
    }

    if (data.premium === false || accessUntil.getTime() <= Date.now()) {
      console.warn("Access expired");
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

  function buildReadyPayload(result) {
    return {
      userId: currentUserId,
      data: result.data,
      accessUntil: result.accessUntil,
      accessUntilText: formatDateRu(result.accessUntil)
    };
  }

  async function initFirebaseIfNeeded() {
    if (!hasFirebaseConfig()) {
      console.warn("Firebase config missing");
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    db = firebase.firestore();
    return true;
  }

  async function refreshAccessSilently(settings) {
    try {
      const result = await readUser();

      if (!result.ok) {
        showAccessNotice(result.message, true);
        lockPaidContentForError(result);

        if (typeof settings.onBlocked === "function") {
          settings.onBlocked(result);
        }

        return;
      }

      hideAccessNotice();
      setPaidButtonsDisabled(false);

      const payload = buildReadyPayload(result);
      lastReadyPayload = payload;

      if (typeof settings.onRefresh === "function") {
        settings.onRefresh(payload);
      }
    } catch (error) {
      console.warn("Access load failed", error);
      showAccessNotice("Не удалось подключиться к серверу. Попробуйте ещё раз через несколько секунд.", true);
      lockPaidContentForError({ expired: false });
    }
  }

  async function initProtectedPage(options) {
    const settings = options || {};
    const page = document.getElementById("app");

    setLoading(true);
    hideAccessNotice();

    if (!currentUserId) {
      setLoading(false);
      showAccessNotice("Не удалось определить пользователя", true);
      lockPaidContentForError({ expired: false });
      return;
    }

    localStorage.setItem("tgid", currentUserId);

    try {
      const firebaseReady = await initFirebaseIfNeeded();

      if (!firebaseReady) {
        setLoading(false);
        showAccessNotice("Доступ временно недоступен", true);
        lockPaidContentForError({ expired: false });
        return;
      }

      const result = await readUser();

      setLoading(false);

      if (!result.ok) {
        showAccessNotice(result.message, true);
        lockPaidContentForError(result);

        if (typeof settings.onBlocked === "function") {
          settings.onBlocked(result);
        }

        return;
      }

      if (page) {
        page.classList.remove("isLoading", "errorState", "canRetry");
      }

      hideAccessNotice();
      setPaidButtonsDisabled(false);

      const payload = buildReadyPayload(result);
      lastReadyPayload = payload;

      if (typeof settings.onReady === "function") {
        settings.onReady(payload);
      }

      if (!refreshInterval) {
        refreshInterval = setInterval(function() {
          refreshAccessSilently(settings);
        }, 5 * 60 * 1000);
      }
    } catch (error) {
      console.warn("Access load failed", error);
      setLoading(false);
      showAccessNotice("Не удалось подключиться к серверу. Попробуйте ещё раз через несколько секунд.", true);
      lockPaidContentForError({ expired: false });
    }
  }

 document.addEventListener("click", function(event) {
  const button = event.target.closest("[data-action]");

  if (!button || button.disabled) return;

  const tgid = encodeURIComponent(currentUserId || "");
  const action = button.dataset.action;

  if (action === "renew-access") {
    goTo(`index.html?tgid=${tgid}`);
  }

  if (action === "retry") {
    initProtectedPage(window.KMPageOptions || {});
  }
});

  return {
    initProtectedPage,
    normalizeDate,
    formatDateRu,
    goTo,
    getUserId,
    currentUserId,
    getLastReadyPayload: function() {
      return lastReadyPayload;
    }
  };
})();
