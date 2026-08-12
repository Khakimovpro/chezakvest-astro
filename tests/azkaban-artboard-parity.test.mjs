import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Azkaban birthday landing opts into its measured source artboard', async () => {
  const page = JSON.parse(await read('src/data/pages/den-rozhdeniya-uznik-azkabana.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'header', 'hero', 'breadcrumbs', 'breadcrumbSpacer', 'packagesHeading', 'packages', 'showsHeading', 'shows',
    'hallHeading', 'hall', 'quizHeading', 'quiz', 'dividerBeforeReviews', 'reviewsHeading', 'dividerAfterReviews',
    'story', 'features', 'dividerBeforeGallery', 'galleryHeading', 'gallery', 'dividerAfterGallery', 'trustHeading',
    'trust', 'dividerBeforeAlternatives', 'alternatives', 'dividerBeforeBooking', 'booking', 'dividerAfterBooking',
    'venuesHeading', 'venues', 'footerSpacer', 'footer', 'copyright',
  ];

  assert.equal(hero.composition, 'azkaban-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'azkaban-artboard');
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 9184);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 12332);
  const start = (dimension, until) => order.slice(0, order.indexOf(until))
    .reduce((total, key) => total + source.records[key][dimension], 0);
  assert.equal(start('desktop', 'packagesHeading'), 777);
  assert.equal(start('desktop', 'quiz'), 3387);
  assert.equal(start('desktop', 'booking'), 7783);
  assert.equal(start('mobile', 'packagesHeading'), 921);
  assert.equal(start('mobile', 'quiz'), 4164);
  assert.equal(start('mobile', 'booking'), 9941);
  assert.deepEqual(source.packages.map((item) => item.src), [
    '/assets/static.tildacdn.com/tild3062-6161-4030-b866-323939616631/_1___-2.png',
    '/assets/static.tildacdn.com/tild6566-6363-4439-a438-643461343262/_2___-2.png',
    '/assets/static.tildacdn.com/tild3334-6662-4466-b237-386665393934/_3___-2.png',
  ]);
  await Promise.all(source.packages.map((item) => access(new URL(`public${item.src}`, root))));
});

test('Azkaban branch stays isolated and replaces source conversion blocks locally', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/AzkabanArtboard.astro'),
  ]);

  assert.match(layout, /sourceAzkaban\s*=\s*hero\.composition\s*===\s*'azkaban-artboard'/u);
  assert.match(layout, /<AzkabanArtboard source=\{page\.sourceParity\} page=\{page\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /data-source-artboard="azkaban"/u);
  assert.match(component, /data-parity-record="rec2144896401"/u);
  assert.match(component, /data-parity-record="rec2097407391"/u);
  assert.match(component, /data-lead-form/u);
  assert.match(component, /data-lead-kind="party"/u);
  assert.match(component, /id="prazdnik"/u);
  assert.doesNotMatch(component, /https?:\/\/(?:static|optim|thb)\.tildacdn\.com/u);
});

test('Azkaban keeps the captured source visual layers local instead of the generic dark-card treatment', async () => {
  const [pageText, component] = await Promise.all([
    read('src/data/pages/den-rozhdeniya-uznik-azkabana.json'),
    read('src/components/AzkabanArtboard.astro'),
  ]);
  const page = JSON.parse(pageText);
  const visual = page.sourceParity.visual;

  assert.deepEqual(visual.hero.title, ['ДЕТСКИЙ ПРАЗДНИК', 'в стиле Узник Азкабана']);
  assert.deepEqual(visual.hall.equipment, [
    'Музыкальной колонкой',
    'Холодильником и микроволновой печью',
    'Кулером с горячей и холодной водой',
    'Безлимитный чай/кофе для вас',
    'Необходимой мебелью: столы, стулья, диванчики',
  ]);
  assert.equal(visual.shows.length, 8);
  assert.equal(visual.features.icons.length, 4);
  assert.equal(visual.booking.decorations.length, 3);
  assert.equal(visual.venues.length, 9);
  assert.deepEqual(visual.footer.organisation.map((item) => item[0]), [
    'Детский День рождения', 'Взрослый День рождения', 'День Рождения в VR',
    'Выпускной 2026', 'Корпоратив | Тимбилдинг', 'Новый год 2027',
  ]);
  assert.deepEqual(visual.footer.entertainment.map((item) => item[0]), [
    'Квеструмы', 'VR-арена', 'Активные игры', 'Прятки в темноте', 'Страшные квесты',
  ]);

  const assets = [
    visual.hall.image,
    ...visual.shows.map((item) => item.img),
    ...visual.features.icons,
    ...visual.reviews.badges,
    visual.gallery.image,
    visual.trust.icon,
    visual.trust.leftImage,
    visual.trust.rightImage,
    visual.booking.background,
    ...visual.booking.decorations,
  ];
  await Promise.all(assets.map((src) => access(new URL(`public${src}`, root))));

  assert.match(component, /data-source-layer="hero-title"/u);
  assert.match(component, /data-source-layer="source-package-card"/u);
  assert.match(component, /data-source-layer="feature-icon"/u);
  assert.match(component, /data-source-layer="trust-mosaic"/u);
  assert.match(component, /data-source-layer="booking-decoration"/u);
  assert.match(component, /sourceVisual\.booking\?\.background/u);
  assert.match(component, /\.azkaban-artboard__package::after\{display:none/u);
  assert.match(component, /\.azkaban-artboard__trust\{background:#151515/u);
});
