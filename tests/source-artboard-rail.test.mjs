import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { railIndexAfterKey } from '../src/scripts/source-artboard-rail.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the shared rail controller makes every slide reachable with keyboard commands', () => {
  assert.equal(railIndexAfterKey(0, 5, 'ArrowLeft'), 4);
  assert.equal(railIndexAfterKey(4, 5, 'ArrowRight'), 0);
  assert.equal(railIndexAfterKey(3, 5, 'Home'), 0);
  assert.equal(railIndexAfterKey(1, 5, 'End'), 4);
  assert.equal(railIndexAfterKey(2, 5, 'PageDown'), 3);
  assert.equal(railIndexAfterKey(2, 5, 'Escape'), 2);
});

test('the source-artboard rail exposes labelled arrow, dot and live controls', async () => {
  const controls = await read('src/components/SourceArtboardRailControls.astro');

  assert.match(controls, /data-source-artboard-rail-prev/u);
  assert.match(controls, /data-source-artboard-rail-next/u);
  assert.match(controls, /data-source-artboard-rail-dot/u);
  assert.match(controls, /role="tablist"/u);
  assert.match(controls, /aria-live="polite"/u);
  assert.match(controls, /aria-controls=/u);
});

test('all four source artboards mark clipped local card rails as keyboard- and touch-reachable', async () => {
  const components = await Promise.all([
    read('src/components/NewYearArtboard.astro'),
    read('src/components/MinecraftArtboard.astro'),
    read('src/components/AmongUsArtboard.astro'),
    read('src/components/RobloxArtboard.astro'),
  ]);

  const expectedRailIds = [
    ['newyear-scenarios', 'newyear-shows', 'newyear-additions', 'newyear-masters'],
    ['minecraft-additions', 'minecraft-gallery'],
    ['amongus-additions'],
    ['roblox-additions'],
  ];

  for (const [component, ids] of components.map((component, index) => [component, expectedRailIds[index]])) {
    assert.match(component, /SourceArtboardRailControls/u);
    assert.match(component, /data-source-artboard-rail-viewport/u);
    assert.match(component, /data-source-artboard-rail-slide/u);
    assert.match(component, /scroll-snap-type:x mandatory/u);
    assert.match(component, /overscroll-behavior-inline:contain/u);
    assert.match(component, /prefers-reduced-motion:reduce/u);
    for (const id of ids) assert.match(component, new RegExp(`data-source-artboard-rail-id="${id}"`, 'u'));
  }

  assert.doesNotMatch(components[0], /newyear-artboard__show-card:nth-child\(n\+5\)\{display:none\}/u);
});
