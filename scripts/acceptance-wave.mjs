// Приёмочный обход после волны правок по отчёту тестера.
// Не гейт сборки: запускается руками при живом preview на 4599.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:4599/chezakvest-preview';
const out = '/home/claude/che_za_kvest/work/tester-report/evidence/acceptance';
mkdirSync(out, { recursive: true });
const manifest = JSON.parse(readFileSync('src/generated/source-snapshot-manifest.json', 'utf8'));
const routes = Object.keys(manifest.routes);
const browser = await chromium.launch();
const report = [];

// --- 1. Обход всех маршрутов на двух ширинах
for (const width of [1440, 390]) {
  const broken = [];
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 100)));
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1800);
      const state = await page.evaluate(() => {
        const records = document.querySelector('.t-records');
        return {
          opacity: records ? getComputedStyle(records).opacity : '1',
          height: document.body.scrollHeight,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          text: document.body.innerText.trim().length,
        };
      });
      const issues = [];
      if (errors.length) issues.push(`js: ${errors[0]}`);
      if (state.opacity === '0') issues.push('записи прозрачны');
      if (state.text < 400) issues.push(`мало текста: ${state.text}`);
      if (state.overflow > 2) issues.push(`вылет по горизонтали: ${state.overflow}px`);
      if (issues.length) broken.push({ route, issues });
    } catch (e) {
      broken.push({ route, issues: [String(e).slice(0, 60)] });
    }
    await page.close();
  }
  report.push({ проверка: `обход ${routes.length} маршрутов @${width}`, проблем: broken.length, детали: broken.slice(0, 8) });
}

// --- 2. Точечные сценарии
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const check = async (name, route, fn) => {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  try {
    report.push({ проверка: name, результат: await fn() });
  } catch (e) {
    report.push({ проверка: name, результат: `ОШИБКА: ${String(e).slice(0, 90)}` });
  }
};

await check('родное окно сертификата (п.9)', '/', () => page.evaluate(() => {
  document.querySelector('[data-source-popup="#popup:cert"]')?.click();
  return new Promise((r) => setTimeout(() => {
    const p = [...document.querySelectorAll('.t-popup')].find((n) => getComputedStyle(n).display !== 'none');
    r(p ? `открылось «${(p.querySelector('.t702__title')?.textContent || '').trim()}»` : 'НЕ ОТКРЫЛОСЬ');
  }, 900));
}));

await check('закрытие окна не прыгает наверх (п.10, 30, 45)', '/', () => page.evaluate(() => {
  window.scrollTo(0, 1400);
  return new Promise((r) => setTimeout(() => {
    const y0 = window.scrollY;
    document.querySelector('[data-source-popup="#popup:cert"]')?.click();
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => r(window.scrollY === y0 ? `остались на ${y0}` : `УЕХАЛИ ${y0} → ${window.scrollY}`), 600);
    }, 700);
  }, 400));
}));

await check('маска телефона и проверка формы (п.12, 13, 52)', '/', () => page.evaluate(() => {
  document.querySelector('[data-source-popup="#popup:cert"]')?.click();
  return new Promise((r) => setTimeout(() => {
    const p = [...document.querySelectorAll('.t-popup')].find((n) => getComputedStyle(n).display !== 'none');
    const tel = p?.querySelector('input[type=tel]');
    tel?.focus();
    tel.value = '';
    '9281234567'.split('').forEach((ch) => {
      tel.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      tel.value += ch;
      tel.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    setTimeout(() => {
      const form = p.querySelector('form');
      form?.querySelector('button, .t-submit')?.click();
      setTimeout(() => r({ телефон: tel.value, отправлено: form?.dataset.submitted === 'true', ошибка: !!form?.querySelector('.js-error-control-box, .t-input-error') }), 500);
    }, 400);
  }, 900));
}));

await check('расписание и онлайн-бронь (п.28)', '/kvest_v_realnosti_koralina/', async () => {
  await page.evaluate(() => document.querySelector('[data-source-schedule]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(6000);
  return page.evaluate(() => {
    const slot = document.querySelector('[data-source-schedule]');
    return { слотов: slot?.querySelectorAll('.label_quest').length ?? 0, свободных: slot?.querySelectorAll('.label_quest:not(.close_item)').length ?? 0 };
  });
});

await check('квиз подбора программы (п.48)', '/kids/', () => page.evaluate(() => {
  const quiz = document.querySelector('[data-source-quiz], .source-quiz, [class*="quiz"]');
  return quiz ? `есть блок ${quiz.className.toString().slice(0, 50)}` : 'НЕ НАЙДЕН';
}));

await check('окна услуг и мастер-классов (п.55, 56, 71)', '/kids/', () => page.evaluate(() => {
  const hooks = new Set([...document.querySelectorAll('[data-source-popup]')].map((n) => n.dataset.sourcePopup));
  return [...hooks].join(', ');
}));

await check('отзывы: фильтры и сетка (п.11)', '/', () => page.evaluate(() => {
  const block = document.querySelector('.source-reviews');
  return block ? { карточек: block.querySelectorAll('.review-card').length, фильтров: block.querySelectorAll('[class*="filter"], [class*="tag"]').length } : 'НЕ НАЙДЕН';
}));

await check('карта площадок живая (п.16)', '/', async () => {
  await page.evaluate(() => document.querySelector('.source-map')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const map = document.querySelector('.source-map');
    return { активна: map?.hasAttribute('data-source-map-active'), карта: !!map?.querySelector('iframe'), кнопкаПоказать: !!map?.querySelector('.source-map__load') };
  });
});

await check('карта в подвале страницы адреса (п.17)', '/krasnormerskaya103/', async () => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3500);
  return page.evaluate(() => {
    const maps = [...document.querySelectorAll('.source-map')];
    return { карт: maps.length, сIframe: maps.filter((m) => m.querySelector('iframe')).length };
  });
});

await check('увеличение фото (п.14, 19)', '/krasnormerskaya103/', async () => {
  const zoomable = await page.evaluate(() => document.querySelectorAll('[data-source-zoom], [data-zoomable], .t-zoomable').length);
  return { кликабельныхФото: zoomable };
});

await check('видео квеста (п.25)', '/kvest_v_realnosti_harry_potter_i_krestrazh/', () => page.evaluate(() => {
  const stage = document.querySelector('.source-video-stage, [data-source-video]');
  if (!stage) return 'НЕ НАЙДЕН';
  stage.querySelector('button, .source-video__play')?.click();
  return new Promise((r) => setTimeout(() => r({ запущено: stage.hasAttribute('data-source-video-active'), плеер: !!stage.querySelector('video, iframe') }), 1500));
}));

await check('табы и аккордеон (п.44, 74)', '/new-year/', () => page.evaluate(() => {
  const btn = document.querySelector('.t585__trigger-button');
  btn?.click();
  return new Promise((r) => setTimeout(() => r({ аккордеонРаскрылся: btn?.getAttribute('aria-expanded') === 'true' }), 700));
}));

console.log(JSON.stringify(report, null, 1));
await browser.close();
