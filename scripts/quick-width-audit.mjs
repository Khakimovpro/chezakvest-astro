// Лёгкий аудит: ищем на каждой ширине горизонтальный вылет, наложения текста и обрезку.
// Запуск: node scripts/quick-width-audit.mjs > /tmp/audit.json
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const INVENTORY = new URL('../migration/parity/live-inventory.json', import.meta.url).pathname;
const PORT = Number(process.env.AUDIT_PORT ?? '8799');
const WIDTHS = [1512, 1440, 1366, 1280, 1200, 1100, 1024, 900, 768, 640, 480, 390];
const inventory = JSON.parse(await readFile(INVENTORY, 'utf8'));
const allRoutes = [...new Set([
  ...(inventory.clone_route_paths ?? []),
  ...inventory.matrix.map((row) => row.route_clone).filter(Boolean),
])].filter((route) => route !== '/404/').sort((left, right) => left.localeCompare(right));
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',').map((route) => route.trim()).filter(Boolean)
  : allRoutes;
const OUTPUT = process.env.AUDIT_OUTPUT || '';

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

async function auditRoute(route) {
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
      for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 800) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(25);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1700);
      const res = await page.evaluate((knownRoutes) => {
        const doc = document.documentElement;
        const vw = window.innerWidth;
        const overflow = Math.max(0, doc.scrollWidth - vw);
        // элементы, торчащие за правый край окна
        const all = [...document.querySelectorAll('body *')];
        const offscreen = [];
        const clipped = [];
        const overlaps = [];
        const missingImageDimensions = [];
        const firstScreenLazy = [];
        const brokenLinks = [];
        const brokenForms = [];
        const textRects = (element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        };
        const isInsideHorizontalScroller = (element) => {
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 2) return true;
          }
          return false;
        };
        const isClippedDecoration = (element) => {
          if (element.tagName !== 'IMG' || (element.getAttribute('alt') || '').trim()) return false;
          const rect = element.getBoundingClientRect();
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (['hidden', 'clip'].includes(style.overflow) || ['hidden', 'clip'].includes(style.overflowX)) {
              const parentRect = parent.getBoundingClientRect();
              return rect.right > parentRect.right + 2 || rect.left < parentRect.left - 2;
            }
          }
          return false;
        };
        const visible = all.filter((el) => {
          if (el.closest('[hidden], [aria-hidden="true"], .nolimAutoScaleFix')) return false;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) return false;
          for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || Number(parentStyle.opacity) === 0) return false;
            if (['hidden', 'clip'].includes(parentStyle.overflow) || ['hidden', 'clip'].includes(parentStyle.overflowX)) {
              const parentRect = parent.getBoundingClientRect();
              if (r.right <= parentRect.left + 1 || r.left >= parentRect.right - 1
                || r.bottom <= parentRect.top + 1 || r.top >= parentRect.bottom - 1) return false;
            }
          }
          return true;
        });
        for (const el of visible) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 2 && !el.closest('[data-allow-overflow]')) {
            const own = el.textContent && el.textContent.trim().length > 0 && el.children.length === 0;
            if (isInsideHorizontalScroller(el)) continue;
            if (isClippedDecoration(el)) continue;
            const actualRight = own ? Math.max(...textRects(el).map((rect) => rect.right), -Infinity) : r.right;
            if ((own || el.tagName === 'IMG') && actualRight > vw + 2) {
              offscreen.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), right: Math.round(actualRight), text: (el.textContent || '').trim().slice(0, 40) });
            }
          }
        }
        for (const image of document.images) {
          if (!image.hasAttribute('width') || !image.hasAttribute('height')) {
            missingImageDimensions.push((image.currentSrc || image.src || image.alt || 'img').slice(0, 120));
          }
          const rect = image.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0 && image.loading === 'lazy') {
            firstScreenLazy.push((image.currentSrc || image.src || image.alt || 'img').slice(0, 120));
          }
        }
        const canonicalPath = (pathname) => pathname === '/' ? '/' : `${pathname.replace(/\/+$/u, '')}/`;
        const routeSet = new Set(knownRoutes.map(canonicalPath));
        for (const anchor of document.querySelectorAll('a')) {
          const raw = (anchor.getAttribute('href') || '').trim();
          if (!raw || /^javascript:/iu.test(raw)) {
            brokenLinks.push({ text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().slice(0, 45), href: raw });
            continue;
          }
          if (raw.startsWith('#') && raw.length > 1) {
            if (/^#(?:prev|next)$/u.test(raw) && anchor.closest('.t-slds, [data-source-nolim-slider], [class*="slider"], [class*="gallery"], [class*="carousel"]')) continue;
            const target = decodeURIComponent(raw.slice(1));
            if (!document.getElementById(target) && !document.querySelector(`[name="${CSS.escape(target)}"]`)) {
              brokenLinks.push({ text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().slice(0, 45), href: raw });
            }
            continue;
          }
          try {
            const target = new URL(raw, document.baseURI);
            if (target.origin === location.origin && !routeSet.has(canonicalPath(target.pathname)) && !target.pathname.startsWith('/assets/')) {
              brokenLinks.push({ text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().slice(0, 45), href: target.pathname });
            }
          } catch {
            brokenLinks.push({ text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().slice(0, 45), href: raw });
          }
        }
        for (const form of document.querySelectorAll('form')) {
          const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          if (!submit) {
            brokenForms.push({ id: form.id || form.className || 'form', reason: 'submit-control' });
            continue;
          }
          if (form.hasAttribute('data-local-source-form')) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            if (form.dataset.submitted !== 'true') {
              brokenForms.push({ id: form.id || form.className || 'form', reason: 'local-confirmation' });
            }
          }
        }
        // обрезка: текстовый узел вылезает за пределы предка с overflow:hidden
        for (const el of visible) {
          if (el.children.length || !(el.textContent || '').trim()) continue;
          const rects = textRects(el);
          if (!rects.length) continue;
          let p = el.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
              const pr = p.getBoundingClientRect();
              const cutBottom = Math.max(...rects.map((rect) => rect.bottom - pr.bottom));
              // A horizontally scrollable rail intentionally clips its
              // off-canvas items in the current frame; the text remains
              // reachable through native scrolling. Keep the vertical gate,
              // but do not misclassify that scroll boundary as lost text.
              const scrollableX = ['auto', 'scroll'].includes(cs.overflowX)
                && p.scrollWidth > p.clientWidth + 2;
              const cutRight = scrollableX
                ? Number.NEGATIVE_INFINITY
                : Math.max(...rects.map((rect) => rect.right - pr.right));
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
            const aText = (a.textContent || '').trim();
            const bText = (b.textContent || '').trim();
            const interactivePair = Boolean(a.closest('a,button,input,select,textarea') || b.closest('a,button,input,select,textarea'));
            if (!interactivePair && (aText.length < 2 || bText.length < 2)) continue;
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
          missingImageDimensions: missingImageDimensions.slice(0, 8), firstScreenLazy: firstScreenLazy.slice(0, 8),
          brokenLinks: brokenLinks.slice(0, 8), brokenForms: brokenForms.slice(0, 8),
          counts: { offscreen: offscreen.length, clipped: clipped.length, overlaps: overlaps.length,
            missingImageDimensions: missingImageDimensions.length, firstScreenLazy: firstScreenLazy.length,
            brokenLinks: brokenLinks.length, brokenForms: brokenForms.length }, fontOk,
          height: Math.round(doc.scrollHeight) };
      }, allRoutes);
      out.push({ route, width, ...res, errors: errors.slice(0, 3), failed: failed.slice(0, 3), external: [...new Set(external)].slice(0, 3) });
    } catch (e) {
      out.push({ route, width, error: String(e).slice(0, 160) });
    }
    await ctx.close();
  }
  process.stderr.write(`done ${route}\n`);
}

let nextRoute = 0;
// Two concurrent tall-page contexts stay below Chromium's memory cliff on the
// venue galleries. The environment override may raise this to the documented
// maximum of three for smaller route groups.
const workerCount = Math.min(Math.max(1, Number(process.env.AUDIT_WORKERS ?? '2')), 3, ROUTES.length);
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (nextRoute < ROUTES.length) {
    const route = ROUTES[nextRoute];
    nextRoute += 1;
    await auditRoute(route);
  }
}));
const routeOrder = new Map(ROUTES.map((route, index) => [route, index]));
const widthOrder = new Map(WIDTHS.map((width, index) => [width, index]));
out.sort((left, right) => (
  (routeOrder.get(left.route) - routeOrder.get(right.route))
  || (widthOrder.get(left.width) - widthOrder.get(right.width))
));

await browser.close();
server.close();
const defectCount = out.reduce((total, row) => total
  + Number(row.overflow > 0)
  + (row.counts?.offscreen ?? 0)
  + (row.counts?.clipped ?? 0)
  + (row.counts?.overlaps ?? 0)
  + (row.counts?.missingImageDimensions ?? 0)
  + (row.counts?.firstScreenLazy ?? 0)
  + (row.counts?.brokenLinks ?? 0)
  + (row.counts?.brokenForms ?? 0)
  + (row.errors?.length ?? 0)
  + (row.failed?.length ?? 0)
  + (row.external?.length ?? 0)
  + Number(Boolean(row.error)), 0);
const payload = `${JSON.stringify(out, null, 1)}\n`;
if (OUTPUT) {
  await writeFile(OUTPUT, payload);
  console.log(JSON.stringify({ routes: ROUTES.length, widths: WIDTHS.length, measurements: out.length, defectCount, output: OUTPUT }));
} else {
  process.stdout.write(payload);
}
if (defectCount > 0) process.exitCode = 1;
