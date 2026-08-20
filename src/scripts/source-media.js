// Модуль «media» живого слоя: фото и видео внутри снимков Tilda.
//
// Что здесь живёт и почему:
//  * кадрирование слайдов галерей Zero Block — настройки кадра лежат в
//    data-атрибутах элемента, а применял их вырезанный рантайм Tilda;
//  * полноэкранный просмотр фото по клику — на оригинале это t-zoomer,
//    его разметку и обработчики снимок тоже не сохранил;
//  * кнопка Play на первом экране квеста — её модалку рисовал inline-скрипт,
//    который санитайзер убирает вместе со всеми <script> снимка;
//  * доводка позиции этой кнопки: общий расчёт Zero Block промахивается на
//    якорях «справа»/«снизу», и кнопка уезжает под шапку.

const ZOOM_LABEL = 'Открыть фото на весь экран';
const FILM_FADE_MS = 250;

// ——— Кадр слайда галереи ———————————————————————————————————————————————

// Оригинал просит у CDN уже обрезанный под слот кадр и рисует его cover/contain.
// В снимке остаётся исходный файл, а правило background-size Tilda пишет только
// внутри медиазапросов — на десктопе фон брал натуральный размер, и снимок
// выглядел сильным «зумом»: у фото «как дойти» пропадал номер шага и обрывалась
// траектория маршрута. Настройки кадра лежат в самом снимке, берём их оттуда.
const applyGalleryFit = (gallery) => {
  const stretch = gallery.getAttribute('data-field-slds_stretch-value');
  const position = gallery.getAttribute('data-field-slds_imgposition-value');
  gallery.querySelectorAll('.tn-atom__slds-img').forEach((slide) => {
    if (!(slide instanceof HTMLElement)) return;
    if (stretch) slide.style.backgroundSize = stretch;
    if (position) slide.style.backgroundPosition = position;
  });
};

// ——— Полноэкранный просмотр ———————————————————————————————————————————

const zoomSource = (node) => {
  const attribute = node.getAttribute('data-img-zoom-url')
    || node.getAttribute('data-original')
    || node.getAttribute('data-source-lazy-img');
  if (attribute) return attribute;
  if (node instanceof HTMLImageElement && (node.currentSrc || node.src)) return node.currentSrc || node.src;
  const background = node.ownerDocument.defaultView?.getComputedStyle(node).backgroundImage || '';
  return /url\(["']?(.+?)["']?\)/.exec(background)?.[1] || '';
};

const zoomCaption = (node) => node.getAttribute('alt') || node.getAttribute('aria-label') || '';

const controlButton = (document_, className, label, glyph) => {
  const button = document_.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.textContent = glyph;
  return button;
};

const buildViewer = (document_) => {
  const dialog = document_.createElement('dialog');
  dialog.className = 'source-zoomer';
  dialog.setAttribute('aria-label', 'Просмотр фото');
  // Открытое модальное окно само уводит фокус на первую кнопку, и у стрелки
  // появляется рамка, которой на оригинале нет. Держим фокус на самом окне:
  // Esc и стрелки работают, а Tab по-прежнему ведёт по кнопкам.
  dialog.tabIndex = -1;

  const stage = document_.createElement('div');
  stage.className = 'source-zoomer__stage';
  const image = document_.createElement('img');
  image.className = 'source-zoomer__img';
  image.alt = '';
  image.decoding = 'async';
  stage.append(image);

  const previous = controlButton(document_, 'source-zoomer__arrow source-zoomer__arrow_prev', 'Предыдущее фото', '‹');
  const next = controlButton(document_, 'source-zoomer__arrow source-zoomer__arrow_next', 'Следующее фото', '›');
  const close = controlButton(document_, 'source-zoomer__close', 'Закрыть просмотр', '×');
  const counter = document_.createElement('p');
  counter.className = 'source-zoomer__counter';

  dialog.append(stage, previous, next, close, counter);
  document_.body.append(dialog);
  return { dialog, image, previous, next, close, counter };
};

const createViewer = (document_) => {
  const { dialog, image, previous, next, close, counter } = buildViewer(document_);
  let group = [];
  let index = 0;
  let restoreOverflow = '';
  let touchStart = null;

  const show = (candidate) => {
    if (!group.length) return;
    index = ((candidate % group.length) + group.length) % group.length;
    const source = zoomSource(group[index]);
    if (!source) return;
    image.src = source;
    image.alt = zoomCaption(group[index]);
    const many = group.length > 1;
    previous.hidden = !many;
    next.hidden = !many;
    counter.textContent = many ? `${index + 1} / ${group.length}` : '';
    // Соседние кадры подгружаем заранее: у оригинала переключение мгновенное.
    if (many) {
      [1, -1].forEach((shift) => {
        const neighbour = zoomSource(group[(index + shift + group.length) % group.length]);
        if (neighbour) new Image().src = neighbour;
      });
    }
  };

  const open = (nodes, startIndex) => {
    group = nodes;
    show(startIndex);
    if (!image.getAttribute('src')) return;
    restoreOverflow = document_.documentElement.style.overflow;
    document_.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    dialog.focus();
  };

  const dismiss = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener('close', () => {
    document_.documentElement.style.overflow = restoreOverflow;
    image.removeAttribute('src');
    image.alt = '';
    group = [];
  });
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', dismiss);
  // Клик мимо снимка закрывает просмотр — так же ведёт себя оригинал.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target === image.parentElement) dismiss();
  });
  document_.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    }
  });
  dialog.addEventListener('touchstart', (event) => {
    touchStart = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    const end = event.changedTouches[0]?.clientX ?? null;
    if (touchStart === null || end === null) return;
    const shift = end - touchStart;
    touchStart = null;
    if (Math.abs(shift) > 60) show(index + (shift < 0 ? 1 : -1));
  }, { passive: true });

  return open;
};

const markTrigger = (node, groups, key) => {
  if (!(node instanceof HTMLElement) || node.dataset.sourceZoomGroup) return;
  const bucket = groups.get(key) || [];
  if (!groups.has(key)) groups.set(key, bucket);
  node.dataset.sourceZoomGroup = key;
  node.dataset.sourceZoomIndex = String(bucket.length);
  node.setAttribute('data-source-zoom', '');
  if (!node.getAttribute('aria-label') && !(node instanceof HTMLImageElement)) {
    node.setAttribute('aria-label', ZOOM_LABEL);
  }
  bucket.push(node);
};

const collectZoomGroups = (root) => {
  const groups = new Map();
  // Галереи Zero Block: признак увеличения хранится настройкой элемента.
  [...root.querySelectorAll('[data-elem-type="gallery"]')].forEach((gallery, order) => {
    if (!(gallery instanceof HTMLElement)) return;
    applyGalleryFit(gallery);
    if (gallery.getAttribute('data-field-zoomable-value') !== 'y') return;
    const key = `gallery-${gallery.dataset.elemId || 'elem'}-${order}`;
    gallery.querySelectorAll('.tn-atom__slds-img').forEach((slide) => markTrigger(slide, groups, key));
  });
  // Обычные блоки Tilda (T979, T662, T1148, слайдеры): снимок сохранил родные
  // маркеры увеличения, группа у оригинала — в пределах одной записи.
  root.querySelectorAll('[data-zoomable="yes"]').forEach((node) => {
    const record = node.closest('[id^="rec"]');
    markTrigger(node, groups, `record-${record ? record.id : 'page'}`);
  });
  return groups;
};

const initZoom = (root, document_) => {
  const groups = collectZoomGroups(root);
  if (!groups.size) return;
  const open = createViewer(document_);
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-source-zoom]') : null;
    if (!(target instanceof HTMLElement)) return;
    const bucket = groups.get(target.dataset.sourceZoomGroup || '');
    if (!bucket) return;
    event.preventDefault();
    open(bucket, Number(target.dataset.sourceZoomIndex) || 0);
  });
};

// ——— Кнопка Play на первом экране квеста ———————————————————————————————

// Разметка и стили модалки (.pb-modal) уже лежат в снимке — их писал сам блок
// Tilda. Не было только обработчика: он жил в inline-скрипте рядом с кнопкой.
// Адрес ролика генератор снимков переносит на кнопку в data-source-play-video.
const openFilm = (button, document_) => {
  let address = '';
  try {
    address = decodeURIComponent(button.dataset.sourcePlayVideo || '');
  } catch {
    return;
  }
  if (!address) return;

  const modal = document_.createElement('div');
  modal.className = 'pb-modal';
  const inner = document_.createElement('div');
  inner.className = 'pb-modal-inner';
  const close = controlButton(document_, 'pb-close', 'Закрыть видео', '×');
  const video = document_.createElement('video');
  video.src = address;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  inner.append(close, video);
  modal.append(inner);
  document_.body.append(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const dismiss = () => {
    video.pause();
    modal.classList.remove('open');
    document_.removeEventListener('keydown', onKey);
    globalThis.setTimeout(() => modal.remove(), FILM_FADE_MS);
  };
  function onKey(event) {
    if (event.key === 'Escape') dismiss();
  }
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target === inner || event.target === close) dismiss();
  });
  document_.addEventListener('keydown', onKey);
};

const initPlayButtons = (root, document_) => {
  root.querySelectorAll('.play-btn[data-source-play-video]').forEach((button) => {
    if (!(button instanceof HTMLElement) || button.dataset.sourceFilmReady) return;
    button.dataset.sourceFilmReady = 'true';
    button.addEventListener('click', () => openFilm(button, document_));
  });
};

// ——— Позиция кнопки Play ————————————————————————————————————————————————

const RESPONSIVE_STEPS = [[1199, 960], [959, 640], [639, 480], [479, 320]];

const responsiveAttribute = (element, prefix) => {
  let value = element.getAttribute(`data-${prefix}-value`);
  RESPONSIVE_STEPS.forEach(([maximum, suffix]) => {
    if (window.innerWidth <= maximum) {
      value = element.getAttribute(`data-${prefix}-res-${suffix}-value`) ?? value;
    }
  });
  return value;
};

const gridWidth = () => {
  if (window.innerWidth >= 1200) return 1200;
  if (window.innerWidth >= 960) return 960;
  if (window.innerWidth >= 640) return 640;
  if (window.innerWidth >= 480) return 480;
  return 320;
};

// Общий расчёт Zero Block в снимке считает якоря «справа» и «снизу» как
// «отступ от края», а Tilda откладывает их иначе: край элемента совмещается с
// краем сетки, и поле left/top только сдвигает его дальше. Из-за этого кнопка Play
// уезжала в правый верхний угол и пряталась под шапкой. Пересчитываем ровно ту
// же формулу, что стоит в собственном CSS снимка: boundary − size + offset.
const anchoredPosition = (element, artboard) => {
  const axisX = responsiveAttribute(element, 'field-axisx') || 'left';
  const axisY = responsiveAttribute(element, 'field-axisy') || 'top';
  if (axisX !== 'right' && axisY !== 'bottom') return null;
  const base = gridWidth();
  const container = responsiveAttribute(element, 'field-container') || 'grid';
  const boundary = container === 'window' ? window.innerWidth : base;
  const shift = container === 'window' ? 0 : (window.innerWidth - base) / 2;
  const position = {};
  if (axisX === 'right') position.left = `${shift + boundary - element.offsetWidth + Number(responsiveAttribute(element, 'field-left') || 0)}px`;
  if (axisY === 'bottom') position.top = `${artboard.offsetHeight - element.offsetHeight + Number(responsiveAttribute(element, 'field-top') || 0)}px`;
  return position;
};

const keepPlayButtonAnchored = (root) => {
  root.querySelectorAll('.play-btn').forEach((button) => {
    const element = button.closest('.t396__elem');
    const artboard = button.closest('.t396__artboard');
    if (!(element instanceof HTMLElement) || !(artboard instanceof HTMLElement)) return;
    if (element.dataset.sourceAnchorReady) return;
    element.dataset.sourceAnchorReady = 'true';
    // Масштабируемые артборды (upscale=window) живут по своим правилам —
    // их геометрию не трогаем.
    if (artboard.getAttribute('data-artboard-upscale') === 'window') return;
    const apply = () => {
      const position = anchoredPosition(element, artboard);
      if (!position) return;
      Object.entries(position).forEach(([property, value]) => {
        if (element.style[property] !== value) element.style[property] = value;
      });
    };
    apply();
    // Раскладка снимка пересчитывает инлайн-стили при изменении ширины и через
    // отложенные проходы — возвращаем своё значение сразу после каждой записи.
    new MutationObserver(apply).observe(element, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', apply, { passive: true });
  });
};

export function initSourceMedia() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-source-snapshot]');
  if (!(root instanceof HTMLElement) || root.dataset.sourceMediaReady) return;
  root.dataset.sourceMediaReady = 'true';
  initZoom(root, document);
  initPlayButtons(root, document);
  keepPlayButtonAnchored(root);
}
