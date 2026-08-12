import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const sourceAssets = (value) => {
  if (typeof value === 'string') return value.startsWith('/assets/') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(sourceAssets);
  if (value && typeof value === 'object') return Object.values(value).flatMap(sourceAssets);
  return [];
};

test('VR birthday opts into the measured source artboard instead of generic holiday blocks', async () => {
  const page = JSON.parse(await read('src/data/pages/den-rozhdeniya-na-vr-arene.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'header', 'hero', 'breadcrumbs', 'games', 'packagesHeading', 'packages', 'showsHeading', 'shows',
    'hallHeading', 'hall', 'videoSpacer', 'videoHeading', 'video', 'certificate', 'gallerySpacer',
    'galleryHeading', 'gallery', 'callback', 'venuesHeading', 'venues', 'footerSpacer', 'footer', 'copyright',
  ];

  assert.equal(hero.composition, 'vr-birthday-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'vr-birthday-artboard');
  assert.equal(source.bookingHref, '#callback');
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 6850);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 9048);
  const start = (dimension, until) => order.slice(0, order.indexOf(until))
    .reduce((total, key) => total + source.records[key][dimension], 0);
  assert.equal(start('desktop', 'games'), 694);
  assert.equal(start('desktop', 'packages'), 1378);
  assert.equal(start('desktop', 'hall'), 2986);
  assert.equal(start('desktop', 'callback'), 5506);
  assert.equal(start('mobile', 'games'), 768);
  assert.equal(start('mobile', 'packages'), 1542);
  assert.equal(start('mobile', 'hall'), 3765);
  assert.equal(start('mobile', 'callback'), 6553);
  assert.equal(source.games.length, 4);
  assert.equal(source.packages.length, 3);
  assert.equal(source.shows.length, 8);
  assert.equal(source.gallery.length, 8);
  assert.equal(source.venues.length, 9);
});

test('VR birthday artboard renders local source bitmaps and a local callback replacement', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/VrBirthdayArtboard.astro'),
  ]);

  assert.match(layout, /sourceVrBirthday\s*=\s*hero\.composition\s*===\s*'vr-birthday-artboard'/u);
  assert.match(layout, /<VrBirthdayArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /vr-birthday-artboard__hero/u);
  assert.match(component, /vr-birthday-artboard__packages/u);
  assert.match(component, /vr-birthday-artboard__callback/u);
  assert.match(component, /data-lead-form/u);
  assert.match(component, /href=\{bookingHref\}/u);
  assert.match(component, /<label for="vr-birthday-callback-name">[\s\S]*?Ваше имя[\s\S]*?id="vr-birthday-callback-name"/u);
  assert.match(component, /<label for="vr-birthday-callback-phone">[\s\S]*?Телефон[\s\S]*?id="vr-birthday-callback-phone"/u);
  assert.match(component, /href=\{href\('\/pryatki_v_temnote'\)\}/u);
  assert.doesNotMatch(component, /https?:\/\/(?:static|optim|thb)\.tildacdn\.com/u);
});

test('VR birthday mirrors its rendered source bitmap subset locally', async () => {
  const page = JSON.parse(await read('src/data/pages/den-rozhdeniya-na-vr-arene.json'));
  const assets = [...new Set(sourceAssets(page.sourceParity))];
  assert.ok(assets.length >= 28);
  await Promise.all(assets.map((asset) => access(new URL(`public${asset}`, root))));
});
