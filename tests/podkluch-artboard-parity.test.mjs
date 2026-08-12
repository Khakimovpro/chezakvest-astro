import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async () => JSON.parse(await read('src/data/pages/prazdniki-pod-kluch.json'));

const sourceAssets = [
  '/assets/static.tildacdn.com/tild6436-3538-4636-a461-653734623439/24fe0f2f-ffa8-42ae-8.png',
  '/assets/static.tildacdn.com/tild6265-6632-4839-b363-653738663762/ea43ee19-50d6-4025-9.png',
  '/assets/static.tildacdn.com/tild6137-6463-4137-b634-633131623832/833024e9-f82c-42e9-a.png',
  '/assets/static.tildacdn.com/tild3037-3062-4361-a566-333631623231/447119e8-32a9-4300-b.png',
  '/assets/static.tildacdn.com/tild3338-6439-4466-b038-303931333530/9f14ec0d-9aa4-437f-9.png',
  '/assets/static.tildacdn.com/tild6362-6131-4236-b636-623238633530/f43d2e7f-e453-4fd0-8.png',
  '/assets/static.tildacdn.com/tild6534-3438-4338-a632-383730633365/e64f36b3-0c6e-4eb1-a.png',
  '/assets/static.tildacdn.com/tild6431-6463-4730-b234-633931636663/6478939a-9f3f-4d00-9.png',
  '/assets/static.tildacdn.com/tild6464-6161-4364-a339-336563343263/__-2.png',
  '/assets/static.tildacdn.com/tild6639-3434-4262-a365-376339336161/__-2.png',
  '/assets/static.tildacdn.com/tild6338-3765-4164-b038-336430313236/__-2.png',
];

test('models the captured pod-kluch hero, video rail, and package order as an opt-in artboard', async () => {
  const document = await page();
  const hero = document.sections.find((section) => section.kind === 'hero');
  const programs = document.sections.find((section) => section.kind === 'podkluch-programs');

  assert.equal(hero.composition, 'podkluch-artboard');
  assert.equal(hero.heightDesktop, 910);
  assert.equal(hero.heightMobile, 1100);
  assert.equal(hero.city, 'В Ростове-на-Дону');
  assert.equal(hero.videoLabel, 'Видео');
  assert.deepEqual(
    hero.layers.filter((layer) => layer.type === 'video').map((layer) => ({
      key: layer.key,
      desktop: layer.desktop,
      mobile: layer.mobile,
    })),
    [
      {
        key: 'standard-video',
        desktop: { top: 621, left: 22, width: 183, height: 265 },
        mobile: { top: 893, left: -10, width: 110, height: 182 },
      },
      {
        key: 'super-video',
        desktop: { top: 621, left: 217, width: 183, height: 265 },
        mobile: { top: 893, left: 104, width: 110, height: 182 },
      },
      {
        key: 'maxi-video',
        desktop: { top: 621, left: 412, width: 183, height: 265 },
        mobile: { top: 893, left: 219, width: 110, height: 182 },
      },
    ],
  );
  assert.deepEqual(
    programs.items.map((item) => item.name),
    ['Стандарт', 'Супер', 'Макси'],
    'the source package cards are not replaced with generic package columns',
  );
  assert.equal(programs.cta, 'Узнать свободную дату');

  const referenced = [...hero.layers.map((layer) => layer.src), ...programs.items.map((item) => item.src)];
  assert.deepEqual(referenced, sourceAssets);
  for (const sourceAsset of sourceAssets) {
    await access(resolve(process.cwd(), 'public', sourceAsset.slice(1)));
  }
});

test('keeps the special source artboard isolated from shared holiday routes', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/PodKluchArtboard.astro'),
  ]);

  assert.match(layout, /sourcePodKluch = hero\.composition === 'podkluch-artboard'/u);
  assert.match(layout, /<PodKluchArtboard hero=\{hero\} programs=\{podKluchPrograms\}/u);
  assert.match(layout, /s\.kind !== 'podkluch-programs'/u);
  assert.match(component, /--podkluch-layer-top-mobile/u);
  assert.match(component, /grid-template-columns:348px/u);
  assert.match(component, /grid-template-columns:repeat\(3,31\.016%\)/u);
  assert.match(component, /podkluch-hero__video/u);
  assert.match(component, /font-family: 'Montserratblack'/u);
  assert.match(component, /font-family: 'Nunito'/u);
});
