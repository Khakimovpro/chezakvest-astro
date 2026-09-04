import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('restores the source-verified FNAF page across discovery surfaces', async () => {
  const [page, site, venues, magnit, homeSnapshot, magnitSnapshot] = await Promise.all([
    json('src/data/pages/fnaf.json'),
    json('src/data/site.json'),
    json('src/data/venues.json'),
    json('src/data/pages/magnitogorskaya1.json'),
    read('src/source-snapshots/home.html'),
    read('src/source-snapshots/magnitogorskaya1.html'),
  ]);

  assert.equal(page.slug, 'fnaf');
  assert.equal(page.type, 'quest');
  assert.equal(page.venueSlug, 'magnitogorskaya1');
  assert.equal(page.seo.title, 'Квест в стиле 5 ночей с Фредди в Ростове-на-Дону');
  assert.deepEqual(page.hero.pills, ['4-24', '60 мин.', '10+']);
  assert.equal(page.booking.calendarId, 113);
  assert.equal(site.cards.find((card) => card.href === '/fnaf')?.title, '5 ночей с Фредди');
  assert.ok(site.megamenu.catalog.cols.flatMap((column) => column.links).some((item) => item.href === '/fnaf'));

  const magnitChip = venues.chips.find((chip) => chip.href === '/magnitogorskaya1');
  assert.ok(magnitChip.groups.flatMap((group) => group.items).some((item) => item.href === '/fnaf'));
  assert.ok(magnit.games.items.some((item) => item.href === '/fnaf'));

  for (const snapshot of [homeSnapshot, magnitSnapshot]) {
    assert.match(snapshot, /href="__SITE_BASE__\/fnaf\/"/u);
    assert.match(snapshot, /5 ночей с Фредди/u);
    assert.match(snapshot, /__SITE_BASE__\/assets\/optim\.tildacdn\.com\/tild6365-3761-4430-a464-613566386531\//u);
  }

  for (const path of Object.values(page.hero.bgset)) {
    await access(new URL(`../public${path}`, import.meta.url));
  }
});

test('ships FNAF as a local snapshot with its live booking calendar', async () => {
  const [manifest, snapshot] = await Promise.all([
    json('src/generated/source-snapshot-manifest.json'),
    read('src/source-snapshots/fnaf.html'),
  ]);

  assert.equal(manifest.routes['/fnaf/'].snapshot, 'fnaf.html');
  assert.match(snapshot, /data-source-route="\/fnaf\/"/u);
  assert.match(snapshot, /data-source-schedule="113"/u);
  assert.match(snapshot, /5 ночей с Фредди/u);
  assert.match(snapshot, /Телефонный парень: Алло, меня слышно\?/u);
  assert.match(snapshot, /3 уровня сложности на\s+выбор/u);
  assert.match(snapshot, /Костюмированный актер/u);
  assert.match(snapshot, /Банкетный зал на\s+20 человек/u);
  assert.doesNotMatch(snapshot, /https:\/\/(?:static|optim|thb)\.tildacdn\.(?:com|net)/u);
});

test('enables only the confirmed Yandex Metrika counter', async () => {
  const [site, analytics] = await Promise.all([
    json('src/data/site.json'),
    read('src/components/Analytics.astro'),
  ]);

  assert.equal(site.analytics.metrikaId, '48864086');
  assert.match(analytics, /window\.ym\(metrikaId, 'init'/u);
  assert.doesNotMatch(analytics, /reachGoal/u);
  assert.doesNotMatch(analytics, /ecommerce\s*:/u);
});
