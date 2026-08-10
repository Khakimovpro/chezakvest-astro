export function initMapEmbed() {
  const stage = document.querySelector('[data-map-embed]');
  const button = stage?.querySelector('[data-map-load]');
  if (!stage || !button || stage.dataset.ready) return;
  stage.dataset.ready = 'true';

  button.addEventListener('click', () => {
    if (stage.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = stage.dataset.mapEmbed;
    frame.title = 'Карта площадок «Чё за Квест» в Ростове-на-Дону';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    frame.addEventListener('load', () => stage.classList.add('is-loaded'), { once: true });
    stage.append(frame);
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Карта загружается…';
    button.disabled = true;
  }, { once: true });
}
