import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('restores the six audited quest keys, booking fallbacks and two-hall celebrations', async () => {
  const names = [
    'among_us', 'portal-strike', 'zvonok', 'kvest_v_realnosti_psihbolnitsa',
    'igra_v_kalmara', 'kvest_v_realnosti_sherlock_holms',
  ];
  const pages = await Promise.all(names.map((name) => json(`src/data/pages/${name}.json`)));
  assert.deepEqual(pages.map((page) => page.difficulty), [3, 3, 3, 3, 4, 5]);
  assert.deepEqual(pages.map((page) => page.booking?.calendarId), [84, 91, 84, 8, 87, 9]);
  for (const page of [pages[0], pages[2], pages[4]]) {
    assert.equal(page.celebrationVenues?.length, 2);
    assert.equal(page.celebrationVenues?.[1]?.venueSlug, 'magnitogorskaya1');
  }
  for (const page of [pages[0], pages[4]]) {
    assert.deepEqual(page.features.items[1], {
      t: 'Костюмированный актер',
      sub: 'погружающий детей в праздник входит в стоимость',
    });
  }

  const [quest, booking, venues] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    read('src/components/PrebookingForm.astro'),
    read('src/components/VenuesSection.astro'),
  ]);
  assert.match(quest, /qhero__keys/);
  assert.match(quest, /celebrationVenues/);
  assert.match(quest, /<PrebookingForm/);
  assert.match(quest, /<VenuesSection/);
  assert.match(booking, /Расписание не загрузилось/u);
  assert.match(venues, /VenueChips/);
});

test('converts campaign URLs into indexable holiday pages and moves New Year navigation', async () => {
  const campaignSlugs = ['minecraft-lend', 'roblox-land', 'amongus-land', 'igra-v-kalmara-lend', 'new-year'];
  const pages = await Promise.all(campaignSlugs.map((slug) => json(`src/data/pages/${slug}.json`)));
  assert.ok(pages.every((page) => page.type === 'holiday' && page.sections?.length));

  const [urls, site, legacy] = await Promise.all([
    read('src/lib/urls.js'),
    json('src/data/site.json'),
    read('migration/legacy-url-map.csv'),
  ]);
  for (const slug of campaignSlugs.slice(0, 4)) assert.doesNotMatch(urls, new RegExp(`['\"]/${slug}['\"]`));
  assert.equal(site.megamenu.party.cols.at(-1).href, '/new-year');
  for (const slug of [...campaignSlugs.slice(0, 4), 'new-year']) {
    assert.match(legacy, new RegExp(`/${slug},/${slug},200`));
  }
});

test('keeps venue maps click-lazy and completes the Magnitogorskaya game list', async () => {
  const magnit = await json('src/data/pages/magnitogorskaya1.json');
  assert.equal(magnit.games.items.length, 14);
  assert.deepEqual(magnit.games.items.slice(-8).map((item) => item.t), [
    'Роблокс. Радужные друзья', 'Роблокс. Дорс', 'Бегущий в лабиринте',
    'Игра в Кальмара', 'Гарри Поттер и Кубок огня', 'Амонг Ас',
    'Уэнсдей. Потерянная душа', 'Майнкрафт',
  ]);
  const [venue, map, lazyMap] = await Promise.all([
    read('src/layouts/VenuePage.astro'),
    read('src/scripts/map-embed.js'),
    read('src/components/LazyMap.astro'),
  ]);
  assert.match(venue, /<LazyMap/);
  assert.match(lazyMap, /data-map-embed/);
  assert.match(map, /querySelectorAll\('\[data-map-embed\]'\)/);
  assert.match(map, /createElement\('iframe'\)/);
});

test('adds the local review and shared venue sections to audited parity templates', async () => {
  const [holiday, category, venue, info] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/layouts/CategoryPage.astro'),
    read('src/layouts/VenuePage.astro'),
    read('src/layouts/InfoPage.astro'),
  ]);
  for (const template of [holiday, category, venue, info]) assert.match(template, /VenuesSection/);
  for (const template of [holiday, category, venue]) assert.match(template, /Reviews/);
});

test('keeps audited quest art direction and every source related card', async () => {
  const [patologiya, shizofreniya, quest] = await Promise.all([
    json('src/data/pages/patologiya.json'),
    json('src/data/pages/shizofreniya.json'),
    read('src/layouts/QuestPage.astro'),
  ]);
  assert.equal(patologiya.theme, 'dark');
  assert.equal(shizofreniya.theme, 'dark');
  assert.match(quest, /canonicalizeCardItems\(relatedItems\)/);
  assert.doesNotMatch(quest, /filteredRelatedItems/);

  const sharedRail = ['puteshestvie', 'pirati', 'pobeg', 'mystery_shack', 'indiana'];
  const pages = await Promise.all(sharedRail.map((slug) => json(`src/data/pages/${slug}.json`)));
  for (const page of pages) {
    assert.deepEqual(page.related.items.at(-1), {
      t: 'Фантастический угон',
      href: '/ugon',
      img: '/assets/q/c2245d4825.webp',
    });
    assert.ok(page.related.items.some((item) => item.href === `/${page.slug}`));
  }
});
