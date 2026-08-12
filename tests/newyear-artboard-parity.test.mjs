import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceAssets = [
  '/assets/static.tildacdn.com/tild3262-6437-4163-a664-323535303334/_-2.jpg',
  '/assets/static.tildacdn.com/tild3161-6535-4831-b364-303861663861/__320-480px.png',
  '/assets/static.tildacdn.com/tild3036-3666-4734-b263-613930383463/image_3.png',
  '/assets/static.tildacdn.com/tild3663-3435-4437-b134-323835643532/tempImageRF9AD7_1-2.png',
  '/assets/static.tildacdn.com/tild6561-3234-4761-b931-343461393236/download_12.png',
  '/assets/static.tildacdn.com/tild3364-3332-4138-a232-613136353466/8.png',
  '/assets/static.tildacdn.com/tild6661-6530-4362-a163-613339313330/__.jpg',
  '/assets/static.tildacdn.com/tild6232-6135-4636-a665-613063653162/_03.jpg',
  '/assets/static.tildacdn.com/tild6364-3764-4731-b439-316133666666/photo.jpg',
  '/assets/static.tildacdn.com/tild3731-6330-4232-a339-393461633861/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild6230-6463-4838-b865-386137323461/2_.jpg',
  '/assets/static.tildacdn.com/tild3738-3861-4636-b531-376631326334/_.jpg',
  '/assets/static.tildacdn.com/tild6165-3563-4637-a661-396264623634/_-2.jpg',
  '/assets/static.tildacdn.com/tild3666-3363-4430-b737-616439363137/-_.jpg',
  '/assets/static.tildacdn.com/tild3764-6439-4433-a266-633336383865/-_.jpg',
  '/assets/static.tildacdn.com/tild6131-6564-4735-b639-353532663239/photo.jpg',
  '/assets/static.tildacdn.com/tild3862-6331-4263-b264-343334343765/_.jpg',
  '/assets/static.tildacdn.com/tild3535-3437-4837-b939-646237636439/photo.jpg',
  '/assets/static.tildacdn.com/tild6538-3631-4730-a232-633036643535/-_.jpg',
  '/assets/static.tildacdn.com/tild3931-3963-4736-a263-653163353463/_.jpg',
  '/assets/static.tildacdn.com/tild3635-3962-4134-b738-353735346234/noroot.png',
  '/assets/static.tildacdn.com/tild3834-3730-4065-b561-363835313731/noroot.png',
  '/assets/static.tildacdn.com/tild3830-3130-4662-b562-386630333361/noroot.png',
  '/assets/static.tildacdn.com/tild6537-6330-4733-b338-313332316637/noroot.png',
  '/assets/static.tildacdn.com/tild3836-6134-4037-a337-623736643465/_.jpg',
  '/assets/static.tildacdn.com/tild3231-6564-4735-a239-353165663535/noroot.png',
  '/assets/static.tildacdn.com/tild6436-3363-4164-b133-643933383861/noroot.png',
  '/assets/static.tildacdn.com/tild6638-3366-4663-a232-313261333339/noroot.png',
];

test('New Year opts into the R15 source artboard and preserves the measured record sequence', async () => {
  const page = JSON.parse(await read('src/data/pages/new-year.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'spacer', 'hero', 'breadcrumb', 'benefitsHeading', 'benefits', 'programHeading', 'program',
    'dividerAfterProgram', 'scenarios', 'hallHeading', 'hall', 'dividerAfterHall', 'showsHeading',
    'shows', 'dividerAfterShows', 'helpHeading', 'help', 'dividerAfterHelp', 'additionsHeading',
    'additions', 'masters', 'dividerAfterMasters', 'reviewsHeading', 'dividerAfterReviews',
    'faqHeading', 'faq', 'dividerAfterFaq', 'callback', 'dividerAfterCallback', 'venuesHeading',
    'venues', 'footerSpacer', 'footer', 'footerBottom',
  ];

  assert.equal(hero.composition, 'newyear-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'newyear-artboard');
  assert.deepEqual(source.records.hero, { desktop: 688, mobile: 767 });
  assert.deepEqual(source.records.benefits, { desktop: 748, mobile: 1426 });
  assert.deepEqual(source.records.program, { desktop: 799, mobile: 1010 });
  assert.deepEqual(source.records.shows, { desktop: 735, mobile: 469 });
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 9123);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 11560);
  assert.deepEqual(source.shows.map((item) => item.title), [
    'Нащупал', 'Мафия', 'Угадай мелодию', 'Попробуй объяснить',
    'Любимый герой', 'НЕигры', 'Импровизация. Без чувств', 'Флешмоб (Дискотека)',
  ]);
  assert.deepEqual(source.additions.map((item) => item.title), [
    'Вынос торта любимым героем', 'Банкетное меню', 'Тематические торты',
    'Профессиональные актёры', 'Профессиональный фотограф',
  ]);
  assert.deepEqual(source.masters.map((item) => item.title), [
    'Сливочное пиво', 'Волшебные палочки', 'Космос в банке', 'Тай-дай', 'Роспись',
  ]);
});

test('New Year mirrors source-only visual assets locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the HolidayPage branch keeps old redirect SEO and a local booking target while excluding generic holiday records', async () => {
  const [layout, component, redirect] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/NewYearArtboard.astro'),
    read('src/pages/new-year-2025.astro'),
  ]);

  assert.match(layout, /sourceNewYear\s*=\s*hero\.composition\s*===\s*'newyear-artboard'/u);
  assert.match(layout, /<NewYearArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /<PartyForm id="newyear" sectionId="prazdnik"/u);
  assert.match(component, /newyear-artboard__benefit-grid/u);
  assert.match(component, /newyear-artboard__show-grid/u);
  assert.match(component, /newyear-artboard__booking\s+\.pform:target/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
  assert.match(redirect, /target="\/new-year"/u);
});
