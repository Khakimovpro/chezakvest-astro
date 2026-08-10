// ===== Минимальный ванильный интерактив нативной главной =====

// ---------- Табы каталога + мобильный дропдаун ----------
function initCatalog() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const select = document.getElementById('cat-select');
  const panels = Array.from(document.querySelectorAll('.catalog__panel'));
  const blocks = Array.from(document.querySelectorAll('.catblock'));
  const allPanel = panels.find((panel) => panel.dataset.cat === 'all');
  if (!tabs.length || !blocks.length || !allPanel) return;

  function apply(cat) {
    const activeTab = tabs.find((tab) => tab.dataset.cat === cat) || tabs[0];
    const activePanel = document.getElementById(activeTab.dataset.panel) || allPanel;

    // Keep exactly one tabpanel exposed to assistive technologies without
    // duplicating the catalogue markup for the "all games" tab.
    blocks.forEach((block) => {
      const destination = cat !== 'all' && block.dataset.cat === cat ? activePanel : allPanel;
      destination.append(block);
    });
    panels.forEach((panel) => {
      panel.hidden = panel !== activePanel;
    });
    tabs.forEach((t) => {
      const on = t === activeTab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    if (select && select.value !== activeTab.dataset.cat) select.value = activeTab.dataset.cat;
  }

  tabs.forEach((t) => t.addEventListener('click', () => apply(t.dataset.cat)));
  tabs.forEach((tab, currentIndex) => tab.addEventListener('keydown', (event) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    apply(nextTab.dataset.cat);
    nextTab.focus();
  }));
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
  if (!track || !slides.length || !dotsWrap || !prev || !next) return;
  let i = 0;

  // The first slide is in HTML; every later image is requested only when it
  // becomes current or immediately next in a user-controlled interaction.
  const loadSlide = (n) => {
    const img = slides[n] && slides[n].querySelector('img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  };

  const dots = slides.map((slide, idx) => {
    slide.id = slide.id || `promo-slide-${idx + 1}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Слайд ${idx + 1}`);
    b.setAttribute('aria-controls', slide.id);
    b.addEventListener('click', () => go(idx));
    dotsWrap.appendChild(b);
    return b;
  });

  function render() {
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((slide, idx) => slide.setAttribute('aria-hidden', idx === i ? 'false' : 'true'));
    dots.forEach((d, idx) => {
      const active = idx === i;
      d.classList.toggle('is-active', active);
      d.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }
  function go(n) {
    i = (n + slides.length) % slides.length;
    loadSlide(i);
    loadSlide((i + 1) % slides.length);
    render();
  }

  prev.addEventListener('click', () => go(i - 1));
  next.addEventListener('click', () => go(i + 1));

  // свайп на тач-устройствах
  let x0 = null;
  slider.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });

  loadSlide(i);
  loadSlide((i + 1) % slides.length);
  render();
}

// ---------- Бургер-меню ----------
function initBurger() {
  const burger = document.querySelector('.hdr__burger');
  const menu = document.getElementById('mobile-menu');
  if (!burger || !menu) return;
  const firstMenuItem = () => menu.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const isOpen = () => !menu.hasAttribute('hidden');

  function toggle(open, { restoreFocus = false } = {}) {
    const willOpen = open ?? !isOpen();
    if (willOpen) {
      menu.removeAttribute('hidden');
      requestAnimationFrame(() => firstMenuItem()?.focus());
    } else {
      menu.setAttribute('hidden', '');
      if (restoreFocus || menu.contains(document.activeElement)) burger.focus();
    }
    burger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    burger.setAttribute('aria-label', willOpen ? 'Закрыть меню' : 'Открыть меню');
  }
  burger.addEventListener('click', () => toggle());
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    toggle(false, { restoreFocus: true });
  });
}

function boot() {
  initCatalog();
  initSlider();
  initBurger();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
