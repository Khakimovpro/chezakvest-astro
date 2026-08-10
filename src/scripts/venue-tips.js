const HOVER_OPEN_DELAY = 200;
const CLOSE_DELAY = 350;

export function initVenueTips() {
  const root = document.querySelector('[data-venue-chips]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  const supportsHover = window.matchMedia?.('(hover: hover)').matches;
  const wraps = Array.from(root.querySelectorAll('.chipwrap'));
  let openWrap = null;
  const timers = new WeakMap();

  const cancel = (wrap) => {
    const timer = timers.get(wrap);
    if (timer) window.clearTimeout(timer);
    timers.delete(wrap);
  };
  const place = (wrap) => {
    const chip = wrap.querySelector('.chip');
    const tip = wrap.querySelector('.vtip');
    if (!chip || !tip) return;
    const chipRect = chip.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const width = tip.offsetWidth;
    const maxLeft = window.innerWidth - wrapRect.left - width - 8;
    const left = Math.min(maxLeft, Math.max(8 - wrapRect.left, chipRect.width / 2 - width / 2));
    tip.style.left = `${left}px`;
    tip.classList.toggle('vtip--up', chipRect.bottom + tip.offsetHeight + 12 > window.innerHeight && chipRect.top > tip.offsetHeight + 12);
  };
  const close = (wrap = openWrap) => {
    if (!wrap) return;
    cancel(wrap);
    wrap.querySelector('.vtip').hidden = true;
    wrap.querySelector('.chip').setAttribute('aria-expanded', 'false');
    if (openWrap === wrap) openWrap = null;
  };
  const open = (wrap) => {
    if (!wrap) return;
    cancel(wrap);
    if (openWrap && openWrap !== wrap) close(openWrap);
    const tip = wrap.querySelector('.vtip');
    tip.hidden = false;
    wrap.querySelector('.chip').setAttribute('aria-expanded', 'true');
    openWrap = wrap;
    place(wrap);
  };
  const later = (wrap, action, delay) => {
    cancel(wrap);
    timers.set(wrap, window.setTimeout(() => action(wrap), delay));
  };

  wraps.forEach((wrap) => {
    const chip = wrap.querySelector('.chip');
    const tip = wrap.querySelector('.vtip');
    if (!chip || !tip) return;
    if (supportsHover) {
      wrap.addEventListener('mouseenter', () => later(wrap, open, HOVER_OPEN_DELAY));
      wrap.addEventListener('mouseleave', () => later(wrap, close, CLOSE_DELAY));
      wrap.addEventListener('focusin', () => open(wrap));
      wrap.addEventListener('focusout', (event) => {
        if (!wrap.contains(event.relatedTarget)) later(wrap, close, CLOSE_DELAY);
      });
    } else {
      chip.addEventListener('click', (event) => {
        if (openWrap === wrap) return;
        event.preventDefault();
        open(wrap);
      });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (openWrap && !openWrap.contains(event.target)) close();
  }, true);
  window.addEventListener('resize', () => openWrap && place(openWrap), { passive: true });
}
