// Снимает ВСЕ слайды карусели площадок (блок t396 со стрелками «1 из N»).
// В снимке страницы виден только активный слайд, остальные подставляет JS Tilda по клику.
// Запуск: node _capture/slider_shot.mjs <slug> <recid> [сколько слайдов]
// Пишет: _capture/pages/<slug>-slides.json — текст и картинки каждого слайда.
import { chromium } from 'playwright';
import fs from 'fs';

const EXEC = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const HOST = 'https://xn--80aehcht5ci1b.xn--p1ai';
const [slug, rec, nRaw] = process.argv.slice(2);
const N = Number(nRaw || 3);
if (!slug || !rec) { console.error('нужно: node _capture/slider_shot.mjs kids rec844797103 3'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', (r) => (/marquiz|roistat|mc\.yandex/i.test(r.request().url()) ? r.abort() : r.continue()));
await page.goto(`${HOST}/${slug}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(6000);
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
});
await page.waitForTimeout(2000);

const grab = () => page.evaluate((recId) => {
  const el = document.getElementById(recId);
  if (!el) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const text = [...el.querySelectorAll('div,span,li,h1,h2,h3,h4,p')]
    .filter((e) => vis(e) && e.children.length === 0)
    .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const bgs = [...el.querySelectorAll('*')].filter(vis).map((e) => {
    const m = getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    const r = e.getBoundingClientRect();
    return m && r.width > 200 ? m[1] : null;
  }).filter(Boolean);
  return { text: [...new Set(text)], bgs: [...new Set(bgs)] };
}, rec);

const slides = [];
for (let i = 0; i < N; i++) {
  const data = await grab();
  slides.push(data);
  console.log(`слайд ${i + 1}: строк ${data?.text.length}, картинок ${data?.bgs.length} :: ${data?.text[0] || '—'}`);
  const next = await page.$(`#${rec} [href*="next"], #${rec} .t-slds__arrow_right, #${rec} .t396__elem[data-elem-type] a[href*="next"]`);
  if (!next) { console.log('стрелка «вперёд» не найдена — слайдов больше не берём'); break; }
  await next.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1800);
}
fs.writeFileSync(`_capture/pages/${slug}-slides.json`, JSON.stringify(slides, null, 1));
await browser.close();
