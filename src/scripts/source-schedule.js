// Расписание игр и онлайн-бронь.
//
// На оригинале это собственный сервис компании: страница шлёт POST на
// chezakvest.ru/calendar.php?quest=N и кладёт присланную разметку в пустой
// div.resq. Вызов жил в inline-скрипте Tilda, который в снимок не попадает, —
// поэтому на превью бронь выглядела несуществующей.
//
// Запрос уходит только когда блок подходит к экрану: расписание не участвует
// в первой загрузке страницы.

const SCHEDULE_ORIGIN = 'https://chezakvest.ru';
const BASE = import.meta.env.BASE_URL.replace(/\/$/u, '');

const loaded = new WeakSet();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) {
      if (existing.dataset.sourceReady) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', () => {
      script.dataset.sourceReady = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Не загрузился скрипт ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

// Разметка расписания написана под jQuery, поэтому библиотека нужна раньше неё.
// Лежит локально и грузится только на страницах с расписанием.
async function ensureJQuery() {
  if (window.jQuery) return;
  await loadScript(`${BASE}/assets/vendor/jquery-3.7.1.min.js`);
}

// Стили расписания написаны для отдельной страницы: там есть и `body{margin:0}`,
// и правила, которые перебивают наш `[hidden]` — от них на странице разъезжалась
// вёрстка и раскрывалось мобильное меню. Поэтому каждый селектор ограничивается
// слотом расписания, а сами стили не попадают в общий каскад.
const SCOPE = '[data-source-schedule]';

function scopeRules(rules) {
  for (const rule of rules) {
    if (rule.selectorText) {
      rule.selectorText = rule.selectorText
        .split(',')
        .map((selector) => {
          const clean = selector.trim();
          // `body` и `html` внутри чужой страницы означают её собственный корень.
          return /^(?:html|body)$/iu.test(clean) ? SCOPE : `${SCOPE} ${clean}`;
        })
        .join(',');
    } else if (rule.cssRules) {
      scopeRules(rule.cssRules);
    }
  }
}

async function adoptScopedStyles(text) {
  if (!text.trim() || typeof CSSStyleSheet !== 'function' || !CSSStyleSheet.prototype.replace) return;
  const sheet = new CSSStyleSheet();
  // Свои шрифты у страницы уже подключены, чужой @import только тянет сеть.
  await sheet.replace(text.replace(/@import[^;]+;/gu, ''));
  scopeRules(sheet.cssRules);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

// Разбор ответа раскладывает <link> и <style> по своему <head>, поэтому стили
// снимаем со всего разобранного документа и делаем это до переноса разметки.
// Файл calendar.css лежит рядом локальной копией (src/styles/source-schedule.css):
// сервис отдаёт его с дублированным заголовком CORS, и браузер такой ответ отвергает.
async function collectStyles(parsed) {
  const chunks = [];
  for (const node of [...parsed.querySelectorAll('link[rel="stylesheet"], style')]) {
    if (!node.getAttribute('href')) chunks.push(node.textContent ?? '');
    node.remove();
  }
  await adoptScopedStyles(chunks.join('\n'));
}

// innerHTML не запускает скрипты, а расписание без них остаётся статичной
// картинкой: пересобираем каждый тег заново, внешние — по очереди.
async function runScripts(slot) {
  const scripts = [...slot.querySelectorAll('script')];
  for (const original of scripts) {
    const script = document.createElement('script');
    for (const { name, value } of original.attributes) script.setAttribute(name, value);
    if (original.src) {
      original.remove();
      // eslint-disable-next-line no-await-in-loop
      await loadScript(original.src).catch(() => {});
      continue;
    }
    script.textContent = original.textContent;
    original.replaceWith(script);
  }
}

async function loadSchedule(slot) {
  if (loaded.has(slot)) return;
  loaded.add(slot);
  const quest = slot.dataset.sourceSchedule;
  if (!quest) return;
  const url = `${SCHEDULE_ORIGIN}/calendar.php?quest=${encodeURIComponent(quest)}`;
  slot.setAttribute('aria-busy', 'true');
  slot.textContent = 'Загружаем расписание…';
  try {
    await ensureJQuery();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ apiurl: url, tildautm: '' }),
    });
    if (!response.ok) throw new Error(`Расписание ответило ${response.status}`);
    const markup = await response.text();
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    await collectStyles(parsed);
    slot.textContent = '';
    slot.append(...parsed.body.childNodes);
    await runScripts(slot);
  } catch (error) {
    // Подпись «Расписание не загрузилось…» с кнопкой предварительной брони
    // стоит в снимке следующим блоком, поэтому слот просто освобождаем.
    slot.textContent = '';
    console.warn('Расписание не загрузилось:', error);
  } finally {
    slot.removeAttribute('aria-busy');
  }
}

export function initSourceSchedule() {
  const slots = [...document.querySelectorAll('[data-source-schedule]')];
  if (!slots.length) return;
  if (typeof IntersectionObserver !== 'function') {
    slots.forEach((slot) => { void loadSchedule(slot); });
    return;
  }
  const observer = new IntersectionObserver((entries, self) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      self.unobserve(entry.target);
      void loadSchedule(entry.target);
    });
  }, { rootMargin: '600px 0px' });
  slots.forEach((slot) => observer.observe(slot));
}
