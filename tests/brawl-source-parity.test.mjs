import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('models the audited Brawl source records without changing generic quests', async () => {
  const [brawl, zvonok] = await Promise.all([
    json('src/data/pages/brawl_stars.json'),
    json('src/data/pages/zvonok.json'),
  ]);

  assert.deepEqual(brawl.sourceParity, {
    kind: 'brawl-source',
    features: 't265',
    information: 't1033',
    related: 't774',
  });
  assert.equal(brawl.showPartyForm, false);
  assert.deepEqual(
    brawl.features.items.map(({ t }) => t),
    [
      'Уровень сложности рассчитан на детей и подростков',
      'Актер входит в стоимость',
      'Есть комната отдыха, рассчитана на 20 человек',
    ],
  );
  assert.deepEqual(brawl.extra[0].items, [
    { label: 'WI-FI', value: 'Есть' },
    { label: 'ПАРКОВКА', value: 'Нет' },
    { label: 'ЗАЛ ОЖИДАНИЯ', value: 'Есть гостевая зона, есть зона для проведения праздника' },
    { label: 'АДРЕС', value: 'Магнитогорская, 1' },
  ]);
  assert.equal(
    brawl.booking.lines.at(-1),
    'Выберите и забронируйте свободное время, кликнув по нему',
  );
  assert.equal(brawl.related.items.length, 13);
  assert.deepEqual(
    brawl.related.items.map(({ href }) => href),
    [
      '/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom',
      '/kvest_v_realnosti_psihbolnitsa',
      '/zvonok',
      '/kvest_v_realnosti_sherlock_holms',
      '/kvest_v_realnosti_koralina',
      '/kvest_v_realnosti_wednesday',
      '/kvest_v_realnosti_harry_potter_i_krestrazh',
      '/kvest_v_realnosti_noch_v_museum_ograblenie',
      '/ono',
      '/kvest_v_realnosti_dom_prizrakov',
      '/shizofreniya',
      '/hostel-podval-pytok',
      '/patologiya',
    ],
  );
  assert.ok(brawl.related.items.every((item) => item.duration && item.players && item.age && item.address));
  assert.deepEqual(
    brawl.related.items.map((item) => item.sourceOrder.desktop),
    [1, 2, 3, 4, 5, 9, 6, 7, 10, 8, 11, 12, 13],
  );
  assert.deepEqual(
    brawl.related.items.map((item) => item.sourceOrder.mobile),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  );
  assert.equal(zvonok.sourceParity, undefined);
});

test('uses source-only ordering, information and a non-rail T774 grid for Brawl', async () => {
  const [quest, cards, styles] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    read('src/components/CardsRow.astro'),
    read('src/styles/brawl-source-parity.css'),
  ]);

  assert.match(quest, /const isBrawlSource = sourceParity\.kind === 'brawl-source';/);
  assert.match(quest, /quest-page--brawl-source/);
  assert.match(quest, /qfeat--source-t265/);
  assert.match(quest, /qextra--source-t1033/);
  assert.match(quest, /sourceGeometry=\{sourceParity\.related\}/);
  assert.match(quest, /isBrawlSource && <CallbackForm id="q" sectionId="callback" \/>/);
  assert.match(quest, /!isBrawlSource && page\.showPartyForm !== false && <PartyForm \/>/);

  assert.match(cards, /const isSourceT774 = variant === 'poster' && sourceGeometry === 't774';/);
  assert.match(cards, /cards--source-t774/);
  assert.match(cards, /!isSourceT774 && title/);
  assert.match(cards, /!isSourceT774 && \(\s*<button class="cards__arrow/);
  assert.match(cards, /card__t774-overlay/);
  assert.match(cards, /--source-desktop-order/);

  assert.match(styles, /\.quest-page--brawl-source \.cards--source-t774 \.cards__row\{display:grid;grid-template-columns:repeat\(5,220px\);column-gap:25px;row-gap:32px/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--brawl-source \.cards--source-t774 \.cards__row\{grid-template-columns:repeat\(2,151px\);column-gap:20px;row-gap:21px/);
  assert.doesNotMatch(styles, /(^|\n)\.cards--poster \.card\{/);
});
