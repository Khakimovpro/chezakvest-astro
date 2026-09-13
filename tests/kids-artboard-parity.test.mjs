import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const run = promisify(execFile);
const rootPath = new URL('../', import.meta.url).pathname;
test('Kids landing uses the native product contract and keeps every required conversion path', async () => {
  const page = JSON.parse(await read('src/data/pages/kids.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const kinds = page.sections.map((section) => section.kind);
  assert.equal(page.render, 'native');
  assert.equal(hero.composition, undefined);
  assert.deepEqual(hero.pills, ['1,5–3 часа', 'Праздник под ключ', '9 площадок']);
  for (const kind of ['included', 'stats', 'lead-cta', 'packages', 'timeline', 'video', 'players', 'safety', 'reviews', 'cards', 'map', 'faq']) {
    assert.ok(kinds.includes(kind), `native kids has ${kind}`);
  }
  assert.ok(kinds.indexOf('included') < kinds.indexOf('stats'));
  assert.ok(kinds.indexOf('stats') < kinds.indexOf('packages'));
  assert.ok(kinds.indexOf('map') < kinds.indexOf('faq'));
  const leadCta = page.sections.find((section) => section.kind === 'lead-cta');
  assert.deepEqual(leadCta, {
    kind: 'lead-cta',
    title: 'Подберите праздник за пару минут',
    subtitle: 'Ответьте на несколько вопросов — менеджер предложит формат и рассчитает стоимость.',
    cta: 'Старт',
    href: '#quiz',
  });
  assert.ok(page.sections.some((section) => section.kind === 'party-form' && section.id === 'quiz'));
  assert.ok(page.sections.some((section) => section.kind === 'party-form' && section.id === 'prazdnik'));
  assert.equal(page.sections.find((section) => section.kind === 'video').videoSlug, 'kids-party-1');
  assert.equal(page.sections.find((section) => section.kind === 'players').photos.length, 11);
  assert.equal(page.sections.find((section) => section.kind === 'safety').items.length, 4);
  assert.equal(page.sections.find((section) => section.kind === 'map').map.embedUrl.startsWith('https://'), true);
  assert.equal(page.sections.find((section) => section.kind === 'map').map.img.startsWith('/assets/'), true);
  assert.equal(page.sections.find((section) => section.kind === 'faq').items.length, 8);
});

test('Native holiday renderer keeps the visual order, Start quiz fallback, and empty-block guards', async () => {
  const [layout, hero, faq, safety, gallery, reviews, map, mobileCta] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/product/ProductHolidayHero.astro'),
    read('src/components/product/ProductFaq.astro'),
    read('src/components/product/ProductSafety.astro'),
    read('src/components/product/ProductGallery.astro'),
    read('src/components/product/ProductReviews.astro'),
    read('src/components/product/ProductMap.astro'),
    read('src/components/product/MobileCtaBar.astro'),
  ]);
  const visualOrder = [
    '<ProductHolidayHero', '<ProductIncluded', '<ProductStats', '<ProductPackages',
    '<ProductTimeline', '<ProductVideo', '<ProductPlayers', '<ProductSafety',
    '<ProductReviews', '<CardsRow', "nativeByKind('lead-cta')", '<PartyForm id="kquiz"',
    "kind === 'tiles'", "nativeByKind('steps')", '<ProductHalls', '<ProductMap',
    '<ProductFaq', 'sectionId="prazdnik"',
  ];
  const nativeBlock = layout.slice(layout.indexOf('{nativeHoliday'), layout.indexOf('{!nativeHoliday'));
  for (let index = 1; index < visualOrder.length; index += 1) {
    assert.ok(nativeBlock.indexOf(visualOrder[index - 1]) < nativeBlock.indexOf(visualOrder[index]), `${visualOrder[index - 1]} is before ${visualOrder[index]}`);
  }
  assert.match(layout, /data-quiz=\{quizId\}/u);
  assert.match(layout, /sectionId="quiz"/u);
  assert.match(layout, /<MobileCtaBar phoneHref=\{site\.header\.phoneHref\} bookingId="prazdnik"/u);
  assert.match(hero, /<h1/u);
  assert.match(hero, /href="#prazdnik"/u);
  assert.match(hero, /href=\{phoneHref\}/u);
  assert.match(hero, /href=\{wa\}/u);
  assert.match(faq, /data\?\.length > 0/u);
  assert.match(faq, /<details>/u);
  assert.match(safety, /data\?\.items\?\.length > 0/u);
  assert.match(gallery, /data\?\.items\?\.length > 0/u);
  assert.match(reviews, /data\?\.items\?\.length > 0/u);
  assert.match(map, /data\?\.map\?\.embedUrl && data\.map\?\.img/u);
  assert.match(mobileCta, /bookingId = 'booking'/u);
});

test('Kids renders its native body and conversion paths in an isolated static build', { timeout: 45_000 }, async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'cheza-kids-render-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  await run('node_modules/.bin/astro', ['build', '--outDir', outputDir], { cwd: rootPath });
  const [page, html] = await Promise.all([
    JSON.parse(await read('src/data/pages/kids.json')),
    readFile(join(outputDir, 'kids', 'index.html'), 'utf8'),
  ]);
  const faq = page.sections.find((section) => section.kind === 'faq').items;
  assert.doesNotMatch(html, /class="source-snapshot-shell/u);
  assert.match(html, /data-lead-kind="party"/u);
  assert.match(html, /id="quiz"/u);
  assert.match(html, /id="prazdnik"/u);
  assert.match(html, /data-quiz=/u);
  assert.match(html, /href="tel:/u);
  assert.match(html, /wa\.me/u);
  assert.match(html, /data-product-mobile-cta[\s\S]*href="#prazdnik"/u);
  assert.match(html, /product-map__embed/u);
  assert.equal((html.match(/<h1(?:\s|>)/gu) || []).length, 1);
  assert.equal((html.match(/<details>/gu) || []).length, faq.length);
  for (const item of faq) assert.match(html, new RegExp(item.q, 'u'));
});
