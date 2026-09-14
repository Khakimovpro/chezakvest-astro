const preference = matchMedia('(prefers-reduced-motion: no-preference)');
if (preference.matches && 'IntersectionObserver' in window && document.visibilityState === 'visible') {
  const pending = new Set();
  const reveal = (element) => {
    element.classList.add('is-revealed');
    element.classList.remove('is-pending');
    pending.delete(element);
    const done = () => { element.classList.remove('is-revealed'); element.style.removeProperty('--product-reveal-i'); };
    element.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 900);
  };
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { observer.unobserve(entry.target); reveal(entry.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  const mark = (element, index = 0) => {
    if (element.getBoundingClientRect().top < innerHeight) return;
    element.style.setProperty('--product-reveal-i', String(Math.min(index, 4)));
    element.classList.add('is-pending'); pending.add(element); observer.observe(element);
  };
  document.querySelectorAll('[data-product-reveal]').forEach((element) => {
    if (element.dataset.productReveal === 'group') [...element.children].forEach(mark);
    else mark(element);
  });
  const flush = () => pending.forEach(reveal);
  addEventListener('beforeprint', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  preference.addEventListener('change', () => { if (!preference.matches) { flush(); observer.disconnect(); } });
  document.addEventListener('focusin', (event) => {
    const element = event.target.closest('.is-pending');
    if (element) reveal(element);
  });
}

document.querySelectorAll('[data-product-rail], .product-page .cards__wrap').forEach((rail) => {
  rail.addEventListener('click', (event) => {
    if (preference.matches) return;
    const button = event.target.closest('[data-product-next], [data-product-previous], .cards__arrow');
    if (!button) return;
    event.stopImmediatePropagation();
    const track = rail.querySelector('.product-rail__track, .cards__row');
    const forward = button.hasAttribute('data-product-next') || button.classList.contains('cards__arrow--next');
    const step = track.matches('.cards__row') ? Math.max(240, track.clientWidth * .8) : track.clientWidth * .85;
    track.scrollBy({ left: step * (forward ? 1 : -1), behavior: 'instant' });
  }, true);
});
