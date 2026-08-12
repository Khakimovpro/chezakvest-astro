import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');
const page = async () => JSON.parse(await read('src/data/pages/strashnye-kvesty.json'));

const assetPaths = (value, found = new Set()) => {
  if (typeof value === 'string' && value.startsWith('/assets/')) found.add(value);
  else if (Array.isArray(value)) value.forEach((item) => assetPaths(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => assetPaths(item, found));
  return found;
};

test('keeps the measured horror-category source record stack and every source game reachable', async () => {
  const category = await page();
  const source = category.sourceParity;

  assert.equal(source.kind, 'horror-category-artboard');
  assert.equal(category.hero.hideSharedHeader, true);
  assert.deepEqual(Object.keys(source.records), [
    'header', 'hero', 'breadcrumbs', 'gamesHeading', 'games', 'gallery', 'certificate',
    'certificateDivider', 'callback', 'venuesHeading', 'venues', 'footerSpacer', 'footer', 'footerContinuation',
  ]);
  assert.equal(
    Object.values(source.records).reduce((total, record) => total + record.desktop, 0),
    5416,
    'the desktop record stack matches the R27 source document height',
  );
  assert.equal(
    Object.values(source.records).reduce((total, record) => total + record.mobile, 0) + source.mobileRecordSeam,
    8892,
    'the one-pixel Tilda footer seam is retained in the mobile source total',
  );
  assert.equal(source.cardOrder.length, 13);
  assert.equal(new Set(source.cardOrder).size, 13);
  assert.deepEqual(
    source.cardOrder,
    [
      '/kvest_v_realnosti_psihbolnitsa', '/kvest_v_realnosti_wednesday', '/kvest_v_realnosti_koralina',
      '/tekhasskaya-reznya-benzopiloj', '/zvonok', '/beguschij_v_labirinte',
      '/kvest_v_realnosti_dom_prizrakov', '/ono', '/igra_v_kalmara',
      '/kvest_v_realnosti_zamok_drakuly', '/patologiya', '/hostel-podval-pytok', '/shizofreniya',
    ],
  );
  const gameHrefs = new Set(category.games.items.map((game) => game.href));
  for (const href of source.cardOrder) assert.ok(gameHrefs.has(href), `${href} remains a local, reachable game card`);

  const cardAssets = await Promise.all(source.cardOrder.map(async (href) => {
    const card = category.games.items.find((game) => game.href === href);
    if (card.img) return card.img;
    const linked = JSON.parse(await read(`src/data/pages/${href.replace(/^\//, '')}.json`));
    return linked.hero?.bg;
  }));
  assert.equal(cardAssets.length, 13);
  assert.ok(cardAssets.every((asset) => asset?.startsWith('/assets/')),
    'every source card resolves to a checked-in local image, including canonical fallbacks');
  await Promise.all(cardAssets.map((asset) => access(join(root, 'public', asset))));
});

test('uses an isolated horror artboard with local source assets and a three-card accessible rail', async () => {
  const [category, layout, component, styles] = await Promise.all([
    page(),
    read('src/layouts/CategoryPage.astro'),
    read('src/components/HorrorCategoryArtboard.astro'),
    read('src/styles/horror-category-artboard.css'),
  ]);

  assert.match(layout, /import HorrorCategoryArtboard from '\.\.\/components\/HorrorCategoryArtboard\.astro';/);
  assert.match(layout, /sourceHorror\s*=\s*page\.sourceParity\?\.kind\s*===\s*'horror-category-artboard'/);
  assert.match(layout, /\{sourceHorror \? \(\s*<HorrorCategoryArtboard/);
  assert.match(component, /data-source-artboard="horror-category"/);
  assert.match(component, /data-parity-record=\{records\.gallery\?\.id\}/);
  assert.match(component, /data-parity-record=\{records\.certificate\?\.id\}/);
  assert.match(component, /<CallbackForm id="horror-category" sectionId="callback" recordId=\{records\.callback\?\.id\}/);
  assert.match(component, /source\.cardOrder/);
  assert.match(component, /href=\{href\(card\.href\)\}/);
  assert.match(component, /<MessengerFab \/>/);
  assert.doesNotMatch(component, /https?:\/\/(?:static|thb|optim)\.tildacdn\.com/);
  assert.match(styles, /\.horror-category-artboard__gallery-rail\{[^}]*overflow-x:auto/);
  assert.match(styles, /scroll-snap-type:x mandatory/);
  assert.match(styles, /\.horror-category-artboard__footer-main\{height:calc\(var\(--horror-record-mobile\) \+ 1px\)/);
  assert.match(styles, /@media \(max-width:900px\)/);

  const paths = assetPaths(category);
  for (const sourceAsset of category.sourceParity.localAssets) paths.add(sourceAsset);
  assert.equal(paths.size >= 20, true, 'route data carries the complete local horror source asset set');
  await Promise.all([...paths].map((asset) => access(join(root, 'public', asset))));
});
