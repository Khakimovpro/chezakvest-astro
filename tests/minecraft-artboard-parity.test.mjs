import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const sourceAssets = [
  '/assets/static.tildacdn.com/tild3437-3561-4536-a635-303066306432/new__.jpg',
  '/assets/static.tildacdn.com/tild3339-6462-4239-b662-353164363932/-.png',
  '/assets/static.tildacdn.com/tild3564-3134-4832-b935-343137363033/IMG_5253.JPG',
  '/assets/static.tildacdn.com/tild3061-3062-4664-b265-356362643635/photo.png',
  '/assets/static.tildacdn.com/tild3962-3064-4039-a531-343538613834/_photo_2024-04-26_13.jpg',
  '/assets/static.tildacdn.com/tild6463-6163-4266-a136-623536393237/photo.png',
  '/assets/static.tildacdn.com/tild3836-3465-4165-b533-363736613561/_1___-2.png',
  '/assets/static.tildacdn.com/tild3232-6365-4432-a637-613261343564/_2___-2.png',
  '/assets/static.tildacdn.com/tild6164-3662-4438-a431-616666313931/_3___.png',
  '/assets/static.tildacdn.com/tild6133-6535-4638-a662-636261656433/-.jpg',
  '/assets/static.tildacdn.com/tild3035-3863-4332-b833-393664323961/photo_2024-10-17_12-.png',
  '/assets/static.tildacdn.com/tild6264-6533-4639-b035-366261623630/photo_2024-10-31_15-.jpg',
  '/assets/static.tildacdn.com/tild3137-6139-4565-a434-333431353034/noroot.png',
  '/assets/static.tildacdn.com/tild6366-3134-4334-a130-326664373730/photo_2024-10-31_15-.jpg',
  '/assets/static.tildacdn.com/tild3236-3232-4839-b637-666466343066/-.jpg',
  '/assets/static.tildacdn.com/tild3237-3664-4263-b133-346137303465/2_.jpg',
  '/assets/static.tildacdn.com/tild3763-3839-4662-a161-633239313535/_.jpg',
  '/assets/static.tildacdn.com/tild6338-3231-4465-a430-356663653936/noroot.png',
  '/assets/static.tildacdn.com/tild3730-6433-4639-b934-633037323135/photo.jpg',
  '/assets/static.tildacdn.com/tild6263-3230-4230-a633-653166653038/photo_2024-10-17_12-.png',
  '/assets/static.tildacdn.com/tild3635-3963-4039-b139-663737666633/-_.jpg',
  '/assets/static.tildacdn.com/tild3161-3838-4437-b162-633936376562/photo_2024-04-26_13-.jpg',
  '/assets/static.tildacdn.com/tild6566-3034-4337-b431-653937663966/photo_2024-10-30_14-.jpg',
  '/assets/static.tildacdn.com/tild6432-6136-4731-b663-633363363665/noroot.png',
  '/assets/static.tildacdn.com/tild3965-3930-4331-a639-613063303966/photo.svg',
  '/assets/static.tildacdn.com/tild3332-3061-4661-b738-346636633462/tempImage4rhrwp_1-3-.jpg',
  '/assets/static.tildacdn.com/tild6462-3563-4363-a461-393036653939/IMG_5252.JPG',
  '/assets/static.tildacdn.com/tild3938-3132-4264-b439-643831653037/IMG_5253.JPG',
  '/assets/static.tildacdn.com/tild6331-6563-4532-b038-363833663461/photo_2024-10-29_16-.jpg',
  '/assets/static.tildacdn.com/tild6337-6561-4434-a631-626137386564/-_.png',
];

test('Minecraft opts into the measured source artboard rather than generic holiday records', async () => {
  const page = JSON.parse(await read('src/data/pages/minecraft-lend.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'header', 'hero', 'intro', 'programHeading', 'programs', 'programSpacer', 'shows', 'showsSpacer',
    'additions', 'trustHeading', 'trust', 'galleryHeading', 'gallery', 'gallerySpacer', 'gift',
    'venuesHeading', 'venues', 'footerSpacer', 'footer', 'copyright',
  ];

  assert.equal(hero.composition, 'minecraft-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(source.kind, 'minecraft-artboard');
  assert.equal(source.bookingHref, '#prazdnik');
  assert.deepEqual(source.records.hero, { desktop: 550, mobile: 530 });
  assert.deepEqual(source.records.programs, { desktop: 744, mobile: 1330 });
  assert.deepEqual(source.records.shows, { desktop: 1007, mobile: 3464 });
  assert.deepEqual(source.records.trust, { desktop: 850, mobile: 800 });
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 7116);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 11290);
  const start = (dimension, until) => order.slice(0, order.indexOf(until))
    .reduce((total, key) => total + source.records[key][dimension], 0);
  assert.equal(start('desktop', 'programs'), 1470);
  assert.equal(start('desktop', 'shows'), 2244);
  assert.equal(start('desktop', 'trust'), 4051);
  assert.equal(start('desktop', 'gift'), 5494);
  assert.equal(start('mobile', 'programs'), 1604);
  assert.equal(start('mobile', 'shows'), 2964);
  assert.equal(start('mobile', 'trust'), 7328);
  assert.equal(start('mobile', 'gift'), 8811);
  assert.equal(source.programs.length, 3);
  assert.equal(source.shows.length, 8);
  assert.equal(source.additions.length, 4);
  assert.equal(source.gallery.length, 3);
  assert.equal(source.venues.length, 9);
});

test('Minecraft mirrors every rendered Tilda bitmap locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the HolidayPage source-only branch keeps popup replacement local', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/MinecraftArtboard.astro'),
  ]);

  assert.match(layout, /sourceMinecraft\s*=\s*hero\.composition\s*===\s*'minecraft-artboard'/u);
  assert.match(layout, /<MinecraftArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /minecraft-artboard__booking[\s\S]*?<PartyForm/u);
  assert.match(component, /minecraft-artboard__hero/u);
  assert.match(component, /minecraft-artboard__programs/u);
  assert.match(component, /minecraft-artboard__trust/u);
  assert.match(component, /minecraft-artboard__gift/u);
  assert.match(component, /href=\{bookingHref\}/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});

test('Minecraft footer links to the emitted local hide-and-seek route', async () => {
  const component = await read('src/components/MinecraftArtboard.astro');

  assert.match(component, /href=\{href\('\/pryatki_v_temnote'\)\}/u);
  assert.doesNotMatch(component, /href=\{href\('\/pryatki-v-temnote'\)\}/u);
});
