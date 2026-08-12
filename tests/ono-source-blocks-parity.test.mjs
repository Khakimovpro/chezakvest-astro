import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('scopes the measured T347 video and T121 scenario geometry to /ono/', async () => {
  const [ono, quest, cards, styles] = await Promise.all([
    json('src/data/pages/ono.json'),
    read('src/layouts/QuestPage.astro'),
    read('src/components/CardsRow.astro'),
    read('src/styles/ono-source-parity.css'),
  ]);

  assert.deepEqual(ono.sourceParity, { video: 't347', scenarios: 't121', hall: 't396' });
  assert.match(quest, /qvideo--source-t347/);
  assert.match(quest, /sourceGeometry=\{sourceParity\.scenarios\}/);
  assert.match(cards, /sourceGeometry = ''/);
  assert.match(cards, /cards--source-t121/);
  assert.match(cards, /\(max-width:900px\) 280px, 360px/);

  assert.match(styles, /\.qvideo--source-t347 \.qvideo__frame\{[^}]*max-width:560px[^}]*aspect-ratio:16\/9/);
  assert.match(styles, /\.qvideo--source-t347 \.qvideo__(?:poster|player),\.qvideo--source-t347 \.qvideo__(?:poster|player)\{[^}]*height:100%[^}]*object-fit:cover/);
  assert.match(styles, /\.cards--source-t121 \.cards__row\{gap:40px\}/);
  assert.match(styles, /\.cards--source-t121 \.card,\.cards--source-t121 \.card__img\{width:360px;height:360px/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.cards--source-t121 \.cards__row\{gap:10px\}[\s\S]*\.cards--source-t121 \.card,\.cards--source-t121 \.card__img\{width:280px;height:280px/);
});

test('leaves generic quest video and square-card geometry at their existing defaults', async () => {
  const [zvonok, questStyles, onoStyles] = await Promise.all([
    json('src/data/pages/zvonok.json'),
    read('src/styles/quest.css'),
    read('src/styles/ono-source-parity.css'),
  ]);

  assert.equal(zvonok.sourceParity, undefined);
  assert.match(questStyles, /\.cards--square \.card\{width:216px\}/);
  assert.match(questStyles, /\.qvideo__poster\{width:100%;height:auto;object-fit:cover\}/);
  assert.doesNotMatch(onoStyles, /(^|\n)\.cards--square \.card\{/);
  assert.doesNotMatch(onoStyles, /(^|\n)\.qvideo__frame\{/);
});
