let active='all',selectedId=null,map=null,markers=new Map(),lastFocusedElement=null,lockedScrollY=0;

const favoriteState=new Set();
const favoriteCounts=new Map();
const favoriteQueues=new Map();
const favoriteVersions=new Map();

const viewCounts=new Map();
const viewRequests=new Map();

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

function getFavs(){
 return new Set(favoriteState);
}

function isFav(id){
 return favoriteState.has(String(id));
}

function getFavoriteCount(place){
 const id=String(place?.id||'');

 if(favoriteCounts.has(id)){
  return Number(favoriteCounts.get(id));
 }

 return Number(
  place?.favoritesCount ??
  place?.favoriteCount ??
  place?.stats?.favorites ??
  300
 );
}

function toast(text){
 const t=$('#toast');
 if(!t)return;
 t.textContent=text;
 t.classList.add('show');
 clearTimeout(toast.timer);
 toast.timer=setTimeout(()=>t.classList.remove('show'),1400);
}

function updateFavoriteButtons(id){
 const normalizedId=String(id);

 document
  .querySelectorAll('[data-action="favorite"]')
  .forEach(button=>{
   const buttonId=String(
    button.dataset.id ||
    (button.id==='mapFav' ? selectedId : '') ||
    ''
   );

   if(buttonId!==normalizedId)return;

   const active=isFav(normalizedId);

   button.classList.toggle('active',active);
   button.textContent=active?'♥':'♡';
   button.setAttribute(
    'aria-label',
    active?'Удалить из избранного':'Добавить в избранное'
   );
  });
}

function updateFavoriteCounter(id){
 const place=places.find(
  item=>String(item.id)===String(id)
 );

 const counter=document.getElementById(
  'modalFavoriteCount'
 );

 if(!place||!counter)return;

 const value=getFavoriteCount(place);

 counter.dataset.baseCount=String(value);
 counter.textContent=
  new Intl.NumberFormat('ru-RU').format(value);
}

function scheduleFavoriteHeavyRefresh(){
 const refresh=()=>{
  if(active==='favorites'){
   renderCards();
  }

  const listOverlay=document.getElementById(
   'listOverlay'
  );

  if(listOverlay?.classList.contains('open')){
   renderCatalog();
  }

  const mapOverlay=document.getElementById(
   'mapOverlay'
  );

  if(
   mapOverlay?.classList.contains('open') &&
   map
  ){
   updateMapMarkers();

   if(selectedId){
    updateMapCard();
   }
  }
 };

 if('requestIdleCallback' in window){
  window.requestIdleCallback(refresh,{
   timeout:500
  });
 }else{
  window.setTimeout(refresh,0);
 }
}

function refreshFavoriteInterface(id){
 updateFavoriteButtons(id);
 updateFavoriteCounter(id);
 scheduleFavoriteHeavyRefresh();
}

function queueFavoriteSync(id,version){
 const previousTask=
  favoriteQueues.get(id) ||
  Promise.resolve();

 const task=previousTask
  .catch(()=>{})
  .then(async()=>{
   const result=await window.KMFavorites.toggle(id);

   const latestVersion=
    favoriteVersions.get(id)||0;

   // Промежуточный ответ не должен перезаписывать
   // более новое состояние, уже выбранное пользователем.
   if(latestVersion===version){
    if(result?.isFavorite){
     favoriteState.add(id);
    }else{
     favoriteState.delete(id);
    }

    if(
     Number.isFinite(
      Number(result?.favoritesCount)
     )
    ){
     favoriteCounts.set(
      id,
      Number(result.favoritesCount)
     );
    }

    refreshFavoriteInterface(id);
   }

   return result;
  })
  .catch(error=>{
   console.error(
    '[Как Местный] Ошибка синхронизации избранного:',
    error
   );

   const latestVersion=
    favoriteVersions.get(id)||0;

   if(latestVersion===version){
    toast(
     'Не удалось синхронизировать избранное'
    );

    // Получаем истинное состояние с сервера,
    // но не блокируем интерфейс.
    loadGlobalFavorites();
   }
  })
  .finally(()=>{
   if(favoriteQueues.get(id)===task){
    favoriteQueues.delete(id);
   }
  });

 favoriteQueues.set(id,task);
}

function toggleFavorite(id,source){
 const normalizedId=String(id||'').trim();

 if(!normalizedId){
  return;
 }

 if(!window.KMFavorites){
  toast('Сервис избранного пока недоступен');
  return;
 }

 const place=places.find(
  item=>String(item.id)===normalizedId
 );

 const wasFavorite=
  favoriteState.has(normalizedId);

 const currentCount=place
  ? getFavoriteCount(place)
  : 300;

 const nextFavorite=!wasFavorite;

 const nextCount=nextFavorite
  ? currentCount+1
  : Math.max(0,currentCount-1);

 // Каждый тап сразу меняет локальный интерфейс.
 if(nextFavorite){
  favoriteState.add(normalizedId);
 }else{
  favoriteState.delete(normalizedId);
 }

 favoriteCounts.set(
  normalizedId,
  nextCount
 );

 const version=
  (favoriteVersions.get(normalizedId)||0)+1;

 favoriteVersions.set(
  normalizedId,
  version
 );

 refreshFavoriteInterface(normalizedId);

 if(source){
  source.classList.remove(
   'heart-pop',
   'pulse'
  );

  requestAnimationFrame(()=>{
   source.classList.add(
    'heart-pop',
    'pulse'
   );

   window.setTimeout(()=>{
    source.classList.remove(
     'heart-pop',
     'pulse'
    );
   },220);
  });
 }

 toast(
  nextFavorite
   ? 'Сохранено в избранное'
   : 'Удалено из избранного'
 );

 // Firebase идёт в фоне и не блокирует следующий тап.
 queueFavoriteSync(
  normalizedId,
  version
 );
}

function getViewCount(place){
 const id=String(place?.id||'');

 if(viewCounts.has(id)){
  return Number(viewCounts.get(id));
 }

 return Number(
  place?.views ??
  place?.viewCount ??
  place?.stats?.views ??
  1000
 );
}

function updateModalViewCounter(placeId){
 if(String(selectedId)!==String(placeId)){
  return;
 }

 const place=[...places,...sourceArchive].find(
  item=>String(item.id)===String(placeId)
 );

 const counter=document.getElementById(
  'modalViewCount'
 );

 if(!place||!counter){
  return;
 }

 counter.textContent=
  new Intl.NumberFormat('ru-RU').format(
   getViewCount(place)
  );
}

async function loadGlobalViews(){
 if(!window.KMViews){
  console.warn(
   '[Как Местный] KMViews не подключён'
  );
  return;
 }

 try{
  const state=await window.KMViews.getState();

  viewCounts.clear();

  for(
   const [id,count]
   of Object.entries(state?.counts||{})
  ){
   viewCounts.set(
    String(id),
    Number(count)
   );
  }

  if(selectedId){
   updateModalViewCounter(selectedId);
  }

  console.log(
   '[Как Местный] Глобальные просмотры загружены:',
   {
    counts:Object.fromEntries(viewCounts),
    dayKey:state?.dayKey||''
   }
  );
 }catch(error){
  console.error(
   '[Как Местный] Не удалось загрузить просмотры:',
   error
  );
 }
}

function registerPlaceView(placeId){
 const normalizedId=String(placeId||'').trim();

 if(!normalizedId||!window.KMViews){
  return;
 }

 // Не запускаем два параллельных запроса
 // по одной карточке в рамках одной загрузки страницы.
 if(viewRequests.has(normalizedId)){
  return;
 }

 const task=window.KMViews
  .register(normalizedId)
  .then(result=>{
   if(
    Number.isFinite(
     Number(result?.viewsCount)
    )
   ){
    viewCounts.set(
     normalizedId,
     Number(result.viewsCount)
    );
   }

   updateModalViewCounter(normalizedId);

   console.log(
    '[Как Местный] Просмотр обработан:',
    {
     placeId:normalizedId,
     counted:Boolean(result?.counted),
     viewsCount:result?.viewsCount,
     dayKey:result?.dayKey
    }
   );

   return result;
  })
  .catch(error=>{
   console.error(
    '[Как Местный] Ошибка регистрации просмотра:',
    error
   );
  })
  .finally(()=>{
   viewRequests.delete(normalizedId);
  });

 viewRequests.set(normalizedId,task);
}

async function loadGlobalFavorites(){
 if(!window.KMFavorites){
  console.warn(
   '[Как Местный] KMFavorites не подключён'
  );
  return;
 }

 try{
  const state=await window.KMFavorites.getState();

  favoriteState.clear();
  favoriteCounts.clear();

  for(const id of state?.favorites||[]){
   favoriteState.add(String(id));
  }

  for(const [id,count] of Object.entries(state?.counts||{})){
   favoriteCounts.set(String(id),Number(count));
  }

  renderCards();
  renderCatalog();
  updateMapMarkers();

  if(selectedId){
   updateMapCard();
   refreshFavoriteInterface(selectedId);
  }

  console.log(
   '[Как Местный] Глобальное избранное загружено:',
   {
    favorites:[...favoriteState],
    counts:Object.fromEntries(favoriteCounts)
   }
  );
 }catch(error){
  console.error(
   '[Как Местный] Не удалось загрузить избранное:',
   error
  );

  toast('Не удалось загрузить избранное');
 }
}
function isMemoCard(p){return p?.kind==='guide'||p?.archive===true}
function filteredPlaces(){
 const q=$('#searchInput').value.trim().toLowerCase();
 const pool=(active==='all'&&!q)?places:[...places,...sourceArchive];
 let list=pool.filter(p=>{
   const memo=isMemoCard(p);
   const categories=p.categories?.length?p.categories:[p.category];
   const searchable=[
     getPreviewTitle(p),p.description,p.choiceAdvice,p.rawText,p.category,p.subcategory,p.area,
     ...(p.subcategories||[]),...(p.tags||[]),...(p.cuisines||[]),...(p.mealTypes||[]),
     p.booking?.method,p.booking?.offerName,p.mapUrl,p.sourceStatus
   ].filter(Boolean).join(' ').toLowerCase();
   if(active==='guide')return memo&&(!q||searchable.includes(q));
   if(active==='favorites')return isFav(p.id)&&(!q||searchable.includes(q));
   if(memo)return false;
   return (active==='all'||categories.includes(active))&&(!q||searchable.includes(q));
 });
 return list.sort((a,b)=>Number(b.featured)-Number(a.featured));
}

function formatReviewCount(value){
  if(typeof value==='number'&&Number.isFinite(value))return new Intl.NumberFormat('ru-RU').format(value);
  const text=String(value??'').trim();
  const match=text.match(/(\d[\d\s.,]*\s*(?:тыс\.?)?)/i);
  return match?match[1].trim():'—';
}
function cardTemplate(p){const f=isFav(p.id);const seal=p.featured?`<div class="seal" aria-label="Местный рекомендует"><span><i>КАК МЕСТНЫЙ</i><b>✓</b><strong>МЕСТНЫЙ</strong><em>РЕКОМЕНДУЕТ</em><small>★ ★ ★</small></span></div>`:'';return `<article class="card" data-action="details" data-id="${p.id}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(getPreviewTitle(p))}"><div class="pic"><img src="${p.image||FALLBACK_IMAGE}" alt="${escapeHtml(getPreviewTitle(p))}" loading="lazy" decoding="async" style="object-fit:${p.imageFit||'cover'};object-position:${p.imagePosition||'center'}"><span class="badge">${p.featured?'Выбор «Как Местный»':'Рекомендуем'}</span><button class="fav ${f?'active':''}" data-action="favorite" data-id="${p.id}" aria-label="Избранное">${f?'♥':'♡'}</button>${seal}<div class="rating">${p.kind==='guide'?`<span class="rating-type">ПАМЯТКА</span>`:`<span class="rating-star" aria-hidden="true">★</span><span class="rating-value">${p.rating!=null?escapeHtml(p.rating):'—'}</span><span class="rating-divider">·</span><span class="rating-reviews">Отзывов: ${escapeHtml(formatReviewCount(p.reviews))}</span>`}</div></div><div class="body"><span class="card-kicker">${escapeHtml(p.subcategory)}</span><div class="title"><h3>${escapeHtml(getPreviewTitle(p))}</h3><div class="price">${escapeHtml(p.price)}</div></div><p class="choice-preview">${escapeHtml(p.choiceAdvice||p.description)}</p><div class="card-meta-row">${p.time?`<span class="card-meta-pill">${escapeHtml(p.time)}</span>`:''}${p.aud?`<span class="card-meta-pill">${escapeHtml(p.aud)}</span>`:''}${p.area?`<span class="card-meta-pill">${escapeHtml(p.area)}</span>`:''}</div><div class="card-actions"><button class="details" data-action="details" data-id="${p.id}">Подробнее →</button></div></div></article>`}
/* KM LIVE COUNT + COMPACT FAVORITES V56 START */

/*
  Считаем реальные уникальные локации из рабочего массива places.

  Не учитываются:
  — архивные материалы;
  — памятки;
  — объекты без id;
  — повторы с одинаковым id.
*/
function getActualLocationCount(){
 const uniqueIds=new Set(
  places
   .filter(p=>
    p &&
    p.id &&
    !p.archive &&
    p.kind!=='archive' &&
    p.kind!=='guide'
   )
   .map(p=>String(p.id))
 );

 return uniqueIds.size;
}

/*
  Обновляем показатель «Проверенных мест»
  на верхнем экране.
*/
function updateTitleLocationCounter(){
 const count=getActualLocationCount();
 const formatted=new Intl.NumberFormat('ru-RU').format(count);

 /*
   Сначала проверяем специальные id и data-атрибуты,
   если они уже существуют в разметке.
 */
 const directSelectors=[
  '#placesCount',
  '#locationsCount',
  '#verifiedPlacesCount',
  '#verifiedCount',
  '[data-places-count]',
  '[data-location-count]',
  '[data-count="places"]',
  '[data-count="locations"]'
 ];

 directSelectors.forEach(selector=>{
  document.querySelectorAll(selector).forEach(element=>{
   element.textContent=formatted;
  });
 });

 /*
   Затем находим видимую подпись «Проверенных мест».
 */
 const labels=[...document.querySelectorAll(
  'small,span,p,label,div'
 )].filter(element=>{
  const ownText=[...element.childNodes]
   .filter(node=>node.nodeType===Node.TEXT_NODE)
   .map(node=>node.textContent)
   .join(' ')
   .replace(/\s+/g,' ')
   .trim()
   .toLowerCase();

  return (
   ownText==='проверенных мест' ||
   ownText==='проверенные места' ||
   ownText==='всего локаций' ||
   ownText==='локаций в каталоге'
  );
 });

 labels.forEach(label=>{
  const container=
   label.closest(
    '.stat,.metric,.counter,.summary-item,'+
    '.hero-stat,.profile-stat,.community-stat,'+
    '.info-panel,.stat-item'
   ) ||
   label.parentElement;

  if(!container)return;

  const candidates=[
   label.previousElementSibling,
   ...container.querySelectorAll(
    'strong,b,.number,.value,.count,[data-value]'
   )
  ].filter(Boolean);

  const target=candidates.find(element=>
   element!==label &&
   (
    /\d/.test(element.textContent||'') ||
    element.matches?.(
     'strong,b,.number,.value,.count,[data-value]'
    )
   )
  );

  if(target){
   target.textContent=formatted;
  }
 });

 document.documentElement.dataset.actualLocationCount=
  String(count);

 return count;
}

function locationWord(count){
 const mod10=count%10;
 const mod100=count%100;

 if(mod10===1&&mod100!==11){
  return'локация';
 }

 if(
  mod10>=2 &&
  mod10<=4 &&
  (mod100<12||mod100>14)
 ){
  return'локации';
 }

 return'локаций';
}

/*
  Компактная горизонтальная карточка избранного.
  Используются существующие классы list-place и list-heart.
*/
/* KM ALL SECTIONS COMPACT V58 */
/* KM PREVIEW TITLES V65 START */

/*
  Понятные русские названия используются только
  в горизонтальных карточках.

  Официальные title, поиск, карта и полная карточка
  остаются без изменений.
*/
const kmPreviewTitleRules=[
 /* KM PREVIEW EXACT FIXES V66 START */

 {
  test:/kem\s*c[oô]n\s*[đd][aả]o\s*d[uừ]a\s*[đd][aấ]t\s*nha\s*trang/i,
  title:'Мороженое из целого кокоса'
 },
 {
  test:/khu\s*vui\s*ch[oơ]i\s*tr[eẻ]\s*em\s*kim\s*ph[aá]t/i,
  title:'Игровая до 7 лет'
 },
 {
  test:/13\s*:\s*20\s*bar/i,
  title:'Бар до поздна'
 },
 {
  test:/the\s*sigma/i,
  title:'Премиум кальянная'
 },
 {
  test:/z\s*beach\s*nha\s*trang/i,
  title:'Пляжное кафе-клуб Z Beach'
 },
 {
  test:/x[oóòỏõọôơ]m\s*c[oốồổỗộơờớởỡợ]m\s*coffee/i,
  title:'Кафе на рисовом поле'
 },
 {
  test:/cafe\s*moi|caf[eé]\s*m[oơ]i/i,
  title:'Кофе из целого кокоса'
 },
 {
  test:/lac\s*canh|l[aạ]c\s*c[aả]nh/i,
  title:'Местное кафе'
 },

 /* KM PREVIEW EXACT FIXES V66 END */

 {
  test:/panorama.*(?:pool|rooftop)|(?:pool|rooftop).*panorama/i,
  title:'Бассейн 360 на крыше отеля Panorama'
 },
 {
  test:/th[aá]p\s*tr[aầ]m\s*h[uư][oơ]ng|tram\s*huong/i,
  title:'Башня Лотос'
 },
 {
  test:/sailing\s*club/i,
  title:'Пляжное кафе-клуб Sailing'
 },
 {
  test:/b[aã]i\s*d[aà]i.*тих|тих.*b[aã]i\s*d[aà]i|bai\s*dai/i,
  title:'Пляж Бай Дай'
 },
 {
  test:/лонгшон|long\s*son|longs[ơo]n/i,
  title:'Белый Будда'
 },
 {
  test:/cem\s*con\s*dao/i,
  title:'Мороженое из целого кокоса'
 },
 {
  test:/home\s*(?:com\s*)?coffee/i,
  title:'Кафе с видом на рисовые террасы'
 },
 {
  test:/chill\s*chill.*rooftop/i,
  title:'Крыша с видом на Лотос'
 },
 {
  test:/regalia\s*gold/i,
  title:'Ресторан на крыше с бассейном'
 },
 {
  test:/men\s*tuoi|m[eê]n\s*t[uư][oơ]i/i,
  title:'Местный пивной паб'
 },
 {
  test:/the\s*beach\s*club/i,
  title:'Клуб на пляже'
 },
 {
  test:/pza\s*sigma|pizza\s*sigma/i,
  title:'Кальянная'
 },
 {
  test:/altitude.*rooftop/i,
  title:'Ресторан на крыше'
 },
 {
  test:/happy\s*beach/i,
  title:'Пляжное кафе-клуб Happy Beach'
 },
 {
  test:/skylight/i,
  title:'Ресторан на крыше'
 },
 {
  test:/(?:^|\s)13\s*[-–—]\s*20(?:\s|$)/i,
  title:'Бар допоздна'
 },
 {
  test:/alibu\s*resort/i,
  title:'Дневной билет в 5★ отель Alibu Resort'
 },
 {
  test:/mia\s*resort/i,
  title:'Дневной билет в 5★ отель Mia Resort'
 },
 {
  test:/sen\s*spa.*premium|premium.*sen\s*spa/i,
  title:'Премиальный SPA'
 },
 {
  test:/happy\s*smile\s*coffee/i,
  title:'Кафе с видом'
 },
 {
  test:/kem\s*c[oơ]m\s*d[uư][aừ]|kem\s*com\s*dua/i,
  title:'Мороженое в кокосе'
 },
 {
  test:/nha\s*bar|nh[aà]\s*bar/i,
  title:'Ночной клуб (много русскоговорящих)'
 },
 {
  test:/railway\s*coffee/i,
  title:'Кофейня с поездом'
 },
 {
  test:/fly\s*nha\s*trang.*paragliding|fly.*paragliding/i,
  title:'Полёт на параплане / парамоторе'
 },
 {
  test:/m[-\s]*bar\s*sushi/i,
  title:'Суши на 25-м этаже'
 },
 {
  test:/khu\s*du\s*lich.*sinh|khu\s*du\s*lịch.*sinh/i,
  title:'Рыбалка на озере'
 },
 {
  test:/institute\s*of\s*okeanography|institute\s*of\s*oceanography|институт\s*океанограф/i,
  title:'Чудо-рыбы'
 },
 {
  test:/kong\s*forest/i,
  title:'Квадроциклы / зиплайн / рафтинг'
 },
 {
  test:/kdl\s*tau\s*ngam|kdl\s*t[aà]u\s*ng[aầ]m/i,
  title:'Подводная лодка на суше'
 },
 {
  test:/chua\s*tau\s*van|ch[uù]a\s*t[aà]u\s*v[aâ]n/i,
  title:'Лабиринт дракона'
 },
 {
  test:/lavash\s*brunch/i,
  title:'Бомбические сэндвичи'
 },
 {
  test:/diamond\s*bay.*day\s*pass|day\s*pass.*diamond\s*bay/i,
  title:'Дневной билет в 5★ отель Diamond Bay'
 },
 {
  test:/selectum\s*noa/i,
  title:'Дневной билет в 5★ отель Selectum Noa'
 },
 {
  test:/marriott/i,
  title:'Дневной билет в 5★ отель Marriott'
 },
 {
  test:/amiana/i,
  title:'Дневной билет в 5★ отель Amiana'
 },
 {
  test:/capybara|капибар/i,
  title:'Кафе с капибарами'
 }
];

function getPreviewTitle(place){
 const manualTitle=String(
  place?.previewTitle ||
  place?.preview_title ||
  ''
 ).trim();

 if(manualTitle){
  return manualTitle;
 }

 const searchable=[
  place?.id,
  place?.title,
  place?.name,
  place?.category,
  place?.subcategory,
  ...(place?.categories||[]),
  ...(place?.subcategories||[]),
  ...(place?.tags||[])
 ]
  .filter(Boolean)
  .join(' ');

 const rule=kmPreviewTitleRules.find(item=>
  item.test.test(searchable)
 );

 return rule?.title || place?.title || 'Локация';
}

/* KM PREVIEW TITLES V65 END */

function compactPlaceCard(p){
 const favorite=isFav(p.id);

 const hasRating=Number.isFinite(Number(p.rating));

 const ratingText=hasRating
  ? formatGoogleRating(p.rating)
  : '—';

 const reviewText=formatReviewCount(p.reviews);

 const areaText=
  p.area ||
  p.subcategory ||
  categoryNames[p.category] ||
  'Нячанг';

 const priceText=
  p.averageCheck ||
  p.price ||
  p.check ||
  p.averagePrice ||
  '';

 return`
  <button
   class="list-place favorite-compact-card compact-preview-v83"
   data-action="details"
   data-id="${escapeHtml(p.id)}"
   type="button"
  >
   <img
    src="${p.image||FALLBACK_IMAGE}"
    alt="${escapeHtml(getPreviewTitle(p))}"
    loading="lazy"
    decoding="async"
    style="
     object-fit:${p.imageFit||'cover'};
     object-position:${p.imagePosition||'center'};
    "
   >

   <span class="favorite-compact-copy compact-preview-copy-v83">

    <strong class="compact-preview-title-v83">
     ${escapeHtml(getPreviewTitle(p))}
    </strong>

    <span class="compact-preview-middle-v83">

     <span class="compact-preview-rating-v83">
      <span class="compact-preview-star-v83" aria-hidden="true">★</span>
      <b>${escapeHtml(ratingText)}</b>
      ${
       reviewText&&reviewText!=='—'
        ? `<span class="compact-preview-reviews-v83">(${escapeHtml(reviewText)})</span>`
        : ''
      }
     </span>

     <span class="compact-preview-area-v83">
      <span aria-hidden="true">⌖</span>
      ${escapeHtml(areaText)}
     </span>

    </span>

    ${
     priceText
      ? `<span class="compact-preview-price-v83">
          <span aria-hidden="true">₫</span>
          ${escapeHtml(priceText)}
         </span>`
      : ''
    }

   </span>

   <span
    class="list-heart ${favorite?'active':''}"
    data-action="favorite"
    data-id="${escapeHtml(p.id)}"
    role="button"
    tabindex="0"
    aria-label="${favorite?'Удалить из избранного':'Добавить в избранное'}"
   >${favorite?'♥':'♡'}</span>

  </button>
 `;
}

/* KM LIVE COUNT + COMPACT FAVORITES V56 END */

/* KM COMMUNITY TOTALS V57 START */

function getUniqueRealPlaces(){
 return[
  ...new Map(
   places
    .filter(place=>
     place &&
     place.id &&
     !place.archive &&
     place.kind!=='archive' &&
     place.kind!=='guide'
    )
    .map(place=>[String(place.id),place])
  ).values()
 ];
}

function formatCommunityTotal(value){
 return new Intl.NumberFormat('ru-RU').format(
  Math.max(0,Math.round(Number(value)||0))
 );
}

function updateCommunityTotals(){
 const realPlaces=getUniqueRealPlaces();

 const totalPlaces=realPlaces.length;

 const totalViews=realPlaces.reduce(
  (sum,place)=>sum+(Number(getViewCount(place))||0),
  0
 );

 const totalFavorites=realPlaces.reduce(
  (sum,place)=>sum+(Number(getFavoriteCount(place))||0),
  0
 );

 const placesNode=document.getElementById('communityPlaces');
 const viewsNode=document.getElementById('communityViews');
 const favoritesNode=document.getElementById('communityFavorites');

 if(placesNode){
  placesNode.textContent=formatCommunityTotal(totalPlaces);
 }

 if(viewsNode){
  viewsNode.textContent=formatCommunityTotal(totalViews);
 }

 if(favoritesNode){
  favoritesNode.textContent=formatCommunityTotal(totalFavorites);
 }

 return{
  places:totalPlaces,
  views:totalViews,
  favorites:totalFavorites
 };
}

let communityFirebaseRefreshRunning=false;

async function refreshCommunityFirebaseTotals(){
 if(communityFirebaseRefreshRunning)return;

 communityFirebaseRefreshRunning=true;

 try{
  const requests=[];

  if(window.KMViews?.getState){
   requests.push(
    window.KMViews.getState().then(state=>{
     const counts=state?.counts||{};

     Object.entries(counts).forEach(([placeId,count])=>{
      viewCounts.set(
       String(placeId),
       Math.max(0,Number(count)||0)
      );
     });
    })
   );
  }

  if(window.KMFavorites?.getState){
   requests.push(
    window.KMFavorites.getState().then(state=>{
     const counts=state?.counts||{};

     Object.entries(counts).forEach(([placeId,count])=>{
      favoriteCounts.set(
       String(placeId),
       Math.max(0,Number(count)||0)
      );
     });
    })
   );
  }

  await Promise.allSettled(requests);
  updateCommunityTotals();

 }catch(error){
  console.warn(
   '[Как Местный] Ошибка обновления общей статистики:',
   error
  );
 }finally{
  communityFirebaseRefreshRunning=false;
 }
}

function startCommunityTotals(){
 /*
   Сначала выводим данные, которые уже есть в карточках
   и загруженных Map.
 */
 updateCommunityTotals();

 /*
   Затем подтягиваем Firebase после полной загрузки модулей.
 */
 setTimeout(refreshCommunityFirebaseTotals,800);
 setTimeout(refreshCommunityFirebaseTotals,2500);

 /*
   Локальные изменения после просмотра или сердечка
   отражаются практически сразу.
 */
 setInterval(updateCommunityTotals,1000);

 /*
   Действия других пользователей подтягиваются онлайн.
 */
 setInterval(refreshCommunityFirebaseTotals,10000);
}

if(document.readyState==='loading'){
 document.addEventListener(
  'DOMContentLoaded',
  startCommunityTotals,
  {once:true}
 );
}else{
 startCommunityTotals();
}

/* KM COMMUNITY TOTALS V57 END */

function renderCards(){
 const list=filteredPlaces();
 const titles={all:'Лучшее для вас',food:'Еда и напитки',beach:'Пляжи',spa:'SPA, сауны и бани',views:'Локации',night:'Вечерний Нячанг',family:'С детьми',entertainment:'Развлечения',guide:'Памятки и инструкции',money:'Деньги и обмен',shopping:'Покупки и сувениры',connectivity:'Связь и интернет',airport:'Аэропорт',rules:'Правила и таможня',favorites:'Ваше избранное'};
 $('#sectionTitle').textContent=titles[active]||'Лучшее для вас';

 /*
   Счётчик пересчитывается при каждом рендере страницы.
 */
 updateTitleLocationCounter();

 /*
   Только для раздела «Избранное» включаем
   компактные горизонтальные карточки.
 */
 if(active==='favorites'){
  const uniqueFavorites=[
   ...new Map(
    list
     .filter(p=>p&&p.id)
     .map(p=>[String(p.id),p])
   ).values()
  ];

  $('#count').textContent=uniqueFavorites.length
   ? `${uniqueFavorites.length} ${locationWord(uniqueFavorites.length)}`
   : 'Сохранённых локаций пока нет';

  $('#grid').classList.add('favorites-compact-mode');

  $('#grid').innerHTML=uniqueFavorites.length
   ? `<div class="favorites-compact-list">${
      uniqueFavorites.map(compactPlaceCard).join('')
     }</div>`
   : `<div class="empty favorites-compact-empty">
      Здесь появятся места, которые вы добавите в избранное.
     </div>`;

  return;
 }

 /* KM HOME HORIZONTAL V60 */

 /*
   Главная подборка «Лучшее для вас» теперь использует
   тот же компактный горизонтальный формат, что и все разделы.
 */
 if(active==='all'){
  const uniqueHomePlaces=[
   ...new Map(
    list
     .filter(p=>p&&p.id)
     .map(p=>[String(p.id),p])
   ).values()
  ];

  $('#grid').classList.add('favorites-compact-mode');

  $('#count').textContent=uniqueHomePlaces.length
   ? `${uniqueHomePlaces.length} ${locationWord(uniqueHomePlaces.length)}`
   : 'Ничего не найдено';

  $('#grid').innerHTML=uniqueHomePlaces.length
   ? `<div class="favorites-compact-list home-compact-list">${
      uniqueHomePlaces.map(compactPlaceCard).join('')
     }</div>`
   : `<div class="empty favorites-compact-empty">
      По вашему запросу пока ничего не найдено.
     </div>`;

  return;
 }

 /*
   Любой открытый раздел показываем единым
   компактным горизонтальным списком.
 */
 const uniqueSectionPlaces=[
  ...new Map(
   list
    .filter(p=>p&&p.id)
    .map(p=>[String(p.id),p])
  ).values()
 ];

 $('#grid').classList.add('favorites-compact-mode');

 $('#count').textContent=uniqueSectionPlaces.length
  ? `${uniqueSectionPlaces.length} ${locationWord(uniqueSectionPlaces.length)}`
  : 'В этом разделе пока нет локаций';

 $('#grid').innerHTML=uniqueSectionPlaces.length
  ? `<div class="favorites-compact-list section-compact-list">${
     uniqueSectionPlaces.map(compactPlaceCard).join('')
    }</div>`
  : `<div class="empty favorites-compact-empty">
     В этом разделе пока нет подходящих локаций.
    </div>`;
}
function setFilter(v){active=v;$$('.chip').forEach(c=>c.classList.toggle('active',c.dataset.filter===v));renderCards();$('#places').scrollIntoView({behavior:'smooth'})}
function reset(){active='all';$('#searchInput').value='';$$('.chip').forEach(c=>c.classList.toggle('active',c.dataset.filter==='all'));renderCards()}

function escapeHtml(value){return String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}
function section(label,title,body){if(!body)return'';return `<section class="place-section"><div class="place-section-label">${label}</div>${title?`<h3>${title}</h3>`:''}${body}</section>`}
function listHtml(items,className=''){if(!items||!items.length)return'';return `<ul class="place-list ${className}">${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`}
function infoPanels(items){const clean=items.filter(x=>x&&x.value);if(!clean.length)return'';return `<div class="two-column">${clean.map(x=>`<div class="info-panel"><small>${escapeHtml(x.label)}</small><strong>${escapeHtml(x.value)}</strong></div>`).join('')}</div>`}
function menuHtml(block){if(!block||!block.items||!block.items.length)return'';return `<div class="menu-list">${block.items.map(item=>typeof item==='string'?`<div class="menu-item"><strong>${escapeHtml(item)}</strong></div>`:`<div class="menu-item ${item.url?'has-link':''}" ${item.url?`data-open-url="${escapeHtml(item.url)}" role="button" tabindex="0"`:''}><strong>${escapeHtml(item.name)}</strong>${item.price?`<span>${escapeHtml(item.price)}</span>`:''}${item.note?`<small>${escapeHtml(item.note)}</small>`:''}</div>`).join('')}</div>`}
function galleryHtml(p){if(!p.gallery?.length)return'';return `<div class="detail-gallery">${p.gallery.map((src,i)=>`<button type="button" data-gallery-src="${src}" aria-label="Открыть фото ${i+1}"><img src="${src}" alt="${escapeHtml(getPreviewTitle(p))} — фото ${i+1}" loading="lazy"></button>`).join('')}</div>`}
function actionsHtml(p){if(!p.actions?.length)return'';return `<div class="partner-actions">${p.actions.map(a=>`<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.label)}</a>`).join('')}</div>`}
function nearbyHtml(items){if(!items||!items.length)return'';return `<div class="nearby-list">${items.map(item=>`<div class="nearby-item"><strong>${escapeHtml(item.title||item)}</strong>${item.distance?`<span>${escapeHtml(item.distance)}</span>`:''}</div>`).join('')}</div>`}
function detailCell(label,body,wide=false){if(!body)return'';return `<section class="detail-cell ${wide?'wide':''}"><small>${escapeHtml(label)}</small>${body}</section>`}
function formatGoogleReviews(value){
 if(value==null)return'Нет отзывов';

 if(typeof value==='number'&&Number.isFinite(value)){
  const count=Math.round(value);
  if(count<=0)return'Нет отзывов';
  if(count<1000)return`${count.toLocaleString('ru-RU')} отзывов`;

  const thousands=count/1000;
  const formatted=(Math.round(thousands*10)/10).toLocaleString('ru-RU',{
   minimumFractionDigits:Number.isInteger(thousands)?0:1,
   maximumFractionDigits:1
  });

  return`${formatted} тыс. отзывов`;
 }

 const text=String(value).trim();

 if(!text)return'Нет отзывов';

 const normalized=text
  .replace(/\u00a0/g,' ')
  .replace(/,/g,'.');

 const thousandsMatch=normalized.match(/(\d+(?:\.\d+)?)\s*тыс/i);

 if(thousandsMatch){
  const thousands=Number(thousandsMatch[1]);

  if(Number.isFinite(thousands)&&thousands>0){
   return`${thousands.toLocaleString('ru-RU',{
    minimumFractionDigits:Number.isInteger(thousands)?0:1,
    maximumFractionDigits:1
   })} тыс. отзывов`;
  }
 }

 const digits=normalized.match(/\d[\d\s.]*/);

 if(!digits)return'Нет отзывов';

 const count=Number(
  digits[0]
   .replace(/\s/g,'')
   .replace(/\./g,'')
 );

 if(!Number.isFinite(count)||count<=0)return'Нет отзывов';

 if(count<1000)return`${count.toLocaleString('ru-RU')} отзывов`;

 const thousands=count/1000;
 const formatted=(Math.round(thousands*10)/10).toLocaleString('ru-RU',{
  minimumFractionDigits:Number.isInteger(thousands)?0:1,
  maximumFractionDigits:1
 });

 return`${formatted} тыс. отзывов`;
}

function formatGoogleRating(value){
 const rating=Number(value);
 if(!Number.isFinite(rating))return'—';
 return rating.toLocaleString('ru-RU',{
  minimumFractionDigits:1,
  maximumFractionDigits:1
 });
}

const categoryNames={
 food:'Еда и напитки',
 coffee:'Кофе и десерты',
 beach:'Пляжи',
 spa:'SPA, сауны и бани',
 views:'Локации',
 night:'Вечерний Нячанг',
 family:'С детьми',
 entertainment:'Развлечения',
 guide:'Памятки и инструкции',
 money:'Деньги',
 connectivity:'Связь и интернет',
 airport:'Аэропорт',
 transport:'Транспорт',
 shopping:'Покупки',
 medical:'Медицина',
 resort:'Отели и курорты',
 pool:'Бассейны',
 waterpark:'Аквапарки',
 luxury:'Премиальный отдых',
 'luxury-day':'Day Pass',
 food:'Еда и напитки',
 rules:'Правила и таможня',
 sos:'SOS'
};

function renderPlaceHeader(p){
 const category=categoryNames[p.category]||p.category||'Локация';
 const placeType=p.subcategory||category;
 const rawAverageCheck=
  p.averageCheck||
  p.price||
  p.check||
  p.averagePrice||
  '';

 const averageCheck=
  typeof rawAverageCheck==='string' &&
  rawAverageCheck.trim() &&
  !/^d+$/i.test(rawAverageCheck.trim())
   ? rawAverageCheck.trim()
   : '';

 const hasRating=Number.isFinite(Number(p.rating));
 const rating=hasRating?formatGoogleRating(p.rating):'—';
 const reviews=hasRating?formatGoogleReviews(p.reviews):'Без отзывов';

 const views=getViewCount(p);

 const favoritesCount=getFavoriteCount(p);

 const formatCount=value=>
  new Intl.NumberFormat('ru-RU').format(
   Number.isFinite(Number(value)) ? Number(value) : 0
  );

 return`
 <div class="modal-title-main">
  <h2 id="modalTitle">${escapeHtml(p.title)}</h2>

  <div class="google-rating-line">
   <span class="google-star" aria-hidden="true">★</span>
   <span class="google-rating-value">${escapeHtml(rating)}</span>
   <span class="google-review-count">(${escapeHtml(reviews)})</span>
  </div>

  <div class="modal-social-stats" aria-label="Популярность локации">
   <span class="modal-social-stat modal-view-stat">
    <svg class="modal-stat-eye" viewBox="0 0 24 16" aria-hidden="true">
     <path class="modal-stat-eye-shape" d="M1.5 8C4.2 3.8 7.7 1.7 12 1.7S19.8 3.8 22.5 8C19.8 12.2 16.3 14.3 12 14.3S4.2 12.2 1.5 8Z"/>
     <circle class="modal-stat-eye-iris" cx="12" cy="8" r="3.15"/>
     <circle class="modal-stat-eye-pupil" cx="12" cy="8" r="1.15"/>
    </svg>
    <strong id="modalViewCount">${formatCount(views)}</strong>
   </span>

   <span class="modal-social-stat modal-favorite-stat">
    <svg class="modal-stat-heart" viewBox="0 0 24 22" aria-hidden="true">
     <defs>
      <linearGradient id="kmHeartGradient" x1="5" y1="2" x2="18" y2="20">
       <stop offset="0%" stop-color="#ff8798"/>
       <stop offset="42%" stop-color="#ff526d"/>
       <stop offset="100%" stop-color="#d91f49"/>
      </linearGradient>
      <filter id="kmHeartShadow" x="-40%" y="-40%" width="180%" height="180%">
       <feDropShadow dx="0" dy="1.4" stdDeviation="1.35" flood-color="#ff3157" flood-opacity=".42"/>
      </filter>
     </defs>
     <path class="modal-stat-heart-shape" filter="url(#kmHeartShadow)" fill="url(#kmHeartGradient)" d="M12 20.2 3.7 12.5C-1.3 7.9 1.4 1.5 6.6 1.5c2.4 0 4.3 1.3 5.4 3 1.1-1.7 3-3 5.4-3 5.2 0 7.9 6.4 2.9 11L12 20.2Z"/>
     <path class="modal-stat-heart-highlight" d="M6.2 4.2c1.3-.7 2.9-.3 3.8.8"/>
    </svg>
    <strong
     id="modalFavoriteCount"
     data-base-count="${favoritesCount}"
    >${formatCount(favoritesCount)}</strong>
   </span>
  </div>
 </div>

 <div class="modal-place-type">
  <div class="modal-place-type-block">
   <span class="modal-place-type-label">Тип локации</span>
   <strong>${escapeHtml(placeType)}</strong>
  </div>

  ${averageCheck?`
  <div class="modal-average-check">
   <span class="modal-average-check-label">Средний чек</span>
   <strong>${escapeHtml(averageCheck)}</strong>
  </div>`:''}
 </div>`;
}

function renderPlaceContent(p){
 const menu=menuHtml(p.categoryBlock);
 const gallery=galleryHtml(p);

 const practical=infoPanels([
  {label:'Лучшее время',value:p.time},
  {label:'Сколько заложить',value:p.duration},
  {label:'Кому подходит',value:p.aud},
  {label:'Атмосфера',value:p.atmosphere},
  {label:'Средний чек / стоимость',value:p.price},
  {label:'Район',value:p.area},
  {label:'Адрес',value:p.address},
  {label:'Расписание',value:p.schedule},
  {label:'Контакты',value:p.contacts}
 ]);

 const reason=listHtml(p.whyIncluded);

 const important=`${
  p.pros?.length
   ?'<strong class="detail-subtitle detail-subtitle-positive">Плюсы</strong>'+listHtml(p.pros)
   :''
 }${
  p.important?.length
   ?'<strong class="detail-subtitle detail-subtitle-warning">Важно знать</strong>'+listHtml(p.important,'warn')
   :''
 }`;

 return`<div class="detail-grid">
  ${detailCell(
   'Цель',
   `<p>${escapeHtml(p.choiceAdvice||p.description||'')}</p>`,
   true
  )}
  ${detailCell('Причина',reason)}
  ${detailCell(
   'Совет от местного',
   `<p>${escapeHtml(p.localAdvice||'')}</p>`
  )}
  ${menu
   ?detailCell(p.categoryBlock?.title||'Что выбрать',menu,true)
   :''
  }
  ${gallery
   ?detailCell('Фотографии и материалы',gallery,true)
   :''
  }
  ${important
   ?detailCell('Плюсы и важно знать',important,true)
   :''
  }
  ${practical
   ?detailCell('Практическая информация',practical,true)
   :''
  }
 </div>
 ${p.sourceStatus
  ?`<div class="detail-source">${escapeHtml(p.sourceStatus)}</div>`
  :''
 }`;
}

function renderPlaceFooter(p){
 const hasRoute=Boolean(
  p.mapPoints?.length||
  p.mapUrl||
  (Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)))
 );

 const favorite=isFav(p.id);

 return`<div class="modal-fixed-actions">
  <button
   class="modal-route-button${hasRoute?'':' is-disabled'}"
   data-action="${hasRoute?'route':'none'}"
   data-id="${p.id}"
   ${hasRoute?'':'disabled'}
   aria-label="${hasRoute?'Проложить маршрут':'Маршрут недоступен'}"
  >
   <span class="modal-route-icon" aria-hidden="true">↗</span>
   <span>${hasRoute?'Проложить маршрут':'Маршрут недоступен'}</span>
  </button>

  <button
   class="modal-fav ${favorite?'active':''}"
   data-action="favorite"
   data-id="${p.id}"
   aria-label="${favorite?'Удалить из избранного':'Добавить в избранное'}"
  >${favorite?'♥':'♡'}</button>
 </div>`;
}

function lockBody(){
 if(document.body.classList.contains('is-locked'))return;
 lockedScrollY=window.scrollY;
 document.body.style.position='fixed';
 document.body.style.top=`-${lockedScrollY}px`;
 document.body.style.width='100%';
 document.body.classList.add('is-locked');
}
function unlockBody(){
 if(!document.body.classList.contains('is-locked'))return;
 document.body.classList.remove('is-locked');
 document.body.style.position='';
 document.body.style.top='';
 document.body.style.width='';
 window.scrollTo(0,lockedScrollY);
}

function applyMobileModalLayout(){
 if(!window.matchMedia('(max-width:680px)').matches)return;

 const modal=$('#modal');
 const sheet=modal?.querySelector('.compact-sheet');
 const picture=modal?.querySelector('.sheetpic');
 const image=$('#mimg');
 const header=$('#modalPlaceHeader');
 const title=$('#modalTitle');
 const content=$('#modalContent');
 const footer=$('#modalPlaceFooter');

 if(!modal||!sheet||!picture||!image||!header||!content||!footer)return;

 const important=(element,property,value)=>{
  element.style.setProperty(property,value,'important');
 };

 /* Внешний экран */
 important(modal,'position','fixed');
 important(modal,'inset','0');
 important(modal,'width','100%');
 important(modal,'height','100dvh');
 important(modal,'padding','8px');
 important(modal,'box-sizing','border-box');
 important(modal,'align-items','center');
 important(modal,'justify-content','center');
 important(modal,'overflow','hidden');

 /* Tiffany-рамка целиком внутри экрана */
 important(sheet,'position','relative');
 important(sheet,'display','grid');
 important(
  sheet,
  'grid-template-rows',
  'minmax(175px,24dvh) auto minmax(0,1fr) auto'
 );
 important(sheet,'width','100%');
 important(sheet,'max-width','430px');
 important(sheet,'height','calc(100dvh - 16px)');
 important(sheet,'min-height','0');
 important(sheet,'max-height','calc(100dvh - 16px)');
 important(sheet,'margin','0');
 important(sheet,'overflow','hidden');
 important(sheet,'border','2px solid #39d2c0');
 important(sheet,'border-radius','24px');
 important(sheet,'background','#151819');
 important(sheet,'transform','none');

 /* Фото — полностью, без cover */
 important(picture,'position','relative');
 important(picture,'display','block');
 important(picture,'width','100%');
 important(picture,'height','100%');
 important(picture,'min-height','0');
 important(picture,'max-height','none');
 important(picture,'margin','0');
 important(picture,'padding','0');
 important(picture,'overflow','hidden');
 important(picture,'border-radius','22px 22px 0 0');
 important(picture,'background','#080a0b');

 important(image,'display','block');
 important(image,'width','100%');
 important(image,'height','100%');
 important(image,'max-width','100%');
 important(image,'max-height','100%');
 important(image,'margin','0');
 important(image,'padding','0');
 important(image,'object-fit','contain');
 important(image,'object-position','center center');
 important(image,'border-radius','22px 22px 0 0');
 important(image,'background','#080a0b');
 important(image,'transform','none');

 /* Блок названия */
 important(header,'display','block');
 important(header,'width','100%');
 important(header,'min-width','0');
 important(header,'height','auto');
 important(header,'min-height','0');
 important(header,'max-height','none');
 important(header,'padding','12px 14px 10px');
 important(header,'margin','0');
 important(header,'overflow','visible');
 important(header,'box-sizing','border-box');
 important(header,'background','#151819');

 /* Оригинальное название — перенос на две строки */
 if(title){
  important(title,'display','-webkit-box');
  important(title,'width','100%');
  important(title,'min-width','0');
  important(title,'max-width','100%');
  important(title,'height','auto');
  important(title,'min-height','2.3em');
  important(title,'max-height','2.3em');
  important(title,'margin','0 0 8px');
  important(title,'padding','0');
  important(title,'white-space','normal');
  important(title,'overflow','hidden');
  important(title,'text-overflow','ellipsis');
  important(title,'word-break','normal');
  important(title,'overflow-wrap','anywhere');
  important(title,'-webkit-box-orient','vertical');
  important(title,'-webkit-line-clamp','2');
  important(title,'font-size','22px');
  important(title,'line-height','1.15');
 }

 /* Прокручивается только информация */
 important(content,'display','block');
 important(content,'width','100%');
 important(content,'min-width','0');
 important(content,'height','auto');
 important(content,'min-height','0');
 important(content,'max-height','none');
 important(content,'margin','0');
 important(content,'padding','4px 14px 92px');
 important(content,'overflow-x','hidden');
 important(content,'overflow-y','auto');
 important(content,'overscroll-behavior','contain');
 important(content,'-webkit-overflow-scrolling','touch');
 important(content,'box-sizing','border-box');

 /* Нижние кнопки остаются внутри рамки */
 important(footer,'position','relative');
 important(footer,'left','auto');
 important(footer,'right','auto');
 important(footer,'bottom','auto');
 important(footer,'width','100%');
 important(footer,'min-width','0');
 important(footer,'margin','0');
 important(footer,'padding','8px 12px 10px');
 important(footer,'box-sizing','border-box');
 important(footer,'background','#151819');
 important(footer,'border-top','1px solid rgba(255,255,255,.08)');
 important(footer,'z-index','70');
}

function openModal(id){
 const p=[...places,...sourceArchive].find(x=>x.id===id);if(!p)return;
 lastFocusedElement=document.activeElement;
 selectedId=id;
 const modal=$('#modal');
 $('#mimg').src=p.image||FALLBACK_IMAGE;
 $('#mimg').alt=getPreviewTitle(p);
 $('#mimg').style.setProperty('object-fit','cover','important');
 $('#mimg').style.objectPosition=p.imagePosition||'center';
 $('#mimg').classList.remove('contain-photo');
 $('#modalSeal').hidden=false;
 $('#modalChoiceBadge').hidden=true;
 $('#modalPlaceHeader').innerHTML=renderPlaceHeader(p);
 $('#modalContent').innerHTML=renderPlaceContent(p);
 $('#modalPlaceFooter').innerHTML=renderPlaceFooter(p);
 modal.classList.remove('closing');
 modal.classList.add('open');
 modal.setAttribute('aria-hidden','false');
 lockBody();

 requestAnimationFrame(()=>{
  modal.querySelector('.sheet')?.focus({
   preventScroll:true
  });

  registerPlaceView(id);
 });
}
function closeModal(){
 const modal=$('#modal');

 if(!modal.classList.contains('open')){
  return;
 }

 const focusedInside=
  modal.contains(document.activeElement);

 if(focusedInside){
  document.activeElement?.blur?.();
 }

 modal.classList.remove('open','closing');
 modal.setAttribute('aria-hidden','true');

 requestAnimationFrame(()=>{
  unlockBody();

  requestAnimationFrame(()=>{
   lastFocusedElement?.focus?.({
    preventScroll:true
   });
  });
 });
}
function routeTo(id){
 const p=[...places,...sourceArchive].find(x=>x.id===id);
 if(!p){toast('Локация не найдена');return}

 if(p.mapPoints?.length){
  openGroupMap(p);
  return;
 }

 const lat=Number(p.lat);
 const lng=Number(p.lng);

 if(
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  !(lat===0 && lng===0)
 ){
  window.open(
   `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
   '_blank',
   'noopener,noreferrer'
  );
  return;
 }

 if(p.mapUrl){
  window.open(p.mapUrl,'_blank','noopener,noreferrer');
  return;
 }

 toast('Маршрут пока не добавлен');
}
function openGroupMap(p){
 closeModal();openOverlay('map');initMap();
 const group=L.featureGroup();
 p.mapPoints.forEach((point,i)=>{const marker=L.marker([point.lat,point.lng],{icon:markerIcon(false)}).addTo(map);marker.bindPopup(`<div class="km-point-popup"><strong>${escapeHtml(point.name)}</strong><a href="${escapeHtml(point.url)}" target="_blank" rel="noopener noreferrer">Открыть маршрут в Google Maps</a></div>`);group.addLayer(marker)});
 if(group.getLayers().length)map.fitBounds(group.getBounds().pad(.2),{maxZoom:15});
 $('#mapCard').classList.remove('open');
}
function openOverlay(type){
 const el=type==='map'?$('#mapOverlay'):$('#listOverlay');

 if(type==='map'){
  selectedId=null;

  const card=$('#mapCard');
  if(card){
   card.classList.remove('open');
   card.dataset.placeId='';
  }
 }
 lastFocusedElement=document.activeElement;
 el.classList.add('open');
 el.setAttribute('aria-hidden','false');
 lockBody();
 setNav(type);
 if(type==='map'){
  initMap();

  const refreshMobileMap=()=>{
   if(!map)return;

   map.invalidateSize(true);

  
 /* Один независимый самолётик геолокации */
 document
  .querySelectorAll(
   '#kmLocationButton, .km-location-control, .km-location-button'
  )
  .forEach(element=>element.remove());

 const mapOverlayElement=document.querySelector('#mapOverlay');

 if(mapOverlayElement){
  const locationButton=document.createElement('button');

  locationButton.id='kmLocationButton';
  locationButton.className='km-map-airplane-button';
  locationButton.type='button';
  locationButton.title='Моё местоположение';
  locationButton.setAttribute(
   'aria-label',
   'Показать моё местоположение'
  );

  locationButton.innerHTML=`
   <svg
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
   >
    <path
     class="km-plane-main"
     d="
      M32 2
      C29.9 2 28.7 4.1 28.3 7.3
      L26.3 23.8
      L7.4 34.2
      C5.4 35.3 4.7 37.4 5.8 39
      C6.8 40.5 8.5 40.8 10.4 40.2
      L25.8 35.9
      L27.3 47.7
      L20.2 54.3
      C18.8 55.6 18.7 57.5 19.8 58.8
      C20.8 60 22.7 60.1 24.1 59.2
      L32 54.6
      L39.9 59.2
      C41.3 60.1 43.2 60 44.2 58.8
      C45.3 57.5 45.2 55.6 43.8 54.3
      L36.7 47.7
      L38.2 35.9
      L53.6 40.2
      C55.5 40.8 57.2 40.5 58.2 39
      C59.3 37.4 58.6 35.3 56.6 34.2
      L37.7 23.8
      L35.7 7.3
      C35.3 4.1 34.1 2 32 2
      Z
     "
    />
    <path
     class="km-plane-line"
     d="
      M32 8 L32 49
      M26.7 31.4 L37.3 31.4
      M28.1 49.2 L35.9 49.2
     "
    />
   </svg>
  `;

  locationButton.addEventListener(
   'click',
   event=>{
    event.preventDefault();
    event.stopPropagation();
    locateMapUser();
   }
  );

  mapOverlayElement.appendChild(locationButton);
 }

 const mappedPlaces=places.filter(place=>
    Number.isFinite(place.lat)&&
    Number.isFinite(place.lng)
   );

   markers.forEach(marker=>{
    if(marker&&!map.hasLayer(marker)){
     marker.addTo(map);
    }
   });

   if(mappedPlaces.length){
    const visibleCityPlaces=mappedPlaces.filter(place=>
     place.lat>=12.18&&
     place.lat<=12.32&&
     place.lng>=109.14&&
     place.lng<=109.26
    );

    const targetPlaces=
     visibleCityPlaces.length
      ? visibleCityPlaces
      : mappedPlaces;

    map.fitBounds(
     targetPlaces.map(place=>[
      place.lat,
      place.lng
     ]),
     {
      padding:[30,30],
      maxZoom:13
     }
    );
   }
  };

  requestAnimationFrame(refreshMobileMap);
  setTimeout(refreshMobileMap,120);
  setTimeout(refreshMobileMap,400);
 }
 else{
  catalogState={
   category:null,
   subcategory:null
  };
  renderCatalog();
 }
 el.querySelector('.close-overlay')?.focus({preventScroll:true});
}
function closeOverlay(type){
 const el=type==='map'?$('#mapOverlay'):$('#listOverlay');
 if(!el.classList.contains('open'))return;
 el.classList.remove('open');
 el.setAttribute('aria-hidden','true');
 unlockBody();
 setNav('home');
 lastFocusedElement?.focus?.({preventScroll:true});
}
function setNav(v){$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.nav===v))}
function markerIcon(favorite){return L.divIcon({className:'',html:`<div class="km-marker ${favorite?'favorite':''}"></div>`,iconSize:[32,32],iconAnchor:[16,31]})}
let userLocationMarker=null;
let userAccuracyCircle=null;

function distanceKm(lat1,lng1,lat2,lng2){
 const earthRadiusKm=6371;
 const toRad=value=>value*Math.PI/180;
 const dLat=toRad(lat2-lat1);
 const dLng=toRad(lng2-lng1);

 const a=
  Math.sin(dLat/2)*Math.sin(dLat/2)+
  Math.cos(toRad(lat1))*
  Math.cos(toRad(lat2))*
  Math.sin(dLng/2)*
  Math.sin(dLng/2);

 return earthRadiusKm*2*Math.atan2(
  Math.sqrt(a),
  Math.sqrt(1-a)
 );
}

function locateMapUser(){
 if(!navigator.geolocation){
  toast('Геолокация не поддерживается');
  return;
 }

 

 navigator.geolocation.getCurrentPosition(
  position=>{
   const lat=position.coords.latitude;
   const lng=position.coords.longitude;
   const accuracy=Math.max(
    Number(position.coords.accuracy)||0,
    20
   );

   if(userLocationMarker){
    map.removeLayer(userLocationMarker);
   }

   if(userAccuracyCircle){
    map.removeLayer(userAccuracyCircle);
   }

   userAccuracyCircle=L.circle(
    [lat,lng],
    {
     radius:accuracy,
     color:'#39d2c0',
     weight:1,
     fillColor:'#39d2c0',
     fillOpacity:.12
    }
   ).addTo(map);

   const userIcon=L.divIcon({
    className:'km-user-location-pin',
    html:`
      <div class="km-user-pin">
        <div class="km-user-pin-dot"></div>
      </div>
    `,
    iconSize:[28,40],
    iconAnchor:[14,40],
    popupAnchor:[0,-34]
   });

   userLocationMarker=L.marker(
    [lat,lng],
    {icon:userIcon}
   )
    .addTo(map)
    .bindPopup(
      '<strong>📍 Я здесь</strong><br>Ваше текущее местоположение'
    );

   const nearby=places.filter(place=>
    Number.isFinite(place.lat)&&
    Number.isFinite(place.lng)&&
    distanceKm(lat,lng,place.lat,place.lng)<=2
   );

   if(nearby.length){
    const bounds=L.latLngBounds([
     [lat,lng],
     ...nearby.map(place=>[place.lat,place.lng])
    ]);

    map.flyToBounds(
     bounds.pad(.2),
     {
      maxZoom:15,
      duration:1.1
     }
    );

    toast(
     `Рядом найдено: ${nearby.length} ${
      nearby.length===1?'место':'мест'
     }`
    );
   }else{
    map.flyTo(
     [lat,lng],
     15,
     {
      animate:true,
      duration:1.1
     }
    );

    toast('Показываем район рядом с вами');
   }
  },
  error=>{
   const messages={
    1:'',
    2:'Не удалось определить местоположение',
    3:'Определение местоположения заняло слишком много времени'
   };

   const message=messages[error.code]||'Ошибка определения местоположения';
   if(message)toast(message);
  },
  {
   enableHighAccuracy:true,
   timeout:12000,
   maximumAge:60000
  }
 );
}

function initMap(){
 if(map)return;

 map=L.map(
  'map',
  {
   zoomControl:false
  }
 ).setView(
  [12.2388,109.1965],
  13
 );

 L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
   maxZoom:19,
   attribution:'© OpenStreetMap'
  }
 ).addTo(map);

 L.control.zoom({
  position:'bottomright'
 }).addTo(map);

 /* Один контрол геолокации без дублей */
 document
  .querySelectorAll('.km-location-control')
  .forEach(element=>element.remove());


 const mappedPlaces=places.filter(place=>
  Number.isFinite(place.lat)&&
  Number.isFinite(place.lng)
 );

 mappedPlaces.forEach(place=>{
  const marker=L.marker(
   [place.lat,place.lng],
   {
    icon:markerIcon(isFav(place.id))
   }
  )
   .addTo(map)
   .on(
    'click',
    ()=>showMapCard(place.id)
   );

  markers.set(place.id,marker);
 });

 if(mappedPlaces.length){
  const cityPlaces=mappedPlaces.filter(place=>
   place.lat>=12.18&&
   place.lat<=12.32&&
   place.lng>=109.14&&
   place.lng<=109.26
  );

  if(cityPlaces.length){
   map.fitBounds(
    cityPlaces.map(place=>[
     place.lat,
     place.lng
    ]),
    {
     padding:[35,35],
     maxZoom:13
    }
   );
  }
 }
}
function updateMapMarkers(){markers.forEach((m,id)=>m.setIcon(markerIcon(isFav(id))))}
function showMapCard(id){selectedId=id;updateMapCard();$('#mapCard').classList.add('open');const p=places.find(x=>x.id===id);map.panTo([p.lat,p.lng],{animate:true})}
function updateMapCard(){const p=[...places,...sourceArchive].find(x=>x.id===selectedId);if(!p)return;$('#mapCardImage').src=p.image||FALLBACK_IMAGE;$('#mapCardTitle').textContent=getPreviewTitle(p);$('#mapCardDesc').textContent=p.description;$('#mapCardRating').textContent=`★ ${p.rating}`;$('#mapCardArea').textContent=p.area;$('#mapFav').textContent=isFav(p.id)?'♥':'♡';$('#mapFav').classList.toggle('active',isFav(p.id))}

let catalogState={category:null,subcategory:null};
function catalogGroups(){
 const groups={};

 /*
   Единственные карточки денежного раздела,
   которые показываем в каталоге «Все места».
 */
 const moneyCatalogIds=new Set([
   'money-exchange-nha-trang',
   'vrb-atms',
   'alex-exchange'
 ]);

 const moneyFolder='Обмен валюты и снятие наличных с карт РФ';

 /*
   Защита от повторного добавления одной карточки.
 */
 const addedMoneyIds=new Set();

 [...places,...sourceArchive].forEach(p=>{

   const memo=isMemoCard(p);

   /*
     Раздел «Памятки и инструкции» полностью удалён
     из структуры каталога.

     Старые guide/archive-карточки больше
     не создают собственный раздел и подразделы.
   */
   if(memo&&!moneyCatalogIds.has(p.id)){
     return;
   }

   /*
     Все объекты категории money обрабатываем отдельно,
     чтобы не создавать старые подразделы:
     «Деньги», «Банкоматы», «Обмен валюты» и другие.
   */
   const belongsToMoney=
     p.category==='money'||
     p.categories?.includes('money')||
     moneyCatalogIds.has(p.id);

   if(belongsToMoney){

     /*
       В итоговый денежный подраздел попадают
       только три подтверждённые карточки.
     */
     if(!moneyCatalogIds.has(p.id)){
       return;
     }

     groups.money??={};
     groups.money[moneyFolder]??=[];

     if(!addedMoneyIds.has(p.id)){
       groups.money[moneyFolder].push(p);
       addedMoneyIds.add(p.id);
     }

     return;
   }

   /*
     Все остальные обычные категории работают
     по прежней логике.

     Служебную категорию guide исключаем,
     чтобы «Памятки и инструкции» не появились снова.
   */
   const categories=(
     p.categories?.length
       ? p.categories
       : [p.category]
   ).filter(cat=>cat&&cat!=='guide'&&cat!=='money');

   const subs=p.subcategories?.length
     ? p.subcategories
     : [p.subcategory||'Без подраздела'];

   categories.forEach(cat=>{
     groups[cat]??={};

     subs.forEach(sub=>{
       groups[cat][sub]??=[];

       if(!groups[cat][sub].some(x=>x.id===p.id)){
         groups[cat][sub].push(p);
       }
     });
   });
 });

 return groups;
 const mapCard=$('#mapCard');

 mapCard.onclick=event=>{
  if(
   event.target.closest('#mapRoute')||
   event.target.closest('#mapFav')||
   event.target.closest('#mapDetails')
  ){
   return;
  }

  openModal(id);
 };
}
function renderCatalog(){const groups=catalogGroups();const root=$('#catalog');
 if(!catalogState.category){
  const locationWord=count=>{
    const mod10=count%10;
    const mod100=count%100;

    if(mod10===1&&mod100!==11)return'локация';
    if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return'локации';
    return'локаций';
  };

  root.innerHTML=`
    <h2 class="catalog-level-title">Разделы</h2>
    <div class="catalog-grid">
      ${Object.entries(groups).map(([cat,subs])=>{
        /*
          Считаем только уникальные карточки.
          Если одна локация входит в пять подразделов,
          на карточке основного раздела она считается один раз.
        */
        const uniqueIds=new Set(
          Object.values(subs)
            .flat()
            .filter(p=>p&&p.id)
            .map(p=>p.id)
        );

        const count=uniqueIds.size;

        return `
          <button class="catalog-tile" data-catalog-category="${cat}">
            <strong>${escapeHtml(categoryNames[cat]||cat)}</strong>
            <small>${count} ${locationWord(count)}</small>
          </button>
        `;
      }).join('')}
    </div>
  `;

  return;
}
 
const subs=groups[catalogState.category]||{};

/* KM FAMILY SEMANTIC V53 START */
if(catalogState.category==='family'){
  const semantic={
    'Детские игровые комнаты':[],
    'Развлечения с детьми':[],
    'До 7 лет':[],
    '7–12 лет':[],
    'Аквапарки':[],
    'Контактные животные':[],
    'Кафе с животными':[],
    'Мороженое и десерты':[],
    'Парки и прогулки':[],
    'Семейные пляжи':[]
  };

  /*
    Берём только полноценные карточки мест.
    Архивные статьи, памятки, новости и цитаты исключаем.
  */
  const familyPlaces=places.filter(p=>{
    if(
      !p ||
      p.archive ||
      p.kind==='archive' ||
      p.kind==='guide'
    ){
      return false;
    }

    const categories=[
      p.category,
      ...(p.categories||[])
    ]
      .filter(Boolean)
      .map(value=>
        String(value)
          .toLowerCase()
          .replace(/ё/g,'е')
      );

    const t=[
      p.id,
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.choiceAdvice,
      p.atmosphere,
      p.area,
      p.address,
      p.aud,
      p.audience,
      p.bestTime,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[]),
      ...(p.whyIncluded||[]),
      ...(p.pros||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    const categoryMatch=categories.some(value=>
      value==='family' ||
      value==='kids' ||
      value==='children' ||
      value==='waterpark' ||
      value==='beach' ||
      value==='entertainment'
    );

    const semanticMatch=
      /с\s+детьми|для\s+детей|семейн|ребен|детск|kids?|children|family|игров\w*\s+(?:комнат|центр|площад)|аквапарк|waterpark|зоопарк|животн|ферм|мор...|десерт|морожен|парк|прогул|семейн\w*\s+пляж/.test(t);

    return categoryMatch||semanticMatch;
  });

  const add=(section,p)=>{
    if(!semantic[section]||!p?.id)return;

    if(!semantic[section].some(item=>item.id===p.id)){
      semantic[section].push(p);
    }
  };

  const searchable=p=>[
    p.id,
    getPreviewTitle(p),
    p.name,
    p.category,
    p.subcategory,
    p.description,
    p.shortDescription,
    p.fullDescription,
    p.choiceAdvice,
    p.atmosphere,
    p.area,
    p.address,
    p.aud,
    p.audience,
    p.bestTime,
    ...(p.categories||[]),
    ...(p.subcategories||[]),
    ...(p.tags||[]),
    ...(p.searchKeywords||[]),
    ...(p.whyIncluded||[]),
    ...(p.pros||[])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/ё/g,'е');

  familyPlaces.forEach(p=>{
    const t=searchable(p);

    /*
      1. ДЕТСКИЕ ИГРОВЫЕ КОМНАТЫ
    */
    if(
      /детск\w*\s+(?:игров\w*\s+)?комнат|игров\w*\s+комнат|детск\w*\s+центр|развлекательн\w*\s+центр\s+для\s+детей|indoor\s+playground|kids?\s+(?:room|club|play\s*area)|playroom/.test(t)
    ){
      add('Детские игровые комнаты',p);
    }

    /*
      2. РАЗВЛЕЧЕНИЯ С ДЕТЬМИ
      Общая семейная активность.
    */
    if(
      /развлечен\w*\s+с\s+детьми|для\s+детей|с\s+детьми|семейн\w*\s+развлеч|family\s+(?:activity|activities|entertainment)|kids?\s+activity|детск\w*\s+развлеч/.test(t)
    ){
      add('Развлечения с детьми',p);
    }

    /*
      3. ДО 7 ЛЕТ
    */
    if(
      /до\s*7\s*лет|до\s*семи\s*лет|малыш|дошколь|дети\s*[0-6]\s*лет|0\s*[-–]\s*7|1\s*[-–]\s*6|toddlers?|preschool|under\s*7|маленьк\w*\s+дет/.test(t)
    ){
      add('До 7 лет',p);
    }

    /*
      4. 7–12 ЛЕТ
    */
    if(
      /7\s*[-–]\s*12|от\s*7\s*до\s*12|7\s*до\s*12|школьник|младш\w*\s+школьн|school[-\s]?age|ages?\s*7\s*[-–]\s*12|дети\s+старше\s+7/.test(t)
    ){
      add('7–12 лет',p);
    }

    /*
      5. АКВАПАРКИ
    */
    if(
      /аквапарк|waterpark|water\s+park|водн\w*\s+горк|водн\w*\s+аттракцион|splash\s+park|детск\w*\s+бассейн|водн\w*\s+площадк/.test(t)
    ){
      add('Аквапарки',p);
    }

    /*
      6. КОНТАКТНЫЕ ЖИВОТНЫЕ
      Зоопарки, фермы, сафари, места с кормлением животных.
    */
    if(
      /контактн\w*\s+животн|контактн\w*\s+зоопарк|зоопарк|zoo\b|сафари|safari|ферм\w*\s+животн|animal\s+farm|petting\s+zoo|парк\s+птиц|bird\s+park|кормлен\w*\s+животн|олень|овеч|альпак|кролик|обезьян/.test(t)
    ){
      add('Контактные животные',p);
    }

    /*
      7. КАФЕ С ЖИВОТНЫМИ
    */
    if(
      /кафе\s+с\s+животн|котокафе|кот\w*\s+кафе|кафе\s+с\s+кот|кафе\s+с\s+собак|кафе\s+с\s+кролик|кафе\s+с\s+енот|animal\s+cafe|cat\s+cafe|dog\s+cafe|pet\s+cafe/.test(t)
    ){
      add('Кафе с животными',p);
    }

    /*
      8. МОРОЖЕНОЕ И ДЕСЕРТЫ
    */
    if(
      /морожен|ice\s*cream|gelato|десерт|dessert|сладост|пирожн|торт|вафл|панкейк|кокосов\w*\s+десерт|кафе[-\s]?мороженое/.test(t)
    ){
      add('Мороженое и десерты',p);
    }

    /*
      9. ПАРКИ И ПРОГУЛКИ
    */
    if(
      /парк\b|park\b|прогулк|набережн|сквер|сад\b|garden|ботаническ|природн\w*\s+парк|семейн\w*\s+прогул|пешеходн\w*\s+маршрут|для\s+прогулок/.test(t)
    ){
      add('Парки и прогулки',p);
    }

    /*
      10. СЕМЕЙНЫЕ ПЛЯЖИ
    */
    if(
      /семейн\w*\s+пляж|пляж\w*\s+с\s+детьми|пляж\w*\s+для\s+детей|family\s+beach|kids?\s+beach|мелковод|полог\w*\s+вход|без\s+волн|спокойн\w*\s+море|безопасн\w*\s+купани|детск\w*\s+пляжн\w*\s+зон/.test(t)
    ){
      add('Семейные пляжи',p);
    }
  });

  /*
    Возрастные подразделы могут не иметь прямого возраста
    в старых карточках. Семейные места без точного возраста
    оставляем в «Развлечения с детьми», но не выдумываем возраст.
  */

  const familyPriority=p=>{
    const explicit=Number(p.priority);

    if(Number.isFinite(explicit)){
      return explicit;
    }

    if(p.featured){
      return 500;
    }

    return 0;
  };

  Object.keys(semantic).forEach(section=>{
    semantic[section].sort((a,b)=>{
      const priorityDifference=
        familyPriority(b)-familyPriority(a);

      if(priorityDifference!==0){
        return priorityDifference;
      }

      const ratingDifference=
        (Number(b.rating)||0)-(Number(a.rating)||0);

      if(ratingDifference!==0){
        return ratingDifference;
      }

      return String(a.title||'').localeCompare(
        String(b.title||''),
        'ru'
      );
    });
  });

  /*
    Полностью удаляем старые подразделы «С детьми»
    и устанавливаем только утверждённые десять.
  */
  Object.keys(subs).forEach(key=>delete subs[key]);
  Object.assign(subs,semantic);
}
/* KM FAMILY SEMANTIC V53 END */


/* KM LOCATIONS SEMANTIC V51 START */
if(catalogState.category==='views'){
  const semantic={
    'Рассветы':[],
    'Закаты':[],
    'Вид на город':[],
    'Вид на море':[],
    'Горы':[],
    'Водопады':[],
    'Храмы':[],
    'Фотолокации':[],
    'Необычные места':[],
    'Смотровые площадки':[]
  };

  /*
    Используем только полноценные карточки places.
    Архивные публикации, новости, цитаты и памятки исключены.
  */
  const locationPlaces=places.filter(p=>{
    if(
      !p ||
      p.archive ||
      p.kind==='archive' ||
      p.kind==='guide'
    ){
      return false;
    }

    const categories=[
      p.category,
      ...(p.categories||[])
    ]
      .filter(Boolean)
      .map(value=>
        String(value)
          .toLowerCase()
          .replace(/ё/g,'е')
      );

    const t=[
      p.id,
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.choiceAdvice,
      p.atmosphere,
      p.area,
      p.address,
      p.bestTime,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[]),
      ...(p.whyIncluded||[]),
      ...(p.pros||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    const categoryMatch=categories.some(value=>
      value==='views' ||
      value==='view' ||
      value==='attractions' ||
      value==='photo' ||
      value==='photospot' ||
      value==='landmark' ||
      value==='nature'
    );

    const semanticMatch=
      /рассвет|sunrise|закат|sunset|вид\s+на\s+город|city\s+view|панорам\w*\s+города|вид\s+на\s+море|sea\s+view|ocean\s+view|горы?|mountain|перевал|водопад|waterfall|каскад|храм|пагод|будд|temple|pagoda|фотолокац|photo\s*spot|инстамест|смотров\w*\s+площад|viewpoint|observation\s+deck|необычн\w*\s+мест|секретн\w*\s+мест|скал|пещер|cave/.test(t);

    return categoryMatch||semanticMatch;
  });

  const add=(section,p)=>{
    if(!semantic[section]||!p?.id)return;

    if(!semantic[section].some(item=>item.id===p.id)){
      semantic[section].push(p);
    }
  };

  const searchable=p=>[
    p.id,
    getPreviewTitle(p),
    p.name,
    p.category,
    p.subcategory,
    p.description,
    p.shortDescription,
    p.fullDescription,
    p.choiceAdvice,
    p.atmosphere,
    p.area,
    p.address,
    p.bestTime,
    ...(p.categories||[]),
    ...(p.subcategories||[]),
    ...(p.tags||[]),
    ...(p.searchKeywords||[]),
    ...(p.whyIncluded||[]),
    ...(p.pros||[])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/ё/g,'е');

  locationPlaces.forEach(p=>{
    const t=searchable(p);

    if(
      /рассвет|sunrise|восход\s+солнца|ранн\w*\s+утро|утренн\w*\s+солнц|dawn/.test(t)
    ){
      add('Рассветы',p);
    }

    if(
      /закат|sunset|вечерн\w*\s+солнц|золот\w*\s+час|golden\s+hour/.test(t)
    ){
      add('Закаты',p);
    }

    if(
      /вид\s+на\s+город|городск\w*\s+вид|панорам\w*\s+города|панорам\w*\s+нячанг|city\s+view|cityscape|skyline|вид\s+на\s+нячанг|ночн\w*\s+город/.test(t)
    ){
      add('Вид на город',p);
    }

    if(
      /вид\s+на\s+море|морск\w*\s+вид|панорам\w*\s+моря|вид\s+на\s+залив|вид\s+на\s+бухт|sea\s+view|ocean\s+view|bay\s+view|coastal\s+view/.test(t)
    ){
      add('Вид на море',p);
    }

    if(
      /гор(?:а|ы|е|у|ой)|горн\w*|mountain|перевал|серпантин|вершин|холм|ущель|склон|hon\s+ba|хон\s+ба|гора\s+ангела/.test(t)
    ){
      add('Горы',p);
    }

    if(
      /водопад|waterfall|каскад|природн\w*\s+купел|горн\w*\s+рек|порог|yang\s+bay|янг\s+бей|ba\s+ho|ба\s+хо/.test(t)
    ){
      add('Водопады',p);
    }

    if(
      /храм|пагод|монастыр|будд|стату\w*\s+будд|temple|pagoda|buddha|святын|чамск\w*\s+башн|po\s+nagar|пон?агар/.test(t)
    ){
      add('Храмы',p);
    }

    if(
      /фотолокац|мест\w*\s+для\s+фото|фотосесси|photo\s*spot|photo\s*location|instagram|инстамест|красив\w*\s+фото|декорац|цветочн\w*\s+пол|фотогенич/.test(t)
    ){
      add('Фотолокации',p);
    }

    if(
      /необычн\w*\s+мест|уникальн\w*\s+мест|секретн\w*\s+мест|скрыт\w*\s+мест|малоизвестн|нестандартн|заброш|пещер|cave|hidden\s+place|secret\s+place|unique\s+place/.test(t)
    ){
      add('Необычные места',p);
    }

    if(
      /смотров\w*\s+площад|обзорн\w*\s+площад|видов\w*\s+площад|viewpoint|view\s*point|observation\s+deck|observation\s+point|панорамн\w*\s+площад|обзорн\w*\s+точк|смотров\w*\s+точк/.test(t)
    ){
      add('Смотровые площадки',p);
    }
  });

  /*
    Сортировка:
    priority выше всех, затем featured,
    затем рейтинг и название.
  */
  const locationPriority=p=>{
    const explicit=Number(p.priority);

    if(Number.isFinite(explicit)){
      return explicit;
    }

    if(p.featured){
      return 500;
    }

    return 0;
  };

  Object.keys(semantic).forEach(section=>{
    semantic[section].sort((a,b)=>{
      const priorityDifference=
        locationPriority(b)-locationPriority(a);

      if(priorityDifference!==0){
        return priorityDifference;
      }

      const ratingDifference=
        (Number(b.rating)||0)-(Number(a.rating)||0);

      if(ratingDifference!==0){
        return ratingDifference;
      }

      return String(a.title||'').localeCompare(
        String(b.title||''),
        'ru'
      );
    });
  });

  /*
    Полностью удаляем старые подразделы категории views
    и заменяем их десятью утверждёнными подразделами.
  */
  Object.keys(subs).forEach(key=>delete subs[key]);
  Object.assign(subs,semantic);
}
/* KM LOCATIONS SEMANTIC V51 END */


/* KM ENTERTAINMENT SEMANTIC V50 START */
if(catalogState.category==='entertainment'){
  const semantic={
    'Авторские маршруты':[],
    'Морские развлечения':[],
    'Подводный мир':[],
    'Рыбалка':[],
    'Экстрим':[],
    'Активный отдых':[],
    'Шоу и впечатления':[],
    'Рассветы и закаты':[],
    'Для детей':[],
    'Необычные впечатления':[]
  };

  /*
    Только настоящие карточки locations.
    Архивные статьи, новости, памятки и цитаты сюда не попадают.
  */
  const entertainmentPlaces=places.filter(p=>{
    if(
      !p ||
      p.archive ||
      p.kind==='archive' ||
      p.kind==='guide'
    ){
      return false;
    }

    const t=[
      p.id,
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.choiceAdvice,
      p.atmosphere,
      p.area,
      p.bestTime,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[]),
      ...(p.whyIncluded||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    const categories=[
      p.category,
      ...(p.categories||[])
    ]
      .filter(Boolean)
      .map(v=>String(v).toLowerCase());

    const categoryMatch=categories.some(v=>
      v==='entertainment' ||
      v==='activity' ||
      v==='activities' ||
      v==='extreme' ||
      v==='excursions' ||
      v==='family'
    );

    const semanticMatch=
      /sunset\s*jeep|джип|морск\w*\s+прогул|катер|яхт|банан|бэтм|батм|гидроцикл|jetski|jet\s*ski|дайвинг|diving|снорклинг|snorkel|рыбал|кальмар|парасейлинг|parasail|серфинг|surf|сап|sup\b|e[-\s]?foil|квадроцикл|atv\b|зиплайн|zipline|стрельб\w*\s+из\s+лука|archery|боулинг|bowling|гольф|golf|театр|theater|theatre|кинотеатр|гора\s+ангела|кокосов\w*\s+лод|корзинк\w*\s+лод|пивн\w*\s+spa|beer\s*spa|для\s+детей|семейн/.test(t);

    return categoryMatch||semanticMatch;
  });

  const add=(section,p)=>{
    if(!semantic[section]||!p?.id)return;

    if(!semantic[section].some(item=>item.id===p.id)){
      semantic[section].push(p);
    }
  };

  const searchable=p=>[
    p.id,
    getPreviewTitle(p),
    p.name,
    p.category,
    p.subcategory,
    p.description,
    p.shortDescription,
    p.fullDescription,
    p.choiceAdvice,
    p.atmosphere,
    p.area,
    p.bestTime,
    ...(p.categories||[]),
    ...(p.subcategories||[]),
    ...(p.tags||[]),
    ...(p.searchKeywords||[]),
    ...(p.whyIncluded||[])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/ё/g,'е');

  entertainmentPlaces.forEach(p=>{
    const t=searchable(p);

    /*
      1. АВТОРСКИЕ МАРШРУТЫ
      Sunset Jeep и индивидуальные авторские поездки.
    */
    if(
      /sunset\s*jeep|sunset[-\s]?jeep|ретро[-\s]?джип|авторск\w*\s+маршрут|индивидуальн\w*\s+(?:маршрут|тур|поездк)|джип[-\s]?(?:тур|маршрут|экскурс)|jeep\s*(?:tour|route)/.test(t)
    ){
      add('Авторские маршруты',p);
    }

    /*
      2. МОРСКИЕ РАЗВЛЕЧЕНИЯ
    */
    if(
      /морск\w*\s+прогул|прогулк\w*\s+на\s+(?:катер|яхт|лодк)|катамаран|яхт|yacht|boat\s*(?:trip|tour)|cruise|круиз|катан\w*\s+на\s+банан|banana\s+boat|бэтм|батм|flyfish|flying\s+fish|гидроцикл|jetski|jet\s*ski|парасейлинг|parasail|серфинг|surf|e[-\s]?foil|водн\w*\s+развлеч/.test(t)
    ){
      add('Морские развлечения',p);
    }

    /*
      3. ПОДВОДНЫЙ МИР
    */
    if(
      /дайвинг|diving|scuba|снорклинг|snorkel|подводн\w*\s+(?:мир|плавани|экскурс)/.test(t)
    ){
      add('Подводный мир',p);
    }

    /*
      4. РЫБАЛКА
    */
    if(
      /рыбал|fishing|кальмар|squid\s*fishing|глубоководн|deep[-\s]?sea\s+fishing|озерн\w*\s+рыбал|рыбалк\w*\s+на\s+озер|морск\w*\s+рыбал/.test(t)
    ){
      add('Рыбалка',p);
    }

    /*
      5. ЭКСТРИМ
    */
    if(
      /квадроцикл|atv\b|quad\s*bike|зиплайн|zipline|zip[-\s]?line|e[-\s]?foil|парасейлинг|parasail|экстрим|extreme|адреналин/.test(t)
    ){
      add('Экстрим',p);
    }

    /*
      6. АКТИВНЫЙ ОТДЫХ
    */
    if(
      /стрельб\w*\s+из\s+лука|лук\w*\s+по\s+мишен|archery\s*tag|archery|дуэл\w*\s+из\s+лука|боулинг|bowling|гольф|golf/.test(t)
    ){
      add('Активный отдых',p);
    }

    /*
      7. ШОУ И ВПЕЧАТЛЕНИЯ
    */
    if(
      /do\s*(?:theater|theatre)|do\s*театр|театр\s*do|миров\w*\s+театр|театр|theater|theatre|кинотеатр\w*\s+под\s+открыт\w*\s+неб|open[-\s]?air\s+cinema|русск\w*\s+язык/.test(t)
    ){
      add('Шоу и впечатления',p);
    }

    /*
      8. РАССВЕТЫ И ЗАКАТЫ
    */
    if(
      /рассвет|sunrise|закат|sunset|сап\w*\s+на\s+рассвет|sup\w*\s+(?:sunrise|рассвет)|гора\s+ангела|angel\s+mountain|sunset\s*jeep/.test(t)
    ){
      add('Рассветы и закаты',p);
    }

    /*
      9. ДЛЯ ДЕТЕЙ
    */
    if(
      /для\s+детей|с\s+детьми|семейн|family|kids?|children|ребен|ребён|кокосов\w*\s+(?:лод|корзин)|корзинк\w*\s+лод|basket\s+boat|coconut\s+boat/.test(t)
    ){
      add('Для детей',p);
    }

    /*
      10. НЕОБЫЧНЫЕ ВПЕЧАТЛЕНИЯ
    */
    if(
      /пивн\w*\s+spa|пивн\w*\s+спа|пивн\w*\s+ванн|beer\s*spa|beer\s*bath|необычн\w*\s+впечатлен|кокосов\w*\s+(?:лод|корзин)|basket\s+boat/.test(t)
    ){
      add('Необычные впечатления',p);
    }
  });

  /*
    Приоритет:
    1. Поле priority карточки.
    2. Sunset Jeep получает максимальный внутренний приоритет.
    3. Featured идёт выше обычных карточек.
    4. Затем рейтинг.
  */
  const entertainmentPriority=p=>{
    const t=searchable(p);

    if(/sunset\s*jeep|sunset[-\s]?jeep/.test(t)){
      return 10000;
    }

    const explicit=Number(p.priority);
    if(Number.isFinite(explicit)){
      return explicit;
    }

    if(p.featured){
      return 500;
    }

    return 0;
  };

  Object.keys(semantic).forEach(section=>{
    semantic[section].sort((a,b)=>{
      const priorityDifference=
        entertainmentPriority(b)-entertainmentPriority(a);

      if(priorityDifference!==0){
        return priorityDifference;
      }

      const ratingA=Number(a.rating)||0;
      const ratingB=Number(b.rating)||0;

      if(ratingB!==ratingA){
        return ratingB-ratingA;
      }

      return String(a.title||'').localeCompare(
        String(b.title||''),
        'ru'
      );
    });
  });

  /*
    Полностью удаляем старые подразделы «Развлечений»
    и устанавливаем только десять утверждённых групп.
  */
  Object.keys(subs).forEach(key=>delete subs[key]);
  Object.assign(subs,semantic);
}
/* KM ENTERTAINMENT SEMANTIC V50 END */


/* KM SPA SEMANTIC V48 */

if(catalogState.category==='spa'){

const semantic={

'Массаж беременным':[],
'Массаж всего тела':[],
'Массаж ног':[],
'Массаж головы':[],
'Массаж лица':[],
'Мойка волос':[],
'Массаж камнями':[],
'Массаж слепых':[],
'Тайский массаж':[],
'Комплексный массаж':[],
'Лечебный массаж':[],
'Сауны и бани':[]

};

const spaPlaces=places.filter(p=>{

if(!p)return false;

if(p.archive)return false;

if(p.kind==="archive")return false;

const t=(

(getPreviewTitle(p)||"")+" "+
(p.description||"")+" "+
(p.subcategory||"")+" "+
(p.category||"")+" "+
((p.categories||[]).join(" "))+" "+
((p.tags||[]).join(" "))+" "+
((p.searchKeywords||[]).join(" "))

).toLowerCase();

return /spa|массаж|massage|баня|сауна|sauna|хамам|хаммам|парная|горячий источник|hot spring|wellness|relax|расслабление/.test(t);

});

function add(section,p){

if(!semantic[section])return;

if(!semantic[section].some(x=>x.id===p.id))
semantic[section].push(p);

}

spaPlaces.forEach(p=>{

const t=(

(getPreviewTitle(p)||"")+" "+
(p.description||"")+" "+
(p.subcategory||"")+" "+
((p.categories||[]).join(" "))+" "+
((p.tags||[]).join(" "))+" "+
((p.searchKeywords||[]).join(" "))

).toLowerCase();

if(/беремен/.test(t))
add("Массаж беременным",p);

if(/body massage|full body|всего тела|полный массаж/.test(t))
add("Массаж всего тела",p);

if(/foot|ног/.test(t))
add("Массаж ног",p);

if(/head|голов/.test(t))
add("Массаж головы",p);

if(/face|лиц/.test(t))
add("Массаж лица",p);

if(/мойка волос|hair wash|hair spa|шампун/.test(t))
add("Мойка волос",p);

if(/stone|камн/.test(t))
add("Массаж камнями",p);

if(/blind|слеп/.test(t))
add("Массаж слепых",p);

if(/thai|тайск/.test(t))
add("Тайский массаж",p);

if(/комплекс|package|combo/.test(t))
add("Комплексный массаж",p);

if(/лечеб|therapy|medical massage/.test(t))
add("Лечебный массаж",p);

if(/баня|сауна|sauna|хамам|хаммам|парная/.test(t))
add("Сауны и бани",p);

});

/* полностью заменяем старые подразделы */

Object.keys(subs).forEach(k=>delete subs[k]);

Object.assign(subs,semantic);

}



/* KM BEACH SEMANTIC V47 */
if(catalogState.category==='beach'){
  const semantic={
    'Без волн':[],
    'Белый песок':[],
    'Рядом с центром':[],
    'С детьми':[],
    'Платные пляжи':[],
    'Day Pass в отелях':[]
  };

  /*
    В раздел допускаются только полноценные карточки пляжей,
    пляжных клубов, курортов и Day Pass.

    sourceArchive, статьи, цитаты и памятки не используются.
  */
  const beachPlaces=places.filter(p=>{
    if(
      !p ||
      p.archive ||
      p.kind==='archive' ||
      p.kind==='guide'
    ){
      return false;
    }

    const categories=[
      p.category,
      ...(p.categories||[])
    ]
      .filter(Boolean)
      .map(value=>
        String(value)
          .toLowerCase()
          .replace(/ё/g,'е')
      );

    const categoryMatch=categories.some(value=>
      value==='beach' ||
      value==='beaches' ||
      value==='daypass' ||
      value==='day-pass' ||
      value==='resort' ||
      value==='beachclub' ||
      value==='beach-club'
    );

    const textValue=[
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.atmosphere,
      p.area,
      p.bestTime,
      p.price,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    const textMatch=
      /пляж|beach|бухт|залив|лагун|купани|море|берег|песок|ресорт|resort|day\s*pass|дэй\s*пасс|дневн\w*\s+доступ|пляжн\w*\s+клуб/.test(
        textValue
      );

    return categoryMatch||textMatch;
  });

  const add=(section,p)=>{
    if(!semantic[section])return;

    if(!semantic[section].some(item=>item.id===p.id)){
      semantic[section].push(p);
    }
  };

  beachPlaces.forEach(p=>{
    const t=[
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.atmosphere,
      p.area,
      p.address,
      p.bestTime,
      p.price,
      p.averageCheck,
      p.workingHours,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[]),
      ...(p.audience||[]),
      ...(p.pros||[]),
      ...(p.whyIncluded||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    /*
      БЕЗ ВОЛН

      Подходят спокойные бухты, лагуны,
      мелководье и защищённые участки моря.
    */
    if(
      /без\s+волн|спокойн\w*\s+море|тих\w*\s+вода|штиль|лагун|защищенн\w*\s+бухт|закрыт\w*\s+бухт|мелковод|полог\w*\s+вход|calm\s+water|calm\s+sea|no\s+waves|sheltered\s+bay|lagoon|shallow\s+water/.test(t)
    ){
      add('Без волн',p);
    }

    /*
      БЕЛЫЙ ПЕСОК
    */
    if(
      /бел\w*\s+песок|белоснежн\w*\s+песок|светл\w*\s+песок|white\s+sand|powdery\s+sand|fine\s+white\s+sand/.test(t)
    ){
      add('Белый песок',p);
    }

    /*
      РЯДОМ С ЦЕНТРОМ

      Используем прямые признаки центрального пляжа,
      района Trần Phú и пешей доступности от центра.
    */
    if(
      /рядом\s+с\s+центром|в\s+центре|центр\w*\s+нячанг|центральн\w*\s+пляж|городск\w*\s+пляж|набережн\w*\s+tran\s*phu|tran\s*phu|trần\s*phú|пешком\s+от\s+центра|walking\s+distance\s+from\s+(the\s+)?center|central\s+beach|city\s+beach|downtown/.test(t)
    ){
      add('Рядом с центром',p);
    }

    /*
      С ДЕТЬМИ

      Подходят семейные пляжи, пологий вход,
      мелководье, детские зоны и безопасное купание.
    */
    if(
      /с\s+детьми|для\s+детей|семейн|family|family[-\s]?friendly|детск\w*\s+зон|детск\w*\s+бассейн|мелковод|полог\w*\s+вход|безопасн\w*\s+купани|спокойн\w*\s+море|kids?|children/.test(t)
    ){
      add('С детьми',p);
    }

    /*
      ПРИВАТНЫЕ ПЛЯЖИ
    */
    if(
      /приватн\w*\s+пляж|частн\w*\s+пляж|закрыт\w*\s+пляж|собственн\w*\s+пляж|пляж\s+отеля|пляж\s+резорта|private\s+beach|hotel\s+beach|resort\s+beach|exclusive\s+beach|restricted\s+access/.test(t)
    ){
      add('Приватные пляжи',p);
    }

    /*
      ПЛАТНЫЕ ПЛЯЖИ

      Сюда входят входной билет, платный доступ,
      обязательный депозит или покупка пакета.
    */
    if(
      /платн\w*\s+пляж|платн\w*\s+вход|входн\w*\s+билет|плата\s+за\s+вход|стоимость\s+входа|депозит|минимальн\w*\s+заказ|платн\w*\s+доступ|paid\s+beach|paid\s+entry|entrance\s+fee|admission\s+fee|minimum\s+spend|access\s+fee/.test(t)
    ){
      add('Платные пляжи',p);
    }

    /*
      DAY PASS В ОТЕЛЯХ

      Используем карточки с Day Pass,
      дневным доступом к бассейну, пляжу
      или инфраструктуре отеля/резорта.
    */
    if(
      /day\s*pass|daypass|дэй\s*пасс|дей\s*пасс|дневн\w*\s+доступ|доступ\s+на\s+день|день\s+в\s+отеле|день\s+в\s+резорте|hotel\s+day\s*pass|resort\s+day\s*pass|pool\s+day\s*pass|доступ\s+к\s+бассейну|доступ\s+к\s+инфраструктуре/.test(t)
    ){
      add('Day Pass в отелях',p);

      /*
        Day Pass практически всегда является
        платным доступом.
      */
      add('Платные пляжи',p);
    }
  });

  /*
    Полностью удаляем старые подразделы раздела «Пляжи»
    и заменяем их утверждённой структурой.
  */
  Object.keys(subs).forEach(key=>delete subs[key]);
  Object.assign(subs,semantic);
}


/* KM FOOD SEMANTIC V46 */
if(catalogState.category==='food'){
  const semantic={
    'Завтраки':[],
    'Поздние завтраки':[],
    'Обеды':[],
    'Ужин':[],
    'Поздний ужин':[],
    'Вьетнамская кухня':[],
    'Русская кухня':[],
    'Итальянская кухня':[],
    'Французская кухня':[],
    'Корейская кухня':[],
    'Японская кухня':[],
    'Морепродукты':[],
    'Стейки':[],
    'Бургеры':[],
    'Пицца':[],
    'Суши':[],
    'Кофе':[],
    'Десерты':[],
    'Кальянные':[]
  };

  /*
    Используем только полноценные карточки мест.
    sourceArchive, статьи, цитаты и черновики сюда не попадают.
  */
  const foodPlaces=places.filter(p=>{
    if(!p||p.archive||p.kind==='archive'||p.kind==='guide'){
      return false;
    }

    const categories=[
      p.category,
      ...(p.categories||[])
    ]
      .filter(Boolean)
      .map(value=>String(value).toLowerCase());

    const foodCategoryMatch=categories.some(value=>
      value==='food'||
      value==='restaurant'||
      value==='restaurants'||
      value==='cafe'||
      value==='coffee'||
      value==='dessert'||
      value==='hookah'
    );

    const basicText=[
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.atmosphere,
      p.whatToOrder,
      p.bestTime,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    const foodTextMatch=
      /ресторан|кафе|кофейн|еда|кухн|завтрак|обед|ужин|пицц|бургер|стейк|суши|морепродукт|seafood|coffee|cafe|restaurant|dessert|hookah|shisha|кальян/.test(
        basicText
      );

    return foodCategoryMatch||foodTextMatch;
  });

  const add=(section,p)=>{
    if(!semantic[section])return;

    if(!semantic[section].some(item=>item.id===p.id)){
      semantic[section].push(p);
    }
  };

  foodPlaces.forEach(p=>{
    const t=[
      getPreviewTitle(p),
      p.name,
      p.category,
      p.subcategory,
      p.description,
      p.shortDescription,
      p.fullDescription,
      p.atmosphere,
      p.whatToOrder,
      p.bestTime,
      p.time,
      p.workingHours,
      ...(p.categories||[]),
      ...(p.subcategories||[]),
      ...(p.tags||[]),
      ...(p.searchKeywords||[])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g,'е');

    /*
      ЗАВТРАКИ

      Поздний завтрак также обязательно попадает
      в общий подраздел «Завтраки».
    */
    const lateBreakfast=
      /поздн\w*\s+завтрак|late\s+breakfast|brunch|бранч/.test(t);

    const breakfast=
      lateBreakfast||
      /завтрак|breakfast|утренн\w*\s+меню/.test(t);

    if(breakfast)add('Завтраки',p);
    if(lateBreakfast)add('Поздние завтраки',p);

    /*
      ОБЕДЫ
    */
    if(
      /обед|ланч|business\s+lunch|lunch|дневн\w*\s+меню/.test(t)
    ){
      add('Обеды',p);
    }

    /*
      УЖИН

      Поздний ужин одновременно попадает
      в «Ужин» и «Поздний ужин».
    */
    const lateDinner=
      /поздн\w*\s+ужин|late\s+dinner|late\s+night\s+food|after\s*22|after\s*23|после\s*22|после\s*23|ночн\w*\s+еда|поесть\s+ночью|круглосуточ|24\s*\/\s*7|24\s*hours?/.test(t);

    const dinner=
      lateDinner||
      /ужин|dinner|вечерн\w*\s+меню/.test(t);

    if(dinner)add('Ужин',p);
    if(lateDinner)add('Поздний ужин',p);

    /*
      НАЦИОНАЛЬНЫЕ КУХНИ
    */
    if(
      /вьетнамск\w*\s+кухн|vietnamese|viet\s+food|pho\b|phở|фо\b|banh\s*mi|bánh\s*mì|bun\s*cha|bún\s*chả|com\s*tam|cơm\s*tấm/.test(t)
    ){
      add('Вьетнамская кухня',p);
    }

    if(
      /русск\w*\s+кухн|russian\s+cuisine|russian\s+food|борщ|пельмен|блины|солянк/.test(t)
    ){
      add('Русская кухня',p);
    }

    if(
      /итальянск\w*\s+кухн|italian|италия|паста|ризотто|лазанья|тирамису/.test(t)
    ){
      add('Итальянская кухня',p);
    }

    if(
      /французск\w*\s+кухн|french\s+cuisine|french\s+food|франция|круассан|croissant|багет|baguette/.test(t)
    ){
      add('Французская кухня',p);
    }

    if(
      /корейск\w*\s+кухн|korean|корея|кимчи|kimchi|самгепсаль|tteokbokki|ттокпокки/.test(t)
    ){
      add('Корейская кухня',p);
    }

    if(
      /японск\w*\s+кухн|japanese|япония|рамен|ramen|удон|udon|темпура|tempura|сашими|sashimi/.test(t)
    ){
      add('Японская кухня',p);
    }

    /*
      ТИПЫ БЛЮД
    */
    if(
      /морепродукт|seafood|креветк|shrimp|prawn|лобстер|lobster|краб|crab|устриц|oyster|кальмар|squid|осьминог|octopus|рыбн\w*\s+ресторан/.test(t)
    ){
      add('Морепродукты',p);
    }

    if(
      /стейк|steak|steakhouse|стейкхаус|ribeye|рибай|t[-\s]?bone|томагавк/.test(t)
    ){
      add('Стейки',p);
    }

    if(
      /бургер|burger|cheeseburger|чизбургер/.test(t)
    ){
      add('Бургеры',p);
    }

    if(
      /пицц|pizza|pizzeria|пиццери/.test(t)
    ){
      add('Пицца',p);
    }

    if(
      /суши|sushi|ролл|rolls?\b|сашими|sashimi/.test(t)
    ){
      add('Суши',p);
    }

    /*
      НАПИТКИ И ДЕСЕРТЫ
    */
    if(
      /кофе|кофейн|coffee|cafe|café|эспрессо|espresso|капучино|cappuccino|латте|latte/.test(t)
    ){
      add('Кофе',p);
    }

    if(
      /десерт|dessert|торт|cake|пирожн|морожен|ice\s*cream|вафл|waffle|тирамису|cheesecake|чизкейк|сладост/.test(t)
    ){
      add('Десерты',p);
    }

    /*
      КАЛЬЯННЫЕ

      Карточка кальянной может одновременно оставаться
      в «Вечернем Нячанге».
    */
    if(
      /кальян|кальянн|hookah|shisha|шиша/.test(t)
    ){
      add('Кальянные',p);
    }
  });

  /*
    Полностью убираем старые подразделы еды
    и заменяем их утверждённой структурой.
  */
  Object.keys(subs).forEach(key=>delete subs[key]);
  Object.assign(subs,semantic);
}


if(catalogState.category==='night'){
  const semantic={
    'Закаты':[],
    'Бары на крышах':[],
    'Пляжные клубы':[],
    'Ночные клубы':[],
    'Живая музыка':[],
    'Караоке':[],
    'Где поесть ночью':[],
    'Романтические места':[]
  };

  /*
    В редакционные подразделы «Вечернего Нячанга»
    допускаются только полноценные карточки мест.
    Архивные тексты, новости, цитаты и черновики исключены.
  */
  const all=places.filter(p=>
    p &&
    !p.archive &&
    p.kind!=='archive' &&
    p.kind!=='guide'
  );

  all.forEach(p=>{
    const t=((getPreviewTitle(p)||'')+' '+(p.description||'')+' '+(p.subcategory||'')+' '+(p.category||'')+' '+((p.categories||[]).join(' '))+' '+((p.tags||[]).join(' '))).toLowerCase();

    if(/rooftop|sky|roof|панорам|видов/i.test(t))
      semantic['Бары на крышах'].push(p);

    if(/beach club|пляжн|louisiane|sailing/i.test(t))
      semantic['Пляжные клубы'].push(p);

    if(/night|club|dj|дискот|клуб/i.test(t))
      semantic['Ночные клубы'].push(p);

    if(/live|music|band|jazz|акустик|жив/i.test(t))
      semantic['Живая музыка'].push(p);

    if(/karaoke|караоке/i.test(t))
      semantic['Караоке'].push(p);

    if(/late|24|ноч|after 22|поздн|круглосуточ/i.test(t))
      semantic['Где поесть ночью'].push(p);

    if(/romantic|романт|couple|для двоих|закат|sunset/i.test(t))
      semantic['Романтические места'].push(p);
  });

  semantic['Закаты']=[{
      id:'golden-pagoda',
      title:'Golden Pagoda',
      area:'Нячанг',
      price:'Авторская рекомендация',
      rating:'—',
      image:'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=900'
  }];

  Object.keys(semantic).forEach(key=>{
    const seen=new Set();

    semantic[key]=semantic[key].filter(item=>{
      if(!item?.id||seen.has(item.id))return false;
      seen.add(item.id);
      return true;
    });
  });

  Object.keys(subs).forEach(k=>delete subs[k]);
  Object.assign(subs,semantic);
}
const catTitle=categoryNames[catalogState.category]||catalogState.category;
 if(!catalogState.subcategory){root.innerHTML=`<div class="catalog-breadcrumb"><button class="catalog-back" data-catalog-back="root">← Разделы</button></div><h2 class="catalog-level-title">${escapeHtml(catTitle)}</h2><div class="catalog-grid">${Object.entries(subs).map(([sub,list])=>`<button class="catalog-tile" data-catalog-subcategory="${escapeHtml(sub)}"><strong>${escapeHtml(sub)}</strong><small>${list.length} ${list.length===1?'место':'мест'}</small></button>`).join('')}</div>`;return}
 const list=[
  ...new Map(
    (subs[catalogState.subcategory]||[])
      .filter(p=>p&&p.id)
      .map(p=>[p.id,p])
  ).values()
];

root.innerHTML=`
  <div class="catalog-breadcrumb">
    <button class="catalog-back" data-catalog-back="category">
      ← ${escapeHtml(catTitle)}
    </button>
  </div>

  <h2 class="catalog-level-title">
    ${escapeHtml(catalogState.subcategory)}
  </h2>

  <div class="catalog-places">
    ${list.map(p=>`
      <button class="list-place" data-action="details" data-id="${p.id}">
        <img src="${p.image||FALLBACK_IMAGE}" alt="" loading="lazy">

        <span>
          <strong>${escapeHtml(getPreviewTitle(p))}</strong>
          <small>
            ${escapeHtml(p.area)} · ★ ${escapeHtml(p.rating)} · ${escapeHtml(p.price)}
          </small>
        </span>

        <span
          class="list-heart ${isFav(p.id)?'active':''}"
          data-action="favorite"
          data-id="${p.id}"
        >
          ${isFav(p.id)?'♥':'♡'}
        </span>
      </button>
    `).join('')}
  </div>
`;
}

/* Later integration point: call setProfileAvatar(photoUrl, displayName) after FlutterFlow/Firebase sync. */
function setProfileAvatar(photoUrl,displayName='С'){
 const img=$('#profileAvatarImage'),fallback=$('#profileAvatarFallback');
 const letter=(displayName||'С').trim().charAt(0).toUpperCase()||'С';
 fallback.textContent=letter;
 const showFallback=()=>{img.removeAttribute('src');img.hidden=true;fallback.hidden=false};
 if(!photoUrl){showFallback();return}
 img.onload=()=>{img.hidden=false;fallback.hidden=true};
 img.onerror=showFallback;
 img.src=photoUrl;
}
/* KM DYNAMIC HERO V59 START */

const heroPhrases={
 earlyMorning:[
  {
   title:'Нячанг встречает новый день.',
   text:'Самое тихое время для моря, пустой набережной и первых лучей солнца.'
  },
  {
   title:'Город только просыпается.',
   text:'Отправляйтесь на рассвет, прогулку у моря или ранний завтрак без очередей.'
  },
  {
   title:'Начнём день раньше остальных?',
   text:'Сейчас особенно красиво на пляже, у храмов и на смотровых площадках.'
  },
  {
   title:'Первые часы Нячанга — особенные.',
   text:'Выберите спокойный маршрут, кофе у моря или место для красивого рассвета.'
  },
  {
   title:'Утро начинается с моря.',
   text:'Пока город не стал шумным, самое время увидеть Нячанг без суеты.'
  }
 ],

 morning:[
  {
   title:'Где позавтракаем?',
   text:'Выберите хорошее кафе, поздний завтрак или кофе с красивым видом.'
  },
  {
   title:'Начнём день красиво?',
   text:'Море, завтрак, прогулка или тихая локация — собрали лучшие варианты рядом.'
  },
  {
   title:'Куда отправимся утром?',
   text:'Пока не стало жарко, можно успеть на пляж, в храм или на прогулку.'
  },
  {
   title:'Найдём лучший кофе?',
   text:'Покажем кофейни, завтраки и места, где приятно спокойно начать день.'
  },
  {
   title:'С чего начнём путешествие?',
   text:'Выберите настроение — море, вкусный завтрак, виды или активный отдых.'
  }
 ],

 day:[
  {
   title:'Что хотите сегодня?',
   text:'Сейчас жарко — выберите прохладное кафе, SPA, бассейн или место с кондиционером.'
  },
  {
   title:'Куда отправимся днём?',
   text:'Подберём место в тени, ресторан без жары или отдых у воды.'
  },
  {
   title:'Сделаем паузу от солнца?',
   text:'Самое время для обеда, массажа, торгового центра или прохладного бассейна.'
  },
  {
   title:'Найдём лучшее место?',
   text:'Выберите кафе с кондиционером, Day Pass или спокойную локацию для дневного отдыха.'
  },
  {
   title:'Выберите настроение отдыха.',
   text:'Вкусный обед, SPA, развлечения или прохладное место с красивым видом.'
  }
 ],

 evening:[
  {
   title:'Где встретим закат?',
   text:'Выберите красивый вид, ресторан, rooftop или романтическое место.'
  },
  {
   title:'Где поужинаем?',
   text:'Собрали рестораны для спокойного ужина, свидания и вечера с друзьями.'
  },
  {
   title:'Чем займёмся вечером?',
   text:'Закаты, прогулки, бары на крышах и места с живой музыкой уже ждут.'
  },
  {
   title:'Вечер только начинается…',
   text:'Самое время выбрать ресторан, красивую локацию или продолжение вечера.'
  },
  {
   title:'Куда отправимся после заката?',
   text:'Покажем ночные места, бары, караоке и рестораны, которые ещё открыты.'
  }
 ],

 night:[
  {
   title:'Где ещё открыто?',
   text:'Покажем рестораны, бары, караоке и ночные места, которые работают сейчас.'
  },
  {
   title:'Продолжим вечер?',
   text:'Выберите ночной клуб, бар на крыше, караоке или место для позднего ужина.'
  },
  {
   title:'Ищем ночные места?',
   text:'Нячанг не спит — собрали лучшие варианты для продолжения ночи.'
  },
  {
   title:'Нячанг ещё не спит.',
   text:'Найдём, где поесть, выпить, послушать музыку или просто красиво завершить вечер.'
  },
  {
   title:'Куда заглянем этой ночью?',
   text:'Открытые заведения, поздний ужин и ночные развлечения — всё в одном месте.'
  }
]};

let heroPeriod='';
let heroPhraseIndex=0;
let heroTransitionBusy=false;

function getHeroPeriod(){
 const hour=new Date().getHours();

 if(hour>=4&&hour<6)return'earlyMorning';
 if(hour>=6&&hour<11)return'morning';
 if(hour>=11&&hour<17)return'day';
 if(hour>=17&&hour<22)return'evening';

 return'night';
}

function ensureHeroTransitionStyles(){
 if(document.getElementById('km-dynamic-hero-v59-style')){
  return;
 }

 const style=document.createElement('style');

 style.id='km-dynamic-hero-v59-style';
 style.textContent=`
  #heroTitle,
  #heroText{
   transition:
    opacity .42s ease,
    transform .42s ease;
   will-change:opacity,transform;
  }

  .hero-text-changing{
   opacity:0 !important;
   transform:translateY(5px);
  }

  .hero-copy{
   min-height:250px;
  }

  @media(max-width:680px){
   .hero-copy{
    min-height:285px;
   }
  }

  @media(prefers-reduced-motion:reduce){
   #heroTitle,
   #heroText{
    transition:none !important;
   }

   .hero-text-changing{
    transform:none;
   }
  }
 `;

 document.head.appendChild(style);
}

function updateHero(force=false){
 const titleNode=$('#heroTitle');
 const textNode=$('#heroText');

 if(!titleNode||!textNode||heroTransitionBusy){
  return;
 }

 ensureHeroTransitionStyles();

 const period=getHeroPeriod();
 const phrases=heroPhrases[period];

 if(!phrases?.length){
  return;
 }

 if(period!==heroPeriod){
  heroPeriod=period;
  heroPhraseIndex=0;
  force=true;
 }

 const phrase=phrases[heroPhraseIndex];

 const applyPhrase=()=>{
  titleNode.textContent=phrase.title;
  textNode.textContent=phrase.text;

  requestAnimationFrame(()=>{
   titleNode.classList.remove('hero-text-changing');
   textNode.classList.remove('hero-text-changing');
   heroTransitionBusy=false;
  });
 };

 if(force){
  applyPhrase();
 }else{
  heroTransitionBusy=true;

  titleNode.classList.add('hero-text-changing');
  textNode.classList.add('hero-text-changing');

  setTimeout(applyPhrase,430);
 }

 heroPhraseIndex=(heroPhraseIndex+1)%phrases.length;
}

function startDynamicHero(){
 updateHero(true);

 if(window.__kmDynamicHeroInterval){
  clearInterval(window.__kmDynamicHeroInterval);
 }

 window.__kmDynamicHeroInterval=setInterval(
  ()=>updateHero(false),
  25000
 );
}

if(document.readyState==='loading'){
 document.addEventListener(
  'DOMContentLoaded',
  startDynamicHero,
  {once:true}
 );
}else{
 startDynamicHero();
}

/* KM DYNAMIC HERO V59 END */
const FALLBACK_IMAGE='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171b1c"/><stop offset="1" stop-color="#0b0d0e"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><circle cx="400" cy="235" r="62" fill="none" stroke="#39d2c0" stroke-opacity=".55" stroke-width="3"/><text x="400" y="252" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#d9b15f">КМ</text><text x="400" y="330" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#9aa2a4">Фотография будет добавлена</text></svg>`);
document.addEventListener('error',e=>{
 const img=e.target;
 if(img instanceof HTMLImageElement&&!img.dataset.fallback){
   img.dataset.fallback='1';
   img.src=FALLBACK_IMAGE;
 }
},true);
const updateTopState=()=>$('.top')?.classList.toggle('is-scrolled',window.scrollY>10);
window.addEventListener('scroll',updateTopState,{passive:true});
updateTopState();


/* KM_ONE_TAP_FAVORITE_START */

function activateFavoriteButton(button,event){
 if(!button)return;

 event.preventDefault();
 event.stopPropagation();
 event.stopImmediatePropagation?.();

 const placeId=String(
  button.dataset.id ||
  (button.id==='mapFav' ? selectedId : '') ||
  ''
 ).trim();

 if(!placeId){
  return;
 }

 toggleFavorite(placeId,button);
}

// Телефон, мышь, трекпад — одно отпускание пальца = одно действие.
document.addEventListener('pointerup',event=>{
 const button=event.target.closest?.(
  '[data-action="favorite"]'
 );

 if(!button)return;

 activateFavoriteButton(button,event);
},true);

// Обычный click после pointerup только гасим,
// чтобы он не вызвал второе переключение.
// Для клавиатуры detail === 0 — выполняем действие.
document.addEventListener('click',event=>{
 const button=event.target.closest?.(
  '[data-action="favorite"]'
 );

 if(!button)return;

 event.preventDefault();
 event.stopPropagation();
 event.stopImmediatePropagation?.();

 if(event.detail===0){
  activateFavoriteButton(button,event);
 }
},true);

/* KM_ONE_TAP_FAVORITE_END */

document.addEventListener('click',e=>{const openUrl=e.target.closest('[data-open-url]');if(openUrl){window.open(openUrl.dataset.openUrl,'_blank','noopener,noreferrer');return}const gallery=e.target.closest('[data-gallery-src]');if(gallery){$('#lightboxImage').src=gallery.dataset.gallerySrc;$('#imageLightbox').classList.add('open');$('#imageLightbox').setAttribute('aria-hidden','false');return}if(e.target.closest('[data-lightbox-close]')||e.target===$('#imageLightbox')){$('#imageLightbox').classList.remove('open');$('#imageLightbox').setAttribute('aria-hidden','true');return}const cat=e.target.closest('[data-catalog-category]');if(cat){catalogState={category:cat.dataset.catalogCategory,subcategory:null};renderCatalog();return}const sub=e.target.closest('[data-catalog-subcategory]');if(sub){catalogState.subcategory=sub.dataset.catalogSubcategory;renderCatalog();return}const back=e.target.closest('[data-catalog-back]');if(back){if(back.dataset.catalogBack==='root')catalogState={category:null,subcategory:null};else catalogState.subcategory=null;renderCatalog();return}const route=e.target.closest('[data-action="route"]');if(route){e.preventDefault();e.stopPropagation();routeTo(route.dataset.id);return}const details=e.target.closest('[data-action="details"]');if(details){openModal(details.dataset.id);return}const view=e.target.closest('[data-view]');if(view){openOverlay(view.dataset.view);return}const close=e.target.closest('[data-close]');if(close){closeOverlay(close.dataset.close);return}const home=e.target.closest('[data-nav="home"]');
if(home){
 closeModal();
 closeOverlay('map');
 closeOverlay('list');

 active='all';
 catalogState={category:null,subcategory:null};

 $('#searchInput').value='';

 $$('.chip').forEach(c=>
  c.classList.toggle(
   'active',
   c.dataset.filter==='all'
  )
 );

 renderCards();

 setNav('home');

 window.scrollTo({
  top:0,
  behavior:'smooth'
 });

 return;
}

const nav=e.target.closest('[data-nav="favorites"]');
if(nav){
 active='favorites';

 $$('.chip').forEach(c=>c.classList.remove('active'));

 renderCards();

 setNav('favorites');

 $('#places').scrollIntoView({
  behavior:'smooth'
 });

 return;
}if(e.target===$('#modal'))closeModal()});

document.addEventListener('pointerdown',e=>{
 const card=e.target.closest('.card[data-action="details"]');
 if(!card||e.target.closest('button,a'))return;
 const rect=card.getBoundingClientRect();
 card.style.setProperty('--ripple-x',`${e.clientX-rect.left}px`);
 card.style.setProperty('--ripple-y',`${e.clientY-rect.top}px`);
 card.classList.remove('ripple');
 void card.offsetWidth;
 card.classList.add('ripple','is-pressing');
});
document.addEventListener('pointerup',()=>$$('.card.is-pressing').forEach(card=>card.classList.remove('is-pressing')));
document.addEventListener('pointercancel',()=>$$('.card.is-pressing').forEach(card=>card.classList.remove('is-pressing')));
document.addEventListener('animationend',e=>{if(e.target.matches?.('.card'))e.target.classList.remove('ripple')});
document.addEventListener('transitionend',e=>{if(e.target.matches?.('.card')&&e.propertyName==='transform')window.setTimeout(()=>e.target.classList.remove('ripple'),180)});
$$('.chip').forEach(c=>c.addEventListener('click',()=>setFilter(c.dataset.filter)));$('#searchInput').addEventListener('input',renderCards);$('#resetBtn').addEventListener('click',reset);$('#closeModal').addEventListener('click',closeModal);$('#mapDetails').addEventListener('click',()=>openModal(selectedId));$('#mapRoute').addEventListener('click',()=>routeTo(selectedId));document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card[data-action="details"]')){e.preventDefault();openModal(e.target.dataset.id);return}if(e.key==='Escape'){closeModal();if($('#mapOverlay').classList.contains('open'))closeOverlay('map');if($('#listOverlay').classList.contains('open'))closeOverlay('list')}});updateHero();
renderCards();
renderCatalog();
loadGlobalFavorites();
loadGlobalViews();


/* ===== KM SINGLE GEO POINTER V100 ===== */
(function installSingleGeoPointerV100(){

  function removeOldGeoButtons(){
    document.querySelectorAll(
      [
        '#kmLocationControl',
        '.km-location-control',
        '.km-location-button',
        '.km-map-airplane-button',
        '#kmLocationButton',
        '[title="Моё местоположение"]:not(#kmGeoPointerV100)',
        '[aria-label="Показать моё местоположение"]:not(#kmGeoPointerV100)'
      ].join(',')
    ).forEach(element=>{
      if(element.id !== 'kmGeoPointerV100'){
        element.remove();
      }
    });
  }

  function createGeoPointer(){
    const overlay=document.querySelector('#mapOverlay');

    if(!overlay){
      return;
    }

    removeOldGeoButtons();

    let button=document.querySelector('#kmGeoPointerV100');

    if(button){
      return;
    }

    button=document.createElement('button');
    button.id='kmGeoPointerV100';
    button.type='button';
    button.title='Моё местоположение';
    button.setAttribute(
      'aria-label',
      'Показать моё местоположение'
    );

    /* Стандартная навигационная стрелка, НЕ самолёт */
    button.innerHTML=`
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="
            M39.8 7.5
            5.8 21.2
            C4.3 21.8 4.2 23.9 5.7 24.6
            L19.1 30.5
            L25 43.8
            C25.7 45.3 27.8 45.2 28.4 43.7
            L42.2 9.8
            C42.8 8.2 41.3 6.8 39.8 7.5
            Z
          "
        />
        <path
          class="km-geo-pointer-detail"
          d="M20 29 L39 10"
        />
      </svg>
    `;

    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();

      if(typeof locateMapUser === 'function'){
        locateMapUser();
      }
    });

    overlay.appendChild(button);
  }

  function refreshGeoPointer(){
    createGeoPointer();

    requestAnimationFrame(()=>{
      removeOldGeoButtons();
      createGeoPointer();
    });

    setTimeout(()=>{
      removeOldGeoButtons();
      createGeoPointer();
    },150);

    setTimeout(()=>{
      removeOldGeoButtons();
      createGeoPointer();
    },500);
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      refreshGeoPointer,
      {once:true}
    );
  }else{
    refreshGeoPointer();
  }

  document.addEventListener('click',event=>{
    if(
      event.target.closest('[data-view="map"]') ||
      event.target.closest('[data-nav="map"]')
    ){
      refreshGeoPointer();
    }
  });

  /*
    Если старый Leaflet-контрол попробует появиться позже,
    удаляем его и оставляем только нашу нижнюю стрелку.
  */
  const observer=new MutationObserver(()=>{
    removeOldGeoButtons();
    createGeoPointer();
  });

  observer.observe(document.documentElement,{
    childList:true,
    subtree:true
  });

})();




