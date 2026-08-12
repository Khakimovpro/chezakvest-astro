import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { cycleGalleryIndex } from '../src/scripts/t396-gallery.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('loops through every local T396 gallery photo without an external slider', () => {
  assert.equal(cycleGalleryIndex(0, 6), 1);
  assert.equal(cycleGalleryIndex(5, 6), 0);
  assert.equal(cycleGalleryIndex(0, 1), 0);
  assert.equal(cycleGalleryIndex(0, 0), 0);
});

test('gives both isolated hall artboards local dot controls and 3-second autoplay', async () => {
  const [magnit, ono, galleryScript] = await Promise.all([
    read('src/components/MagnitVenueHall.astro'),
    read('src/components/OnoVenueHall.astro'),
    read('src/scripts/t396-gallery.js'),
  ]);

  for (const component of [magnit, ono]) {
    assert.match(component, /data-t396-gallery/);
    assert.match(component, /data-t396-gallery-track/);
    assert.match(component, /data-t396-gallery-slide/);
    assert.match(component, /data-t396-gallery-dot/);
    assert.match(component, /aria-selected/);
  }

  assert.match(galleryScript, /createAutoplay/);
  assert.match(galleryScript, /delay:\s*3000/);
  assert.match(galleryScript, /aria-hidden/);
  assert.match(galleryScript, /inert/);
});

test('keeps mobile hall gallery controls above the overlapping source CTA layer', async () => {
  const [magnit, ono] = await Promise.all([
    read('src/components/MagnitVenueHall.astro'),
    read('src/components/OnoVenueHall.astro'),
  ]);

  assert.match(magnit, /\.magnit-hall__dots\{position:absolute;z-index:4;/);
  assert.match(ono, /\.ono-hall__dots\{position:absolute;z-index:4;/);
});
