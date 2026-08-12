import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const localAssets = (value, paths = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => localAssets(item, paths));
    return paths;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => localAssets(item, paths));
    return paths;
  }
  if (typeof value === 'string' && value.startsWith('/assets/')) paths.add(value);
  return paths;
};

test('Kids landing opts into its measured source composition', async () => {
  const page = JSON.parse(await read('src/data/pages/kids.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'header', 'hero', 'breadcrumbs', 'breadcrumbGap', 'breadcrumbTail', 'scenarios', 'dividerAfterScenarios',
    'statsHeading', 'stats', 'dividerAfterStats', 'packagesHeading', 'packageTabs', 'packages', 'dividerAfterPackages',
    'showsHeading', 'shows', 'dividerAfterShows', 'quizHeading', 'quiz', 'dividerAfterQuiz', 'hallsHeading', 'halls',
    'dividerAfterHalls', 'bookingHeading', 'booking', 'dividerAfterBooking', 'additionsHeading', 'additions', 'masterclasses',
    'dividerAfterMasterclasses', 'reviewsHeading', 'dividerAfterReviews', 'invitationHeading', 'invitation',
    'dividerAfterInvitation', 'galleryHeading', 'gallery', 'dividerAfterGallery', 'venuesHeading', 'venues', 'footerSpacer',
    'footer', 'copyright',
  ];

  assert.equal(hero.composition, 'kids-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'kids-artboard');
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 13846);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 13264);
  const start = (dimension, until) => order.slice(0, order.indexOf(until))
    .reduce((total, key) => total + source.records[key][dimension], 0);
  assert.equal(start('desktop', 'reviewsHeading'), 7847);
  assert.equal(start('desktop', 'invitation'), 8127);
  assert.equal(start('desktop', 'venuesHeading'), 12982);
  assert.equal(start('mobile', 'reviewsHeading'), 8240);
  assert.equal(start('mobile', 'invitation'), 8750);
  assert.equal(start('mobile', 'venuesHeading'), 11400);
  assert.deepEqual(source.venues.map((item) => item.title), [
    'Гвардейский пер., 61', 'ул. Социалистическая, 186', 'ул. Красноармейская, 103', 'пр-т Соколова, 23',
    'пр-т Мира, д. 27', 'ул. Нансена, 107/1', 'ул. Магнитогорская, 1', 'ул. 40-летия Победы, 216', 'пр-т Нагибина, 14а',
  ]);
  await Promise.all(source.localAssets.map((path) => access(new URL(`public${path}`, root))));
  await Promise.all([...localAssets(page.sections)].map((path) => access(new URL(`public${path}`, root))));
});

test('Kids branch is isolated and contains source review, invitation and venue records', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/KidsArtboard.astro'),
  ]);

  assert.match(layout, /sourceKids\s*=\s*hero\.composition\s*===\s*'kids-artboard'/u);
  assert.match(layout, /<KidsArtboard source=\{page\.sourceParity\} page=\{page\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /data-source-artboard="kids"/u);
  assert.match(component, /data-parity-record="rec844797129"/u);
  assert.match(component, /data-parity-record="rec844797134"/u);
  assert.match(component, /data-parity-record="rec1100733931"/u);
  assert.match(component, /data-lead-form/u);
  assert.match(component, /data-lead-kind="party"/u);
  assert.match(component, /id="prazdnik"/u);
  assert.doesNotMatch(component, /https?:\/\/(?:static|optim|thb)\.tildacdn\.com/u);
});
