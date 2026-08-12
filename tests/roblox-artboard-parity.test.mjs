import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceAssets = [
  '/assets/static.tildacdn.com/tild6366-3466-4664-a338-633938366530/7ad3c0ee-a35c-444c-9.png',
  '/assets/static.tildacdn.com/tild3166-6133-4265-b736-666331333162/caed1ab0-dd5c-4e39-a.png',
  '/assets/static.tildacdn.com/tild3062-3833-4637-a365-653838626563/ROBLOX.svg',
  '/assets/static.tildacdn.com/tild6633-3333-4139-a330-663635636135/1_.png',
  '/assets/static.tildacdn.com/tild6266-3432-4137-a538-646265633432/decor__.svg',
  '/assets/static.tildacdn.com/tild3561-6366-4337-a637-363764333531/decor___blur.svg',
  '/assets/static.tildacdn.com/tild3637-6230-4333-b731-313330343434/2_decor__.svg',
  '/assets/static.tildacdn.com/tild6338-3364-4132-a237-636565613261/2_.svg',
  '/assets/static.tildacdn.com/tild3839-3438-4135-a335-666434316132/photo_2024-10-30_14-.jpg',
  '/assets/static.tildacdn.com/tild3730-3631-4664-a639-323638656165/3__.png',
  '/assets/static.tildacdn.com/tild3231-6466-4162-a665-353764346531/3__.png',
  '/assets/static.tildacdn.com/tild3037-3236-4237-b563-663238316563/3__.jpg',
  '/assets/static.tildacdn.com/tild6638-3763-4335-a434-623762353536/noroot.png',
  '/assets/static.tildacdn.com/tild6433-3534-4265-a436-633664336631/3_.png',
  '/assets/static.tildacdn.com/tild3737-6464-4266-b265-393030366439/4__.png',
  '/assets/static.tildacdn.com/tild3431-3631-4338-a263-343265383664/noroot.png',
  '/assets/static.tildacdn.com/tild6462-3366-4731-a530-303530653535/noroot.png',
  '/assets/static.tildacdn.com/tild6464-3138-4234-b034-316262333862/image_2025-03-20_20-.jpg',
  '/assets/static.tildacdn.com/tild3235-3935-4063-b933-346639363931/noroot.png',
  '/assets/static.tildacdn.com/tild3865-3330-4661-a539-613535393162/photo.png',
  '/assets/static.tildacdn.com/tild3834-6264-4434-b061-333862343963/noroot.png',
  '/assets/static.tildacdn.com/tild3930-6438-4463-b237-306432633962/_Roblox.jpg',
  '/assets/static.tildacdn.com/tild3635-3963-4039-b139-663737666633/-_.jpg',
  '/assets/static.tildacdn.com/tild3365-6339-4435-a633-623833323735/noroot.png',
  '/assets/static.tildacdn.com/tild3133-3664-4632-b566-643965636530/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild3434-6330-4661-b163-643832373066/photo_53980772950812.jpg',
  '/assets/static.tildacdn.com/tild6537-6635-4333-a439-656130613230/6_img1.jpg',
  '/assets/static.tildacdn.com/tild6362-3362-4531-a466-306163656161/6_konfetti.png',
  '/assets/static.tildacdn.com/tild6264-3138-4432-b566-626239613665/6_baloon.png',
  '/assets/static.tildacdn.com/tild3466-3134-4363-b064-613538316266/6_baloon2.png',
  '/assets/static.tildacdn.com/tild3165-3939-4561-b536-386234653237/6_kids.png',
  '/assets/static.tildacdn.com/tild3163-6266-4530-a136-376662333735/6_like.png',
  '/assets/static.tildacdn.com/tild6137-6435-4262-b135-353636633333/noroot.png',
  '/assets/static.tildacdn.com/tild3239-3565-4161-a230-323732646465/6_ruka.png',
  '/assets/static.tildacdn.com/tild6164-6438-4164-b066-303037393733/5_fon.jpg',
  '/assets/static.tildacdn.com/tild6364-6138-4961-b132-383266363438/5_gift.png',
  '/assets/static.tildacdn.com/tild3966-6666-4363-b838-613961643464/2_.svg',
  '/assets/static.tildacdn.com/tild3431-3237-4565-a435-343732646232/5_banda.png',
  '/assets/static.tildacdn.com/tild6337-6561-4434-a631-626137386564/-_.png',
];

test('Roblox opts into the captured R15 source artboard and source record sequence', async () => {
  const page = JSON.parse(await read('src/data/pages/roblox-land.json'));
  const hero = page.sections.find((section) => section.kind === 'hero');
  const source = page.sourceParity;
  const order = [
    'hero', 'intro', 'video', 'packages', 'shows', 'showDivider', 'additions',
    'hallHeading', 'hall', 'trustHeading', 'trust', 'bonus', 'venuesHeading',
    'venues', 'venuesGap', 'footerSpacer', 'footer', 'footerBottom', 'documentTrim',
  ];

  assert.equal(hero.composition, 'roblox-artboard');
  assert.equal(hero.hideSharedHeader, true);
  assert.equal(page.showCallback, false);
  assert.equal(source.kind, 'roblox-artboard');
  assert.deepEqual(source.records.hero, { desktop: 938, mobile: 918 });
  assert.deepEqual(source.records.packages, { desktop: 1173, mobile: 2433 });
  assert.deepEqual(source.records.hall, { desktop: 600, mobile: 785 });
  assert.deepEqual(source.records.trust, { desktop: 707, mobile: 1926 });
  assert.equal(order.reduce((total, key) => total + source.records[key].desktop, 0), 8169);
  assert.equal(order.reduce((total, key) => total + source.records[key].mobile, 0), 13711);
  assert.deepEqual(source.packages.map((item) => item.title), ['Стандарт', 'Супер', 'Макси']);
  assert.deepEqual(source.shows.map((item) => item.title), [
    'Шоу Любимый герой', 'Шоу Квиз Роблокс', 'Шоу Кажется нащупал', 'Шоу мафия. Игра на выживание',
  ]);
  assert.deepEqual(source.additions.map((item) => item.title), [
    'Вынос торта ведущим', 'Тематические торты', 'Фотограф на мероприятие', 'Профессиональные актеры',
  ]);
});

test('Roblox mirrors every selected source visual bitmap locally', async () => {
  await Promise.all(sourceAssets.map((asset) => access(new URL(`public${asset}`, root))));
});

test('the guarded HolidayPage branch keeps Roblox conversion local and isolated', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/RobloxArtboard.astro'),
  ]);

  assert.match(layout, /sourceRoblox\s*=\s*hero\.composition\s*===\s*'roblox-artboard'/u);
  assert.match(layout, /<RobloxArtboard source=\{page\.sourceParity\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(layout, /<PartyForm id="roblox" sectionId="prazdnik"/u);
  assert.match(component, /roblox-artboard__package-grid/u);
  assert.match(component, /roblox-artboard__trust-grid/u);
  assert.match(component, /roblox-artboard__booking\s+\.pform:target/u);
  assert.doesNotMatch(component, /https?:\/\/static\.tildacdn\.com/u);
});
