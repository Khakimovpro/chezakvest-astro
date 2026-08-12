import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const page = () => JSON.parse(read('src/data/pages/kvest_v_realnosti_zapad.json'));

test('Zapad keeps the R27 Tilda record sequence in route-owned source parity data', () => {
  const source = page().sourceParity;

  assert.deepEqual(source, {
    kind: 'zapad-source',
    records: {
      hero: 'rec223203317',
      breadcrumbs: 'rec1127416181',
      breadcrumbSpacer: 'rec1127416341',
      aliasBeforeStory: 'rec222654580',
      story: 'rec222017391',
      gallery: 'rec222017392',
      storySpacer: 'rec306093018',
      information: 'rec222017394',
      booking: 'rec222017396',
      callback: 'rec1144740346',
      aliasBeforeVenues: 'rec222205461',
      venuesHeading: 'rec1100733926',
      venues: 'rec1100733931',
      footerSpacer: 'rec1100733986',
    },
    hero: { desktop: 900, mobile: 760 },
    story: { desktop: 350, mobile: 480 },
    gallery: { desktop: 626, mobile: 325 },
    information: { desktop: 980, mobile: 900 },
    booking: { desktop: 290, mobile: 330 },
    callback: { desktop: 480, mobile: 630 },
  });
});

test('Zapad selects an isolated source renderer without weakening generic QuestPage rendering', () => {
  const quest = read('src/layouts/QuestPage.astro');
  const unrelated = JSON.parse(read('src/data/pages/zvonok.json'));

  assert.match(quest, /import ZapadSourceArtboard from '\.\.\/components\/ZapadSourceArtboard\.astro';/u);
  assert.match(quest, /const isZapadSource = sourceParity\.kind === 'zapad-source';/u);
  assert.match(quest, /\{isZapadSource \? <ZapadSourceArtboard page=\{page\} source=\{sourceParity\} asset=\{asset\} href=\{link\} \/> : \(/u);
  assert.match(quest, /\{!isZapadSource && <Header \/>\}/u);
  assert.equal(unrelated.sourceParity, undefined);
});

test('Zapad artboard renders the two source alias records and source-only information order', () => {
  const artboard = read('src/components/ZapadSourceArtboard.astro');

  for (const record of [
    'records.hero', 'records.breadcrumbs', 'records.breadcrumbSpacer',
    'records.aliasBeforeStory', 'records.story', 'records.gallery',
    'records.storySpacer', 'records.information', 'records.booking',
    'records.aliasBeforeVenues', 'records.venuesHeading',
    'records.venues', 'records.footerSpacer',
  ]) assert.match(artboard, new RegExp(`data-parity-record=\\{${record}\\}`, 'u'));

  assert.match(artboard, /<CallbackForm id="zapad" sectionId="callback" recordId=\{records\.callback\} \/>/u);
  assert.match(read('src/components/CallbackForm.astro'), /data-parity-record=\{recordId\}/u);
  assert.match(artboard, /class="zapad-artboard__price-card"/u);
  assert.match(artboard, /Онлайн <span>бронирование<\/span>/u);
  assert.doesNotMatch(artboard, /CardsRow/u);
  assert.doesNotMatch(artboard, /PartyForm/u);
});

test('Zapad keeps hero booking anchors on the current route', () => {
  const artboard = read('src/components/ZapadSourceArtboard.astro');

  assert.match(artboard, /const localHref = \(value\) => String\(value \|\| ''\)\.startsWith\('#'\) \? value : href\(value\);/u);
  assert.match(artboard, /href=\{localHref\(button\.href\)\}/u);
});

test('Zapad source CSS owns the captured desktop and mobile record geometry', () => {
  const css = read('src/styles/zapad-source-parity.css');

  assert.match(css, /--zapad-hero-height:900px/u);
  assert.match(css, /--zapad-story-height:350px/u);
  assert.match(css, /--zapad-gallery-height:626px/u);
  assert.match(css, /--zapad-information-height:980px/u);
  assert.match(css, /--zapad-booking-height:290px/u);
  assert.match(css, /--zapad-callback-height:480px/u);
  assert.match(css, /@media \(max-width:900px\)/u);
  assert.match(css, /--zapad-hero-height:760px/u);
  assert.match(css, /--zapad-story-height:480px/u);
  assert.match(css, /--zapad-gallery-height:325px/u);
  assert.match(css, /--zapad-information-height:900px/u);
  assert.match(css, /--zapad-booking-height:330px/u);
  assert.match(css, /--zapad-callback-height:630px/u);
});
