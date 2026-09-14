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
  }), { rootMargin: '0px 0px -12% 0px' });
  const mark = (element, index = 0) => {
    if (element.getBoundingClientRect().top < innerHeight) return;
    element.style.setProperty('--product-reveal-i', String(Math.min(index, 5)));
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

if (!preference.matches) document.querySelectorAll('[data-product-rail]').forEach((rail) => {
  rail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-product-next], [data-product-previous]');
    if (!button) return;
    event.stopImmediatePropagation();
    const track = rail.querySelector('.product-rail__track');
    track.scrollBy({ left: track.clientWidth * (button.hasAttribute('data-product-next') ? .85 : -.85), behavior: 'instant' });
  }, true);
});
