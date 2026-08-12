import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('uses the live first-slide composition for repeated quest and venue photo sets', async () => {
  const [quest, venue, styles] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    read('src/layouts/VenuePage.astro'),
    read('src/styles/quest.css'),
  ]);

  assert.match(quest, /qvenue__photos--rail/);
  assert.match(quest, /qextra__photos--rail/);
  assert.match(venue, /vhow__photos--rail/);
  assert.match(venue, /qvenue__photos--rail/);
  assert.match(styles, /\.qvenue__photos--rail/);
  assert.match(styles, /\.qextra__photos--rail/);
  assert.match(styles, /\.vhow__photos--rail/);
});

test('keeps venue-only forms in step with the live address pages', async () => {
  const [venue, mira, nansena] = await Promise.all([
    read('src/layouts/VenuePage.astro'),
    json('src/data/pages/mira27.json'),
    json('src/data/pages/nansena107.json'),
  ]);

  assert.match(venue, /page\.showPartyForm !== false/);
  assert.doesNotMatch(venue, /<CallbackForm/);
  assert.equal(mira.showPartyForm, false);
  assert.equal(nansena.showPartyForm, false);
});

test('matches the measured 530px mobile quest hero section', async () => {
  const styles = await read('src/styles/quest.css');
  assert.match(styles, /\.qhero__panel\{aspect-ratio:auto;min-height:516px\}/);
});

test('uses the measured Tilda header, hero, and breadcrumb cadence on every generic quest page', async () => {
  const [quest, styles] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    read('src/styles/quest.css'),
  ]);

  assert.match(quest, /quest-page/);
  assert.match(styles, /body\.quest-page \.hdr__inner\{height:80px/);
  assert.match(styles, /body\.quest-page \.crumbs\{padding-bottom:90px/);
  assert.match(styles, /@media \(min-width:901px\)\{body\.quest-page \.qhero\{padding-top:0/);
});

test('keeps the shared quest callback in the live order before venue chips', async () => {
  const quest = await read('src/layouts/QuestPage.astro');
  const callbackAt = quest.lastIndexOf('<CallbackForm');
  const venuesAt = quest.lastIndexOf('<VenuesSection id={`venues-${page.slug}`} base={base} />');

  assert.ok(callbackAt >= 0, 'the source callback remains available for audited quests');
  assert.ok(venuesAt >= 0, 'the shared venue chips remain available for audited quests');
  assert.ok(callbackAt < venuesAt, 'Tilda places the callback record before the venue section');
  assert.match(
    quest,
    /<CallbackForm id=\{page\.showPartyForm === false \? 'prazdnik' : 'q'\} sectionId=\{page\.showPartyForm === false \? 'prazdnik' : 'callback'\} \/>/,
  );
});

test('uses the source dark art direction for every audited horror page', async () => {
  const [quest, hostel, pathology, schizophrenia] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    json('src/data/pages/hostel-podval-pytok.json'),
    json('src/data/pages/patologiya.json'),
    json('src/data/pages/shizofreniya.json'),
  ]);

  assert.match(quest, /page\.showPartyForm !== false/);
  assert.equal(hostel.theme, 'dark');
  assert.equal(pathology.theme, 'dark');
  assert.equal(schizophrenia.theme, 'dark');
  assert.equal(hostel.showPartyForm, false);
  assert.equal(pathology.showPartyForm, false);
  assert.equal(schizophrenia.showPartyForm, false);
});

test('matches the source callback-record heights on desktop and mobile', async () => {
  const [quest, styles] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    read('src/styles/quest.css'),
  ]);

  assert.match(quest, /bodyClass=\{questBodyClass\}/);
  assert.match(styles, /\.quest-page \.cbform\{min-height:480px/);
  assert.match(styles, /@media \(max-width:640px\)\{\.quest-page \.cbform\{min-height:630px/);
  assert.match(styles, /body\.theme-dark \.cbform\{/);
});

test('keeps party-form field labels visibly associated while preserving the source placeholder copy', async () => {
  const [form, styles] = await Promise.all([
    read('src/components/PartyForm.astro'),
    read('src/styles/quest.css'),
  ]);

  assert.match(form, /pform__label--date/);
  assert.match(form, /pform__label--inside[^>]*>Ваше имя<\/label>/);
  assert.match(form, /pform__label--phone[^>]*>\+7 \(000\) 000-00-00<\/label>/);
  assert.match(form, /aria-label="Телефон"/);
  assert.doesNotMatch(styles, /\.pform__label\{[^}]*clip:/);
  assert.match(styles, /\.pform__label--inside\{[^}]*pointer-events:none/);
});

test('keeps the complete three-record source inventory for the 40-let venue grid', async () => {
  const [venue, styles, forty] = await Promise.all([
    read('src/layouts/VenuePage.astro'),
    read('src/styles/quest.css'),
    json('src/data/pages/40letpobedy216.json'),
  ]);

  assert.match(venue, /import \{ groupVenueGameItems \} from '\.\.\/lib\/venue-games\.js';/);
  assert.match(venue, /const gameGroups = groupVenueGameItems\(page\.games\?\.items, page\.games\?\.groups\);/);
  assert.match(venue, /items=\{canonicalGameItems\(group\.items\)\}/);
  assert.deepEqual(forty.games.groups.map((group) => group.size), [6, 7, 3]);
  assert.equal(forty.games.items.length, 16);
  assert.deepEqual(
    forty.games.items.slice(6).map((item) => item.t),
    [
      'Роблокс. Дорс',
      'Бегущий в лабиринте',
      'Игра в Кальмара',
      'Гарри Поттер и Кубок Огня',
      'Амонг Ас',
      'Уэнсдей. Потерянная душа',
      'Майнкрафт',
      'Portal strike kids',
      'party games',
      'Portal strike',
    ],
  );
  assert.ok(forty.games.items.every((item) => item.img.startsWith('/assets/')));
  assert.equal(forty.howto.photos[0], '/assets/q/7f30fa4ea5.webp');
  assert.match(styles, /\.venue-page \.cards__row\{display:grid;grid-template-columns:repeat\(3,360px\)/);
  assert.match(styles, /\.venue-page \.cards--poster \.card__img\{width:360px;height:360px\}/);
  assert.match(styles, /grid-template-columns:320px;justify-content:center/);
});
