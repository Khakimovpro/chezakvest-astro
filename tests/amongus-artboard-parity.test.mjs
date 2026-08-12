import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceAssets = [
  '/assets/static.tildacdn.com/tild3733-3266-4434-b933-636336313937/photo_20325-05-13_11.png',
  '/assets/static.tildacdn.com/tild6566-3834-4033-b630-393963303866/dmitriy-leongff2ovic.png',
  '/assets/static.tildacdn.com/tild6463-6166-4865-b731-396333373962/snapedit_17474129053.png',
  '/assets/static.tildacdn.com/tild3630-3365-4161-b439-353039346262/2_4_1.svg',
  '/assets/static.tildacdn.com/tild3933-3866-4436-b233-626265633332/DSC_4533_1.jpg',
  '/assets/static.tildacdn.com/tild6338-3931-4234-b532-393636656537/33_1__1.svg',
  '/assets/static.tildacdn.com/tild3861-6638-4136-b362-326232326266/221_3_2.svg',
  '/assets/static.tildacdn.com/tild3439-3036-4166-a237-633766626637/image-3-2.png',
  '/assets/static.tildacdn.com/tild6633-6163-4630-a331-333135643135/_.jpg',
  '/assets/static.tildacdn.com/tild3532-3434-4664-a464-366335343238/-.jpg',
  '/assets/static.tildacdn.com/tild3366-6365-4762-b665-633666363431/_2.jpg',
  '/assets/static.tildacdn.com/tild6531-3663-4361-b138-333865356332/Mafia.jpg',
  '/assets/static.tildacdn.com/tild6636-6135-4335-a434-366364626139/amongas_mini.png',
  '/assets/static.tildacdn.com/tild3434-6236-4666-b730-653163336530/_VR.jpg',
  '/assets/static.tildacdn.com/tild3332-3062-4631-a564-336364316163/_mini.jpg',
  '/assets/static.tildacdn.com/tild3636-3835-4665-b338-666330336136/_.jpg',
  '/assets/static.tildacdn.com/tild3434-3462-4665-b535-383435633563/image-15-2.png',
  '/assets/static.tildacdn.com/tild3033-6165-4230-a138-623138663761/image_24.png',
  '/assets/static.tildacdn.com/tild3561-3934-4231-b639-323164653634/4090969693_a35cdc26-.png',
  '/assets/static.tildacdn.com/tild3933-3136-4735-a430-346635383439/_1_2.png',
  '/assets/static.tildacdn.com/tild3437-3336-4535-a431-396335396138/_DSC3759.jpg',
  '/assets/static.tildacdn.com/tild3032-3730-4137-a662-303536393730/_DSC3628.jpg',
  '/assets/static.tildacdn.com/tild3561-3036-4763-a633-393338336536/_DSC3787.jpg',
  '/assets/static.tildacdn.com/tild6365-6436-4333-a632-383764356661/_DSC3704.jpg',
  '/assets/static.tildacdn.com/tild6538-3863-4466-b434-396638393135/_DSC3751.jpg',
  '/assets/static.tildacdn.com/tild3938-6532-4162-a530-396538653433/_DSC3701.jpg',
  '/assets/static.tildacdn.com/tild6533-6538-4762-b163-343935306431/_DSC3658.jpg',
  '/assets/static.tildacdn.com/tild3938-6339-4465-b631-356437313865/photo_2024-09-28_14-.jpg',
  '/assets/static.tildacdn.com/tild6265-3065-4132-b332-613131376261/3_2_1.png',
  '/assets/static.tildacdn.com/tild3961-3561-4235-b139-373362323530/331_4_1.png',
  '/assets/static.tildacdn.com/tild3162-3766-4966-a530-363963316434/_5_1.png',
  '/assets/static.tildacdn.com/tild3137-3130-4165-a539-356562656339/33_1__1_1.png',
  '/assets/static.tildacdn.com/tild3836-6461-4436-b238-323766353839/102832617_1.png',
  '/assets/static.tildacdn.com/tild3265-6366-4766-b836-626631383035/Frame_1328-2.png',
  '/assets/static.tildacdn.com/tild3538-6338-4039-b662-323163633930/image-5-2.png',
  '/assets/static.tildacdn.com/tild6530-6239-4337-a561-653733613865/Frame_1328-2.png',
  '/assets/static.tildacdn.com/tild6266-3662-4865-a461-393234393663/1_1_1.png',
  '/assets/static.tildacdn.com/tild3666-3063-4234-b666-333334363733/Dw9p2Cs30WY-2_1-2-2.png',
  '/assets/static.tildacdn.com/tild6635-6664-4336-b964-613336356363/Frame_1328-2.png',
  '/assets/static.tildacdn.com/tild6136-3565-4363-b866-316530326163/image-10-2.png',
  '/assets/static.tildacdn.com/tild6163-3530-4132-b930-323438633866/205467036_6306483_1.png',
  '/assets/static.tildacdn.com/tild6337-6561-4434-a631-626137386564/-_.png',
];

test('Among Us opts into the captured R15 source artboard and record sequence', async () => {
  const page = JSON.parse(await read('src/data/pages/amongus-land.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'hero', 'intro', 'video', 'packages', 'shows', 'showDivider', 'additions', 'additionsGap',
    'trustHeading', 'trust', 'galleryHeading', 'gallery', 'bonus', 'venuesHeading',
    'venues', 'footerSpacer', 'footer', 'footerBottom',
  ];

  assert.equal(hero.composition, 'amongus-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'amongus-artboard');
  assert.deepEqual(source.records.hero, { desktop: 900, mobile: 844 });
  assert.deepEqual(source.records.packages, { desktop: 1242, mobile: 2433 });
  assert.deepEqual(source.records.shows, { desktop: 590, mobile: 1874 });
  assert.deepEqual(source.records.trust, { desktop: 707, mobile: 1926 });
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 8106);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 13265);
  assert.deepEqual(source.packages.map((item) => item.title), ['Стандарт', 'Супер', 'Макси']);
  assert.deepEqual(source.shows.map((item) => item.title), [
    'Шоу любимый герой', 'Шоу Квиз Амонг Ас', 'Шоу Кажется нащупал', 'Шоу мафия. Найди предателя',
  ]);
  assert.equal(source.gallery.length, 8);
});

test('Among Us keeps the R27 source record map and layered trust/footer visual contracts', async () => {
  const [page, component] = await Promise.all([
    read('src/data/pages/amongus-land.json').then(JSON.parse),
    read('src/components/AmongUsArtboard.astro'),
  ]);
  const source = page.sourceParity;

  assert.deepEqual(source.recordIds, {
    hero: 'rec1049626221', intro: 'rec1036403466', video: 'rec1037984321', packages: 'rec1036403486',
    shows: 'rec1036403496', showDivider: 'rec1036403506', additions: 'rec1036403511',
    trustHeading: 'rec1036403556', trust: 'rec1036403561', galleryHeading: 'rec1043693181',
    gallery: 'rec1038440301', bonus: 'rec1036403611', venuesHeading: 'rec1036403621',
    venues: 'rec1036403626', footerSpacer: 'rec1043705606', footer: 'rec1036403681', footerBottom: 'rec1036403686',
  });
  assert.equal(source.trust.cards.length, 8);
  assert.equal(source.trust.cards[1].src.endsWith('Dw9p2Cs30WY-2_1-2-2.png'), true);
  assert.equal(source.trust.cards[4].src.endsWith('image-10-2.png'), true);
  assert.equal(source.trust.cards[7].src.endsWith('image-5-2.png'), true);
  assert.deepEqual(source.trust.cards.map(({ kind, mobileOrder }) => [kind, mobileOrder]), [
    ['years', 1], ['celebration', 2], ['reviews', 3], ['venues', 4],
    ['cartoon', 6], ['safety', 5], ['age', 7], ['party', 8],
  ]);
  assert.equal(source.footer.logo.endsWith('/-_.png'), true);
  assert.equal(source.footer.venues.some((item) => item.title === 'УЛИЦА 40-ЛЕТИЯ ПОБЕДЫ, 216'), true);
  assert.equal(source.footer.phoneDesktop, '+7 (958) 405 54 34');
  assert.equal(source.footer.phoneMobile, '+7 (863) 204 43 25');

  for (const key of Object.keys(source.recordIds)) {
    assert.match(component, new RegExp(`data-parity-record=\\{recordIds\\.${key}\\}`, 'u'));
  }
  assert.match(component, /amongus-artboard__venues-desktop/u);
  assert.match(component, /amongus-artboard__trust-card-art/u);
  assert.match(component, /--amongus-trust-mobile-order:\$\{card\.mobileOrder \|\| 0\}/u);
  assert.match(component, /amongus-artboard__footer-logo/u);
  assert.match(component, /amongus-artboard__footer-phone--desktop/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});

test('Among Us mirrors every source visual bitmap locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the guarded HolidayPage branch preserves local conversion and does not affect generic routes', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/AmongUsArtboard.astro'),
  ]);

  assert.match(layout, /sourceAmongUs\s*=\s*hero\.composition\s*===\s*'amongus-artboard'/u);
  assert.match(layout, /<AmongUsArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /<PartyForm id="amongus" sectionId="prazdnik"/u);
  assert.match(component, /amongus-artboard__package-grid/u);
  assert.match(component, /amongus-artboard__trust-grid/u);
  assert.match(component, /amongus-artboard__booking\s+\.pform:target/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});
