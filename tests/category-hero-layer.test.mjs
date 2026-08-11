import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('renders the documented local foreground layer for the horror category hero', async () => {
  const category = JSON.parse(await read('src/data/pages/strashnye-kvesty.json'));

  assert.deepEqual(category.hero.foreground, {
    src: '/assets/static.tildacdn.com/tild3337-3537-4933-a532-356335333533/photo.webp',
    width: 731,
    height: 1034,
  });

  const [layout, css] = await Promise.all([
    read('src/layouts/CategoryPage.astro'),
    read('src/styles/category.css'),
  ]);
  assert.match(layout, /hero\.foreground\?\.src/);
  assert.match(layout, /class="qhero__foreground"/);
  assert.match(css, /\.category-theme--dark\s+\.qhero__foreground/);
  assert.match(css, /top:18px;left:700px;width:380px;height:532px/);
  assert.match(css, /top:138px;left:106px;width:234px;height:332px/);

  await access(new URL('public/assets/static.tildacdn.com/tild3337-3537-4933-a532-356335333533/photo.webp', root));
});
