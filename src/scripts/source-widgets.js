// Локальные виджеты внутри снимков Tilda: карта площадок и плашка «БОНУС».
// Генератор снимков (_capture/build_source_snapshots.py) оставляет на месте
// сторонних виджетов локальную разметку и маркеры с данными, а весь показ и
// единственный внешний запрос (карта) живут здесь — запрос уходит только после
// клика посетителя, как в src/components/LazyMap.astro.

const MAP_TITLE = 'Карта площадок «Чё за Квест» в Ростове-на-Дону';
// Оригинальный Marquiz показывает плашку через 10 секунд. Такая пауза на статике
// читается как «плашки нет» — и у посетителя, и на приёмочных скриншотах,
// поэтому ждём ровно столько, чтобы она не прыгала поверх первого экрана.
const BONUS_DELAY_MS = 1200;
const BONUS_DISMISSED_KEY = 'chezakvest.quiz-pop-dismissed';

const stored = (key) => {
  // В приватном режиме и при запрете на хранилище обращение бросает исключение,
  // а плашка из-за этого пропадать не должна.
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const remember = (key) => {
  try {
    globalThis.localStorage?.setItem(key, '1');
  } catch {
    /* закрытие не переживёт перезагрузку — это лучше, чем сломанный обработчик */
  }
};

const activateMap = (stage) => {
  if (stage.querySelector('iframe')) return;
  const button = stage.querySelector('[data-source-map-load]');
  const frame = stage.ownerDocument.createElement('iframe');
  frame.src = stage.dataset.sourceMapEmbed;
  frame.title = stage.dataset.sourceMapTitle || MAP_TITLE;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  // Постер и кнопку убираем только после ответа Яндекса: пока карта едет,
  // на месте блока остаётся картинка, а не белая дыра.
  frame.addEventListener('load', () => {
    stage.dataset.sourceMapActive = 'true';
  }, { once: true });
  stage.append(frame);
  if (button) {
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Карта загружается…';
    button.disabled = true;
  }
};

const initMaps = (root) => {
  root.querySelectorAll('[data-source-map][data-source-map-embed]').forEach((stage) => {
    if (!(stage instanceof HTMLElement) || stage.dataset.ready) return;
    stage.dataset.ready = 'true';
    const button = stage.querySelector('[data-source-map-load]');
    button?.addEventListener('click', () => activateMap(stage), { once: true });
  });
};

const buildBonusPlaque = (marker) => {
  const document_ = marker.ownerDocument;
  // Классы `quiz-pop` уже оформлены в src/styles/page.css — там же лежит правило
  // `.quiz-pop-visible .mfab`, которое на узком экране поднимает кнопку
  // мессенджеров над плашкой. Своя разметка тут развела бы их по разным правилам.
  const plaque = document_.createElement('aside');
  plaque.className = 'quiz-pop';
  plaque.setAttribute('aria-label', marker.dataset.bonusText || 'Подобрать квест');
  const colour = marker.dataset.bonusColor;
  if (colour) plaque.style.background = colour;

  const link = document_.createElement('a');
  link.className = 'quiz-pop__link';
  link.href = '#source-booking';

  const badge = document_.createElement('span');
  badge.className = 'quiz-pop__badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '✓';

  const eyebrow = document_.createElement('span');
  eyebrow.className = 'quiz-pop__eyebrow';
  eyebrow.textContent = (marker.dataset.bonusTitle || 'Бонус').toUpperCase();

  const text = document_.createElement('span');
  text.textContent = `«${marker.dataset.bonusText || 'Подобрать квест и получить подарок'}»`;

  link.append(badge, eyebrow, text);

  const close = document_.createElement('button');
  close.className = 'quiz-pop__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.textContent = '×';

  plaque.append(link, close);
  return { plaque, close };
};

const initBonus = (root) => {
  const marker = root.querySelector('[data-source-bonus]');
  if (!(marker instanceof HTMLElement) || marker.dataset.ready) return;
  marker.dataset.ready = 'true';
  if (stored(BONUS_DISMISSED_KEY)) return;

  const { plaque, close } = buildBonusPlaque(marker);
  plaque.hidden = true;
  // Снимок живёт внутри `.source-snapshot-shell`, которая до раскладки первого
  // кадра скрыта целиком; плавающая плашка от этого не зависит и переезжает в body.
  document.body.append(plaque);

  close.addEventListener('click', () => {
    plaque.hidden = true;
    document.body.classList.remove('quiz-pop-visible');
    remember(BONUS_DISMISSED_KEY);
  });

  globalThis.setTimeout(() => {
    plaque.hidden = false;
    document.body.classList.add('quiz-pop-visible');
  }, BONUS_DELAY_MS);
};

export function initSourceWidgets() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-source-snapshot]');
  if (!root) return;
  initMaps(root);
  initBonus(root);
}
