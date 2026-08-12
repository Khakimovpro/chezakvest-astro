import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { cycleVypuskIndex } from '../src/scripts/vypusknoj-artboard-controls.js';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const sourceAssets = [
  '/assets/static.tildacdn.com/tild3130-3432-4231-a166-333333343932/__.jpg',
  '/assets/static.tildacdn.com/tild6162-3633-4565-b664-393366366236/--_mini.png',
  '/assets/static.tildacdn.com/tild3165-3161-4339-a166-353666616432/____mini.png',
  '/assets/static.tildacdn.com/tild6364-6337-4137-b135-616333396265/_mini.png',
  '/assets/static.tildacdn.com/tild3035-3661-4434-b462-333032353334/efea3ecc-785e-42ad-9.png',
  '/assets/static.tildacdn.com/tild6333-3064-4563-a439-326463353665/photo.svg',
  '/assets/static.tildacdn.com/tild6437-6165-4462-a163-383065653238/22.png',
  '/assets/static.tildacdn.com/tild3036-3065-4334-a462-373265623233/_.png',
  '/assets/static.tildacdn.com/tild3234-3765-4963-b735-646238303664/_mini.png',
  '/assets/static.tildacdn.com/tild3464-3462-4065-b462-353931643230/__.jpg',
  '/assets/static.tildacdn.com/tild3539-3436-4132-a533-303639653139/__.png',
  '/assets/static.tildacdn.com/tild6436-3264-4361-b838-343639346166/noroot.png',
  '/assets/static.tildacdn.com/tild3430-3930-4437-b335-623937323737/IMG_7151.jpg',
  '/assets/static.tildacdn.com/tild3334-3966-4964-b430-373265343261/159d9f2ed569252f19c5.jpeg',
  '/assets/static.tildacdn.com/tild3638-3337-4261-b839-663838356334/_DSC7951_1.jpg',
  '/assets/static.tildacdn.com/tild3462-6361-4331-a530-613138666131/_st_block.png',
  '/assets/static.tildacdn.com/tild3563-6236-4435-b539-336539323632/_st_block.png',
  '/assets/static.tildacdn.com/tild6366-3133-4136-b933-653137333462/_st_block.png',
  '/assets/static.tildacdn.com/tild6330-3737-4631-b733-373236626239/Portal_Strike.png',
  '/assets/static.tildacdn.com/tild3464-6665-4961-b665-363365666438/___st_block.png',
  '/assets/static.tildacdn.com/tild3834-6264-4434-b061-333862343963/noroot.png',
  '/assets/static.tildacdn.com/tild6236-3065-4339-a437-613732383332/noroot.png',
  '/assets/static.tildacdn.com/tild3635-3963-4039-b139-663737666633/-_.jpg',
  '/assets/static.tildacdn.com/tild3266-6530-4961-b639-656630353465/noroot.png',
  '/assets/static.tildacdn.com/tild3662-6664-4032-b135-663138643665/photo_2024-06-08_14-.jpg',
  '/assets/static.tildacdn.com/tild6162-3163-4464-b062-613637353633/photo_2024-06-08_14-.jpg',
  '/assets/static.tildacdn.com/tild3830-3366-4161-b636-373562633061/photo_2023-11-20_22-.jpg',
  '/assets/static.tildacdn.com/tild3337-3666-4237-b830-313666316639/IMAGE_2021-11-24_140.jpg',
  '/assets/static.tildacdn.com/tild6231-3732-4435-b437-303934356436/IMG_3527.jpeg',
  '/assets/static.tildacdn.com/tild3965-3930-4331-a639-613063303966/photo.svg',
  '/assets/static.tildacdn.com/tild6165-3863-4262-a337-346333663664/_.jpg',
  '/assets/static.tildacdn.com/tild3339-6462-4239-b662-353164363932/-.png',
  '/assets/static.tildacdn.com/tild3536-3232-4837-a430-643364383434/_.svg',
  '/assets/static.tildacdn.com/tild3761-6461-4363-b436-653661303937/_.svg',
  '/assets/static.tildacdn.com/tild6337-6561-4434-a631-626137386564/-_.png',
];

test('Vypusknoj Kalmar opts into the captured source artboard rather than generic holiday sections', async () => {
  const page = JSON.parse(await read('src/data/pages/vypusknoj-kalmar.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const r27Records = [
    ['spacer', 'rec888951739', 58, 58],
    ['hero', 'rec888951742', 856, 770],
    ['intro', 'rec888951751', 212, 282],
    ['features', 'rec888951757', 850, 1020],
    ['scenarioHeading', 'rec888951769', 160, 150],
    ['program', 'rec892172401', 847, 1691],
    ['dividerAfterProgram', 'rec888951778', 30, 30],
    ['scenarios', 'rec888951784', 624, 563],
    ['dividerAfterScenarios', 'rec888951790', 40, 40],
    ['additions', 'rec888951793', 635, 722],
    ['hallHeading', 'rec888951799', 260, 260],
    ['hall', 'rec888951802', 600, 785],
    ['trustHeading', 'rec888951820', 140, 220],
    ['trust', 'rec888951823', 770, 750],
    ['maskedReviewTop', 'rec925900196', 315, 210],
    ['maskedReviewMiddle', 'rec925900666', 255, 150],
    ['maskedReviewBottom', 'rec888951853', 73, 73],
    ['gift', 'rec888951859', 700, 490],
    ['venuesHeading', 'rec888951868', 210, 230],
    ['venues', 'rec888951871', 157, 567],
    ['footerSpacer', 'rec888951901', 84, 85],
    ['footer', 'rec888951904', 341, 856],
    ['footerBottom', 'rec888951907', 194, 360],
  ];
  const order = r27Records.map(([key]) => key);

  assert.equal(hero.composition, 'vypusknoj-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'vypusknoj-kalmar-artboard');
  assert.deepEqual(Object.keys(source.records), order);
  for (const [key, id, desktop, mobile] of r27Records) {
    assert.deepEqual(source.records[key], { id, desktop, mobile });
  }
  assert.equal(source.desktopFooterRecordTrim, 1);
  assert.equal(
    order.reduce((total, key) => total + source.records[key].desktop, 0) - source.desktopFooterRecordTrim,
    8410,
  );
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 10362);
  assert.deepEqual(source.program.cards.map((item) => item.title), [
    'ШОУ ЛЮБИМЫЙ ГЕРОЙ',
    'ШОУ КВИЗ ИГРА В КАЛЬМАРА',
    'ШОУ КАЖЕТСЯ НАЩУПАЛ',
    'ШОУ МАФИЯ. ИГРА НА ВЫЖИВАНИЕ',
  ]);
  assert.deepEqual(source.scenarios.items.map((item) => item.title), [
    'БЕГУЩИЙ В ЛАБИРИНТЕ', 'МАЙНКРАФТ', 'ГАРРИ ПОТТЕР', 'АМОНГ АС', 'PORTAL STRIKE',
  ]);
  assert.deepEqual(source.additions.items.map((item) => item.title), [
    'Профессиональные актеры', 'Вынос торта ведущим', 'Тематические торты', 'Фотограф на мероприятие',
  ]);
  assert.equal(source.bookingHref, '#prazdnik');
  assert.deepEqual(source.hall.equipment, [
    'музыкальной колонкой',
    'холодильником и микроволновой печью',
    'кулером с горячей и холодной водой',
    'необходимой мебелью: столы, стулья, диванчики',
    'безлимитный чай/кофе для вас',
  ]);
  assert.deepEqual(source.footer.venues.map((item) => item.title), [
    'ПЕР. ГВАРДЕЙСКИЙ, 61',
    'УЛ. СОЦИАЛИСТИЧЕСКАЯ, 186',
    'УЛ. КРАСНОАРМЕЙСКАЯ, 103',
    'ПР-Т СОКОЛОВА, 23',
    'УЛ, НАНСЕНА, 107/1',
    'ПР-Т МИРА, 27',
    'УЛ. МАГНИТОГОРСКАЯ, 1',
    'УЛИЦА 40-ЛЕТИЯ ПОБЕДЫ, 216',
    'УЛ. НАГИБИНА, 14А',
  ]);
  assert.equal(source.footer.hours, 'Работаем с 10:00 до 23:30');
  assert.equal(source.footer.email, 'marketing.chezaquest@yandex.ru');
});

test('Vypusknoj Kalmar mirrors every source-only bitmap locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the HolidayPage route-only branch renders the source composition and keeps the local booking form hidden until requested', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/VypusknojKalmarArtboard.astro'),
  ]);

  assert.match(layout, /sourceVypusknoj\s*=\s*hero\.composition\s*===\s*'vypusknoj-artboard'/u);
  assert.match(layout, /<VypusknojKalmarArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /<PartyForm id="vypusknoj" sectionId="prazdnik"/u);
  assert.match(component, /vypusknoj-artboard__program/u);
  assert.match(component, /vypusknoj-artboard__masked-review-rail/u);
  assert.match(component, /vypusknoj-artboard__booking\s+\.pform:target/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});

test('the Vypusk source sliders and hall pager retain every local item behind route-only controls', async () => {
  const [component, controls, layout] = await Promise.all([
    read('src/components/VypusknojKalmarArtboard.astro'),
    read('src/scripts/vypusknoj-artboard-controls.js'),
    read('src/layouts/HolidayPage.astro'),
  ]);

  assert.equal(cycleVypuskIndex(4, 5), 0);
  assert.equal(cycleVypuskIndex(0, 5, -1), 4);
  assert.match(component, /data-vypusk-slider-mode="cards"/u);
  assert.match(component, /data-vypusk-slider-mode="gallery"/u);
  assert.match(component, /data-vypusk-slider-prev/u);
  assert.match(component, /data-vypusk-slider-next/u);
  assert.match(component, /data-vypusk-slider-dot/u);
  assert.match(component, /data-vypusk-autoplay="3000"/u);
  assert.match(component, /data-vypusk-slider-count/u);
  assert.match(controls, /createAutoplay/u);
  assert.match(controls, /delay:\s*autoplayDelay/u);
  assert.match(controls, /prefersReducedMotion/u);
  assert.match(layout, /const faq = sourceVypusknoj \? null : sections\.find\(\(s\) => s\.kind === 'faq'\);/u);
});

test('the R27 Vypusk renderer keeps individual masked/footer record boundaries and source hall/footer copy', async () => {
  const component = await read('src/components/VypusknojKalmarArtboard.astro');
  const recordKeys = [
    'spacer', 'hero', 'intro', 'features', 'scenarioHeading', 'program',
    'dividerAfterProgram', 'scenarios', 'dividerAfterScenarios', 'additions',
    'hallHeading', 'hall', 'trustHeading', 'trust', 'maskedReviewTop',
    'maskedReviewMiddle', 'maskedReviewBottom', 'gift', 'venuesHeading',
    'venues', 'footerSpacer', 'footer', 'footerBottom',
  ];

  for (const key of recordKeys) {
    assert.match(component, new RegExp(`data-parity-record=\\{records\\.${key}\\?\\.id\\}`, 'u'));
  }
  assert.match(component, /hall\.equipmentTitle/u);
  assert.match(component, /\(hall\.equipment \|\| \[\]\)\.map/u);
  assert.match(component, /footer\.venues/u);
  assert.match(component, /footer\.hours/u);
  assert.match(component, /footer\.email/u);
  assert.match(component, /footer\.logo/u);
  assert.match(component, /--vypusknoj-desktop-footer-trim:\$\{desktopFooterRecordTrim\}px/u);
  assert.match(component, /vypusknoj-artboard__footer-bottom\{[^}]*margin-bottom:var\(--vypusknoj-desktop-footer-trim,0px\)/u);
  assert.doesNotMatch(component, /maskedReviewRail/u);
});
