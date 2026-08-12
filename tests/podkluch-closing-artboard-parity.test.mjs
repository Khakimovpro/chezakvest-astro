import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async () => JSON.parse(await read('src/data/pages/prazdniki-pod-kluch.json'));

const sourceAssets = [
  '/assets/static.tildacdn.com/tild6537-6330-4733-b338-313332316637/noroot.png',
  '/assets/static.tildacdn.com/tild3836-6134-4037-a337-623736643465/_.jpg',
  '/assets/static.tildacdn.com/tild3231-6564-4735-a239-353165663535/noroot.png',
  '/assets/static.tildacdn.com/tild6436-3363-4164-b133-643933383861/noroot.png',
  '/assets/static.tildacdn.com/tild6638-3366-4663-a232-313261333339/noroot.png',
  '/assets/static.tildacdn.com/tild6538-3631-4730-a232-633036643535/-_.jpg',
  '/assets/static.tildacdn.com/tild3931-3963-4736-a263-653163353463/_.jpg',
  '/assets/static.tildacdn.com/tild3635-3962-4134-b738-353735346234/noroot.png',
  '/assets/static.tildacdn.com/tild3834-3730-4065-b561-363835313731/noroot.png',
  '/assets/static.tildacdn.com/tild3830-3130-4662-b562-386630333361/noroot.png',
  '/assets/static.tildacdn.com/tild3361-3138-4962-b233-633164663065/LAT_3538.webp',
  '/assets/static.tildacdn.com/tild6430-3930-4633-b861-333864653265/LAT_1165.webp',
  '/assets/static.tildacdn.com/tild6639-3232-4330-b132-333866666566/LAT_3415.webp',
  '/assets/static.tildacdn.com/tild3137-6331-4636-b564-346438323161/LAT_0655.webp',
  '/assets/static.tildacdn.com/tild3665-6436-4665-b563-356139333732/_.webp',
  '/assets/static.tildacdn.com/tild6266-6465-4137-b734-363963626331/LAT_3531.webp',
  '/assets/static.tildacdn.com/tild3265-3038-4238-b365-643839373336/LAT_1323.webp',
  '/assets/static.tildacdn.com/tild3736-6130-4661-a561-366163396461/LAT_3451.webp',
];

// Measured from the live T827 review wall after its native in-view animation
// settles at 1440px and 390px. Coordinates are relative to rec677119230.
const reviewAssets = [
  ['/assets/static.tildacdn.com/tild6636-6332-4038-a164-666533363733/IMG_20230620_0717541.jpg', [40, 35, 197], [0, 25, 76]],
  ['/assets/static.tildacdn.com/tild6361-6464-4336-b561-656362663934/IMG_20230619_232405.jpg', [500, 35, 145], [180, 25, 56]],
  ['/assets/static.tildacdn.com/tild6265-3464-4237-b536-303837336564/IMG_20230619_225749.jpg', [960, 35, 175], [180, 91, 68]],
  ['/assets/static.tildacdn.com/tild3362-3333-4035-b466-303137303731/IMG_20230619_225835.jpg', [500, 200, 238], [0, 111, 92]],
  ['/assets/static.tildacdn.com/tild3336-3930-4237-b936-373031366464/IMG_20230619_225859.jpg', [960, 230, 193], [180, 169, 75]],
  ['/assets/static.tildacdn.com/tild6661-3336-4335-b161-386235383666/IMG_20230619_225922.jpg', [40, 252, 219], [0, 213, 85]],
  ['/assets/static.tildacdn.com/tild3734-6332-4632-b631-323466393135/IMG_20230619_232314.jpg', [960, 443, 144], [180, 253, 56]],
  ['/assets/static.tildacdn.com/tild6535-3566-4838-b836-303239383736/IMG_20230619_225808.jpg', [500, 458, 144], [0, 307, 56]],
  ['/assets/static.tildacdn.com/tild6130-3038-4262-a664-386234373861/IMG_20230619_232333.jpg', [40, 491, 250], [180, 319, 97]],
  ['/assets/static.tildacdn.com/tild3263-6637-4530-a436-373065646637/IMG_20230619_232452.jpg', [960, 608, 204], [0, 373, 79]],
  ['/assets/static.tildacdn.com/tild6439-3239-4433-a161-633431656666/IMG_20230619_232514.jpg', [500, 626, 210], [180, 426, 81]],
  ['/assets/static.tildacdn.com/tild3863-3430-4430-b763-323731343539/IMG_20230620_071548.jpg', [40, 774, 160], [0, 462, 62]],
  ['/assets/static.tildacdn.com/tild6435-6463-4536-b639-666265623733/IMG_20230620_071614.jpg', [960, 877, 151], [180, 517, 58]],
  ['/assets/static.tildacdn.com/tild6631-3032-4661-b431-336634316238/IMG_20230620_071642.jpg', [500, 952, 178], [0, 533, 69]],
  ['/assets/static.tildacdn.com/tild6262-6235-4763-b963-643864346337/IMG_20230620_071823.jpg', [40, 1041, 160], [180, 585, 62]],
  ['/assets/static.tildacdn.com/tild6365-3931-4261-b633-363936333632/IMG_20230620_071844.jpg', [960, 1102, 144], [0, 612, 56]],
  ['/assets/static.tildacdn.com/tild3363-3462-4233-a662-326533643163/IMG_20230620_072334.jpg', [500, 1150, 195], [180, 657, 75]],
  ['/assets/static.tildacdn.com/tild3039-3635-4437-b865-353334353166/IMG_20230620_072401.jpg', [40, 1221, 173], [0, 678, 67]],
  ['/assets/static.tildacdn.com/tild3637-6236-4832-b162-363931626431/IMG_20230620_072429.jpg', [960, 1266, 144], [180, 742, 56]],
  ['/assets/static.tildacdn.com/tild3630-3738-4462-b561-326632646165/_611.jpg', [500, 1365, 144], [0, 755, 56]],
  ['/assets/static.tildacdn.com/tild6365-3064-4464-b135-393533353035/_61.jpg', [40, 1414, 144], [180, 808, 56]],
  ['/assets/static.tildacdn.com/tild3732-6337-4561-a263-363062343735/_1031.jpg', [960, 1430, 221], [0, 821, 85]],
  ['/assets/static.tildacdn.com/tild6364-3337-4065-b736-343231663637/_103.jpg', [500, 1529, 144], [180, 874, 56]],
  ['/assets/static.tildacdn.com/tild6161-6433-4066-b064-383561336539/_23.jpg', [40, 1578, 156], [0, 916, 60]],
  ['/assets/static.tildacdn.com/tild6563-3462-4231-a562-613961356462/1.jpg', [960, 1671, 167], [180, 939, 65]],
  ['/assets/static.tildacdn.com/tild6264-3965-4935-a666-303236643332/2.jpg', [500, 1693, 144], [0, 986, 56]],
  ['/assets/static.tildacdn.com/tild3636-6463-4332-a131-313030313561/_1861.jpg', [40, 1754, 145], [180, 1014, 56]],
  ['/assets/static.tildacdn.com/tild3865-6232-4365-a335-666132343633/_186.jpg', [500, 1857, 175], [0, 1052, 68]],
];
const reviewActionIcon = '/assets/static.tildacdn.com/tild3632-6432-4034-a665-666633343761/ic_info_outline_black.svg';

test('models the remaining Pod Kluch native records instead of generic tiles, halls, gallery, and reviews', async () => {
  const document = await page();
  const closing = document.sections.find((section) => section.kind === 'podkluch-closing');

  assert.ok(closing, 'the route owns a native closing artboard');
  assert.deepEqual(closing.sourceRecords, [
    'rec685260517', 'rec685281002', 'rec678379442', 'rec678337393', 'rec678337395',
    'rec677119223', 'rec677119224', 'rec677119229', 'rec677119230', 'rec677119231',
  ]);
  assert.deepEqual(
    closing.collections.map((collection) => ({ record: collection.record, desktopHeight: collection.desktopHeight, mobileHeight: collection.mobileHeight })),
    [
      { record: 'rec685260517', desktopHeight: 554, mobileHeight: 659 },
      { record: 'rec685281002', desktopHeight: 581, mobileHeight: 779 },
    ],
  );
  assert.equal(closing.hall.headingRecord, 'rec678379442');
  assert.equal(closing.hall.desktopHeight, 580);
  assert.equal(closing.hall.mobileHeight, 600);
  assert.equal(closing.hall.initialIndex, 0);
  assert.equal(closing.hall.items.length, 5, 'all source carousel slides stay reachable');
  assert.deepEqual(closing.hall.items[0].lines, [
    'Магические уроки; Шпионское приключение; Страшные тайны;',
    'Свето-музыка и стерео звук;',
    'Множество настольных игр;',
    'Праздничная сервировка стола;',
    'Все самое необходимое для замечательного праздника "Под ключ"',
  ]);
  assert.ok(closing.hall.items.flatMap((item) => item.lines).includes('Яркая посуда и праздничная сервировка;'));
  assert.ok(closing.hall.items.flatMap((item) => item.lines).includes('Вызов своей дедукции в квесте "Шерлок Холмс";'));
  assert.ok(closing.hall.items.flatMap((item) => item.lines).includes('Уникальная локация для активных игр и пряток "Лабиринт" площадью 150 кв.м;'));
  assert.equal(closing.gallery.record, 'rec677119224');
  assert.deepEqual(closing.gallery.desktopLayout, [2, 1, 1, 2, 2, 1, 1, 2]);
  assert.equal(closing.reviews.headingRecord, 'rec677119229');
  assert.equal(closing.reviews.bodyRecord, 'rec677119230');
  assert.equal(closing.reviews.actionRecord, 'rec677119231');
  assert.equal(closing.reviews.desktopHeight, 2153);
  assert.equal(closing.reviews.mobileHeight, 1319);
  assert.equal(closing.reviews.action, 'Оставить отзыв');
  assert.equal(closing.reviews.href, '#prazdnik');
  assert.equal(closing.reviews.icon, reviewActionIcon);
  assert.deepEqual(
    closing.reviews.items.map((item) => [
      item.src,
      [item.desktop.left, item.desktop.top, item.desktop.height],
      [item.mobile.left, item.mobile.top, item.mobile.height],
    ]),
    reviewAssets,
    'the review wall retains every locally mirrored source screenshot and its measured masonry coordinates',
  );

  const referenced = [
    ...closing.collections.flatMap((collection) => collection.items.map((item) => item.src)),
    ...closing.gallery.items.map((item) => item.src),
    ...closing.reviews.items.map((item) => item.src),
    closing.reviews.icon,
  ];
  assert.deepEqual(referenced, [...sourceAssets, ...reviewAssets.map(([src]) => src), reviewActionIcon]);
  for (const sourceAsset of referenced) {
    await access(resolve(process.cwd(), 'public', sourceAsset.slice(1)));
  }
});

test('keeps the remaining source renderer gated to Pod Kluch and exposes the native hall carousel controls', async () => {
  const [layout, component] = await Promise.all([
    read('src/layouts/HolidayPage.astro'),
    read('src/components/PodKluchClosingArtboard.astro'),
  ]);

  assert.match(layout, /import PodKluchClosingArtboard from '\.\.\/components\/PodKluchClosingArtboard\.astro'/u);
  assert.match(layout, /sourcePodKluch && s\.kind === 'podkluch-closing'/u);
  assert.match(layout, /<PodKluchClosingArtboard closing=\{s\} asset=\{asset\} href=\{heroLink\}/u);
  assert.match(component, /data-parity-record=\{collection\.record\}/u);
  assert.match(component, /data-parity-record=\{hall\.headingRecord\}/u);
  assert.match(component, /data-podkluch-hall-prev/u);
  assert.match(component, /data-podkluch-hall-next/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /slide\.hidden = index !== current/u);
  assert.match(component, /grid-template-columns:repeat\(3,454px\)/u);
  assert.match(component, /grid-template-columns:repeat\(5,224px\)/u);
  assert.match(component, /reviews\.items\.map/u);
  assert.match(component, /asset\(reviews\.icon\)/u);
  assert.match(component, /--podkluch-review-left/u);
  assert.match(component, /linear-gradient\(0deg,#ff6b00 0%,#ff9100 100%\)/u);
  assert.doesNotMatch(component, /reviews-placeholder/u);
  assert.match(component, /@media \(max-width:639px\)/u);
});
