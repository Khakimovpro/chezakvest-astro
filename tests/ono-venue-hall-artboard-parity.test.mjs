import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('renders the Ono T396 celebration hall through a route-opt-in artboard', async () => {
  const [ono, quest, hall] = await Promise.all([
    json('src/data/pages/ono.json'),
    read('src/layouts/QuestPage.astro'),
    read('src/components/OnoVenueHall.astro'),
  ]);

  assert.equal(ono.sourceParity.hall, 't396');
  assert.equal(ono.venue.caption, '2 ЗАЛА ПО 30 КВ.М');
  assert.ok(!ono.venue.lines.includes(ono.venue.caption));
  assert.match(quest, /import OnoVenueHall from '\.\.\/components\/OnoVenueHall\.astro';/);
  assert.match(quest, /sourceParity\.hall === 't396'/);
  assert.match(quest, /<OnoVenueHall[\s\S]*halls=\{onoCelebrationHalls\}/);
  assert.match(hall, /class="ono-hall__gallery"/);
  assert.match(hall, /class="ono-hall__caption"/);
  assert.match(hall, /class="ono-hall__panel"/);
  assert.match(hall, /class="ono-hall__cta"/);
  assert.match(hall, /href=\{hall\.addressHref\}/);
  assert.match(hall, /href=\{ctaHref\}/);
  assert.match(hall, /width="600"[\s\S]*height="400"/);
});

test('keeps the captured 1440 and 390 T396 geometry local to Ono', async () => {
  const hall = await read('src/components/OnoVenueHall.astro');

  assert.match(hall, /\.ono-hall__heading\{height:165px;padding-top:46px\}/);
  assert.match(hall, /\.ono-hall__artboard\{[^}]*height:570px[^}]*padding:0/);
  assert.match(hall, /\.ono-hall__gallery\{[^}]*top:8px[^}]*left:80px[^}]*width:600px[^}]*height:400px/s);
  assert.match(hall, /\.ono-hall__panel\{[^}]*top:138px[^}]*left:581px[^}]*width:540px[^}]*height:341px/s);
  assert.match(hall, /\.ono-hall__caption\{[^}]*top:419px[^}]*left:80px[^}]*width:442px/s);
  assert.match(hall, /\.ono-hall__cta\{[^}]*top:451px[^}]*left:720px[^}]*width:300px[^}]*height:55px/s);
  assert.match(hall, /@media \(max-width:479px\)\{[\s\S]*?\.ono-hall__artboard\{[^}]*height:755px/s);
  assert.match(hall, /@media \(max-width:479px\)\{[\s\S]*?\.ono-hall__gallery\{[^}]*top:415\.672px[^}]*left:-24\.375px[^}]*width:439px[^}]*height:275px/s);
  assert.match(hall, /@media \(max-width:479px\)\{[\s\S]*?\.ono-hall__panel\{[^}]*top:148\.703px[^}]*left:12\.188px[^}]*width:365\.688px[^}]*height:353\.5px/s);
  assert.match(hall, /@media \(max-width:479px\)\{[\s\S]*?\.ono-hall__cta\{[^}]*top:663\.125px[^}]*left:36\.563px[^}]*width:316\.938px[^}]*height:56\.063px/s);
});

test('does not opt generic quest routes into the Ono hall artboard', async () => {
  const [zvonok, quest] = await Promise.all([
    json('src/data/pages/zvonok.json'),
    read('src/layouts/QuestPage.astro'),
  ]);

  assert.equal(zvonok.sourceParity, undefined);
  assert.match(quest, /sourceParity\.hall === 't396' \? \(/);
  assert.match(quest, /: celebrationVenues\.length > 0 && \(/);
});

test('keeps both source T396 halls behind accessible local prev/next controls', async () => {
  const [ono, quest, hall] = await Promise.all([
    json('src/data/pages/ono.json'),
    read('src/layouts/QuestPage.astro'),
    read('src/components/OnoVenueHall.astro'),
  ]);

  assert.equal(ono.celebrationVenues.length, 2);
  assert.equal(ono.celebrationVenues[1].venueSlug, 'magnitogorskaya1');
  assert.equal(ono.celebrationVenues[1].caption, '3 ЗАЛА ПО 30 КВ.М');
  assert.match(ono.celebrationVenues[1].lines[0], /до 15 гостей в каждом зале/);
  assert.match(quest, /halls=\{onoCelebrationHalls\}/);
  assert.match(hall, /class="ono-hall__slide"/);
  assert.match(hall, /data-ono-hall-slide/);
  assert.match(hall, /data-ono-hall-prev/);
  assert.match(hall, /data-ono-hall-next/);
  assert.match(hall, /aria-live="polite"/);
  assert.match(hall, /const setSlide = \(nextIndex\) =>/);
  assert.match(hall, /nextIndex = \(activeIndex \+ direction \+ slides\.length\) % slides\.length/);
  assert.match(hall, /data-ono-hall-pagination/);
});
