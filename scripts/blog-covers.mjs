#!/usr/bin/env node
// Генератор обложек статей блога: 1200×630 под og:image.
//
// Фон — реальное фото квеста, которое автор статьи выбрал во frontmatter.
// Поверх ложится типографика сайта (Montserrat, оранжевый акцент), чтобы ссылка
// в мессенджере и в выдаче выглядела как карточка бренда, а не как случайный кадр.
//
// Запуск:  node scripts/blog-covers.mjs [--write-frontmatter]
// Готовые файлы: public/assets/blog/<slug>.webp

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog');
const PUBLIC_DIR = join(ROOT, 'public');
const OUT_DIR = join(PUBLIC_DIR, 'assets', 'blog');
const FONT_DIR = join(PUBLIC_DIR, 'assets', 'fonts.gstatic.com', 's', 'montserrat', 'v31');
const FONT_FILE = 'JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2'; // кириллический сабсет Montserrat
const WRITE_FRONTMATTER = process.argv.includes('--write-frontmatter');

function field(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(frontmatter);
  return match ? match[1].trim() : '';
}

// Верхняя плашка обложки: короткая тема статьи, взятая из её же тегов.
function eyebrowFor(tags) {
  const skip = new Set(['ростов', 'ростов-на-дону']);
  const tag = tags.find((item) => !skip.has(item.toLowerCase()));
  return (tag || 'блог').toUpperCase();
}

function coverHtml({ title, eyebrow, photoUrl, fontUrl }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Montserrat';src:url('${fontUrl}') format('woff2');font-weight:100 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:'Montserrat',sans-serif}
.wrap{position:relative;width:1200px;height:630px}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,8,.50) 0%,rgba(8,8,8,.10) 30%,rgba(8,8,8,.72) 72%,rgba(8,8,8,.94) 100%)}
.content{position:absolute;inset:0;padding:52px 64px 56px;display:flex;flex-direction:column;justify-content:space-between}
.eyebrow{display:inline-block;align-self:flex-start;background:#ff6b00;color:#1f2933;font-weight:800;font-size:19px;letter-spacing:.09em;padding:10px 20px;border-radius:60px}
.bottom{display:flex;flex-direction:column;gap:22px}
h1{color:#fff;font-weight:800;font-size:60px;line-height:1.08;max-width:1010px;text-wrap:balance;text-shadow:0 4px 22px rgba(0,0,0,.75)}
h1.long{font-size:50px}
.foot{display:flex;align-items:center;gap:16px}
.bar{width:64px;height:6px;background:#ff6b00;border-radius:3px}
.brand{color:#fff;font-weight:700;font-size:24px;letter-spacing:.02em}
.brand span{color:#ff8a00}
</style></head><body>
<div class="wrap">
  <img class="photo" src="${photoUrl}" alt="">
  <div class="shade"></div>
  <div class="content">
    <span class="eyebrow">${eyebrow}</span>
    <div class="bottom">
      <h1 class="${title.length > 46 ? 'long' : ''}">${title}</h1>
      <div class="foot"><span class="bar"></span><span class="brand">Чё за Квест <span>· чезаквест.рф</span></span></div>
    </div>
  </div>
</div></body></html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const names = (await readdir(BLOG_DIR)).filter((name) => name.endsWith('.md'));
  if (names.length === 0) throw new Error('В src/content/blog нет статей');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const fontBytes = await readFile(join(FONT_DIR, FONT_FILE));
  const fontUrl = `data:font/woff2;base64,${fontBytes.toString('base64')}`;
  const report = [];

  for (const name of names) {
    const slug = name.replace(/\.md$/, '');
    const raw = await readFile(join(BLOG_DIR, name), 'utf8');
    const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    if (!match) throw new Error(`${name}: файл без frontmatter`);
    const frontmatter = match[1];

    const title = field(frontmatter, 'title');
    const source = field(frontmatter, 'image');
    const tagsRaw = /^tags:\s*\[(.*)\]\s*$/m.exec(frontmatter)?.[1] || '';
    const tags = [...tagsRaw.matchAll(/"([^"]+)"/g)].map((item) => item[1]);

    // Уже сгенерированная обложка фоном быть не может — берём кадр, выбранный автором.
    const photoPath = source.startsWith('/assets/blog/')
      ? field(frontmatter, 'coverSource') || source
      : source;
    // Картинку вшиваем в разметку: страница живёт на about:blank и внешний file:// не загрузит.
    const photoBytes = await readFile(join(PUBLIC_DIR, photoPath));
    const photoUrl = `data:image/webp;base64,${photoBytes.toString('base64')}`;

    await page.setContent(coverHtml({ title, eyebrow: eyebrowFor(tags), photoUrl, fontUrl }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    const outPath = join(OUT_DIR, `${slug}.webp`);
    await sharp(png).webp({ quality: 82 }).toFile(outPath);

    if (WRITE_FRONTMATTER && !source.startsWith('/assets/blog/')) {
      const updated = raw.replace(
        /^image:\s*"[^"]*"\s*$/m,
        `image: "/assets/blog/${slug}.webp"\ncoverSource: "${photoPath}"`,
      );
      await writeFile(join(BLOG_DIR, name), updated);
    }
    report.push({ slug, photoPath });
  }

  await browser.close();
  for (const item of report) console.log(`${item.slug}.webp  ←  ${item.photoPath}`);
  console.log(`\nГотово: ${report.length} обложек в public/assets/blog/`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
