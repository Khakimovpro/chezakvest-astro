// Съём одной страницы чезаквест.рф с ЖИВОГО оригинала в JSON.
// Запуск: node _capture/scrape_page.mjs <slug> [ещё слаги...]
// Пишет: _capture/pages/<slug>.json  +  _capture/shots/<slug>-{1440,390}.png
// В консоль — только короткая сводка, сырьё в чат не тащим.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const EXEC = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const HOST = 'https://xn--80aehcht5ci1b.xn--p1ai';
const OUT = '_capture/pages';
const SHOTS = '_capture/shots';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('нужен слаг: node _capture/scrape_page.mjs ono'); process.exit(1); }

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-gpu'] });

for (const slug of slugs) {
  const url = slug === 'index' ? HOST + '/' : `${HOST}/${slug}`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(6000);
    // прокрутка до конца — Tilda дорисовывает блоки и подгружает ленивые картинки
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const cs = el => getComputedStyle(el);
      const box = el => { const r = el.getBoundingClientRect(); return { t: Math.round(r.top + scrollY), l: Math.round(r.left + scrollX), w: Math.round(r.width), h: Math.round(r.height) }; };
      const abs = box;
      const bg = el => { const m = cs(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/); return m ? m[1] : null; };
      const visible = el => { const r = el.getBoundingClientRect(); const s = cs(el); return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };

      const meta = {
        url: location.href,
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        robots: document.querySelector('meta[name="robots"]')?.content || '',
        og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(m => [m.getAttribute('property'), m.content])),
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent.slice(0, 4000)),
        h1: [...document.querySelectorAll('h1')].map(txt),
        headings: [...document.querySelectorAll('h2,h3,h4')].filter(visible).map(h => ({ tag: h.tagName, text: txt(h) })).filter(h => h.text),
        docHeight: document.body.scrollHeight,
      };

      // секции = Tilda-записи верхнего уровня
      const recs = [...document.querySelectorAll('#allrecords > .r, #allrecords > div[id^="rec"]')];
      const sections = recs.filter(visible).map(r => {
        const b = box(r);
        const type = r.getAttribute('data-record-type') || '';
        const texts = [...r.querySelectorAll('h1,h2,h3,h4,h5,p,li,div,span,a')]
          .filter(el => visible(el) && el.children.length === 0)
          .map(el => ({ tag: el.tagName, text: txt(el), fs: cs(el).fontSize, fw: cs(el).fontWeight, color: cs(el).color }))
          .filter(t => t.text && t.text.length < 3000);
        // дедуп подряд идущих одинаковых строк
        const seen = new Set();
        const uniq = texts.filter(t => { const k = t.tag + '|' + t.text; if (seen.has(k)) return false; seen.add(k); return true; });
        const imgs = [...r.querySelectorAll('img')].filter(visible).map(i => ({
          src: i.getAttribute('data-original') || i.currentSrc || i.src, alt: i.alt || '',
          w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height),
        }));
        const bgs = [...r.querySelectorAll('*')].filter(el => visible(el) && bg(el)).slice(0, 60)
          .map(el => ({ url: bg(el), size: cs(el).backgroundSize, pos: cs(el).backgroundPosition, ...box(el) }));
        const links = [...r.querySelectorAll('a')].filter(visible).map(a => ({ text: txt(a).slice(0, 80), href: a.href, cls: a.className.slice(0, 60), ...abs(a) })).filter(a => a.text || a.href);
        const videos = [...r.querySelectorAll('iframe,video')].map(v => v.src || v.getAttribute('data-src') || '');
        return {
          rec: r.id, type, ...b,
          plain: (r.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000),
          bgColor: cs(r).backgroundColor,
          texts: uniq, imgs, bgs, links, videos,
        };
      });

      return { meta, sections };
    });

    // мобильный проход — только геометрия секций, чтобы знать переносы
    const mob = await ctx.newPage();
    await mob.setViewportSize({ width: 390, height: 844 });
    await mob.goto(url, { waitUntil: 'load', timeout: 90000 });
    await mob.waitForTimeout(6000);
    await mob.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } window.scrollTo(0, 0); });
    await mob.waitForTimeout(2500);
    data.mobile = await mob.evaluate(() => {
      const recs = [...document.querySelectorAll('#allrecords > .r, #allrecords > div[id^="rec"]')];
      return {
        docHeight: document.body.scrollHeight,
        sections: recs.map(r => { const b = r.getBoundingClientRect(); return { rec: r.id, t: Math.round(b.top + scrollY), h: Math.round(b.height) }; }),
      };
    });

    await page.screenshot({ path: `${SHOTS}/${slug}-1440.png`, fullPage: true });
    await mob.screenshot({ path: `${SHOTS}/${slug}-390.png`, fullPage: true });
    await mob.close();

    fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(data, null, 1));
    const imgs = new Set(data.sections.flatMap(s => [...s.imgs.map(i => i.src), ...s.bgs.map(b => b.url)]).filter(Boolean));
    console.log(`${slug}: секций ${data.sections.length}, картинок ${imgs.size}, высота ${data.meta.docHeight}px (моб ${data.mobile.docHeight}px), h1="${data.meta.h1[0] || '—'}"`);
  } catch (e) {
    console.log(`${slug}: ОШИБКА ${e.message.slice(0, 120)}`);
  } finally {
    await ctx.close();
  }
}
await browser.close();
