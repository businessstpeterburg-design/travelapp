(function () {
  "use strict";

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

  const userId = String(
    params.get("tgid") ||
    params.get("userId") ||
    params.get("id") ||
    localStorage.getItem("tgid") ||
    ""
  ).trim();

  let functionsService = null;

  function initializeFirebase() {
    if (!window.firebase) {
      throw new Error("Firebase SDK не загружен");
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    functionsService = firebase
      .app()
      .functions("europe-west1");

    return functionsService;
  }

  function requireUserId() {
    if (!userId) {
      throw new Error(
        "Не найден tgid. Откройте страницу с параметром ?tgid=..."
      );
    }

    return userId;
  }

  async function getState() {
    const service = functionsService || initializeFirebase();

    const callable = service.httpsCallable(
      "getPlacesFavoritesState"
    );

    const response = await callable({
      tgid: requireUserId()
    });

    return response.data || {
      counts: {},
      favorites: []
    };
  }

  async function toggle(placeId) {
    const normalizedPlaceId = String(placeId || "").trim();

    if (!normalizedPlaceId) {
      throw new Error("Не указан идентификатор локации");
    }

    const service = functionsService || initializeFirebase();

    const callable = service.httpsCallable(
      "togglePlaceFavorite"
    );

    const response = await callable({
      tgid: requireUserId(),
      placeId: normalizedPlaceId
    });

    return response.data;
  }

  function getUserId() {
    return userId;
  }

  window.KMFavorites = {
    initialize: initializeFirebase,
    getState,
    toggle,
    getUserId
  };

  try {
    initializeFirebase();

    console.log(
      "[Как Местный] Firebase Favorites подключён",
      userId ? `tgid=${userId}` : "tgid не найден"
    );
  } catch (error) {
    console.error(
      "[Как Местный] Ошибка подключения Firebase Favorites:",
      error
    );
  }
})();
