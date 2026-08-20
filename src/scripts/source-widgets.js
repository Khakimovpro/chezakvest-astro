// Локальные виджеты внутри снимков Tilda: карта площадок, подсказки к адресам,
// ленивые фоны и плашка «БОНУС». Генератор снимков
// (_capture/build_source_snapshots.py) оставляет на месте сторонних виджетов
// локальную разметку и маркеры с данными, а весь показ и единственный внешний
// запрос (карта) живут здесь.
//
// Карта на оригинале живая сразу, поэтому кнопки «Показать карту» у нас больше
// нет: iframe заказывается, когда блок подходит к экрану. Первый экран от этого
// не тяжелеет — до карты надо доскроллить.

const MAP_TITLE = 'Карта площадок «Чё за Квест» в Ростове-на-Дону';
// Запас, за который до появления карты уходит запрос: примерно пол-экрана
// прокрутки, чтобы к моменту показа Яндекс уже отрисовал плитки.
const MAP_MARGIN = '500px 0px';
// Подсказка площадки: те же паузы, что у tooltipster на оригинале.
const TIP_OPEN_DELAY = 120;
const TIP_CLOSE_DELAY = 200;
// Отступ карточки от плитки — как в оригинале (низ плитки + 12 px).
const TIP_OFFSET = 12;
// Фон подставляем за полэкрана до появления, чтобы к прокрутке он уже был готов.
const LAZY_BACKGROUND_MARGIN = '300px 0px';
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

export const activateMap = (stage) => {
  if (stage.querySelector('iframe')) return;
  const frame = stage.ownerDocument.createElement('iframe');
  frame.src = stage.dataset.sourceMapEmbed;
  frame.title = stage.dataset.sourceMapTitle || MAP_TITLE;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  frame.setAttribute('allow', 'geolocation');
  // Постер убираем только после ответа Яндекса: пока карта едет, на месте блока
  // остаётся картинка, а не белая дыра.
  frame.addEventListener('load', () => {
    stage.dataset.sourceMapActive = 'true';
  }, { once: true });
  stage.append(frame);
  // Кнопка осталась в старых снимках: пока она есть, ей нечего делать.
  stage.querySelector('[data-source-map-load]')?.remove();
};

const initMaps = (root) => {
  const stages = Array.from(root.querySelectorAll('[data-source-map][data-source-map-embed]'))
    .filter((stage) => stage instanceof HTMLElement && !stage.dataset.ready);
  if (!stages.length) return;
  stages.forEach((stage) => { stage.dataset.ready = 'true'; });
  if (typeof IntersectionObserver !== 'function') {
    stages.forEach(activateMap);
    return;
  }
  const observer = new IntersectionObserver((entries, self) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
      self.unobserve(entry.target);
      activateMap(entry.target);
    });
  }, { rootMargin: MAP_MARGIN });
  stages.forEach((stage) => observer.observe(stage));
};

// Подсказка адреса: название площадки и список её квестов. Разметку отдаёт
// запись T300 из самого снимка (`[data-source-tooltip-id]`), связь с плиткой
// ставит генератор (`link_venue_tooltips`), а тут — показ и раскладка.
const buildTip = (source, document_) => {
  const tip = document_.createElement('div');
  tip.className = 'source-tip';
  tip.setAttribute('role', 'tooltip');
  tip.id = `source-tip-${source.dataset.sourceTooltipId}`;
  tip.hidden = true;
  const colour = source.dataset.sourceTooltipColor;
  if (colour) tip.style.background = colour;
  const content = source.querySelector('.t300__content');
  if (content) {
    const copy = content.cloneNode(true);
    while (copy.firstChild) tip.append(copy.firstChild);
  }
  const arrow = document_.createElement('span');
  arrow.className = 'source-tip__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  tip.append(arrow);
  return tip;
};

// Карточку кладём под плитку и центруем по ней, а если снизу места нет —
// поднимаем над плиткой. Считаем в координатах окна и переводим их в систему
// того предка, от которого карточка отсчитывается, — так раскладка не зависит
// от прокрутки и от того, где именно в снимке она висит.
const placeTip = (chip, tip) => {
  if (!chip || !tip) return;
  const rect = chip.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const view = tip.ownerDocument.defaultView;
  const centre = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(8, centre - width / 2),
    Math.max(8, view.innerWidth - width - 8),
  );
  const below = rect.bottom + TIP_OFFSET;
  const above = rect.top - TIP_OFFSET - height;
  const up = below + height > view.innerHeight && above > 0;
  const anchored = up ? above : below;
  // Самый длинный список (18 позиций на 40-летия Победы) не влезает ни вниз, ни
  // вверх. Оригинал в этом случае увозит карточку за верхний край экрана —
  // подтягиваем её обратно в окно, а стрелку-указатель убираем: она бы уже не
  // смотрела на плитку.
  const top = height + 16 <= view.innerHeight
    ? Math.min(Math.max(8, anchored), view.innerHeight - height - 8)
    : anchored;
  const host = tip.offsetParent || tip.ownerDocument.documentElement;
  const origin = host.getBoundingClientRect();
  tip.classList.toggle('source-tip_up', up);
  tip.style.left = `${left - origin.left}px`;
  tip.style.top = `${top - origin.top}px`;
  const arrow = tip.querySelector('.source-tip__arrow');
  if (arrow) {
    arrow.hidden = Math.abs(top - anchored) > 1;
    arrow.style.left = `${Math.min(Math.max(12, centre - left), width - 12)}px`;
  }
};

const initVenueTips = (root) => {
  const sources = new Map();
  root.querySelectorAll('[data-source-tooltip-id]').forEach((source) => {
    sources.set(String(source.dataset.sourceTooltipId), source);
  });
  const chips = Array.from(root.querySelectorAll('[data-source-tooltip]'))
    .filter((chip) => chip instanceof HTMLElement && !chip.dataset.tipReady);
  if (!chips.length || !sources.size) return;
  // На телефоне плитка — обычная ссылка на страницу площадки, и подсказка там
  // только мигнёт перед переходом. Показываем её там, где есть настоящий курсор.
  if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;

  let openChip = null;
  let timer = 0;
  const tips = new Map();

  const tipFor = (chip) => {
    const name = String(chip.dataset.sourceTooltip);
    if (tips.has(name)) return tips.get(name);
    const source = sources.get(name);
    if (!source) return null;
    const tip = buildTip(source, document);
    // Карточка живёт внутри снимка: её оформление в SOURCE_WIDGET_STYLE
    // подписано `[data-source-snapshot]`, за пределами корня оно не действует.
    root.append(tip);
    tips.set(name, tip);
    return tip;
  };

  const close = () => {
    if (!openChip) return;
    const tip = tips.get(String(openChip.dataset.sourceTooltip));
    if (tip) tip.hidden = true;
    openChip.removeAttribute('aria-describedby');
    openChip = null;
  };
  const open = (chip) => {
    const tip = tipFor(chip);
    if (!tip) return;
    if (openChip && openChip !== chip) close();
    tip.hidden = false;
    chip.setAttribute('aria-describedby', tip.id);
    openChip = chip;
    placeTip(chip, tip);
  };
  const later = (action, delay) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(action, delay);
  };

  chips.forEach((chip) => {
    chip.dataset.tipReady = 'true';
    chip.addEventListener('mouseenter', () => later(() => open(chip), TIP_OPEN_DELAY));
    chip.addEventListener('mouseleave', () => later(close, TIP_CLOSE_DELAY));
    chip.addEventListener('focus', () => open(chip));
    chip.addEventListener('blur', () => later(close, TIP_CLOSE_DELAY));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  // Прокрутка и поворот экрана уводят плитку из-под карточки — держим их рядом.
  window.addEventListener('scroll', () => openChip && placeTip(openChip, tips.get(String(openChip.dataset.sourceTooltip))), { passive: true });
  window.addEventListener('resize', () => openChip && placeTip(openChip, tips.get(String(openChip.dataset.sourceTooltip))), { passive: true });
};

// Фоновые слои Tilda, которым генератор не выдал инлайновый background-image:
// ссылка ждёт в data-source-lazy-bg, пока слой не подойдёт к экрану. Без этого
// страница тянула все фоны сразу — на /kids/ это 96 файлов на загрузке.
const applyLazyBackground = (element) => {
  const source = element.dataset.sourceLazyBg;
  if (!source) return;
  element.style.backgroundImage = `url("${source}")`;
  // Возвращаем родной атрибут Tilda: по нему слой узнаёт остальной код снимка.
  element.dataset.original = source;
  delete element.dataset.sourceLazyBg;
  element.classList.add('loaded');
};

const initLazyBackgrounds = (root) => {
  const layers = root.querySelectorAll('[data-source-lazy-bg]');
  if (!layers.length) return;
  if (typeof IntersectionObserver !== 'function') {
    layers.forEach(applyLazyBackground);
    return;
  }
  const observer = new IntersectionObserver((entries, self) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
      self.unobserve(entry.target);
      applyLazyBackground(entry.target);
    });
  }, { rootMargin: LAZY_BACKGROUND_MARGIN });
  layers.forEach((layer) => observer.observe(layer));
};

// Снимки праздников содержат локальный видеоблок Tilda: у него уже есть
// декоративная кнопка, но обработчик оставался в вырезанном legacy runtime.
// Запускаем только по явному действию гостя — видео не участвует в первом весе.
export const bindLocalVideo = (video, trigger) => {
  const showTrigger = () => trigger.classList.remove('hidden');
  const hideTrigger = () => trigger.classList.add('hidden');
  trigger.setAttribute('aria-label', 'Воспроизвести видео');
  trigger.addEventListener('click', () => {
    video.play().then(hideTrigger).catch(showTrigger);
  });
  video.addEventListener('play', hideTrigger);
  video.addEventListener('pause', () => {
    if (!video.ended) showTrigger();
  });
  video.addEventListener('ended', showTrigger);
};

const initLocalVideos = (root) => {
  root.querySelectorAll('.video-box').forEach((box) => {
    if (!(box instanceof HTMLElement) || box.dataset.ready) return;
    const video = box.querySelector('.custom-video');
    const trigger = box.querySelector('.video-play-btn');
    if (!(video instanceof HTMLVideoElement) || !(trigger instanceof HTMLButtonElement)) return;
    box.dataset.ready = 'true';
    bindLocalVideo(video, trigger);
  });
};

// Rutube and the older lazy video records are deliberately inert in generated
// HTML: their network request is created only after the guest asks to play.
export const activateSourceVideo = (stage) => {
  if (stage.dataset.sourceVideoActive) return;
  const kind = stage.dataset.sourceVideoKind;
  let deferredUrl = '';
  try {
    deferredUrl = decodeURIComponent(stage.dataset.sourceVideoUrl || '');
  } catch {
    return;
  }
  // The original Tilda attribute keeps Rutube's signed `p` query parameter.
  // It is required for some embeds, so do not reduce the source to the id.
  const source = kind === 'rutube'
    ? `https://rutube.ru/play/embed/${stage.dataset.rutubeid || stage.dataset.sourceVideoId}`
    : deferredUrl;
  if (!source) return;
  const document_ = stage.ownerDocument;
  let media;
  if (kind === 'video') {
    media = document_.createElement('video');
    media.src = source;
    media.controls = true;
    media.autoplay = true;
    media.playsInline = true;
  } else {
    media = document_.createElement('iframe');
    media.src = source;
    media.title = 'Видео';
    media.allow = 'autoplay; fullscreen; picture-in-picture';
    media.allowFullscreen = true;
    media.referrerPolicy = 'strict-origin-when-cross-origin';
  }
  media.className = 'source-video__media';
  stage.append(media);
  stage.dataset.sourceVideoActive = 'true';
};

const initSourceVideos = (root) => {
  root.querySelectorAll('[data-source-video-kind]').forEach((stage) => {
    if (!(stage instanceof HTMLElement) || stage.dataset.ready) return;
    stage.dataset.ready = 'true';
    stage.querySelector('[data-source-video-play]')?.addEventListener('click', () => activateSourceVideo(stage), { once: true });
  });
};

// Плашку рисует наш код, а раскраску ссылок внутри неё — глобальные стили Tilda
// из шапки документа: без своего правила подпись остаётся синей и подчёркнутой,
// как необработанная ссылка. Поэтому оформление едет здесь же, рядом с разметкой,
// и селекторами по классам перебивает правила уровня тега.
const BONUS_STYLE_ID = 'source-bonus-style';
const BONUS_STYLE = `
.quiz-pop{overflow:visible}
.quiz-pop .quiz-pop__link{color:#fff;text-decoration:none;padding-left:64px}
.quiz-pop .quiz-pop__link:hover,.quiz-pop .quiz-pop__link:focus{color:#fff;text-decoration:none}
.quiz-pop .quiz-pop__badge{left:18px;width:32px;height:32px;background:none;border-radius:0;color:#fff}
.quiz-pop .quiz-pop__badge svg{display:block;width:100%;height:100%}
.quiz-pop .quiz-pop__eyebrow{letter-spacing:.16em}
.quiz-pop .quiz-pop__close{position:absolute;right:-4px;top:-4px;display:grid;place-items:center;width:26px;height:26px;flex:none;border-radius:50%;background:#fff;color:#1c1c1c;font-size:17px;font-weight:400;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
`;

const ensureBonusStyle = (document_) => {
  if (document_.getElementById(BONUS_STYLE_ID)) return;
  const style = document_.createElement('style');
  style.id = BONUS_STYLE_ID;
  style.textContent = BONUS_STYLE;
  document_.head.append(style);
};

// Иконка документа с галочкой — то же, что на оригинале слева в плашке.
const bonusIcon = (document_) => {
  const svg = document_.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const outline = document_.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M14 2.75H6.25A1.5 1.5 0 0 0 4.75 4.25v15.5a1.5 1.5 0 0 0 1.5 1.5h11.5a1.5 1.5 0 0 0 1.5-1.5V7.75Z');
  const fold = document_.createElementNS('http://www.w3.org/2000/svg', 'path');
  fold.setAttribute('d', 'M14 2.75v5h5.25');
  const lines = document_.createElementNS('http://www.w3.org/2000/svg', 'path');
  lines.setAttribute('d', 'M8 10.5h4M8 13.5h3');
  const check = document_.createElementNS('http://www.w3.org/2000/svg', 'path');
  check.setAttribute('d', 'm8 17 1.7 1.7L13.5 15');
  svg.append(outline, fold, lines, check);
  return svg;
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
  badge.append(bonusIcon(document_));

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

  ensureBonusStyle(document);
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
  initVenueTips(root);
  initLazyBackgrounds(root);
  initLocalVideos(root);
  initSourceVideos(root);
  initBonus(root);
}
