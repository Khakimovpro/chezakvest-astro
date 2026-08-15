import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { railIndexAfterKey } from '../src/scripts/source-artboard-rail.js';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const recordOrder = [
  'hero', 'intro', 'features', 'programHeading', 'program', 'programDivider',
  'shows', 'showsDivider', 'additions', 'hallHeading', 'hall', 'trustHeading',
  'trust', 'pinkDivider', 'gift', 'venuesHeading', 'venues', 'footerSpacer',
  'footer', 'footerBottom',
];

const assertHeights = (record, desktop, mobile) => {
  assert.equal(record.desktop, desktop);
  assert.equal(record.mobile, mobile);
};

const localAssets = (value) => {
  if (typeof value === 'string') return value.startsWith('/assets/') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(localAssets);
  if (value && typeof value === 'object') return Object.values(value).flatMap(localAssets);
  return [];
};

test('Igra v Kalmara retains the complete captured artboard data behind its source snapshot route', async () => {
  const page = JSON.parse(await read('src/data/pages/igra-v-kalmara-lend.json'));
  const manifest = JSON.parse(await read('src/generated/source-snapshot-manifest.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;

  assert.equal(hero.composition, 'kalmar-landing-artboard');
  assert.equal(hero.hideSharedHeader, false, 'Layout replaces the complete slot for snapshot routes');
  assert.equal(manifest.routes['/igra_v_kalmara/'].snapshot, 'igra_v_kalmara.html');
  assert.match(manifest.routes['/igra_v_kalmara/'].source, /work\/raw\/pages\/igra_v_kalmara/u);
  assert.equal(source.kind, 'kalmar-landing-artboard');
  assertHeights(source.records.hero, 856, 770);
  assertHeights(source.records.features, 850, 1020);
  assertHeights(source.records.program, 638, 1549);
  assertHeights(source.records.shows, 633, 1891);
  assertHeights(source.records.additions, 634, 722);
  assertHeights(source.records.hall, 600, 785);
  assertHeights(source.records.trust, 770, 750);
  assertHeights(source.records.footerBottom, 193, 359);
  assert.equal(recordOrder.reduce((total, key) => total + source.records[key].desktop, 0), 7498);
  assert.equal(recordOrder.reduce((total, key) => total + source.records[key].mobile, 0), 11053);
  assert.deepEqual(source.program.items.map((item) => item.title), ['СТАНДАРТ', 'СУПЕР', 'МАКСИ']);
  assert.equal(source.shows.length, 4);
  assert.equal(source.additions.length, 4);
  assert.equal(source.hall.slides.length, 2, 'the source has two hall records behind the arrows');
  assert.deepEqual(source.hall.slides.map((slide) => slide.count), ['1 из 2', '2 из 2']);
  assert.equal(source.bookingHref, '#prazdnik');
});

test('Igra v Kalmara emits only local mirrors for source art and retains every source gallery item', async () => {
  const page = JSON.parse(await read('src/data/pages/igra-v-kalmara-lend.json'));
  const assets = [...new Set(localAssets(page.sourceParity))];

  assert.ok(assets.length >= 38, `expected source art, cards, galleries and footer assets; got ${assets.length}`);
  await Promise.all(assets.map((asset) => access(new URL(`public${asset}`, root))));
  assert.equal(page.sourceParity.hall.slides[0].images.length, 6);
  assert.equal(page.sourceParity.hall.slides[1].images.length, 8);
});

test('the HolidayPage branch is route-scoped and retains a local target form', async () => {
  const [layout, component, untouched] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/KalmarLandingArtboard.astro'),
    read('src/data/pages/prazdnik-maxi.json'),
  ]);

  assert.match(layout, /import KalmarLandingArtboard from '\.\.\/components\/KalmarLandingArtboard\.astro';/u);
  assert.match(layout, /sourceKalmarLanding\s*=\s*hero\.composition\s*===\s*'kalmar-landing-artboard'/u);
  assert.match(layout, /<KalmarLandingArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /sourceKalmarLanding && <div class="kalmar-landing-artboard__booking"><PartyForm id="kalmar" sectionId="prazdnik"/u);
  assert.equal(JSON.parse(untouched).sections.some((section) => section.kind === 'kalmar-programs'), false);
  assert.match(component, /kalmar-landing-artboard__hero/u);
  assert.match(component, /kalmar-landing-artboard__trust/u);
  assert.match(component, /kalmar-landing-artboard__booking\s+\.pform:target/u);
  assert.match(component, /href=\{href\('\/privacy\/'\)\}/u, 'footer privacy link stays under SITE_BASE');
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});

test('the source additions and two-hall pager expose local keyboard-capable rails', async () => {
  const component = await read('src/components/KalmarLandingArtboard.astro');

  assert.equal(railIndexAfterKey(0, 4, 'ArrowLeft'), 3);
  assert.equal(railIndexAfterKey(3, 4, 'ArrowRight'), 0);
  assert.equal(railIndexAfterKey(2, 4, 'Home'), 0);
  assert.equal(railIndexAfterKey(1, 4, 'End'), 3);
  assert.match(component, /data-source-artboard-rail-id="kalmar-additions"/u);
  assert.match(component, /data-source-artboard-rail-id="kalmar-hall"/u);
  assert.match(component, /<SourceArtboardRailControls railId="kalmar-additions"/u);
  assert.match(component, /<SourceArtboardRailControls railId="kalmar-hall"/u);
  assert.match(component, /data-source-artboard-rail-slide/u);
});
