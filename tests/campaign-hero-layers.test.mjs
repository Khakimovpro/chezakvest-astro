import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async (slug) => JSON.parse(await read(`src/data/pages/${slug}.json`));

const sourceLayers = {
  'amongus-land': [
    '/assets/static.tildacdn.com/tild6566-3834-4033-b630-393963303866/dmitriy-leongff2ovic.png',
    '/assets/static.tildacdn.com/tild6463-6166-4865-b731-396333373962/snapedit_17474129053.png',
  ],
  'roblox-land': [
    '/assets/static.tildacdn.com/tild3166-6133-4265-b736-666331333162/caed1ab0-dd5c-4e39-a.png',
    '/assets/static.tildacdn.com/tild3062-3833-4637-a365-653838626563/ROBLOX.svg',
    '/assets/static.tildacdn.com/tild6633-3333-4139-a330-663635636135/1_.png',
  ],
  'minecraft-lend': [
    '/assets/static.tildacdn.com/tild3339-6462-4239-b662-353164363932/-.png',
  ],
  'igra-v-kalmara-lend': [
    '/assets/static.tildacdn.com/tild6162-3633-4565-b664-393366366236/--_mini.png',
    '/assets/static.tildacdn.com/tild3165-3161-4339-a166-353666616432/____mini.png',
    '/assets/static.tildacdn.com/tild6364-6337-4137-b135-616333396265/_mini.png',
  ],
  'vypusknoj-kalmar': [
    '/assets/static.tildacdn.com/tild6162-3633-4565-b664-393366366236/--_mini.png',
    '/assets/static.tildacdn.com/tild3165-3161-4339-a166-353666616432/____mini.png',
    '/assets/static.tildacdn.com/tild6364-6337-4137-b135-616333396265/_mini.png',
  ],
  'new-year': [],
};

test('keeps the captured Tilda campaign art as local, responsive layered hero data', async () => {
  const documents = await Promise.all(Object.keys(sourceLayers).map(page));

  for (const document of documents) {
    const hero = document.sections.find((section) => section.kind === 'hero');
    assert.equal(hero.composition, 'tilda-artboard', `${document.slug} uses the source artboard renderer`);
    assert.ok(hero.artboard, `${document.slug} records source artboard geometry`);
    assert.ok(hero.artboard.mobile, `${document.slug} records mobile artboard geometry`);
    assert.ok(Array.isArray(hero.layers), `${document.slug} has an explicit layer list`);

    const actual = hero.layers.map((layer) => layer.src);
    assert.deepEqual(actual.slice(0, sourceLayers[document.slug].length), sourceLayers[document.slug]);
    for (const layer of hero.layers) {
      assert.ok(layer.desktop?.width, `${document.slug} layer has desktop dimensions`);
      assert.ok(layer.mobile?.left !== undefined, `${document.slug} layer has a mobile position`);
      await access(resolve(process.cwd(), 'public', layer.src.slice(1)));
    }
  }
});

test('renders campaign layers above their local artboard image without an invented global overlay', async () => {
  const [layout, styles] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/styles/holiday.css'),
  ]);

  assert.match(layout, /const campaignLayers =/u);
  assert.match(layout, /campaign-hero__layers/u);
  assert.match(layout, /campaign-hero__layer/u);
  assert.match(styles, /\.qhero--campaign-layered \.qhero__panel::after\{display:none\}/u);
  assert.match(styles, /--campaign-layer-top-mobile/u);
  assert.match(styles, /\.campaign-hero__layer--cover\{object-fit:cover\}/u);
});
