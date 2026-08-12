import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

const vrRoutes = [
  'portal-strike',
  'party-games',
  'portal-zombie',
  'portal-strike-kids',
];

test('marks only the four audited VR detail routes with their shared source records', async () => {
  const pages = await Promise.all(vrRoutes.map((slug) => json(`src/data/pages/${slug}.json`)));
  const generic = await json('src/data/pages/zvonok.json');

  for (const [index, page] of pages.entries()) {
    assert.deepEqual(page.sourceParity, {
      kind: 'vr-source',
      features: 't1196',
      booking: 't396',
      related: 't121',
      venue: 't396',
      gallery: 't396',
      scenarios: 't121',
      callback: 't396',
      story: [
        { desktop: 366, mobile: 472 },
        { desktop: 327, mobile: 429 },
        { desktop: 402, mobile: 542 },
        { desktop: 440, mobile: 594 },
      ][index],
      featuresHeight: [
        { desktop: 341, mobile: 413 },
        { desktop: 341, mobile: 413 },
        { desktop: 342, mobile: 413 },
        { desktop: 341, mobile: 413 },
      ][index],
      scenariosHeight: [
        { desktop: 615, mobile: 630 },
        { desktop: 615, mobile: 668 },
        { desktop: 615, mobile: 668 },
        { desktop: 615, mobile: 668 },
      ][index],
      storyOffsetMobile: [0, 0, 0, -29][index],
      relatedGap: [41, 40, 40, 40][index],
      afterVenueGap: [0, 50, 50, 50][index],
    });
    assert.equal(
      page.booking.lines.at(-1),
      'Выберите и забронируйте свободное время, кликнув по нему',
    );
  }

  assert.equal(generic.sourceParity, undefined);
});

test('keeps the VR source branch explicit while generic booking source rules stay route-scoped', async () => {
  const quest = await read('src/layouts/QuestPage.astro');

  assert.match(quest, /const isVrSource = sourceParity\.kind === 'vr-source';/);
  assert.match(quest, /quest-page--vr-source/);
  assert.match(quest, /!isVrSource && page\.booking\?\.calendarId && <PrebookingForm/);
  assert.match(quest, /!isGenericQuestSource && !isVrSource && <div class="qbook__cta">/);
  assert.match(quest, /qfeat--vr-source/);
  assert.match(quest, /sourceGeometry=\{sourceParity\.related\}/);
  assert.match(quest, /sourceGeometry=\{sourceParity\.scenarios\}/);
  assert.match(quest, /--vr-features-desktop:/);
  assert.match(quest, /--vr-story-mobile-offset:/);
  assert.match(quest, /--vr-after-related:/);
  assert.match(quest, /--vr-after-venue:/);
});

test('contains the measured VR rail, booking, venue and callback geometry behind the route class', async () => {
  const styles = await read('src/styles/vr-source-parity.css');

  assert.match(styles, /\.quest-page--vr-source \.qfeat--vr-source\{position:relative;height:var\(--vr-features-desktop\)/);
  assert.match(styles, /\.quest-page--vr-source \.qfeat__card\{flex:0 0 360px/);
  assert.match(styles, /\.quest-page--vr-source \.qfeat__row\{gap:40px/);
  assert.match(styles, /\.quest-page--vr-source \.qbook\{height:300px/);
  assert.match(styles, /\.quest-page--vr-source #drugie \.cards__row\{gap:40px/);
  assert.match(styles, /\.quest-page--vr-source \.qvenue--vr-source \.qvenue__card\{[^}]*height:536px/);
  assert.match(styles, /\.quest-page--vr-source \.cbform\{[^}]*linear-gradient\(0\.102turn/);
  assert.match(styles, /\.quest-page--vr-source \.qextra--vr-source\{[^}]*margin-top:var\(--vr-after-venue\)/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--vr-source \.qbook\{height:260px/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--vr-source #drugie\{height:588px;margin-bottom:var\(--vr-after-related\)/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--vr-source \.qfeat--vr-source\{height:var\(--vr-features-mobile\)/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--vr-source \.qfeat__card\{flex-basis:280px/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--vr-source \.pform__card\{height:526px/);
  assert.doesNotMatch(styles, /(^|\n)\.qbook\{/);
  assert.doesNotMatch(styles, /(^|\n)\.qvenue__card\{/);
});
