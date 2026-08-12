import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalizeCardItems } from '../src/lib/card-items.js';
import { groupVenueGameItems } from '../src/lib/venue-games.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('renders an ungrouped venue game inventory exactly once', async () => {
  const magnitogorskaya = await json('src/data/pages/magnitogorskaya1.json');
  const groups = groupVenueGameItems(magnitogorskaya.games.items, magnitogorskaya.games.groups);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items, magnitogorskaya.games.items);
});

test('keeps explicit game groups and appends only their ungrouped remainder', async () => {
  const fortyLet = await json('src/data/pages/40letpobedy216.json');
  const groups = groupVenueGameItems(fortyLet.games.items, fortyLet.games.groups);

  assert.deepEqual(groups.map((group) => group.items.length), [6, 7, 3]);
  assert.deepEqual(groups.flatMap((group) => group.items), fortyLet.games.items);
});

test('preserves captured related and scenario art before linked-page fallbacks', async () => {
  const ono = await json('src/data/pages/ono.json');
  const capturedRelated = ono.related.items[0];
  const capturedScenario = ono.scenarios.items[0];
  const linkedPages = new Map([
    ['kvest_v_realnosti_psihbolnitsa', {
      img: '/assets/q/wrong-hero.webp',
      imgSet: { '760': '/assets/q/wrong-hero-760.webp' },
    }],
    ['igra-v-kalmara-lend', {
      img: '/assets/q/wrong-scenario-hero.webp',
      imgSet: { '760': '/assets/q/wrong-scenario-hero-760.webp' },
    }],
  ]);

  const [related] = canonicalizeCardItems([capturedRelated], linkedPages);
  const [scenario] = canonicalizeCardItems([capturedScenario], linkedPages);

  assert.equal(related.img, capturedRelated.img);
  assert.equal(related.imgSet, null);
  assert.equal(scenario.img, capturedScenario.img);
  assert.equal(scenario.imgSet, null);
});

test('preserves an explicit responsive card art set', () => {
  const capturedSet = { '760': '/assets/q/card-760.webp', '1600': '/assets/q/card-1600.webp' };
  const [card] = canonicalizeCardItems([{
    t: 'Captured',
    href: '/captured',
    img: '/assets/q/card.webp',
    imgSet: capturedSet,
  }], new Map([['captured', {
    img: '/assets/q/wrong-hero.webp',
    imgSet: { '760': '/assets/q/wrong-hero-760.webp' },
  }]]));

  assert.equal(card.img, '/assets/q/card.webp');
  assert.deepEqual(card.imgSet, capturedSet);
});

test('uses the linked-page responsive art only when a card has none of its own', () => {
  const linkedPages = new Map([['fallback', {
    img: '/assets/q/fallback.webp',
    imgSet: { '760': '/assets/q/fallback-760.webp' },
  }]]);

  const [card] = canonicalizeCardItems([{ t: 'Fallback', href: '/fallback' }], linkedPages);

  assert.equal(card.img, '/assets/q/fallback.webp');
  assert.deepEqual(card.imgSet, { '760': '/assets/q/fallback-760.webp' });
});

test('shares captured-art canonicalization with venue game cards', async () => {
  const venue = await read('src/layouts/VenuePage.astro');

  assert.match(venue, /import \{ canonicalizeCardItems \} from '\.\.\/lib\/card-items\.js';/);
  assert.match(venue, /const canonicalGameItems = \(items = \[\]\) => canonicalizeCardItems\(items, pagesBySlug\);/);
});

test('shares captured-art canonicalization with holiday card rows', async () => {
  const holiday = await read('src/layouts/HolidayPage.astro');

  assert.match(holiday, /import \{ canonicalizeCardItems \} from '\.\.\/lib\/card-items\.js';/);
  assert.match(holiday, /const canonicalCardItems = \(items = \[\]\) => canonicalizeCardItems\(items, pagesBySlug\);/);
});
