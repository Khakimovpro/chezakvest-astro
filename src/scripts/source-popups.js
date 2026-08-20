// Родные попапы Tilda, сохранённые в снимке, и плавная прокрутка по якорям.
//
// Оригинал под каждую кнопку открывает своё окно: «Купить сертификат», «Заказать
// звонок», «Рассчитать стоимость», окна залов и площадок. Разметка этих окон и
// стили Tilda в снимке есть целиком, а связь «кнопка → окно» генератор снимков
// кладёт в data-source-popup (href остаётся запасным путём для браузера без JS).
//
// Адресную строку здесь не трогает ни открытие, ни закрытие: именно из-за смены
// хэша страница прыгала наверх, стоило закрыть окно.

const SHOW_CLASS = 't-popup_show';
// Ровно столько длится переход opacity в tilda-popup-1.1.min.css.
const FADE_MS = 300;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let current = null;
let lastFocused = null;
let closeTimer = 0;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Полоса прокрутки исчезает вместе с прокруткой страницы, и без компенсации
// вёрстка под окном дёргается вправо на её ширину.
function lockScroll() {
  const gap = window.innerWidth - document.documentElement.clientWidth;
  document.body.dataset.sourcePopupScroll = String(window.scrollY);
  document.body.style.overflow = 'hidden';
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
}

function unlockScroll() {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  delete document.body.dataset.sourcePopupScroll;
}

function popupByHook(hook) {
  if (!hook) return null;
  const target = hook.startsWith('#') ? hook : `#${hook}`;
  return document.querySelector(`.t-popup[data-tooltip-hook="${CSS.escape(target)}"]`)
    // Часть окон снята без хука, но с собственным id записи.
    ?? document.querySelector(`${CSS.escape(target)} .t-popup`);
}

function focusFirstControl(popup) {
  const container = popup.querySelector('.t-popup__container') ?? popup;
  const field = container.querySelector('input:not([type="hidden"]):not([disabled]), textarea, select');
  const fallback = container.querySelector(FOCUSABLE);
  const target = field ?? fallback ?? container;
  if (target instanceof HTMLElement) {
    // preventScroll: фокус в поле не должен утаскивать страницу под окном.
    target.focus({ preventScroll: true });
  }
}

export function openSourcePopup(popup) {
  if (!(popup instanceof HTMLElement) || current === popup) return false;
  if (current) closeSourcePopup({ restoreFocus: false });
  window.clearTimeout(closeTimer);
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lockScroll();
  popup.style.display = 'block';
  popup.setAttribute('aria-hidden', 'false');
  current = popup;
  const show = () => popup.classList.add(SHOW_CLASS);
  if (reducedMotion()) show();
  // Класс с переходом вешаем следующим кадром: иначе браузер применит его
  // вместе с display и окно появится рывком, без проявления.
  else requestAnimationFrame(() => requestAnimationFrame(show));
  focusFirstControl(popup);
  return true;
}

export function closeSourcePopup({ restoreFocus = true } = {}) {
  const popup = current;
  if (!popup) return false;
  current = null;
  popup.classList.remove(SHOW_CLASS);
  popup.setAttribute('aria-hidden', 'true');
  unlockScroll();
  const hide = () => { popup.style.display = ''; };
  if (reducedMotion()) hide();
  else closeTimer = window.setTimeout(hide, FADE_MS);
  if (restoreFocus && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
  return true;
}

// Запасное окно на случай, когда родного окна для этой кнопки в снимке нет.
function openLocalBooking() {
  const local = document.querySelector('#source-booking');
  if (!(local instanceof HTMLElement)) return false;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  local.classList.add('source-booking_show');
  lockScroll();
  const field = local.querySelector('input:not([type="checkbox"]):not([disabled])');
  if (field instanceof HTMLElement) field.focus({ preventScroll: true });
  return true;
}

function closeLocalBooking() {
  const local = document.querySelector('#source-booking.source-booking_show');
  if (!(local instanceof HTMLElement)) return false;
  local.classList.remove('source-booking_show');
  unlockScroll();
  if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
  return true;
}

function headerOffset() {
  const header = document.querySelector('.hdr, #t-header, header.site-header, header');
  if (!(header instanceof HTMLElement)) return 0;
  const fixed = getComputedStyle(header).position;
  return fixed === 'fixed' || fixed === 'sticky' ? header.offsetHeight : 0;
}

// Оригинал ведёт к блоку прокруткой и не пишет якорь в адрес: и «поиграть», и
// «смотреть все адреса» оставляют посетителя на том же URL.
export function scrollToTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset() - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  return true;
}

function targetForHash(hash) {
  const id = decodeURIComponent(String(hash).replace(/^#/u, ''));
  if (!id) return null;
  return document.getElementById(id) ?? document.querySelector(`[name="${CSS.escape(id)}"]`);
}

export function initSourcePopups() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;

    // Закрытие: крестик, подложка вокруг окна, кнопка «закрыть» внутри окна.
    if (current) {
      const closer = element.closest('.t-popup__close, .t-popup__block-close, .t-popup__close-wrapper, [data-source-popup-close]');
      const insideContainer = element.closest('.t-popup__container');
      if (closer || (!insideContainer && element.closest('.t-popup') === current)) {
        event.preventDefault();
        closeSourcePopup();
        return;
      }
    }
    const localOpen = document.querySelector('#source-booking.source-booking_show');
    if (localOpen) {
      const closer = element.closest('.source-booking__close, .source-booking__backdrop');
      if (closer) {
        event.preventDefault();
        closeLocalBooking();
        return;
      }
    }

    const trigger = element.closest('[data-source-popup], a[href="#source-booking"], a[href^="#popup:"]');
    if (trigger instanceof HTMLElement) {
      const hook = trigger.dataset.sourcePopup
        ?? (trigger.getAttribute('href')?.startsWith('#popup:') ? trigger.getAttribute('href') : '');
      const popup = popupByHook(hook);
      event.preventDefault();
      if (popup) openSourcePopup(popup);
      else openLocalBooking();
      return;
    }

    // Остальные внутристраничные ссылки: плавно ведём к блоку, адрес не меняем.
    const anchor = element.closest('a[href^="#"]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const hash = anchor.getAttribute('href') ?? '';
    if (hash === '#') {
      event.preventDefault();
      return;
    }
    const target = targetForHash(hash);
    if (!target) return;
    event.preventDefault();
    scrollToTarget(target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (closeSourcePopup() || closeLocalBooking()) event.preventDefault();
  });

  // Фокус не должен уходить за пределы открытого окна.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !current) return;
    const container = current.querySelector('.t-popup__container') ?? current;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  // Адрес со ссылкой на блок (пришли по внешней ссылке) отрабатываем сами:
  // у снимка первый экран появляется после расчёта раскладки, и штатный переход
  // браузера к якорю случается раньше, чем блок встаёт на место.
  const initialTarget = targetForHash(window.location.hash);
  if (initialTarget) {
    window.setTimeout(() => scrollToTarget(initialTarget), 900);
  }
}
