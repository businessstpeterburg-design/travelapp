/*
  ============================================================
  КАК МЕСТНЫЙ — НОВЫЕ ОПУБЛИКОВАННЫЕ ЛОКАЦИИ
  ============================================================

  С этого момента новые карточки добавляются только в этот файл.

  Правила:

  1. У каждой карточки должен быть уникальный id.
  2. Между объектами обязательно ставится запятая.
  3. Пустые поля можно временно оставлять пустыми.
  4. Старые файлы 01–04 не редактируем.
  5. Одна карточка = один объект внутри массива.

  Основные категории проекта:

  food
  coffee
  beach
  spa
  views
  night
  family
  luxury-day
  resort
  pool
  waterpark
  entertainment
  money
  shopping
  connectivity
  transport
  medical
  guide
*/

window.KM_NEW_PLACES = [

  /*
  ШАБЛОН НОВОЙ КАРТОЧКИ

  {
    id: "unique-place-id",

    title: "Название места",

    category: "spa",
    categories: ["spa", "romance"],
    subcategory: "Массаж и SPA",

    description:
      "Короткое описание для основной карточки.",

    choiceAdvice:
      "Совет по выбору: кому и зачем стоит выбрать это место.",

    localAdvice:
      "Авторский совет «Как Местный».",

    whyIncluded: [
      "Почему место вошло в путеводитель",
      "Главная сильная сторона"
    ],

    pros: [
      "Первый плюс",
      "Второй плюс"
    ],

    important: [
      "Что важно знать заранее"
    ],

    rating: 4.8,
    reviews: 1282,

    price: "₫₫",
    area: "Центр Нячанга",

    time: "Лучше вечером",
    duration: "1,5–2 часа",
    aud: "Пары, соло, компания",
    atmosphere: "Спокойная",

    address: "",
    schedule: "",
    contacts: "",

    lat: null,
    lng: null,

    mapUrl: "",

    image:
      "https://example.com/main-photo.jpg",

    gallery: [
      "https://example.com/photo-1.jpg",
      "https://example.com/photo-2.jpg"
    ],

    tags: [
      "SPA",
      "Рядом с центром",
      "Проверено"
    ],

    featured: false,
    verified: true,

    categoryBlock: {
      title: "Что выбрать",
      items: [
        {
          name: "Основная услуга",
          price: "от 300 000 ₫",
          description: "Короткое пояснение"
        }
      ]
    },

    sourceStatus:
      "Рейтинг, отзывы и практическая информация проверены редакцией."
  }

  */

];

/* ==========================================================
   ПОДКЛЮЧЕНИЕ НОВЫХ ЛОКАЦИЙ К ОСНОВНОМУ КАТАЛОГУ
   ========================================================== */

if (typeof places !== 'undefined' && Array.isArray(places)) {
  const existingIds = new Set(
    places.map(place => String(place?.id || '').trim())
  );

  let addedCount = 0;

  window.KM_NEW_PLACES.forEach(place => {
    const id = String(place?.id || '').trim();

    if (!id) {
      console.warn(
        '[Как Местный] Карточка пропущена: отсутствует id',
        place
      );
      return;
    }

    if (existingIds.has(id)) {
      console.warn(
        `[Как Местный] Дубликат id "${id}" пропущен.`
      );
      return;
    }

    places.push({
      category: 'all',
      categories: [],
      subcategory: 'Локации',
      title: 'Без названия',
      description: '',
      choiceAdvice: '',
      whyIncluded: [],
      categoryBlock: {
        title: 'Что выбрать',
        items: []
      },
      localAdvice: '',
      pros: [],
      important: [],
      amenities: [],
      nearby: [],
      tags: [],
      gallery: [],
      featured: false,
      verified: false,
      image: '',
      rating: null,
      reviews: null,
      price: '',
      area: '',
      lat: null,
      lng: null,
      ...place
    });

    existingIds.add(id);
    addedCount++;
  });

  console.info(
    `[Как Местный] Новых карточек подключено: ${addedCount}`
  );
} else {
  console.error(
    '[Как Местный] Основной массив places не найден. Проверьте порядок script.'
  );
}
