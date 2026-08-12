import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const bookingHint = /выберите и забронируйте свободное время,? кликнув по нему/;
const representativeRoutes = [
  '/among_us/',
  '/mystery_shack/',
  '/tekhasskaya-reznya-benzopiloj/',
];

const sourceBooking = (route, viewport, detail) => detail.routes[route][viewport].original.inspection.sections
  .find((section) => /онлайн бронирование/i.test(`${section.heading || ''} ${section.text || ''}`));

test('R27 representative generic quests share the copy-only T396 booking artboard', async () => {
  const detail = JSON.parse(await read('migration/parity/round-27/visual-detail.json'));

  for (const route of representativeRoutes) {
    const desktop = sourceBooking(route, 'desktop', detail);
    const mobile = sourceBooking(route, 'mobile', detail);

    assert.equal(desktop.height, 300, `${route} desktop source booking height`);
    assert.equal(mobile.height, 260, `${route} mobile source booking height`);
    assert.match(desktop.text.toLowerCase(), bookingHint);
    assert.match(mobile.text.toLowerCase(), bookingHint);
    assert.doesNotMatch(desktop.text, /забронировать по телефону|написать в whatsapp/i);
    assert.doesNotMatch(mobile.text, /забронировать по телефону|написать в whatsapp/i);
  }
});

test('QuestPage renders the shared source booking copy without clone-only CTA pills on unmarked routes', async () => {
  const quest = await read('src/layouts/QuestPage.astro');

  assert.match(quest, /const isGenericQuestSource = Object\.keys\(sourceParity\)\.length === 0;/);
  assert.match(quest, /quest-page--generic-source/);
  assert.match(quest, /const sourceBookingHint = 'Выберите и забронируйте свободное время, кликнув по нему';/);
  assert.match(quest, /const bookingLines = page\.booking/);
  assert.match(quest, /\{bookingLines\.map\(\(l\) => \(<p class="qbook__line">\{l\}<\/p>\)\)\}/);
  assert.match(quest, /!isGenericQuestSource && !isVrSource && <div class="qbook__cta">/);
  assert.match(quest, /page\.booking\?\.calendarId && <PrebookingForm/);
});

test('scopes the measured T396 booking geometry to QuestPage without changing other page families', async () => {
  const styles = await read('src/styles/quest.css');

  assert.match(styles, /\.quest-page--generic-source \.qbook\{height:var\(--generic-booking-desktop,300px\);padding:64px 0 0/);
  assert.match(styles, /\.quest-page--generic-source \.qbook__title\{font-size:34px;line-height:1\.2/);
  assert.match(styles, /\.quest-page--generic-source \.qbook__line:last-of-type\{color:var\(--orange\);font-weight:700/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.quest-page--generic-source \.qbook\{height:var\(--generic-booking-mobile,260px\);padding:35px 0 0/);
  assert.doesNotMatch(styles, /(^|\n)\.qbook\{height:300px/);
});

test('uses the same generic booking renderer for the three measured desktop-height variants', async () => {
  const [quest, cup, squid, maze] = await Promise.all([
    read('src/layouts/QuestPage.astro'),
    JSON.parse(await read('src/data/pages/garri-potter-i-kubok-ognya.json')),
    JSON.parse(await read('src/data/pages/igra_v_kalmara.json')),
    JSON.parse(await read('src/data/pages/beguschij_v_labirinte.json')),
  ]);

  assert.deepEqual(cup.booking.sourceHeight, { desktop: 290, mobile: 260 });
  assert.deepEqual(squid.booking.sourceHeight, { desktop: 290, mobile: 260 });
  assert.deepEqual(maze.booking.sourceHeight, { desktop: 270, mobile: 260 });
  assert.match(quest, /const genericBookingStyle = isGenericQuestSource && page\.booking\?\.sourceHeight/);
  assert.match(quest, /<section class="qbook" id="booking" style=\{genericBookingStyle\}>/);
});
