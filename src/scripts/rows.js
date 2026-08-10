// Стрелки листания у горизонтальных рядов карточек (.cards__wrap).
// Скролл нативный — стрелки только двигают его на ширину видимой области.
document.querySelectorAll('.cards__wrap').forEach((wrap) => {
  const row = wrap.querySelector('.cards__row');
  const prev = wrap.querySelector('.cards__arrow--prev');
  const next = wrap.querySelector('.cards__arrow--next');
  if (!row || !prev || !next) return;

  const step = () => Math.max(240, row.clientWidth * 0.8);
  const sync = () => {
    const max = row.scrollWidth - row.clientWidth - 2;
    prev.disabled = row.scrollLeft <= 2;
    next.disabled = row.scrollLeft >= max;
    const hide = max <= 2;
    prev.hidden = hide;
    next.hidden = hide;
  };

  prev.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));
  row.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
});

// Видео грузится только по клику: до этого на странице лежит лёгкий постер.
document.querySelectorAll('.qvideo__frame[data-video]').forEach((frame) => {
  const btn = frame.querySelector('.qvideo__play');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const v = document.createElement('video');
    v.className = 'qvideo__player';
    v.src = frame.dataset.video;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.poster = frame.querySelector('.qvideo__poster')?.src || '';
    frame.querySelector('.qvideo__poster')?.remove();
    btn.remove();
    frame.prepend(v);
  }, { once: true });
});

// The hero play control is a real opt-in activation too: jump to the local
// video and start it without ever loading media during the initial render.
document.querySelectorAll('[data-video-trigger]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    const frame = document.querySelector('#video .qvideo__frame[data-video]');
    const play = frame?.querySelector('.qvideo__play');
    if (!frame || !play) return;
    event.preventDefault();
    frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    play.click();
  });
});
