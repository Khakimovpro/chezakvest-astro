// Приёмка живого слоя: проверяет на собранном сайте то, что уже один раз молча пропало —
// маску телефона, кнопку мессенджеров, плашку «Бонус», карту, отзывы, наведение на карточку,
// цвет меню, ленивые картинки, вес страницы, внешние запросы и горизонтальный скролл.
//
// Запуск (сначала поднять статику: cd dist && python3 -m http.server 8899):
//   node scripts/live-layer-verify.mjs http://127.0.0.1:8899 <тег> [маршруты через запятую]
// Отчёт: logs/live-layer-<тег>/{report.json,summary.txt} + скриншоты.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');
const tag = process.argv[3] || 'after';
const OUT = new URL(`../logs/live-layer-${tag}/`, import.meta.url).pathname;
await fs.mkdir(OUT, { recursive: true });

const ROUTES = (process.argv[4] || '/,/kids/,/contacts/,/igra_v_kalmara/,/nansena107/,/prazdniki-pod-kluch/,/strashnye-kvesty/,/new-year/,/prazdnik-maxi/,/roblox-land/').split(',');

const probe = () => {
  const px = (v) => Math.round(v);
  const R = (el) => { const r = el.getBoundingClientRect(); return [px(r.x), px(r.y), px(r.width), px(r.height)]; };

  // A1 — телефонная маска
  const wraps = [...document.querySelectorAll('.t-input-phonemask__wrap')]
    .filter((w) => w.getBoundingClientRect().height > 5);
  const phone = wraps.slice(0, 3).map((w) => {
    const inp = w.querySelector('input.t-input-phonemask');
    const sel = w.querySelector('.t-input-phonemask__select');
    const flag = w.querySelector('.t-input-phonemask__select-flag');
    const wr = w.getBoundingClientRect();
    const ir = inp?.getBoundingClientRect();
    return {
      display: getComputedStyle(w).display,
      wrap: R(w),
      sel: sel ? R(sel) : null,
      inp: inp ? R(inp) : null,
      overflowPx: ir ? Math.round(ir.bottom - wr.bottom) : null,
      sideBySide: !!(sel && inp) && sel.getBoundingClientRect().right <= inp.getBoundingClientRect().left + 2,
      flagBg: flag ? getComputedStyle(flag).backgroundImage.slice(0, 40) : null,
      flagPos: flag ? getComputedStyle(flag).backgroundPosition : null,
      fontSize: inp ? getComputedStyle(inp).fontSize : null,
    };
  });

  // A2 — плавающие кнопки
  const fixed = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width >= 24 && r.height >= 24 && r.bottom > innerHeight * 0.5;
  }).map((el) => ({ cls: el.className.toString().slice(0, 50), text: (el.innerText || '').trim().slice(0, 30), rect: R(el) }));
  const fab = !!document.querySelector('[data-messenger-root], .mfab-root');
  const bonus = [...document.querySelectorAll('body *')].some((el) => /бонус/i.test((el.textContent || '').slice(0, 200)) && getComputedStyle(el).position === 'fixed');

  // A3 — карта
  const mapNode = document.querySelector('.source-map, [data-source-widget="map"], .lazymap, [data-map-embed]');
  const map = mapNode ? { present: true, rect: R(mapNode), hasIframe: !!mapNode.querySelector('iframe'), text: (mapNode.innerText || '').trim().slice(0, 40) } : { present: false };

  // A4 — отзывы
  const revNodes = [...document.querySelectorAll('.source-reviews, #otzivy, [data-source-widget="reviews"], .reviews, .rv, [id*="otziv"]')];
  const rev = revNodes.find((n) => n.getBoundingClientRect().height > 120 && (n.innerText || '').trim().length > 40);
  const reviews = rev ? { present: true, rect: R(rev), text: (rev.innerText || '').trim().slice(0, 60) } : { present: false, anchors: revNodes.length };

  // A6 — карточки
  const cards = [...document.querySelectorAll('.game-card-animated')];
  const cardsInfo = { count: cards.length, withArrow: cards.filter((c) => c.querySelector('.game-card-arrow')).length, firstRect: cards[0] ? R(cards[0]) : null, cols: cards.slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().x)) };

  // A7 — меню
  const menu = [...document.querySelectorAll('.hdr .nav .nav__item > a, .hdr .nav .nav__trigger > a, .hdr .nav a')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.top > -50 && r.top < 200 && r.width > 20; })
    .slice(0, 6).map((e) => ({ t: (e.innerText || '').trim().slice(0, 24), color: getComputedStyle(e).color }));

  // C1 — картинки и вес
  const imgs = [...document.images];
  const lazy = imgs.filter((i) => i.loading === 'lazy').length;
  const res = performance.getEntriesByType('resource');
  const totalKb = Math.round(res.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024);
  const external = res.filter((r) => !r.name.startsWith(location.origin)).map((r) => r.name.slice(0, 60));

  // общее
  const anims = [...document.querySelectorAll('[data-animate-style], .t-animate')].slice(0, 5)
    .map((e) => ({ op: getComputedStyle(e).opacity, tr: getComputedStyle(e).transition.slice(0, 30) }));
  const hidden = [...document.querySelectorAll('[data-animate-style], .t-animate, .t396__elem--anim-hidden')]
    .filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.05).length;

  return {
    title: document.title, height: document.documentElement.scrollHeight,
    phone, fab, bonus, fixed, map, reviews, cards: cardsInfo, menu,
    imgs: imgs.length, lazy, totalKb, external: [...new Set(external)].slice(0, 6),
    anims, invisibleAnimated: hidden,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const browser = await chromium.launch();
const out = {};
for (const route of ROUTES) {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
    page.on('requestfailed', (r) => errors.push('FAILED ' + r.url().slice(0, 80)));
    const key = `${route} @${width}`;
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      const firstFrame = await page.evaluate(() => {
        const shell = document.querySelector('.source-snapshot-shell');
        if (!shell) return { shell: false };
        const s = getComputedStyle(shell);
        return { shell: true, display: s.display, visibility: s.visibility, busy: shell.getAttribute('aria-busy'), h: Math.round(shell.getBoundingClientRect().height) };
      });
      const initialKb = await page.evaluate(() => Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024));
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1800);
      const data = await page.evaluate(probe);
      data.initialKb = initialKb;
      data.firstFrame = firstFrame;
      data.errors = errors.slice(0, 5);
      // hover первой карточки
      if (data.cards.count && width === 1440) {
        const t = await page.evaluate(() => {
          const c = document.querySelector('.game-card-animated');
          if (!c) return null;
          c.scrollIntoView({ block: 'center' });
          const r = c.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        if (t) {
          await page.waitForTimeout(400);
          await page.mouse.move(t.x, t.y);
          await page.waitForTimeout(700);
          data.hover = await page.evaluate(() => {
            const c = document.querySelector('.game-card-animated');
            const arrow = c?.querySelector('.game-card-arrow');
            const img = c?.querySelector('.game-card-image');
            return {
              active: !!c?.classList.contains('active'),
              arrowOpacity: arrow ? getComputedStyle(arrow).opacity : null,
              imgTransform: img ? getComputedStyle(img).transform.slice(0, 30) : null,
            };
          });
          await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-hover.png` });
          await page.mouse.move(5, 5);
        }
      }
      out[key] = data;
      if (width === 1440) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-bottom.png` });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-top.png` });
      }
    } catch (e) {
      out[key] = { error: String(e).slice(0, 160) };
    }
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${OUT}/report.json`, JSON.stringify(out, null, 2));

// краткая сводка
const lines = [];
for (const [key, d] of Object.entries(out)) {
  if (d.error) { lines.push(`${key}: ОШИБКА ${d.error}`); continue; }
  const ph = d.phone[0];
  lines.push([
    key.padEnd(28),
    `маска:${ph ? (ph.sideBySide ? 'ok' : 'СЛОМАНА') + (ph.overflowPx > 2 ? `(+${ph.overflowPx}px)` : '') : '—'}`,
    `fab:${d.fab ? 'ok' : 'НЕТ'}`,
    `бонус:${d.bonus ? 'ok' : '—'}`,
    `карта:${d.map.present ? 'ok' : 'НЕТ'}`,
    `отзывы:${d.reviews.present ? 'ok' : (d.reviews.anchors ? 'ПУСТО' : '—')}`,
    `карточки:${d.cards.count}${d.hover ? '/hover:' + (d.hover.active ? 'ok' : 'НЕТ') : ''}`,
    `x:${(d.cards.cols || []).slice(0, 3).join('/') || '—'}`,
    `меню:${d.menu[0]?.color || '—'}`,
    `img:${d.imgs}/lazy:${d.lazy}`,
    `вес:старт ${d.initialKb}/после скролла ${d.totalKb}KB`,
    `внешние:${d.external.length}`,
    `невидимых:${d.invisibleAnimated}`,
    `hScroll:${d.hScroll ? 'ЕСТЬ' : 'нет'}`,
    `ошибок:${d.errors.length}`,
  ].join('  '));
}
await fs.writeFile(`${OUT}/summary.txt`, lines.join('\n'));
console.log(lines.join('\n'));
console.log('\nОтчёт:', OUT);
