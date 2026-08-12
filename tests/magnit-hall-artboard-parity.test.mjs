import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('renders Magnitogorskaya hall T396 as its own source artboard', async () => {
  const [venue, hall, magnit] = await Promise.all([
    read('src/layouts/VenuePage.astro'),
    read('src/components/MagnitVenueHall.astro'),
    json('src/data/pages/magnitogorskaya1.json'),
  ]);

  assert.equal(magnit.hall.layout, 'magnit-t396');
  assert.equal(magnit.hall.caption, '3 ЗАЛА ПО 30 КВ.М');
  assert.ok(!magnit.hall.lines.includes(magnit.hall.caption));
  assert.match(venue, /import MagnitVenueHall from '\.\.\/components\/MagnitVenueHall\.astro';/);
  assert.match(venue, /page\.hall\?\.layout === 'magnit-t396'/);
  assert.match(hall, /class="container magnit-hall__artboard"/);
  assert.match(hall, /class="magnit-hall__gallery"/);
  assert.match(hall, /<figcaption class="magnit-hall__caption">/);
  assert.match(hall, /class="magnit-hall__panel"/);
  assert.match(hall, /width="600"[\s\S]*height="400"/);
});

test('keeps the measured desktop and mobile hall coordinates local to Magnitogorskaya', async () => {
  const hall = await read('src/components/MagnitVenueHall.astro');

  assert.match(hall, /\.magnit-hall\{padding:50px 0 0;overflow:clip\}/);
  assert.match(hall, /\.magnit-hall__gallery\{[^}]*left:80px[^}]*width:600px[^}]*height:400px/s);
  assert.match(hall, /\.magnit-hall__panel\{[^}]*left:581px[^}]*width:540px[^}]*min-height:341px/s);
  assert.match(hall, /\.magnit-hall__caption\{[^}]*top:416px/s);
  assert.match(hall, /@media \(max-width:900px\)\{[\s\S]*?\.magnit-hall__gallery\{[^}]*top:415px[^}]*left:-24px[^}]*width:439px[^}]*height:275px/s);
  assert.match(hall, /@media \(max-width:900px\)\{[\s\S]*?\.magnit-hall__panel\{[^}]*top:149px[^}]*left:12px[^}]*right:12px[^}]*min-height:318px/s);
});

test('sends the Magnit hall CTA to the existing local booking form rather than a telephone fallback', async () => {
  const venue = await read('src/layouts/VenuePage.astro');

  assert.match(venue, /page\.showPartyForm !== false && <PartyForm \/>/);
  assert.match(
    venue,
    /<MagnitVenueHall hall=\{page\.hall\} address=\{address\} asset=\{asset\} ctaHref="#prazdnik" \/>/,
  );
});
