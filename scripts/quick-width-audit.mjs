// Лёгкий аудит: ищем на каждой ширине горизонтальный вылет, наложения текста и обрезку.
// Запуск: node scripts/quick-width-audit.mjs > /tmp/audit.json
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const PORT = 8799;
const WIDTHS = [1512, 1440, 1366, 1280, 1200, 1100, 1024, 900, 768, 640, 480, 390];
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',')
  : ['/', '/igra-v-kalmara-lend/', '/kids/', '/ono/', '/prazdnik-maxi/', '/minecraft-lend/', '/amongus-land/',
     '/roblox-land/', '/new-year/', '/strashnye-kvesty/', '/party-games/', '/vypusknoj-kalmar/',
     '/den-rozhdeniya-na-vr-arene/', '/brawl_stars/', '/portal-strike/', '/40letpobedy216/',
     '/igra_v_kalmara/', '/contacts/', '/kvesty-v-rostove-na-donu/'];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = join(ROOT, p);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); }
    catch { file = file.endsWith('/') ? join(file, 'index.html') : file; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const out = [];

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    const external = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    page.on('requestfailed', (r) => failed.push(r.url().slice(0, 120)));
    page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${PORT}`) && !r.url().startsWith('data:')) external.push(r.url().slice(0, 120)); });
    try {
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(400);
      const res = await page.evaluate(() => {
        const doc = document.documentElement;
        const vw = window.innerWidth;
        const overflow = Math.max(0, doc.scrollWidth - vw);
        // элементы, торчащие за правый край окна
        const all = [...document.querySelectorAll('body *')];
        const offscreen = [];
        const clipped = [];
        const overlaps = [];
        const visible = all.filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        });
        for (const el of visible) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 2 && !el.closest('[data-allow-overflow]')) {
            const own = el.textContent && el.textContent.trim().length > 0 && el.children.length === 0;
            if (own || el.tagName === 'IMG') offscreen.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) });
          }
        }
        // обрезка: текстовый узел вылезает за пределы предка с overflow:hidden
        for (const el of visible) {
          if (el.children.length || !(el.textContent || '').trim()) continue;
          const r = el.getBoundingClientRect();
          let p = el.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
              const pr = p.getBoundingClientRect();
              const cutBottom = r.bottom - pr.bottom;
              const cutRight = r.right - pr.right;
              if (cutBottom > 4 || cutRight > 4) {
                clipped.push({ text: (el.textContent || '').trim().slice(0, 45), cutBottom: Math.round(cutBottom), cutRight: Math.round(cutRight), parent: (p.className || '').toString().slice(0, 50) });
              }
              break;
            }
            p = p.parentElement;
          }
        }
        // наложения: только листовые текстовые узлы и кнопки/ссылки, у которых предок абсолютный
        const leaves = visible.filter((el) => {
          if (!(el.textContent || '').trim()) return false;
          if (el.children.length > 0 && el.tagName !== 'A') return false;
          const cs = getComputedStyle(el);
          return cs.position === 'absolute' || getComputedStyle(el.parentElement || el).position === 'absolute';
        });
        for (let i = 0; i < leaves.length; i++) {
          for (let j = i + 1; j < leaves.length; j++) {
            const a = leaves[i], b = leaves[j];
            if (a.contains(b) || b.contains(a)) continue;
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (w > 6 && h > 6) {
              const area = w * h;
              const min = Math.min(ra.width * ra.height, rb.width * rb.height);
              if (area / min > 0.18) {
                overlaps.push({ a: (a.textContent || '').trim().slice(0, 35), b: (b.textContent || '').trim().slice(0, 35), ratio: +(area / min).toFixed(2) });
              }
            }
          }
        }
        const fontOk = document.fonts ? document.fonts.check('900 39px Montserrat') : null;
        return { overflow, offscreen: offscreen.slice(0, 8), clipped: clipped.slice(0, 8), overlaps: overlaps.slice(0, 8),
          counts: { offscreen: offscreen.length, clipped: clipped.length, overlaps: overlaps.length }, fontOk,
          height: Math.round(doc.scrollHeight) };
      });
      out.push({ route, width, ...res, errors: errors.slice(0, 3), failed: failed.slice(0, 3), external: [...new Set(external)].slice(0, 3) });
    } catch (e) {
      out.push({ route, width, error: String(e).slice(0, 160) });
    }
    await ctx.close();
  }
  process.stderr.write(`done ${route}\n`);
}

await browser.close();
server.close();
console.log(JSON.stringify(out, null, 1));
