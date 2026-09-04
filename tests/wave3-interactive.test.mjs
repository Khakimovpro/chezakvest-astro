import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps the local lightbox safe for responsive images', async () => {
  const [layout, lightbox, zoom, script, quest, category, holiday, venue] = await Promise.all([
    read('src/layouts/Layout.astro'),
    read('src/components/Lightbox.astro'),
    read('src/components/ZoomImg.astro'),
    read('src/scripts/lightbox.js'),
    read('src/layouts/QuestPage.astro'),
    read('src/layouts/CategoryPage.astro'),
    read('src/layouts/HolidayPage.astro'),
    read('src/layouts/VenuePage.astro'),
  ]);

  assert.match(layout, /<Lightbox\s*\/>/);
  assert.match(lightbox, /<dialog class="lb" id="lightbox"/);
  assert.match(zoom, /<button[^>]*data-zoom=/);
  assert.match(zoom, /srcset=\{srcset\}/);
  assert.match(script, /image\.currentSrc \|\| image\.src/);
  assert.match(script, /data:image\/gif/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /pointerup/);
  for (const template of [quest, category, holiday, venue]) assert.match(template, /ZoomImg/);
});

test('ships all nine enriched venue chips and keeps the map lazy', async () => {
  const venues = JSON.parse(await read('src/data/venues.json'));
  const [chips, mapScript, home] = await Promise.all([
    read('src/components/VenueChips.astro'),
    read('src/scripts/map-embed.js'),
    read('src/pages/index.astro'),
  ]);

  assert.equal(venues.chips.length, 9);
  assert.deepEqual(venues.chips.map((chip) => chip.groups.flatMap((group) => group.items).length), [2, 1, 3, 3, 1, 2, 15, 18, 6]);
  assert.ok(venues.chips.every((chip) => Number.isFinite(chip.lat) && Number.isFinite(chip.lon) && chip.groups.length));
  assert.match(chips, /aria-describedby/);
  assert.match(chips, /role="tooltip"/);
  assert.match(mapScript, /createElement\('iframe'\)/);
  assert.doesNotMatch(home, /<iframe[^>]+yandex/i);
});

test('uses public Marquiz ids only after a user activates a CTA', async () => {
  const [site, quiz] = await Promise.all([
    JSON.parse(await read('src/data/site.json')),
    read('src/scripts/quiz.js'),
  ]);
  assert.deepEqual(Object.values(site.quiz), [
    '60431b2afe1a980044eacd7b',
    '6a0dc0438b7a3c0019ec1a6d',
    '67b44fbe6a12ce00190ff367',
    '682f8ce24346f100198e7777',
    '6900ca92c48f8400198b05f4',
    '65ffb50868c62b0026e1503f',
    '64b5110b7b839400258d8c7e',
    '67d071e5d174cb00188cdd22',
  ]);
  assert.match(quiz, /script\.marquiz\.ru\/v2\.js/);
  assert.match(quiz, /data-quiz/);
  assert.match(quiz, /Marquiz\.showModal/);
});

test('renders source reviews from the local snapshot with one aggregate count', async () => {
  const reviews = JSON.parse(await read('src/data/reviews.json'));
  const [component, home, styles] = await Promise.all([
    read('src/components/Reviews.astro'),
    read('src/pages/index.astro'),
    read('src/styles/page.css'),
  ]);

  // Данные обновлены 20.08.2026 из виджета MyReviews оригинала: те же правила
  // отбора, что стоят в его настройках — площадки Яндекс/2Gis/Google и оценки 4–5.
  assert.equal(reviews.counts.summary, 4466);
  assert.equal(reviews.ratings.summaryWeight, 4.97);
  assert.equal(reviews.reviews.length, 73);
  assert.deepEqual(reviews.servicesOrder, ['1', '3', '2']);
  assert.deepEqual(reviews.tags, ['квест', 'опыт', 'атмосфера', 'место', 'актеры', 'персонал', 'дети']);
  assert.ok(reviews.reviews.every((review) => review.rating >= 4));
  assert.ok(reviews.reviews.every((review) => reviews.servicesOrder.includes(String(review.service))));
  assert.ok(reviews.reviews.every((review) => Array.isArray(review.tags)));
  assert.match(component, /AggregateRating/);
  assert.match(component, /itemprop="review"/);
  assert.match(component, /review-card__stars" aria-label=.*role="img"/);
  assert.match(component, /startsWith\('https:\/\/'\)/);
  assert.match(home, /<Reviews/);
  assert.doesNotMatch(home, /reviews_desktop\.webp/);
  assert.match(styles, /\.quiz-pop\[hidden\]\{display:none\}/);
});
