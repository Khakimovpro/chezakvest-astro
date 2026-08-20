// Модуль «controls» живого слоя: элементы управления внутри снимков Tilda.
//
// В снимке остаётся только разметка — обработчики, которые на оригинале вешает
// tilda-blocks-*.js, ушли вместе с вырезанным рантаймом. Здесь они восстановлены
// по исходному коду блоков:
//   • t395  — табы «Праздник в квесте / в VR / с играми» (переключают записи ниже);
//   • t585  — аккордеон «Часто задаваемые вопросы»;
//   • t604  — баннеры слайдера, ссылка которых лежит в meta[itemprop="caption"];
//   • tilda-cards — клик по всей карточке, а не только по её заголовку.
// Плюс починка рельс t1196/t1148: живой слой перехватывает указатель
// (setPointerCapture) ради перетаскивания, из-за чего клик прилетает самой
// рельсе, а не карточке-ссылке под курсором, и переход не происходит.

// Смещение указателя, после которого нажатие считается перетаскиванием, а не кликом.
const DRAG_SLOP = 6;
// Столько же, сколько у Tilda: удержание дольше — это выделение текста, не клик.
const CARD_CLICK_LIMIT = 300;
const RAIL_SLIDERS = '.t1196__slider, .t1148__slider';

const siteBase = () => (
  document.querySelector('.source-snapshot-shell')?.dataset.sourceSiteBase || ''
);

// Ссылки внутри снимка живут корневыми путями оригинала («/mystery_shack»),
// а превью стоит на базе вроде /chezakvest-preview и собирает маршруты со
// слэшем на конце — приводим адрес к тому же виду, что и остальные ссылки снимка.
const resolveSourceUrl = (raw, base) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(value)) return value;
  if (!value.startsWith('/')) return value;
  const withSlash = /[.?#]/u.test(value) || value.endsWith('/') ? value : `${value}/`;
  return `${base}${withSlash}`;
};

/* ------------------------------------------------------------------ рельсы */

// Клик по карточке рельсы съедает перехват указателя: событие click приходит на
// саму рельсу (цель захвата), ссылка его не видит. Ловим такой клик и повторяем
// его на ссылке, которая лежала под точкой нажатия, — если пальцем не тянули.
function initRailLinkRescue(scope) {
  scope.querySelectorAll(RAIL_SLIDERS).forEach((slider) => {
    if (slider.dataset.sourceRailLinksReady) return;
    slider.dataset.sourceRailLinksReady = 'true';

    let press = null;
    slider.addEventListener('pointerdown', (event) => {
      press = { x: event.clientX, y: event.clientY, dragged: false };
    }, true);
    slider.addEventListener('pointermove', (event) => {
      if (!press) return;
      if (Math.abs(event.clientX - press.x) > DRAG_SLOP
        || Math.abs(event.clientY - press.y) > DRAG_SLOP) press.dragged = true;
    }, true);
    slider.addEventListener('click', (event) => {
      const point = press;
      press = null;
      // Клик дошёл до ссылки сам (клавиатура, повтор ниже) — рельса не при чём.
      if (event.target instanceof Element && event.target.closest('a[href]')) return;
      if (!point || point.dragged) return;
      const under = slider.ownerDocument.elementFromPoint(point.x, point.y);
      const link = under instanceof Element ? under.closest('a[href]') : null;
      if (!link || !slider.contains(link)) return;
      event.preventDefault();
      link.click();
    }, true);
  });
}

/* ---------------------------------------------------------- баннеры t604 */

// На оригинале адрес баннера лежит в подписи слайда: «<заголовок>__<адрес>».
// Скрипт страницы разбирает её и вешает переход на картинку. Ссылки на попапы
// оживляет отдельный модуль, поэтому здесь только переходы на страницы.
function initBannerLinks(scope, base) {
  scope.querySelectorAll('.t-slds__item').forEach((item) => {
    if (item.dataset.sourceBannerReady) return;
    const caption = item.querySelector('meta[itemprop="caption"]')?.getAttribute('content') || '';
    if (!caption.includes('__')) return;
    const wrapper = item.querySelector('.t604__imgwrapper');
    if (!wrapper) return;
    const target = caption.split('__')[1] || '';
    if (!target || /^#(?:popup|form):/iu.test(target)) return;
    const href = resolveSourceUrl(target, base);
    if (!href) return;

    item.dataset.sourceBannerReady = 'true';
    const link = item.ownerDocument.createElement('a');
    link.className = 'source-banner-link';
    link.href = href;
    // Оригинал открывает баннер в новой вкладке — window.open(адрес, '_blank').
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', 'Подробнее');

    let press = null;
    link.addEventListener('pointerdown', (event) => {
      press = { x: event.clientX, y: event.clientY, dragged: false };
    });
    link.addEventListener('pointermove', (event) => {
      if (!press) return;
      if (Math.abs(event.clientX - press.x) > DRAG_SLOP
        || Math.abs(event.clientY - press.y) > DRAG_SLOP) press.dragged = true;
    });
    // Слайдер листают свайпом прямо по картинке — такой жест переходом не считаем.
    link.addEventListener('click', (event) => {
      const point = press;
      press = null;
      if (point?.dragged) event.preventDefault();
    });

    wrapper.insertAdjacentElement('afterbegin', link);
  });
}

/* -------------------------------------------------------------- табы t395 */

const tabRecordIds = (tab) => String(tab.getAttribute('data-tab-rec-ids') || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const showRecord = (id) => {
  const element = document.getElementById(`rec${id}`);
  if (!element) return;
  element.classList.remove('t395__off');
  element.setAttribute('aria-hidden', 'false');
  element.style.opacity = '';
};

const hideRecord = (id) => {
  const element = document.getElementById(`rec${id}`);
  if (!element) return;
  element.setAttribute('data-connect-with-tab', 'yes');
  element.setAttribute('data-animationappear', 'off');
  element.classList.add('t395__off');
  element.setAttribute('aria-hidden', 'true');
};

// Порт t395_alltabs_updateContent: показываем записи активной вкладки и гасим те,
// что закреплены только за остальными вкладками (общие записи остаются видимыми).
const updateTabContent = (rec) => {
  const tabs = [...rec.querySelectorAll('.t395__tab')];
  const active = tabs.filter((tab) => tab.classList.contains('t395__tab_active'));
  if (active.length !== 1) return;
  const shown = tabRecordIds(active[0]);
  const hidden = [];
  tabs.forEach((tab) => {
    if (tab === active[0]) return;
    tabRecordIds(tab).forEach((id) => {
      if (!shown.includes(id) && !hidden.includes(id)) hidden.push(id);
    });
  });
  shown.forEach(showRecord);
  hidden.forEach(hideRecord);
};

const updateTabSelect = (rec) => {
  const select = rec.querySelector('.t395__select');
  const active = rec.querySelector('.t395__tab_active');
  if (select && active) select.value = active.getAttribute('data-tab-rec-ids') || '';
};

// Оригинал помечает выбранную вкладку в адресе через history.replaceState —
// без записи в историю, чтобы кнопка «назад» вела на предыдущую страницу.
const rememberTabInUrl = (recId, tabNumber) => {
  if (typeof history?.replaceState !== 'function') return;
  try {
    const url = new URL(window.location.href);
    url.hash = `!/tab/${recId}-${tabNumber}`;
    history.replaceState('', '', url.toString());
  } catch {
    /* адрес мог оказаться недоступным — вкладка всё равно переключилась */
  }
};

const switchTab = (rec, recId, tab) => {
  const previous = rec.querySelector('.t395__tab_active');
  if (previous) {
    previous.classList.remove('t395__tab_active');
    const button = previous.querySelector('.t395__title');
    button?.setAttribute('tabindex', '-1');
    button?.setAttribute('aria-selected', 'false');
  }
  tab.classList.add('t395__tab_active');
  const button = tab.querySelector('.t395__title');
  button?.setAttribute('tabindex', '0');
  button?.setAttribute('aria-selected', 'true');

  const number = tab.getAttribute('data-tab-number') || '';
  if (number) rememberTabInUrl(recId, number);
  rec.querySelector('.t395__wrapper')?.setAttribute('data-tab-current', number);
  updateTabContent(rec);
  updateTabSelect(rec);
};

function initTabs(scope) {
  scope.querySelectorAll('.t395').forEach((block) => {
    const rec = block.closest('[id^="rec"]');
    if (!rec || rec.dataset.sourceTabsReady) return;
    const tabs = [...rec.querySelectorAll('.t395__tab')];
    if (!tabs.length) return;
    rec.dataset.sourceTabsReady = 'true';
    const recId = rec.id.replace(/^rec/u, '');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!tab.classList.contains('t395__tab_active')) switchTab(rec, recId, tab);
      });
      // Стрелками влево-вправо вкладки листаются так же, как на оригинале.
      tab.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowLeft' || event.key === 'Left' ? -1
          : event.key === 'ArrowRight' || event.key === 'Right' ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        const index = tabs.indexOf(tab);
        const next = tabs[(index + step + tabs.length) % tabs.length];
        switchTab(rec, recId, next);
        next.querySelector('.t395__title')?.focus();
      });
    });

    // На узком экране вместо вкладок Tilda показывает список — он переключает то же.
    const select = rec.querySelector('.t395__select');
    select?.addEventListener('change', () => {
      const tab = tabs.find((item) => item.getAttribute('data-tab-rec-ids') === select.value);
      if (tab) switchTab(rec, recId, tab);
    });

    // Адрес вида #!/tab/<запись>-<номер> открывает нужную вкладку сразу.
    const match = decodeURI(window.location.hash).match(/^#!\/tab\/(\d+)-(\d+)$/u);
    if (match && match[1] === recId) {
      const target = tabs.find((item) => item.getAttribute('data-tab-number') === match[2]);
      if (target && !target.classList.contains('t395__tab_active')) switchTab(rec, recId, target);
    }
  });
}

/* --------------------------------------------------------- аккордеон t585 */

// Порт t585_init: высота раскрывается через max-height, поэтому сначала ставим
// нулевую высоту, а на следующем кадре — измеренную, иначе перехода не будет.
const collapsePanel = (panel) => {
  if (!panel.style.maxHeight) panel.style.maxHeight = `${panel.scrollHeight}px`;
  window.setTimeout(() => { panel.style.maxHeight = '0px'; }, 0);
};

function initAccordions(scope) {
  scope.querySelectorAll('.t585__accordion').forEach((accordion) => {
    if (accordion.dataset.sourceAccordionReady) return;
    accordion.dataset.sourceAccordionReady = 'true';
    // Блок сам говорит, гасить ли соседей при раскрытии очередного вопроса.
    const single = accordion.getAttribute('data-accordion') === 'true';
    const headers = [...accordion.querySelectorAll('.t585__header')];

    headers.forEach((header) => {
      header.addEventListener('click', () => {
        const panel = header.nextElementSibling;
        if (!(panel instanceof HTMLElement)) return;
        const button = header.querySelector('.t585__trigger-button');
        if (button) {
          const expanded = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', String(!expanded));
          panel.hidden = expanded;
        }
        if (header.classList.contains('t585__opened')) {
          header.classList.remove('t585__opened');
          collapsePanel(panel);
          return;
        }
        if (single) {
          headers.forEach((other) => {
            if (other === header || !other.classList.contains('t585__opened')) return;
            other.classList.remove('t585__opened');
            const otherPanel = other.nextElementSibling;
            if (otherPanel instanceof HTMLElement) collapsePanel(otherPanel);
          });
        }
        header.classList.add('t585__opened');
        panel.style.display = 'block';
        const height = panel.scrollHeight;
        panel.style.maxHeight = '0px';
        window.setTimeout(() => { panel.style.maxHeight = `${height}px`; }, 0);
      });
    });
  });
}

/* ------------------------------------------------------- клик по карточке */

// Порт t_card__moveClickOnCard: на оригинале ссылка лежит в заголовке карточки,
// а нажимается вся карточка целиком.
function initCardClicks(scope) {
  scope.querySelectorAll('.t-card__col').forEach((card) => {
    if (card.dataset.sourceCardClickReady) return;
    const link = card.querySelector('.t-card__link');
    if (!link) return;
    card.dataset.sourceCardClickReady = 'true';
    card.style.cursor = 'pointer';

    let pressedAt = 0;
    card.addEventListener('mousedown', () => { pressedAt = Date.now(); });
    card.addEventListener('mouseup', (event) => {
      if (Date.now() - pressedAt >= CARD_CLICK_LIMIT) return;
      const target = event.target;
      if (target instanceof Element
        && target.closest('.t-card__link, .t-card__link_second, .ql-undercut')) return;
      if (event.button === 0) {
        link.click();
        return;
      }
      // Средней кнопкой карточка открывается в новой вкладке, как ссылка.
      if (event.button === 1) {
        const authored = link.getAttribute('target');
        link.setAttribute('target', '_blank');
        link.click();
        if (authored) link.setAttribute('target', authored);
        else link.removeAttribute('target');
      }
    });
  });
}

export function initSourceControls() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-source-snapshot]');
  if (!root) return;
  const base = siteBase();
  initRailLinkRescue(root);
  initBannerLinks(root, base);
  initTabs(root);
  initAccordions(root);
  initCardClicks(root);
}
