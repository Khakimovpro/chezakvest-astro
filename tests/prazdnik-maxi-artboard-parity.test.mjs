import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const sourceAssets = [
  '/assets/static.tildacdn.com/tild6435-3231-4432-b964-613865313433/__02.jpg',
  '/assets/static.tildacdn.com/tild6161-6331-4336-a539-363837396139/PC_fon.webp',
  '/assets/static.tildacdn.com/tild6661-6530-4362-a163-613339313330/__.jpg',
  '/assets/static.tildacdn.com/tild6561-3234-4761-b931-343461393236/download_12.png',
  '/assets/static.tildacdn.com/tild3865-3132-4864-a630-326531636333/eee8132230613e0ca1d5.jpg',
  '/assets/static.tildacdn.com/tild6564-6637-4461-a231-343637303237/__.webp',
  '/assets/static.tildacdn.com/tild6435-3633-4234-b166-633430396161/photo.jpg',
  '/assets/static.tildacdn.com/tild6562-3936-4534-b139-333839336261/-2.jpg',
  '/assets/static.tildacdn.com/tild3566-3334-4234-b233-653839613766/photo.webp',
  '/assets/static.tildacdn.com/tild3738-3861-4636-b531-376631326334/_.jpg',
  '/assets/static.tildacdn.com/tild6165-3563-4637-a661-396264623634/_-2.jpg',
  '/assets/static.tildacdn.com/tild3061-6162-4135-b261-313632343865/photo.webp',
  '/assets/static.tildacdn.com/tild3162-3136-4139-a638-643138316132/photo.webp',
  '/assets/static.tildacdn.com/tild6266-3961-4662-b734-633134326139/-.webp',
  '/assets/static.tildacdn.com/tild3336-6130-4464-b336-336463313232/tempImageclLCMN_1.webp',
  '/assets/static.tildacdn.com/tild6531-3939-4262-a431-366437346236/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild3234-3134-4166-a434-386630616463/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild3239-6162-4163-a632-643330623031/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild6266-6465-4137-b734-363963626331/LAT_3531.jpg',
  '/assets/static.tildacdn.com/tild3839-3438-4135-a335-666434316132/photo_2024-10-30_14-.jpg',
  '/assets/static.tildacdn.com/tild6366-3266-4665-b961-636461643362/IMG_7336.JPG',
  '/assets/static.tildacdn.com/tild6666-3933-4432-b533-336236656639/IMG_8153.webp',
  '/assets/static.tildacdn.com/tild3230-3735-4137-b162-636636363635/photo_2024-10-30_14-.jpg',
  '/assets/static.tildacdn.com/tild3236-6634-4161-b739-303963653530/photo_2024-09-28_14-.jpg',
  '/assets/static.tildacdn.com/tild6538-6135-4530-b765-303665363933/photo_2024-10-30_14-.jpg',
  '/assets/static.tildacdn.com/tild3537-3136-4665-b339-363339353138/IMG_7336.JPG',
];

test('Prazdnik Maxi opts into the measured source artboard instead of generic holiday records', async () => {
  const page = JSON.parse(await read('src/data/pages/prazdnik-maxi.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const r27Records = [
    ['header', 'rec2262811501', 90, 90],
    ['breadcrumbs', 'rec2262811521', 39, 63],
    ['hero', 'rec2262811511', 570, 690],
    ['price', 'rec2284440491', 452, 533],
    ['intro', 'rec2272057071', 319, 478],
    ['features', 'rec2273109381', 155, 157],
    ['timeline', 'rec2272062161', 539, 628],
    ['programCta', 'rec2282758011', 154, 178],
    ['questsHeading', 'rec2282712661', 279, 292],
    ['quests', 'rec2293166871', 797, 2190],
    ['showsHeading', 'rec2290937391', 216, 313],
    ['shows', 'rec2281782561', 1024, 564],
    ['package', 'rec2272075111', 1313, 657],
    ['bookingCta', 'rec2284426961', 124, 124],
    ['hallHeading', 'rec2290991151', 216, 284],
    ['hallSpacer', 'rec2262811641', 60, 60],
    ['hall', 'rec2262811631', 560, 755],
    ['videoHeading', 'rec2291367111', 188, 226],
    ['video', 'rec2262811681', 540, 670],
    ['reviewsHeading', 'rec2291027701', 159, 168],
    ['galleryHeading', 'rec2291039451', 159, 168],
    ['gallery', 'rec2262811771', 440, 340],
    ['callback', 'rec2262811801', 480, 630],
    ['venuesHeading', 'rec2291390041', 188, 246],
    ['venues', 'rec2262811821', 206, 552],
    ['footerSpacer', 'rec2262811931', 60, 60],
    ['footer', 'rec2262811941', 311, 853],
    ['copyright', 'rec2262811951', 170, 246],
  ];
  const order = r27Records.map(([key]) => key);
  const sourceR27RecordOrder = [
    'header', 'breadcrumbs', 'hero', 'price', 'intro', 'features', 'timeline', 'programCta',
    'questsHeading', 'quests', 'showsHeading', 'shows', 'package', 'bookingCta', 'hallHeading',
    'hallSpacer', 'hall', 'videoHeading', 'video', 'reviewsHeading', 'galleryHeading', 'gallery',
    'callback', 'venuesHeading', 'venues', 'footerSpacer', 'footer', 'copyright',
  ];

  assert.equal(hero.composition, 'maxi-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'prazdnik-maxi-artboard');
  assert.equal(source.bookingHref, '#callback');
  assert.deepEqual(order, sourceR27RecordOrder);
  assert.deepEqual(Object.keys(source.records), sourceR27RecordOrder);
  for (const [key, id, desktop, mobile] of r27Records) {
    assert.deepEqual(source.records[key], { id, desktop, mobile });
  }
  // R27 is the controlled source capture: its reviews widget and live map are
  // not present, so the artboard must use the measured 28-record document.
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 9808);
  assert.equal(source.mobileFooterSeam, 1);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0) + source.mobileFooterSeam, 12216);
  const start = (dimension, until) => order.slice(0, order.indexOf(until)).reduce((total, key) => total + source.records[key][dimension], 0);
  assert.equal(start('desktop', 'shows'), 3610);
  assert.equal(start('desktop', 'video'), 7095);
  assert.equal(start('desktop', 'gallery'), 7953);
  assert.equal(start('desktop', 'callback'), 8393);
  assert.equal(start('desktop', 'footer'), 9327);
  assert.equal(start('mobile', 'shows'), 5612);
  assert.equal(start('mobile', 'video'), 8282);
  assert.equal(start('mobile', 'gallery'), 9288);
  assert.equal(start('mobile', 'callback'), 9628);
  assert.equal(start('mobile', 'footer'), 11116);
  assert.equal(start('mobile', 'copyright') + source.mobileFooterSeam, 11970);
  assert.deepEqual(source.quests.map((item) => item.title), [
    'ИГРА В КАЛЬМАРА', 'ГАРРИ ПОТТЕР И КУБОК ОГНЯ', 'МАЙНКРАФТ',
    'РОБЛОКС', 'АМОНГ АС', 'УЗНИК АЗКАБАНА',
  ]);
  assert.equal(source.shows.length, 8);
  assert.equal(source.package.items.length, 13);
});

test('Prazdnik Maxi mirrors every rendered Tilda bitmap locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the HolidayPage route-only branch renders the local Maxi composition and keeps popup replacements local', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/MaxiArtboard.astro'),
  ]);

  assert.match(layout, /sourceMaxi\s*=\s*hero\.composition\s*===\s*'maxi-artboard'/u);
  assert.match(layout, /<MaxiArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /maxi-artboard__hero/u);
  assert.match(component, /maxi-artboard__callback/u);
  assert.match(component, /data-lead-form/u);
  assert.match(component, /<label for="maxi-callback-name"><span>Ваше Имя<\/span><input id="maxi-callback-name"/u);
  assert.match(component, /<label for="maxi-callback-phone"><span>Телефон<\/span><input id="maxi-callback-phone"/u);
  assert.match(component, /href=\{bookingHref\}/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});

test('the R27 Maxi renderer maps all visible source records and omits controlled-source-absent widgets', async () => {
  const component = await read('src/components/MaxiArtboard.astro');
  const recordKeys = [
    'header', 'breadcrumbs', 'hero', 'price', 'intro', 'features', 'timeline', 'programCta',
    'questsHeading', 'quests', 'showsHeading', 'shows', 'package', 'bookingCta', 'hallHeading',
    'hallSpacer', 'hall', 'videoHeading', 'video', 'reviewsHeading', 'galleryHeading', 'gallery',
    'callback', 'venuesHeading', 'venues', 'footerSpacer', 'footer', 'copyright',
  ];

  for (const key of recordKeys) {
    assert.match(component, new RegExp(`data-parity-record=\\{records\\.${key}\\?\\.id\\}`, 'u'));
  }
  assert.match(component, /maxi-artboard__shows ul\{[^}]*margin:0/u);
  assert.match(component, /--maxi-mobile-footer-seam:\$\{mobileFooterSeam\}px/u);
  assert.match(component, /maxi-artboard__copyright\{[^}]*margin-top:var\(--maxi-mobile-footer-seam,0px\)/u);
  assert.doesNotMatch(component, /<section class="maxi-artboard__reviews"/u);
  assert.doesNotMatch(component, /<div class="maxi-artboard__map"/u);
});
