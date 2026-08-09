// Скриншот страницы в 1440 и 390: node _capture/shot.mjs <url> <имя> [папка]
// Пишет <папка|_capture/shots>/<имя>-{1440,390}.png
import { chromium } from 'playwright';
import fs from 'fs';

const EXEC = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const [url, name, dir = '_capture/shots'] = process.argv.slice(2);
if (!url || !name) { console.error('нужно: node _capture/shot.mjs <url> <имя> [папка]'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-gpu'] });
for (const [w, h] of [[1440, 1200], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  // прокрутка — чтобы отработала ленивая загрузка картинок
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/${name}-${w}.png`, fullPage: true });
  const height = await page.evaluate(() => document.body.scrollHeight);
  console.log(`${name} ${w}px: высота ${height}`);
  await ctx.close();
}
await browser.close();
