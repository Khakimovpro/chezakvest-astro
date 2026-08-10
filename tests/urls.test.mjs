import assert from 'node:assert/strict';
import test from 'node:test';

import { absoluteAssetUrl, canonicalUrl, siteHref } from '../src/lib/urls.js';

const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';

test('uses one trailing-slash canonical form for root, routes, and anchors', () => {
  assert.equal(canonicalUrl('/'), `${ORIGIN}/`);
  assert.equal(canonicalUrl('/zvonok'), `${ORIGIN}/zvonok/`);
  assert.equal(canonicalUrl('/zvonok/'), `${ORIGIN}/zvonok/`);
  assert.equal(canonicalUrl('/#catalog'), `${ORIGIN}/#catalog`);
});

test('creates base-aware trailing-slash internal links without altering external protocols', () => {
  assert.equal(siteHref('', '/zvonok'), '/zvonok/');
  assert.equal(siteHref('/chezakvest-preview', '/zvonok'), '/chezakvest-preview/zvonok/');
  assert.equal(siteHref('/chezakvest-preview', '#catalog'), '/chezakvest-preview/#catalog');
  assert.equal(siteHref('', 'https://wa.me/79282163623'), 'https://wa.me/79282163623');
  assert.equal(siteHref('', 'tel:+79282163623'), 'tel:+79282163623');
});

test('normalizes retired campaign links to canonical internal quest pages', () => {
  assert.equal(siteHref('', '/igra-v-kalmara-lend'), '/igra_v_kalmara/');
  assert.equal(siteHref('/chezakvest-preview', '/minecraft-lend#story'), '/chezakvest-preview/minecraft/#story');
  assert.equal(siteHref('', 'https://xn----7sbikn1bgfafua.xn--80aehcht5ci1b.xn--p1ai/'), '/garri-potter-i-kubok-ognya/');
  assert.equal(siteHref('', 'https://example.test/path'), 'https://example.test/path');
});

test('keeps asset filenames intact when generating absolute structured-data URLs', () => {
  assert.equal(absoluteAssetUrl('/assets/q/7e6b2dde60.webp'), `${ORIGIN}/assets/q/7e6b2dde60.webp`);
  assert.equal(absoluteAssetUrl('assets/logo.svg'), `${ORIGIN}/assets/logo.svg`);
  assert.equal(absoluteAssetUrl('https://cdn.example.test/image.webp'), 'https://cdn.example.test/image.webp');
});
