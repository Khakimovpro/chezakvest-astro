const PLACEHOLDER = 'data:image/gif';

const sourceOf = (trigger) => {
  const image = trigger?.querySelector('img');
  return image && (image.currentSrc || image.src);
};

const altOf = (trigger) => trigger?.querySelector('img')?.alt || '';

export function initLightbox() {
  const dialog = document.getElementById('lightbox');
  if (!(dialog instanceof HTMLDialogElement) || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';

  const image = dialog.querySelector('.lb__img');
  const caption = dialog.querySelector('.lb__caption');
  const counter = dialog.querySelector('.lb__counter');
  const previous = dialog.querySelector('[data-lightbox-prev]');
  const next = dialog.querySelector('[data-lightbox-next]');
  const scale = dialog.querySelector('[data-lightbox-scale]');
  let group = [];
  let index = 0;
  let start = null;
  let previousOverflow = '';

  const isUsable = (src) => Boolean(src && !src.startsWith(PLACEHOLDER));
  const setScaleLabel = () => scale?.setAttribute('aria-label', dialog.classList.contains('is-zoomed') ? 'Уменьшить фото' : 'Увеличить фото');
  const setZoom = (enabled) => {
    dialog.classList.toggle('is-zoomed', enabled);
    setScaleLabel();
  };

  const show = (requestedIndex) => {
    if (!group.length) return false;
    const candidate = (requestedIndex + group.length) % group.length;
    const src = sourceOf(group[candidate]);
    if (!isUsable(src)) return false;
    index = candidate;
    image.src = src;
    image.alt = altOf(group[index]);
    caption.textContent = image.alt;
    counter.textContent = group.length > 1 ? `${index + 1} / ${group.length}` : '';
    previous.hidden = group.length < 2;
    next.hidden = group.length < 2;
    setZoom(false);

    [1, -1].forEach((offset) => {
      const neighbor = sourceOf(group[(index + offset + group.length) % group.length]);
      if (isUsable(neighbor)) new Image().src = neighbor;
    });
    return true;
  };

  const open = (trigger) => {
    const groupName = trigger.dataset.zoom;
    group = Array.from(document.querySelectorAll(`[data-zoom="${CSS.escape(groupName)}"]`));
    if (!show(group.indexOf(trigger))) return;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-zoom]');
    if (trigger) {
      event.preventDefault();
      open(trigger);
      return;
    }
    if (!dialog.open) return;
    if (event.target.closest?.('[data-lightbox-next]')) show(index + 1);
    else if (event.target.closest?.('[data-lightbox-prev]')) show(index - 1);
    else if (event.target.closest?.('[data-lightbox-close]')) close();
    else if (event.target.closest?.('[data-lightbox-scale]')) setZoom(!dialog.classList.contains('is-zoomed'));
    else if (event.target === dialog) close();
    else if (event.target === image && window.matchMedia('(hover: hover)').matches) setZoom(!dialog.classList.contains('is-zoomed'));
  });

  dialog.addEventListener('dblclick', (event) => {
    if (event.target === image) setZoom(!dialog.classList.contains('is-zoomed'));
  });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousOverflow;
    setZoom(false);
    image.removeAttribute('src');
    image.alt = '';
    caption.textContent = '';
    counter.textContent = '';
  });
  document.addEventListener('keydown', (event) => {
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
  dialog.addEventListener('pointerdown', (event) => {
    start = { x: event.clientX, y: event.clientY };
  });
  dialog.addEventListener('pointerup', (event) => {
    if (!start || dialog.classList.contains('is-zoomed')) {
      start = null;
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    else if (dy > 100 && Math.abs(dy) > Math.abs(dx)) close();
    start = null;
  });
}
