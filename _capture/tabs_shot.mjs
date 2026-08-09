// Снимает содержимое ТАБОВ Tilda (блок t395): контент вкладки живёт в DOM только когда она открыта.
// Запуск: node _capture/tabs_shot.mjs <slug> <recid-блока-с-табами>
// Пишет: _capture/shots/<slug>-tab<N>.png (скриншот следующего за табами блока) и список картинок.
import { chromium } from 'playwright';
import fs from 'fs';

const EXEC = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const HOST = 'https://xn--80aehcht5ci1b.xn--p1ai';
const [slug, rec] = process.argv.slice(2);
if (!slug || !rec) { console.error('нужно: node _capture/tabs_shot.mjs kids rec844797072'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
// виджет квиза выезжает поверх контента и закрывает левую карточку — режем его запросы
await page.route('**/*', (route) => (/marquiz|roistat|mc\.yandex|googletag/i.test(route.request().url())
  ? route.abort() : route.continue()));
await page.goto(`${HOST}/${slug}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(6000);
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2000);

const tabs = await page.$$(`#${rec} .t395__tab, #${rec} a, #${rec} li`);
console.log(`табов найдено: ${tabs.length}`);
const out = [];
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].innerText().catch(() => '')).trim();
  await tabs[i].click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // блок сразу после табов — в нём и лежит контент вкладки
  const shot = `_capture/shots/${slug}-tab${i}.png`;
  const target = await page.evaluate((recId) => {
    const el = document.getElementById(recId);
    let n = el?.nextElementSibling;
    while (n && n.getBoundingClientRect().height < 120) n = n.nextElementSibling;
    if (!n) return null;
    const r = n.getBoundingClientRect();
    const imgs = [...n.querySelectorAll('img')].map((im) => im.currentSrc || im.src);
    const bgs = [...n.querySelectorAll('*')].map((e) => {
      const m = getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      return m ? m[1] : null;
    }).filter(Boolean);
    return { id: n.id, top: Math.round(r.top + scrollY), h: Math.round(r.height), imgs, bgs };
  }, rec);
  if (!target) { console.log(`${i} "${label}": блок не найден`); continue; }
  await page.screenshot({ path: shot, fullPage: true,
    clip: { x: 0, y: target.top, width: 1440, height: Math.min(target.h, 1600) } });
  out.push({ i, label, ...target, shot });
  console.log(`${i} "${label}" -> ${shot}, картинок ${target.imgs.length + target.bgs.length}`);
}
fs.writeFileSync(`_capture/pages/${slug}-tabs.json`, JSON.stringify(out, null, 1));
await browser.close();
