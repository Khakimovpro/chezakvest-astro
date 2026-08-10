import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/components/QuestCard.astro', import.meta.url), 'utf8');
const catalogSource = await readFile(new URL('../src/pages/kvesty-v-rostove-na-donu.astro', import.meta.url), 'utf8');

test('keeps quest and venue anchors as siblings in QuestCard', () => {
  const mainLink = source.indexOf('<a class="qcard__main"');
  const mainLinkEnd = source.indexOf('</a>', mainLink);
  const venueLink = source.indexOf('<a class="qcard__venue"');
  const venueLinkEnd = source.indexOf('</a>', venueLink);
  const cardEnd = source.indexOf('</article>', venueLink);

  assert.ok(mainLink >= 0, 'the quest destination is linked');
  assert.ok(venueLink > mainLinkEnd, 'the venue link starts after the quest link closes');
  assert.ok(venueLinkEnd < cardEnd, 'both links remain inside the card article');
});

test('uses responsive hero candidates for catalogue quest cards', () => {
  assert.match(source, /const photoSet = card\.photoSet \|\| card\.hero\?\.bgset/);
  assert.match(source, /srcset=\{photoSrcset \|\| undefined\}/);
  assert.match(catalogSource, /photoSet: page\.hero\?\.bgset \|\| null/);
});
