(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);

  const userId = String(
    params.get("tgid") ||
    params.get("userId") ||
    params.get("id") ||
    localStorage.getItem("tgid") ||
    ""
  ).trim();

  function getFunctionsService() {
    if (!window.firebase) {
      throw new Error("Firebase SDK не загружен");
    }

    if (!firebase.apps.length) {
      throw new Error(
        "Firebase ещё не инициализирован. " +
        "Подключите firebase-favorites.js раньше firebase-views.js."
      );
    }

    return firebase.app().functions("europe-west1");
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
    const callable = getFunctionsService().httpsCallable(
      "getPlacesViewsState"
    );

    const response = await callable({
      tgid: requireUserId()
    });

    return response.data || {
      counts: {},
      dayKey: ""
    };
  }

  async function register(placeId) {
    const normalizedPlaceId = String(placeId || "").trim();

    if (!normalizedPlaceId) {
      throw new Error("Не указан идентификатор локации");
    }

    const callable = getFunctionsService().httpsCallable(
      "registerPlaceView"
    );

    const response = await callable({
      tgid: requireUserId(),
      placeId: normalizedPlaceId
    });

    return response.data;
  }

  window.KMViews = {
    getState,
    register,
    getUserId: function () {
      return userId;
    }
  };

  console.log(
    "[Как Местный] Firebase Views подключён",
    userId ? `tgid=${userId}` : "tgid не найден"
  );
})();
