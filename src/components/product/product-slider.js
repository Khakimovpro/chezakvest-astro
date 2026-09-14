document.querySelectorAll('[data-product-slider]').forEach((slider) => {
  const track = slider.querySelector('.product-slider__track');
  const viewport = slider.querySelector('.product-slider__viewport');
  const slides = [...slider.querySelectorAll('.product-slider__slide')];
  const choices = [...slider.querySelectorAll('[data-slider-index]')];
  const counter = slider.querySelector('.product-slider__counter');
  const desktop = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;
  let interacted = false;
  let hovered = false;
  let gesture = null;
  let suppressClick = false;

  const schedule = () => {
    clearTimeout(timer);
    if (slides.length < 2 || !desktop.matches || reduced.matches || document.hidden || hovered || interacted || slider.contains(document.activeElement)) return;
    timer = setTimeout(() => { show(index + 1); schedule(); }, 5000);
  };
  const preload = () => {
    for (const offset of [-1, 0, 1]) slides[(index + offset + slides.length) % slides.length].querySelector('img').loading = 'eager';
  };
  const show = (requested) => {
    index = (requested + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, i) => {
      slide.inert = i !== index;
      slide.setAttribute('aria-hidden', String(i !== index));
    });
    choices.forEach((choice, i) => {
      if (i === index) choice.setAttribute('aria-current', 'true');
      else choice.removeAttribute('aria-current');
    });
    counter.textContent = `${index + 1} / ${slides.length}`;
    preload();
  };
  const interact = () => { interacted = true; schedule(); };
  const select = (next) => { interact(); show(next); };
  slider.querySelector('[data-slider-prev]')?.addEventListener('click', () => select(index - 1));
  slider.querySelector('[data-slider-next]')?.addEventListener('click', () => select(index + 1));
  choices.forEach((choice, i) => choice.addEventListener('click', () => select(i)));
  slider.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    // Keep focus on the carousel when the previously focused photo becomes inert.
    if (event.target.closest('.product-slider__slide')) slider.focus({ preventScroll: true });
    select(index + (event.key === 'ArrowRight' ? 1 : -1));
  });
  slider.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
  slider.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  slider.addEventListener('focusin', schedule);
  slider.addEventListener('focusout', () => queueMicrotask(schedule));
  slider.addEventListener('pointerdown', interact);
  slider.addEventListener('click', interact);
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || !event.target.closest('.product-slider__photo')) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId, target: event.target.closest('button') };
    suppressClick = false;
    gesture.target.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointerup', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const swiped = Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy);
    gesture = null;
    if (swiped) { suppressClick = true; select(index + (dx < 0 ? 1 : -1)); }
  });
  viewport.addEventListener('pointercancel', () => { gesture = null; });
  viewport.addEventListener('click', (event) => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  }, true);
  document.addEventListener('visibilitychange', schedule);
  desktop.addEventListener('change', schedule);
  reduced.addEventListener('change', schedule);
  preload();
  schedule();
});
