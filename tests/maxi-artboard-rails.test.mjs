import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { nextMaxiRailOffset } from '../src/scripts/maxi-artboard-rails.js';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Maxi rail paging reaches either end without overshooting local content', () => {
  assert.equal(nextMaxiRailOffset(0, 1, 170, 690), 170);
  assert.equal(nextMaxiRailOffset(680, 1, 170, 690), 690);
  assert.equal(nextMaxiRailOffset(170, -1, 170, 690), 0);
  assert.equal(nextMaxiRailOffset(0, -1, 170, 690), 0);
  assert.equal(nextMaxiRailOffset(20, 1, 0, 690), 20);
});

test('every clipped Maxi source collection has a keyboard and native-scroll rail', async () => {
  const [component, page] = await Promise.all([
    read('src/components/MaxiArtboard.astro'),
    read('src/data/pages/prazdnik-maxi.json'),
  ]);
  const source = JSON.parse(page).sourceParity;
  const rails = [
    ['features', source.features.length],
    ['timeline', source.timeline.items.length],
    ['shows', source.shows.length],
    ['package', source.package.items.length],
    ['video', source.video.items.length],
    ['gallery', source.gallery.items.length],
  ];

  for (const [name, count] of rails) {
    assert.ok(count > 1, `${name} must retain every source item`);
    assert.match(component, new RegExp(`data-maxi-rail="${name}"`, 'u'));
    assert.match(component, new RegExp(`id="maxi-${name}-viewport"`, 'u'));
    assert.match(component, new RegExp(`aria-controls="maxi-${name}-viewport"`, 'u'));
  }

  assert.match(component, /data-maxi-rail-prev/u);
  assert.match(component, /data-maxi-rail-next/u);
  assert.match(component, /data-maxi-rail-status/u);
  assert.match(component, /scroll-snap-type:x mandatory/u);
  assert.match(component, /import '\.\.\/scripts\/maxi-artboard-rails\.js';/u);
  assert.doesNotMatch(component, /data-maxi-rail="reviews"/u);
});
