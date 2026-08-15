// Скриншоты проблемных мест для аудита (клон, локальный dist).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const OUT = process.env.OUT || '/tmp/shots';
const PORT = 8801;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ico': 'image/x-icon', '.json': 'application/json', '.xml': 'application/xml' };

const server = createServer(async (req, res) => {
  try {
    let file = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const SHOTS = [
  ['/igra-v-kalmara-lend/', 1280, 800, 0, 'kalmar-hero-1280'],
  ['/igra-v-kalmara-lend/', 1024, 800, 0, 'kalmar-hero-1024'],
  ['/prazdnik-maxi/', 1100, 900, 1200, 'maxi-1100'],
  ['/kids/', 1024, 900, 0, 'kids-1024'],
  ['/minecraft-lend/', 1100, 900, 900, 'minecraft-1100'],
  ['/', 1512, 900, 2600, 'home-cards-1512'],
];

const browser = await chromium.launch();
for (const [route, width, height, scrollY, name] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(600);
  if (scrollY) { await page.evaluate((y) => window.scrollTo(0, y), scrollY); await page.waitForTimeout(400); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
  await ctx.close();
}
await browser.close();
server.close();
