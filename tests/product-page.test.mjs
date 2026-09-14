import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import site from '../src/data/site.json' with { type: 'json' };
import venues from '../src/data/venues.json' with { type: 'json' };
import reviews from '../src/data/reviews.json' with { type: 'json' };
import registry from '../src/data/video-hls.json' with { type: 'json' };
import page from '../src/data/pages/igra_v_kalmara.json' with { type: 'json' };
import { PRODUCT_BLOCK_ORDER, productFaqItems, productPageModel } from '../src/lib/product-page.js';

test('native render flag is evaluated before snapshot lookup', async () => {
  const source = await readFile(new URL('../src/lib/source-snapshots.js', import.meta.url), 'utf8');
  assert.match(source, /page\?\.render\s*===\s*'native'/u);
  assert.match(source, /if \(page\?\.render\s*===\s*'native'\) return null;/u);
});

test('product model is data driven, ordered and omits unavailable blocks', () => {
  const model = productPageModel({ page, site, venues: venues.chips, venuePage: { map: { img: '/x', embedUrl: '/map' } }, reviews, videoRegistry: registry });
  assert.deepEqual(PRODUCT_BLOCK_ORDER, ['hero', 'short', 'gallery', 'video', 'story', 'fit', 'booking', 'reviews', 'players', 'safety', 'party', 'faq', 'map', 'related', 'finalCta']);
  assert.equal(model.video.slug, 'igra_v_kalmara-trailer');
  assert.equal(model.gallery.items.length, 3);
  assert.equal(productPageModel({ page: { product: {}, hero: {} }, site, venues: venues.chips }).gallery, null);
});

test('related product lists do not repeat the current route or title', () => {
  const model = productPageModel({ page, site, venues: venues.chips, venuePage: {}, reviews, videoRegistry: registry });
  assert.ok(model.related.items.every((item) => item.href !== '/igra_v_kalmara'));
  assert.ok(model.related.scenarios.items.every((item) => item.t !== 'Игра в Кальмара'));
});

test('native product route has booking, phone, WhatsApp, required legacy anchors and one H1', async () => {
  const html = await readFile(new URL('../dist/igra_v_kalmara/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /class="source-snapshot-shell/u);
  assert.match(html, /data-source-schedule="87"/u);
  assert.ok(html.includes(site.header.phoneHref));
  assert.match(html, /wa\.me/u);
  for (const anchor of ['story', 'prazdnik', 'booking', 'video', 'karta']) assert.match(html, new RegExp(`id="${anchor}"`));
  assert.equal((html.match(/<h1(?:\s|>)/gu) || []).length, 1);
});

test('product pages with card arrows load the shared row handler in their module graph', async () => {
  const dist = new URL('../dist/', import.meta.url);
  for (const slug of ['igra_v_kalmara', 'kids']) {
    const html = await readFile(new URL(`${slug}/index.html`, dist), 'utf8');
    assert.match(html, /cards__arrow/u);
    const pending = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/gu)]
      .map((match) => new URL(match[1].replace(/^\//u, ''), dist));
    const visited = new Set();
    let found = false;
    while (pending.length && !found) {
      const url = pending.pop();
      if (visited.has(url.href) || !url.href.startsWith(dist.href)) continue;
      visited.add(url.href);
      const source = await readFile(url, 'utf8');
      found = source.includes('.cards__wrap') && source.includes('scrollBy') && source.includes('addEventListener');
      for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/gu)) pending.push(new URL(match[1], url));
    }
    assert.ok(found, `${slug}: card row handler is reachable from the page`);
  }
});

test('FAQ schema source contains only visible questions', () => {
  const faq = productFaqItems(page);
  assert.equal(faq.length, page.product.faq.length);
  assert.ok(faq.every((item) => item.q && item.a));
  assert.equal(faq.length, 10);
});

import kids from '../src/data/pages/kids.json' with { type: 'json' };
import { ICONS, productIcon } from '../src/components/product/icons/lucide.js';
import { pickIcon } from '../src/lib/product-icons.js';
import { typograf } from '../src/lib/typograf.js';

test('all pilot fact lists resolve known meaningful icons', () => {
  const sections = Object.fromEntries(kids.sections.map((section) => [section.kind, section]));
  const lists = [page.hero.pills, page.features.items, page.product.videoPoints, page.product.safety,
    sections.hero.pills, sections.video.points, sections.included.items, sections.safety.items];
  for (const item of lists.flat()) {
    const text = typeof item === 'string' ? item : item.t || item.title;
    const icon = item.icon || pickIcon(text);
    assert.ok(Object.hasOwn(ICONS, icon), `${text}: known icon`);
    assert.notEqual(icon, 'sparkles', `${text}: intentional icon`);
  }
  assert.ok(sections.video.points.every((point) => !sections.included.items.some((item) => item.t === point.t)));
});

test('icon rendering rejects unknown names including inherited object keys', () => {
  assert.equal(productIcon('users'), ICONS.users);
  for (const name of ['typo-icon', 'toString', undefined]) {
    assert.throws(() => productIcon(name), /Unknown product icon:/u);
  }
});

test('typography preserves text while joining short words and number ranges', () => {
  assert.equal(typograf('Игра в Кальмара для 2-24'), 'Игра в\u00a0Кальмара для 2–24');
  assert.equal(typograf('На карте — адрес'), 'На\u00a0карте\u00a0— адрес');
  assert.equal(typograf('<текст>'), '<текст>');
  assert.equal(typograf('Чё за Квест'), 'Чё за\u00a0Квест');
});

test('built product sections use registered SVG icons instead of typographic glyphs', async () => {
  for (const slug of ['igra_v_kalmara', 'kids']) {
    const html = await readFile(new URL(`../dist/${slug}/index.html`, import.meta.url), 'utf8');
    const main = html.match(/<main[\s\S]*?<\/main>/u)?.[0];
    assert.ok(main);
    assert.doesNotMatch(main, /[✓✔★☆▶►‹›]/u);
    const names = [...main.matchAll(/product-icon--([a-z0-9-]+)/gu)].map((match) => match[1]);
    assert.ok(names.length > 30);
    for (const name of names) assert.ok(Object.hasOwn(ICONS, name), name);
  }
});

test('pilot preparation states sourced facts without editorial uncertainty', () => {
  assert.equal(page.product.safetyTitle, 'Перед игрой');
  assert.doesNotMatch(JSON.stringify(page.product), /не опубликован|Что известно/u);
  assert.equal(page.product.safety.length, 4);
});

test('directions ignore quoted quest names when resolving icons', () => {
  for (const text of ['Справа от двери «Чё за Квест?»', 'У входа "Квест"']) {
    assert.equal(pickIcon(text, 'footprints'), 'footprints');
  }
});

import { pluralRu } from '../src/lib/plural.js';
test('review counts use Russian plural forms including formatted counts', () => {
  for (const [n, word] of [[1,'отзыв'],[3,'отзыва'],[11,'отзывов'],['4 483','отзыва'],[21,'отзыв'],[112,'отзывов'],[0,'отзывов']]) {
    assert.equal(pluralRu(n,['отзыв','отзыва','отзывов']), word);
  }
});

test('each pilot hall names its equipment in complete nominative labels', async () => {
  const halls=kids.sections.find(section=>section.kind==='halls').items;
  assert.ok(halls.length>0);
  for(const hall of halls) assert.ok(hall.equipment.every(item=>/^[А-ЯЁ]/u.test(item)));
  const html=await readFile(new URL('../dist/kids/index.html',import.meta.url),'utf8');
  assert.equal((html.match(/<p class="product-halls__equipment-title"[^>]*>Оснащение<\/p>/gu)||[]).length,halls.length);
});

test('pilot display copy keeps the approved spelling and casing',()=>{
 for(const data of [page,kids]) assert.doesNotMatch(JSON.stringify(data),/Уверенны|пришел|актер|ребен|День Рождения/u);
});
