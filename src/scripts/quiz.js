const SCRIPT_URL = 'https://script.marquiz.ru/v2.js';
const initialized = new Set();
let loader;

function loadMarquiz() {
  if (window.Marquiz) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return loader;
}

function configure(id) {
  if (initialized.has(id)) return;
  window.Marquiz?.init?.({
    host: '//quiz.marquiz.ru',
    id,
    autoOpen: false,
    autoOpenFreq: 'once',
    openOnExit: false,
    disableOnMobile: false,
  });
  initialized.add(id);
}

export function initQuiz() {
  if (document.documentElement.dataset.quizReady) return;
  document.documentElement.dataset.quizReady = 'true';
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest?.('[data-quiz]');
    if (!trigger || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const id = trigger.dataset.quiz;
    if (!id) return;
    event.preventDefault();
    trigger.setAttribute('aria-busy', 'true');
    try {
      await loadMarquiz();
      configure(id);
      if (window.Marquiz?.showModal) window.Marquiz.showModal(id);
    } catch {
      window.location.assign(trigger.href);
    } finally {
      trigger.removeAttribute('aria-busy');
    }
  });
}
