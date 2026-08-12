const wrappedIndex = (index, length) => ((index % length) + length) % length;

/**
 * Keep the keyboard contract separate from the DOM setup so every source
 * artboard rail uses the same wraparound behaviour.
 */
export function railIndexAfterKey(index, length, key) {
  if (!Number.isInteger(length) || length < 1) return 0;

  const current = wrappedIndex(Number.isInteger(index) ? index : 0, length);
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') return wrappedIndex(current - 1, length);
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown') return wrappedIndex(current + 1, length);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return current;
}

const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const closestSlideIndex = (viewport, slides) => {
  const viewportLeft = viewport.getBoundingClientRect().left;
  return slides.reduce((closest, slide, index) => {
    const distance = Math.abs(slide.getBoundingClientRect().left - viewportLeft);
    return distance < closest.distance ? { index, distance } : closest;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
};

const scrollToSlide = (viewport, slide, behavior) => {
  const viewportLeft = viewport.getBoundingClientRect().left;
  const left = viewport.scrollLeft + slide.getBoundingClientRect().left - viewportLeft;
  viewport.scrollTo({ left, behavior });
};

export function initSourceArtboardRails(root = globalThis.document) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('[data-source-artboard-rail]').forEach((rail) => {
    if (rail.dataset.sourceArtboardRailReady === 'true') return;

    const viewport = rail.querySelector('[data-source-artboard-rail-viewport]');
    const slides = viewport ? [...viewport.querySelectorAll('[data-source-artboard-rail-slide]')] : [];
    const controls = rail.querySelector('[data-source-artboard-rail-controls]');
    const previous = rail.querySelector('[data-source-artboard-rail-prev]');
    const next = rail.querySelector('[data-source-artboard-rail-next]');
    const dots = [...rail.querySelectorAll('[data-source-artboard-rail-dot]')];
    const status = rail.querySelector('[data-source-artboard-rail-status]');

    if (!viewport || slides.length < 1) return;
    rail.dataset.sourceArtboardRailReady = 'true';

    let selected = 0;
    let scrollFrame = 0;
    const updateSelection = (index = closestSlideIndex(viewport, slides)) => {
      selected = wrappedIndex(index, slides.length);
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === selected;
        dot.setAttribute('aria-selected', String(active));
        dot.tabIndex = active ? 0 : -1;
      });
      if (status) status.textContent = `${selected + 1} из ${slides.length}`;
    };

    const select = (index, options = {}) => {
      const nextIndex = wrappedIndex(index, slides.length);
      updateSelection(nextIndex);
      scrollToSlide(viewport, slides[nextIndex], options.behavior || (prefersReducedMotion() ? 'auto' : 'smooth'));
    };

    const updateScrollableState = () => {
      const scrollable = viewport.scrollWidth > viewport.clientWidth + 1;
      if (controls) controls.hidden = !scrollable;
      rail.toggleAttribute('data-source-artboard-rail-scrollable', scrollable);
      updateSelection();
    };

    previous?.addEventListener('click', () => select(selected - 1));
    next?.addEventListener('click', () => select(selected + 1));
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => select(index));
      dot.addEventListener('keydown', (event) => {
        const destination = railIndexAfterKey(index, dots.length, event.key);
        if (destination === index && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        select(destination);
        dots[destination]?.focus();
      });
    });

    viewport.addEventListener('keydown', (event) => {
      const destination = railIndexAfterKey(selected, slides.length, event.key);
      if (destination === selected && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      select(destination);
    });
    viewport.addEventListener('scroll', () => {
      globalThis.cancelAnimationFrame?.(scrollFrame);
      scrollFrame = globalThis.requestAnimationFrame?.(() => updateSelection()) || 0;
    }, { passive: true });

    globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(updateScrollableState).observe(viewport)
      : globalThis.addEventListener?.('resize', updateScrollableState, { passive: true });
    updateScrollableState();
  });
}
