// ===== Минимальный ванильный интерактив нативной главной =====
import { createAutoplay } from './slider-autoplay.js';

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
  const pause = slider.querySelector('.slider__pause');
  const pauseIcon = slider.querySelector('.slider__pause-icon');
  const pauseText = slider.querySelector('.slider__pause-text');
  if (!track || !slides.length || !dotsWrap || !prev || !next || !pause || !pauseIcon || !pauseText) return;
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
    b.addEventListener('click', () => goFromUser(idx));
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

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const autoplay = createAutoplay({
    isDocumentHidden: () => document.hidden,
    onTick: () => go(i + 1),
    prefersReducedMotion: () => Boolean(motionQuery?.matches),
  });
  const syncAutoplayControl = () => {
    const paused = !autoplay.isEnabled;
    const label = paused ? 'Запустить автопрокрутку' : 'Остановить автопрокрутку';
    slider.setAttribute('aria-live', paused ? 'polite' : 'off');
    pause.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pause.setAttribute('aria-label', label);
    pause.title = label;
    pauseIcon.textContent = paused ? '▶' : 'Ⅱ';
    pauseText.textContent = label;
    pause.disabled = Boolean(motionQuery?.matches);
  };
  function pauseForUser() {
    autoplay.stop();
    syncAutoplayControl();
  }
  function goFromUser(n) {
    pauseForUser();
    go(n);
  }

  prev.addEventListener('click', () => goFromUser(i - 1));
  next.addEventListener('click', () => goFromUser(i + 1));
  pause.addEventListener('click', () => {
    if (autoplay.isEnabled) autoplay.stop();
    else autoplay.start();
    syncAutoplayControl();
  });

  // Automatic movement never resumes after a hover, focus, or direct user
  // action. It can only restart through the explicit pause/play control.
  slider.addEventListener('pointerover', (event) => {
    if (event.relatedTarget && slider.contains(event.relatedTarget)) return;
    if (event.target.closest?.('.slider__pause')) return;
    pauseForUser();
  });
  slider.addEventListener('focusin', (event) => {
    if (!event.target.closest?.('.slider__pause')) pauseForUser();
  });
  document.addEventListener('visibilitychange', () => {
    autoplay.handleVisibilityChange();
    syncAutoplayControl();
  });
  motionQuery?.addEventListener('change', () => {
    if (motionQuery.matches) autoplay.stop();
    syncAutoplayControl();
  });

  // свайп на тач-устройствах
  let x0 = null;
  slider.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) goFromUser(i + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });

  loadSlide(i);
  loadSlide((i + 1) % slides.length);
  render();
  autoplay.start();
  syncAutoplayControl();
}

function boot() {
  initCatalog();
  initSlider();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
