import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async () => JSON.parse(await read('src/data/pages/prazdniki-pod-kluch.json'));

const sourceAssets = [
  '/assets/static.tildacdn.com/tild6230-6463-4838-b865-386137323461/2_.jpg',
  '/assets/static.tildacdn.com/tild3738-3861-4636-b531-376631326334/_.jpg',
  '/assets/static.tildacdn.com/tild3266-3862-4736-a538-393232393631/photo.jpg',
  '/assets/static.tildacdn.com/tild3262-6430-4635-b532-306233653561/_2.jpg',
  '/assets/static.tildacdn.com/tild3261-3365-4262-b463-643735613366/-_.jpg',
  '/assets/static.tildacdn.com/tild3666-3363-4430-b737-616439363137/-_.jpg',
  '/assets/static.tildacdn.com/tild3764-6439-4433-a266-633336383865/-_.jpg',
  '/assets/static.tildacdn.com/tild6334-3031-4264-a364-633339656539/-__.jpg',
];

test('models Pod Kluch additional services as the captured T017 plus T774 records', async () => {
  const document = await page();
  const services = document.sections.find((section) => section.kind === 'podkluch-services');

  assert.deepEqual(services.sourceRecords, ['rec677119204', 'rec678630258']);
  assert.deepEqual(services.heading, {
    prefix: 'Выберите',
    accent: 'дополнительные услуги',
    subtitle: 'Мы заботимся о каждой детали вашего праздника!',
  });
  assert.deepEqual(services.catalogHeading, { prefix: 'Шоу-', accent: 'программы' });
  assert.equal(services.cta, 'Заказать');
  assert.equal(services.href, '#prazdnik');
  assert.deepEqual(services.items.map((item) => item.t), [
    'Нащупал',
    'Мафия',
    'Квиз Баттл',
    'Музыкалити',
    'Распределительная шляпа',
    'Попробуй объяснить',
    'Любимый герой',
    'Ютуб пати',
  ]);
  assert.deepEqual(services.items.map((item) => item.src), sourceAssets);

  for (const sourceAsset of sourceAssets) {
    await access(resolve(process.cwd(), 'public', sourceAsset.slice(1)));
  }
});

test('keeps the T017/T774 renderer route-scoped and preserves its measured responsive geometry', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/PodKluchServices.astro'),
  ]);

  assert.match(layout, /import PodKluchServices from '\.\.\/components\/PodKluchServices\.astro'/u);
  assert.match(layout, /s\.kind === 'podkluch-services'/u);
  assert.match(layout, /<PodKluchServices services=\{s\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /grid-template-columns:repeat\(4,260px\)/u);
  assert.match(component, /gap:40px/u);
  assert.match(component, /padding-bottom:96\.153846153846%/u);
  assert.match(component, /font:700 34px\/41\.8125px Montserrat/u);
  assert.match(component, /@media \(max-width:639px\)/u);
  assert.match(component, /grid-template-columns:1fr/u);
  assert.match(component, /width:350px/u);
  assert.match(component, /gap:20px/u);
});
