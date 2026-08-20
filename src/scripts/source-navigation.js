// Переход между страницами со светлым проявлением, как на оригинале.
//
// Tilda уводит посетителя со страницы через белую вспышку: экран вместе с шапкой
// плавно белеет, а на новой странице белизна так же плавно уходит. Без этого
// переход по ссылке выглядит рывком — тестер отметил это отдельным пунктом.

const FADE_MS = 220;
const OVERLAY_ID = 'source-page-fade';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function overlay() {
  let node = document.getElementById(OVERLAY_ID);
  if (!node) {
    node = document.createElement('div');
    node.id = OVERLAY_ID;
    node.className = 'source-page-fade';
    node.setAttribute('aria-hidden', 'true');
    document.body.appendChild(node);
  }
  return node;
}

function internalHref(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return '';
  if (anchor.target && anchor.target !== '_self') return '';
  if (anchor.hasAttribute('download')) return '';
  const href = anchor.getAttribute('href') ?? '';
  if (!href || href.startsWith('#') || /^(?:tel:|mailto:|javascript:)/iu.test(href)) return '';
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return '';
  // Ссылка на ту же страницу — это переход к блоку, им занимается модуль попапов.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return '';
  return url.href;
}

export function initSourceNavigation() {
  if (reducedMotion()) return;
  const node = overlay();

  // Страница открывается из белизны: класс снимаем, как только снимок встал
  // на место, иначе проявится ещё не разложенный первый экран.
  const reveal = () => node.classList.remove('is-active');
  const shell = document.querySelector('.source-snapshot-shell');
  node.classList.add('is-active');
  if (shell?.hasAttribute('aria-busy')) {
    const observer = new MutationObserver(() => {
      if (shell.hasAttribute('aria-busy')) return;
      observer.disconnect();
      requestAnimationFrame(reveal);
    });
    observer.observe(shell, { attributes: true, attributeFilter: ['aria-busy'] });
    // Страховка: снимок мог не отдать признак готовности (например, при ошибке
    // раскладки) — белизна не должна остаться на экране навсегда.
    window.setTimeout(reveal, 2500);
  } else {
    requestAnimationFrame(reveal);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = internalHref(anchor);
    if (!href) return;
    event.preventDefault();
    node.classList.add('is-active');
    window.setTimeout(() => { window.location.href = href; }, FADE_MS);
  });

  // Возврат «назад» из кэша браузера обязан показать страницу, а не белый экран.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reveal();
  });
}
