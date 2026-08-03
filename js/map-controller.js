'use strict';

/*
 * =========================================================
 * КАК МЕСТНЫЙ — CLEAN MAP CONTROLLER V107
 * =========================================================
 *
 * Единственная ответственность файла:
 * - предпросмотр локации на карте;
 * - рейтинг и отзывы;
 * - лайк;
 * - маршрут;
 * - открытие полной карточки;
 * - закрытие предпросмотра по тапу на карту.
 */

(function installCleanMapControllerV107() {
  if (window.__kmCleanMapControllerV107) {
    return;
  }

  window.__kmCleanMapControllerV107 = true;

  let favoriteBusy = false;

  function getAllMapPlaces() {
    return [
      ...(Array.isArray(places) ? places : []),
      ...(Array.isArray(sourceArchive) ? sourceArchive : []),
    ];
  }

  function findMapPlace(id) {
    return getAllMapPlaces().find(
      place => String(place.id) === String(id)
    );
  }

  function formatRating(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '—';
    }

    return String(number).replace('.', ',');
  }

  /*
   * Используем тот же форматтер и то же поле reviews,
   * что применяются в основных карточках.
   */
  function formatReviews(place) {
    return formatReviewCount(place?.reviews);
  }

  /*
   * Берём одно или два законченных предложения.
   * Никогда не обрываем текст на случайном слове.
   */
  function getMapDescription(place) {
    const source = String(
      place?.mapDescription ||
      place?.shortDescription ||
      place?.choiceAdvice ||
      place?.description ||
      place?.fullDescription ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!source) {
      return 'Подробная информация и советы находятся в полной карточке.';
    }

    const sentences = source.match(/[^.!?]+[.!?]+/g);

    if (!sentences?.length) {
      return source.endsWith('.') ? source : `${source}.`;
    }

    return sentences
      .slice(0, 2)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderMapRating(place) {
    const rating = document.getElementById('mapCardRating');

    if (!rating) {
      return;
    }

    rating.innerHTML = `
      <span class="km-map-rating-star-v107" aria-hidden="true">★</span>
      <span class="km-map-rating-value-v107">${escapeHtml(
        formatRating(place.rating)
      )}</span>
      <span class="km-map-rating-reviews-v107">(${escapeHtml(
        formatReviews(place)
      )})</span>
    `;
  }

  function renderMapFavorite(place) {
    const button = document.getElementById('mapFav');

    if (!button) {
      return;
    }

    const active = isFav(place.id);

    /*
     * Убираем общий data-action.
     * Иначе одновременно срабатывает старый делегированный
     * обработчик из app.js.
     */
    button.removeAttribute('data-action');

    button.dataset.placeId = String(place.id);
    button.dataset.id = String(place.id);

    button.classList.toggle('active', active);
    button.textContent = active ? '♥' : '♡';

    button.setAttribute(
      'aria-label',
      active
        ? 'Убрать из избранного'
        : 'Добавить в избранное'
    );
  }

  function renderMapPreview(place) {
    const card = document.getElementById('mapCard');
    const image = document.getElementById('mapCardImage');
    const title = document.getElementById('mapCardTitle');
    const description = document.getElementById('mapCardDesc');
    const area = document.getElementById('mapCardArea');
    const details = document.getElementById('mapDetails');
    const route = document.getElementById('mapRoute');

    if (!card) {
      return;
    }

    let closeButton=document.getElementById('mapCardClose');

    if(!closeButton){
      closeButton=document.createElement('button');
      closeButton.id='mapCardClose';
      closeButton.className='map-card-close';
      closeButton.type='button';
      closeButton.innerHTML='×';
      closeButton.setAttribute(
        'aria-label',
        'Закрыть предпросмотр локации'
      );

      closeButton.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeMapPreview();
      });

      card.appendChild(closeButton);
    }

    selectedId = place.id;
    card.dataset.placeId = String(place.id);

    if (image) {
      image.src = place.image || FALLBACK_IMAGE;
      image.alt = getPreviewTitle(place);
    }

    if (title) {
      title.textContent = getPreviewTitle(place);
    }

    if (description) {
      description.textContent = getMapDescription(place);
    }

    renderMapRating(place);
    renderMapFavorite(place);

    if (area) {
      area.hidden = true;
      area.textContent = '';
    }

    if (details) {
      details.hidden = true;
    }

    if (route) {
      route.textContent = 'Проложить маршрут';
      route.dataset.placeId = String(place.id);
    }

    card.classList.add('open');
  }

  /*
   * Единственная функция открытия предпросмотра.
   */
  showMapCard = function showMapCardClean(id) {
    const place = findMapPlace(id);

    if (!place) {
      return;
    }

    renderMapPreview(place);

    if (
      map &&
      Number.isFinite(Number(place.lat)) &&
      Number.isFinite(Number(place.lng))
    ) {
      map.panTo(
        [Number(place.lat), Number(place.lng)],
        { animate: true }
      );
    }
  };

  /*
   * Если старая система вызывает updateMapCard после лайка,
   * она теперь также рисует стабильную версию.
   */
  updateMapCard = function updateMapCardClean() {
    const place = findMapPlace(selectedId);

    if (!place) {
      return;
    }

    renderMapPreview(place);
  };

  function closeMapPreview() {
    const card=document.getElementById('mapCard');

    if(card){
      card.classList.remove('open');
      card.dataset.placeId='';
    }

    selectedId=null;
  }

  function bindLeafletDismiss() {
    if (!map || map.__kmCleanDismissV107) {
      return;
    }

    map.__kmCleanDismissV107 = true;

    map.on('click', closeMapPreview);
  }

  /*
   * Оставляем исходную initMap, но добавляем только
   * один обработчик закрытия по свободной карте.
   */
  const baseInitMap = initMap;

  initMap = function initMapClean() {
    baseInitMap();

    requestAnimationFrame(bindLeafletDismiss);
    setTimeout(bindLeafletDismiss, 120);
  };

  async function handleFavorite(button, card) {
    if (favoriteBusy) {
      return;
    }

    const id =
      button.dataset.placeId ||
      card.dataset.placeId ||
      selectedId;

    const place = findMapPlace(id);

    if (!place) {
      return;
    }

    favoriteBusy = true;

    /*
     * Жёстко фиксируем выбранную локацию.
     * Никакой другой id не может попасть в перерисовку.
     */
    selectedId = place.id;

    try {
      await toggleFavorite(place.id, button);

      selectedId = place.id;

      renderMapFavorite(place);
      renderMapRating(place);

      if (typeof updateMapMarkers === 'function') {
        updateMapMarkers();
      }
    } finally {
      favoriteBusy = false;
    }
  }

  function handleRoute(button, card) {
    const id =
      button.dataset.placeId ||
      card.dataset.placeId ||
      selectedId;

    if (id) {
      routeTo(id);
    }
  }

  function bindMapCardEvents() {
    const card = document.getElementById('mapCard');

    if (!card || card.dataset.cleanControllerV107 === 'true') {
      return;
    }

    card.dataset.cleanControllerV107 = 'true';

    /*
     * Capture-фаза блокирует старые обработчики до того,
     * как они успеют обработать лайк или маршрут.
     */
    card.addEventListener(
      'click',
      async event => {
        const favorite = event.target.closest('#mapFav');

        if (favorite) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          await handleFavorite(favorite, card);
          return;
        }

        const route = event.target.closest('#mapRoute');

        if (route) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          handleRoute(route, card);
          return;
        }

        if (event.target.closest('button, a')) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const id = card.dataset.placeId || selectedId;

        if (id) {
          openModal(id);
        }
      },
      true
    );
  }

  function bootCleanMapController() {
    bindMapCardEvents();

    if (map) {
      bindLeafletDismiss();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      bootCleanMapController,
      { once: true }
    );
  } else {
    bootCleanMapController();
  }
})();
