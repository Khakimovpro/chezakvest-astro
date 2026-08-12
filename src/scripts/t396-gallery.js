import { createAutoplay } from './slider-autoplay.js';

export function cycleGalleryIndex(index, count) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1) return 0;
  return (Number(index) + 1 + total) % total;
}

function initT396Gallery(gallery) {
  const track = gallery.querySelector('[data-t396-gallery-track]');
  const slides = [...gallery.querySelectorAll('[data-t396-gallery-slide]')];
  const dots = [...gallery.querySelectorAll('[data-t396-gallery-dot]')];
  if (!(track instanceof HTMLElement) || slides.length < 2 || dots.length !== slides.length) return;

  let activeIndex = 0;
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const render = (nextIndex) => {
    activeIndex = ((Number(nextIndex) % slides.length) + slides.length) % slides.length;
    track.style.transform = `translate3d(-${activeIndex * 100}%, 0, 0)`;
    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.setAttribute('aria-hidden', String(!isActive));
      slide.toggleAttribute('inert', !isActive);
    });
    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.setAttribute('aria-selected', String(isActive));
      dot.setAttribute('aria-current', isActive ? 'true' : 'false');
      dot.tabIndex = isActive ? 0 : -1;
    });
  };
  const autoplay = createAutoplay({
    delay: 3000,
    isDocumentHidden: () => document.hidden,
    onTick: () => render(cycleGalleryIndex(activeIndex, slides.length)),
    prefersReducedMotion: () => Boolean(motionQuery?.matches),
  });
  const pauseForUser = () => {
    autoplay.stop();
    gallery.setAttribute('aria-live', 'polite');
  };
  const selectFromUser = (nextIndex) => {
    pauseForUser();
    render(nextIndex);
  };

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => selectFromUser(index));
    dot.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = cycleGalleryIndex(index, slides.length);
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + slides.length) % slides.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = slides.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      selectFromUser(nextIndex);
      dots[nextIndex].focus();
    });
  });

  gallery.addEventListener('pointerover', (event) => {
    if (event.relatedTarget && gallery.contains(event.relatedTarget)) return;
    pauseForUser();
  });
  gallery.addEventListener('focusin', pauseForUser);
  document.addEventListener('visibilitychange', () => autoplay.handleVisibilityChange());
  motionQuery?.addEventListener('change', () => {
    if (motionQuery.matches) pauseForUser();
  });

  let startX = null;
  gallery.addEventListener('touchstart', (event) => {
    startX = event.touches[0]?.clientX ?? null;
  }, { passive: true });
  gallery.addEventListener('touchend', (event) => {
    if (startX === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(deltaX) > 40) selectFromUser(activeIndex + (deltaX < 0 ? 1 : -1));
    startX = null;
  }, { passive: true });

  gallery.classList.add('is-ready');
  render(0);
  if (autoplay.start()) gallery.setAttribute('aria-live', 'off');
}

export function initT396Galleries(root = document) {
  root.querySelectorAll('[data-t396-gallery]').forEach(initT396Gallery);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initT396Galleries());
  else initT396Galleries();
}
