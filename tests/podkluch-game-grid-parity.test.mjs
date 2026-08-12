import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async () => JSON.parse(await read('src/data/pages/prazdniki-pod-kluch.json'));

const capturedGroups = [
  {
    id: 'quest-show',
    record: 'rec707324259',
    desktopHeight: 850,
    mobileHeight: 1944,
    titles: [
      'Майнкрафт',
      'Уэнздей. Украденная вещь',
      'Амонг Ас',
      'Гарри Поттер и Кубок огня',
      'Бегущий в лабиринте',
      'Игра в Кальмара',
    ],
  },
  {
    id: 'hide',
    record: 'rec707324258',
    desktopHeight: 490,
    mobileHeight: 1034,
    titles: ['Прятки KIDS', 'Прятки. Портал в другое измерение', 'Прятки в темноте'],
  },
  {
    id: 'quest',
    record: 'rec677181803',
    desktopHeight: 1640,
    mobileHeight: 3960,
    titles: [
      'Гарри и последний крестраж',
      'Ночь в музее. Ограбление',
      'Дом призраков',
      'Ограбление банка. Бумажный дом',
      'Уэнздей. Новая битва',
      'Психбольница',
      'Шерлок Холмс',
      'Коралина в Стране Кошмаров',
      'Замок Графа Дракулы',
      'Дикий Запад. Ролевой квест.',
      'Фантом. Квест во сне.',
      'Гарри Поттер и чулан для мётел. Квест для двоих.',
    ],
  },
  {
    id: 'horror',
    record: 'rec748971024',
    desktopHeight: 490,
    mobileHeight: 1084,
    titles: ['Оно', 'Техасская резня бензопилой', 'Звонок'],
  },
];

test('models all 24 captured Pod Kluch source cards with their responsive T396 artboards', async () => {
  const document = await page();
  const catalogue = document.sections.find((section) => section.kind === 'podkluch-games');

  assert.deepEqual(catalogue.sourceRecords, [
    'rec679968954', 'rec677181801', 'rec677181811', 'rec707324259', 'rec677181809',
    'rec707324258', 'rec677181802', 'rec677181803', 'rec748973726', 'rec748971024',
  ]);
  assert.deepEqual(catalogue.heading, { prefix: 'Выберите', accent: 'игры' });
  assert.deepEqual(catalogue.tabs.map((tab) => tab.id), ['all', 'quest-show', 'hide', 'quest', 'horror']);
  assert.equal(catalogue.groups.length, 4);

  for (const expected of capturedGroups) {
    const group = catalogue.groups.find((item) => item.id === expected.id);
    assert.equal(group.sourceRecord, expected.record);
    assert.equal(group.desktopHeight, expected.desktopHeight);
    assert.equal(group.mobileHeight, expected.mobileHeight);
    assert.deepEqual(group.items.map((item) => item.t), expected.titles);
    assert.ok(group.items.every((item) => item.desktop?.top >= 0 && item.mobile?.top >= 0));
  }

  const items = catalogue.groups.flatMap((group) => group.items);
  assert.equal(items.length, 24);
  assert.deepEqual(
    items.slice(0, 3).map((item) => item.href),
    ['/minecraft', '/wednesday_ukradennaya_vesch', '/among_us'],
  );
  assert.deepEqual(
    items.slice(-3).map((item) => item.href),
    ['/ono', '/tekhasskaya-reznya-benzopiloj', '/zvonok'],
  );
  assert.deepEqual(
    catalogue.groups.find((group) => group.id === 'quest').subheading,
    { t: 'Нестандартные квесты', desktop: { top: 1179, left: 349 }, mobile: { top: 2943, left: 14 } },
  );

  for (const item of items) {
    assert.match(item.img, /^\/assets\/static\.tildacdn\.com\//u);
    assert.match(item.ctaImg, /^\/assets\/static\.tildacdn\.com\//u);
    await access(resolve(process.cwd(), 'public', item.img.slice(1)));
    await access(resolve(process.cwd(), 'public', item.ctaImg.slice(1)));
  }
});

test('uses an isolated source game-grid renderer rather than canonicalized generic cards', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/PodKluchGameGrid.astro'),
  ]);

  assert.match(layout, /import PodKluchGameGrid from '\.\.\/components\/PodKluchGameGrid\.astro'/u);
  assert.match(layout, /sourcePodKluch && s\.kind === 'podkluch-games'/u);
  assert.match(layout, /<PodKluchGameGrid catalogue=\{s\} asset=\{asset\} href=\{link\}/u);
  assert.match(component, /src=\{asset\(item\.img\)\}/u);
  assert.match(component, /src=\{asset\(item\.ctaImg\)\}/u);
  assert.doesNotMatch(component, /imgSet|pagesBySlug|canonicalCardItems/u);
  assert.match(component, /width:1200px/u);
  assert.match(component, /width:360px/u);
  assert.match(component, /--podkluch-game-top-mobile/u);
  assert.match(component, /width:320px/u);
});

test('preserves the source filter controls on desktop and mobile without a global dispatcher', async () => {
  const component = await read('src/components/PodKluchGameGrid.astro');

  assert.match(component, /data-podkluch-games/u);
  assert.match(component, /data-podkluch-filter/u);
  assert.match(component, /aria-selected/u);
  assert.match(component, /<select[^>]*data-podkluch-select/u);
  assert.match(component, /data-podkluch-game-group/u);
  assert.match(component, /root\.querySelectorAll/u);
  assert.match(component, /group\.hidden = !visible/u);
});
