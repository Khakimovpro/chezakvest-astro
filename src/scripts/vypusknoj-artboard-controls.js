import { createAutoplay } from './slider-autoplay.js';

export function cycleVypuskIndex(index, count, direction = 1) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1) return 0;

  const current = Number(index);
  const shift = Number(direction);
  const start = Number.isFinite(current) ? Math.trunc(current) : 0;
  const step = Number.isFinite(shift) ? Math.trunc(shift) : 1;
  return ((start + step) % total + total) % total;
}

const numberFrom = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getParts = (root) => ({
  track: root.querySelector('[data-vypusk-slider-track]'),
  slides: [...root.querySelectorAll('[data-vypusk-slider-slide]')],
  dots: [...root.querySelectorAll('[data-vypusk-slider-dot]')],
  previous: root.querySelector('[data-vypusk-slider-prev]'),
  next: root.querySelector('[data-vypusk-slider-next]'),
  count: root.querySelector('[data-vypusk-slider-count]'),
});

const cardTranslate = (root, index) => {
  const compact = window.matchMedia('(max-width: 639px)').matches;
  const offset = numberFrom(compact ? root.dataset.vypuskOffsetMobile : root.dataset.vypuskOffsetDesktop);
  const step = numberFrom(compact ? root.dataset.vypuskStepMobile : root.dataset.vypuskStepDesktop);
  return offset - (step * index);
};

function createRenderer(root, parts, mode) {
  let active = 0;
  const total = parts.slides.length;

  return (next) => {
    active = cycleVypuskIndex(next, total, 0);
    if (mode === 'cards') {
      parts.track.style.transform = `translate3d(${cardTranslate(root, active)}px, 0, 0)`;
      parts.slides.forEach((slide, index) => slide.toggleAttribute('data-vypusk-active', index === active));
    } else {
      parts.slides.forEach((slide, index) => {
        const selected = index === active;
        slide.classList.toggle('is-active', selected);
        slide.setAttribute('aria-hidden', String(!selected));
        slide.toggleAttribute('inert', !selected);
      });
    }

    parts.dots.forEach((dot, index) => {
      const selected = index === active;
      dot.setAttribute('aria-selected', String(selected));
      dot.tabIndex = selected ? 0 : -1;
      dot.classList.toggle('is-active', selected);
    });
    if (parts.count) parts.count.textContent = `${active + 1} из ${total}`;
    return active;
  };
}

function bindDotKeyboard(dots, select) {
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => select(index));
    dot.addEventListener('keydown', (event) => {
      const last = dots.length - 1;
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? last
        : direction ? cycleVypuskIndex(index, dots.length, direction) : null;
      if (target === null) return;
      event.preventDefault();
      dots[target].focus();
      select(target);
    });
  });
}

function bindTouch(root, current, select) {
  let startX = null;
  let suppressClick = false;
  root.addEventListener('touchstart', (event) => {
    startX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  root.addEventListener('touchend', (event) => {
    const endX = event.changedTouches[0]?.clientX;
    const didSwipe = startX !== null && Number.isFinite(endX) && Math.abs(startX - endX) >= 40;
    if (didSwipe) {
      suppressClick = true;
      select(current() + (startX > endX ? 1 : -1));
    }
    startX = null;
  }, { passive: true });
  root.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function initVypuskSlider(root) {
  const parts = getParts(root);
  const mode = root.dataset.vypuskSliderMode;
  if (!parts.track || parts.slides.length < 2 || parts.dots.length !== parts.slides.length) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const render = createRenderer(root, parts, mode);
  const autoplayDelay = numberFrom(root.dataset.vypuskAutoplay);
  let current = render(0);
  const autoplay = autoplayDelay > 0 ? createAutoplay({
    onTick: () => { current = render(current + 1); },
    delay: autoplayDelay,
    prefersReducedMotion: () => motion.matches,
  }) : null;
  const select = (index) => {
    current = render(index);
    if (autoplay) {
      autoplay.stop();
      autoplay.start();
    }
  };

  parts.previous?.addEventListener('click', () => select(current - 1));
  parts.next?.addEventListener('click', () => select(current + 1));
  bindDotKeyboard(parts.dots, select);
  bindTouch(root, () => current, select);
  window.addEventListener('resize', () => { current = render(current); });
  document.addEventListener('visibilitychange', () => autoplay?.handleVisibilityChange());
  root.addEventListener('mouseenter', () => autoplay?.stop());
  root.addEventListener('mouseleave', () => autoplay?.start());
  root.addEventListener('focusin', () => autoplay?.stop());
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) autoplay?.start();
  });
  motion.addEventListener('change', () => (motion.matches ? autoplay?.stop() : autoplay?.start()));
  root.classList.add('is-ready');
  autoplay?.start();
}

export function initVypusknojArtboardControls(scope = document) {
  scope.querySelectorAll('[data-vypusk-slider]').forEach(initVypuskSlider);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initVypusknojArtboardControls(), { once: true });
  } else {
    initVypusknojArtboardControls();
  }
}
