// ===== Минимальный ванильный интерактив нативной главной =====

// ---------- Табы каталога + мобильный дропдаун ----------
function initCatalog() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const select = document.getElementById('cat-select');
  const blocks = Array.from(document.querySelectorAll('.catblock'));
  if (!blocks.length) return;

  function apply(cat) {
    blocks.forEach((b) => {
      b.hidden = !(cat === 'all' || b.dataset.cat === cat);
    });
    tabs.forEach((t) => {
      const on = t.dataset.cat === cat;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (select && select.value !== cat) select.value = cat;
  }

  tabs.forEach((t) => t.addEventListener('click', () => apply(t.dataset.cat)));
  if (select) select.addEventListener('change', () => apply(select.value));
  apply('all');
}

// ---------- Промо-слайдер ----------
function initSlider() {
  const slider = document.getElementById('promo-slider');
  if (!slider) return;
  const track = slider.querySelector('.slider__track');
  const slides = Array.from(slider.querySelectorAll('.slider__slide'));
  const dotsWrap = document.getElementById('promo-dots');
  const prev = slider.querySelector('.slider__arrow--prev');
  const next = slider.querySelector('.slider__arrow--next');
  let i = 0;
  let timer;

  // ленивая подгрузка слайдов: 1-й уже загружен, остальные — из data-src
  const loadSlide = (n) => {
    const img = slides[n] && slides[n].querySelector('img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  };
  // после загрузки страницы, в простое — подгрузить все остальные
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
  idle(() => slides.forEach((_, n) => loadSlide(n)));

  const dots = slides.map((_, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Слайд ${idx + 1}`);
    b.addEventListener('click', () => go(idx, true));
    dotsWrap.appendChild(b);
    return b;
  });

  function render() {
    track.style.transform = `translateX(-${i * 100}%)`;
    dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
  }
  function go(n, user) {
    i = (n + slides.length) % slides.length;
    loadSlide(i);
    loadSlide((i + 1) % slides.length);
    render();
    if (user) restart();
  }
  function restart() {
    clearInterval(timer);
    timer = setInterval(() => go(i + 1), 5000);
  }

  prev.addEventListener('click', () => go(i - 1, true));
  next.addEventListener('click', () => go(i + 1, true));

  // свайп на тач-устройствах
  let x0 = null;
  slider.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1), true);
    x0 = null;
  }, { passive: true });

  render();
  restart();
}

// ---------- Бургер-меню ----------
function initBurger() {
  const burger = document.querySelector('.hdr__burger');
  const menu = document.getElementById('mobile-menu');
  if (!burger || !menu) return;
  function toggle(open) {
    const willOpen = open ?? menu.hasAttribute('hidden');
    if (willOpen) menu.removeAttribute('hidden');
    else menu.setAttribute('hidden', '');
    burger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }
  burger.addEventListener('click', () => toggle());
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
}

function boot() {
  initCatalog();
  initSlider();
  initBurger();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
