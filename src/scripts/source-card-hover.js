// Наведение на карточку квеста: зум фона и оранжевая стрелка в центре.
// На оригинале это делал inline-скрипт страницы Tilda, а санитайзер снимков вырезает
// все inline-скрипты — CSS эффекта в снятых стилях остался, потерялся только класс `active`.
// Свой CSS тут не нужен: `.game-card-animated.active .game-card-image` и `.game-card-arrow`
// приезжают со страницей (public/assets/source-css/*.css).

const CARD_SELECTOR = '.game-card-animated';
const ARROW_CLASS = 'game-card-arrow';
// Разметка стрелки — один в один с оригиналом, иначе не совпадут селекторы снятого CSS.
const ARROW_SVG = '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
// Сколько ждём появления карточек, если на первом проходе их не было. Снимок статичный,
// так что это чистая страховка — наблюдение снимаем по первой находке или по этому сроку,
// чтобы на тяжёлой странице не висел вечный наблюдатель.
const SETTLE_LIMIT_MS = 3000;

const hoverQuery = () => globalThis.matchMedia?.('(hover: hover)') ?? null;

const mountArrow = (card) => {
  // На части снимков стрелка уже попала в HTML: страницу снимали после отработки
  // скрипта Tilda. Второй такой же div дал бы двойной кружок при наведении.
  if (card.querySelector(`.${ARROW_CLASS}`)) return;
  const arrow = card.ownerDocument.createElement('div');
  arrow.className = ARROW_CLASS;
  arrow.innerHTML = ARROW_SVG;
  card.append(arrow);
};

// Тап по тачскрину тоже присылает pointerenter, и класс `active` залипал бы на карточке
// до ухода со страницы. Переход по ссылке при этом не страдает: у стрелки pointer-events: none.
const onPointerEnter = (event) => {
  if (event.pointerType === 'touch') return;
  event.currentTarget.classList.add('active');
};

const onPointerLeave = (event) => {
  event.currentTarget.classList.remove('active');
};

const bindHover = (card) => {
  if (card.dataset.sourceCardHover === 'on') return;
  card.dataset.sourceCardHover = 'on';
  card.addEventListener('pointerenter', onPointerEnter);
  card.addEventListener('pointerleave', onPointerLeave);
  // Прерванный жест (системный свайп, потеря указателя) не присылает pointerleave.
  card.addEventListener('pointercancel', onPointerLeave);
};

// Возвращает число найденных карточек: по нему решаем, нужна ли страховка на дозагрузку.
const enhanceCards = () => {
  const cards = document.querySelectorAll(CARD_SELECTOR);
  const canHover = hoverQuery()?.matches === true;
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    mountArrow(card);
    if (canHover) bindHover(card);
  });
  return cards.length;
};

let wired = false;

export function initCardHover() {
  if (typeof document === 'undefined') return;

  // Проход делаем на каждый вызов — он идемпотентен, а вот подписки ставим один раз.
  const found = enhanceCards();
  if (wired) return;
  wired = true;

  // SourceSnapshotBody раскладывает снимок асинхронно, поэтому подстраховываемся вторым
  // проходом по готовности документа.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceCards, { once: true });
  }

  // Указатель может научиться наведению уже после загрузки: подключили мышь к планшету,
  // переключили эмуляцию устройства в браузере. Один общий слушатель на всю страницу.
  hoverQuery()?.addEventListener?.('change', enhanceCards);

  // Карточки нашлись сразу — дальше следить не за чем (на большинстве маршрутов их нет вовсе,
  // и тогда следим ограниченное время внутри снимка, а не по всему документу).
  if (found > 0 || typeof MutationObserver === 'undefined') return;
  const scope = document.querySelector('[data-source-snapshot]') ?? document.body;
  if (!scope) return;

  let timer = 0;
  const stop = () => {
    observer.disconnect();
    globalThis.clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    if (enhanceCards() > 0) stop();
  });
  timer = globalThis.setTimeout(stop, SETTLE_LIMIT_MS);
  observer.observe(scope, { childList: true, subtree: true });
}
