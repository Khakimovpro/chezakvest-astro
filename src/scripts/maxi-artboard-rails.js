export function nextMaxiRailOffset(offset, direction, step, maximum) {
  const current = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;
  const limit = Number.isFinite(Number(maximum)) ? Math.max(0, Number(maximum)) : 0;
  const distance = Number.isFinite(Number(step)) ? Math.max(0, Number(step)) : 0;
  if (!distance) return Math.min(current, limit);
  const next = current + (Number(direction) < 0 ? -distance : distance);
  return Math.min(limit, Math.max(0, next));
}

function railItems(viewport) {
  const children = [...viewport.children];
  const onlyChild = children[0];
  return children.length === 1 && onlyChild instanceof HTMLElement && (
    /^(OL|UL)$/u.test(onlyChild.tagName) || onlyChild.children.length > 1
  ) ? [...onlyChild.children] : children;
}

function railStep(viewport, items) {
  const first = items[0];
  if (!(first instanceof HTMLElement)) return Math.max(1, Math.round(viewport.clientWidth * 0.8));
  const gap = Number.parseFloat(getComputedStyle(first.parentElement || viewport).gap) || 0;
  return Math.max(1, Math.round(first.getBoundingClientRect().width + gap));
}

function initMaxiRail(rail) {
  if (rail.dataset.maxiRailReady) return;
  const viewport = rail.querySelector('[data-maxi-rail-viewport]');
  const controls = rail.querySelector('[data-maxi-rail-controls]');
  const previous = rail.querySelector('[data-maxi-rail-prev]');
  const next = rail.querySelector('[data-maxi-rail-next]');
  const status = rail.querySelector('[data-maxi-rail-status]');
  if (!(viewport instanceof HTMLElement) || !(previous instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return;

  const items = railItems(viewport);
  if (items.length < 2) {
    if (controls instanceof HTMLElement) controls.hidden = true;
    return;
  }

  rail.dataset.maxiRailReady = 'true';
  let scheduled = false;
  const maximum = () => Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  // Tilda's captured media rails start with a deliberate translated crop.
  // The physical scrollWidth can therefore include an empty transformed tail;
  // page against the last visible card, not that empty area.
  const reachableLimit = () => {
    const limit = maximum();
    const last = items.at(-1);
    if (!(last instanceof HTMLElement)) return limit;
    const viewportRight = viewport.getBoundingClientRect().right;
    const lastRight = last.getBoundingClientRect().right;
    return Math.max(0, Math.min(limit, Math.round(viewport.scrollLeft + lastRight - viewportRight)));
  };
  const indexAtOffset = () => {
    if (viewport.scrollLeft >= reachableLimit() - 1) return items.length - 1;
    return items.reduce((active, item, index) => (
      item.offsetLeft <= viewport.scrollLeft + 2 ? index : active
    ), 0);
  };
  const update = () => {
    scheduled = false;
    const limit = reachableLimit();
    const canScroll = limit > 1;
    if (controls instanceof HTMLElement) controls.hidden = !canScroll;
    previous.disabled = !canScroll || viewport.scrollLeft <= 1;
    next.disabled = !canScroll || viewport.scrollLeft >= limit - 1;
    if (status instanceof HTMLElement) status.textContent = `${indexAtOffset() + 1} из ${items.length}`;
  };
  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  const move = (direction) => {
    const target = nextMaxiRailOffset(viewport.scrollLeft, direction, railStep(viewport, items), reachableLimit());
    viewport.scrollTo({ left: target, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  viewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'Home') viewport.scrollTo({ left: 0, behavior: 'auto' });
    else if (event.key === 'End') viewport.scrollTo({ left: reachableLimit(), behavior: 'auto' });
    else return;
    event.preventDefault();
  });
  viewport.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  update();
}

export function initMaxiRails(root = document) {
  root.querySelectorAll('[data-maxi-rail]').forEach(initMaxiRail);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initMaxiRails(), { once: true });
  else initMaxiRails();
}
