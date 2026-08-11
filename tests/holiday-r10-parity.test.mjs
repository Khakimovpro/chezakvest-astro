import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const page = async (slug) => JSON.parse(await read(`src/data/pages/${slug}.json`));

test('uses the documented dark source canvases while preserving the source header on VR and Azkaban', async () => {
  const [vr, azkaban] = await Promise.all([
    page('den-rozhdeniya-na-vr-arene'),
    page('den-rozhdeniya-uznik-azkabana'),
  ]);

  assert.equal(vr.theme, 'vr');
  assert.equal(azkaban.theme, 'azkaban');
  for (const document of [vr, azkaban]) {
    const hero = document.sections.find((section) => section.kind === 'hero');
    assert.notEqual(hero.hideSharedHeader, true);
    assert.ok(!document.sections.some((section) => section.kind === 'faq'));
  }
  assert.equal(vr.showReviews, false);
  assert.ok(azkaban.sections.some((section) => section.kind === 'reviews' && section.title === 'Честные отзывы наших гостей и их родителей'));
  assert.deepEqual(vr.sections[0].buttons.map((button) => button.primary), [false, true]);
  assert.deepEqual(azkaban.sections[0].buttons.map((button) => button.t), ['Рассчитать стоимость', 'Получить программу']);
});

test('preserves source card art and first-frame gallery geometry on the dark category', async () => {
  const category = await page('strashnye-kvesty');
  assert.equal(category.games.sourcePortraitCards, true);
  assert.equal(category.gallery.carousel, true);

  const layout = await read('src/layouts/CategoryPage.astro');
  assert.match(layout, /sourceImage\s*=\s*g\.img\s*\|\|\s*info\.img/);
  assert.match(layout, /page\.gallery\.carousel/);
});

test('keeps a source callback before venue chips on holiday pages', async () => {
  const layout = await read('src/layouts/HolidayPage.astro');
  const callback = layout.indexOf('{page.showCallback !== false && <CallbackForm id="h" />}');
  const venues = layout.indexOf('<VenuesSection id={`venues-${page.slug}`}');
  assert.ok(callback >= 0, 'callback rendering is present');
  assert.ok(venues >= 0, 'venue rendering is present');
  assert.ok(callback < venues, 'source callback comes before venue chips');
  assert.match(layout, /hasExplicitHeroPrimary \? b\.primary : i === 0/);
});

test('uses source-specific booking copy and removes unsupported generic sections on holiday landings', async () => {
  const [kids, maxi, podKluch, vr, azkaban] = await Promise.all([
    page('kids'),
    page('prazdnik-maxi'),
    page('prazdniki-pod-kluch'),
    page('den-rozhdeniya-na-vr-arene'),
    page('den-rozhdeniya-uznik-azkabana'),
  ]);

  assert.equal(kids.showCallback, false);
  assert.notEqual(maxi.showCallback, false);
  assert.equal(podKluch.showCallback, false);
  assert.equal(azkaban.showCallback, false);
  assert.equal(kids.sections.some((section) => section.title === 'Чё за праздник'), false);
  assert.equal(kids.sections.some((section) => section.kind === 'faq'), false);
  assert.equal(maxi.sections.some((section) => section.kind === 'party-form'), false);
  assert.equal(maxi.sections.some((section) => section.kind === 'faq'), false);
  assert.equal(maxi.sections[0].buttons[0].href, '#callback', 'the Marquiz hero fallback lands on the remaining local callback form');
  assert.equal(podKluch.sections.some((section) => section.title === 'Праздник, который можно собрать под ваш повод'), false);

  for (const document of [kids, podKluch, azkaban]) {
    const form = document.sections.find((section) => section.kind === 'party-form');
    assert.ok(form?.title, `${document.slug} retains a source-labelled conversion form`);
    assert.ok(form?.subtitle, `${document.slug} retains the source supporting copy`);
  }
  assert.equal(vr.sections.some((section) => section.kind === 'party-form'), false);
  assert.equal(vr.sections[0].buttons[0].href, '#pakety');
  assert.ok(
    maxi.sections.findIndex((section) => section.kind === 'reviews')
      < maxi.sections.findIndex((section) => section.kind === 'gallery'),
    'Maxi source places reviews before the photo gallery',
  );

  assert.deepEqual(
    kids.sections.filter((section) => section.kind === 'party-form').map((section) => section.id),
    ['quiz', 'prazdnik'],
  );
  assert.deepEqual(
    azkaban.sections.filter((section) => section.kind === 'party-form').map((section) => section.id),
    ['quiz', 'prazdnik'],
  );
});

test('renders data-provided party-form copy and source first-frame hall rails', async () => {
  const layout = await read('src/layouts/HolidayPage.astro');
  const partyForm = await read('src/components/PartyForm.astro');
  const [kids, maxi] = await Promise.all([page('kids'), page('prazdnik-maxi')]);

  assert.match(layout, /<PartyForm id=\{`p\$\{s\.n \|\| ''\}`\} sectionId=\{s\.id \|\| 'prazdnik'\} title=\{s\.title\} subtitle=\{s\.subtitle\} cta=\{s\.cta\} variant=\{s\.variant\} \/>/);
  assert.match(layout, /hhalls--source-first-frame/);
  assert.match(partyForm, /id = 'party'/);
  assert.match(partyForm, /title = 'У нас вы можете отметить День рождения!'/);
  assert.match(partyForm, /pform--\$\{variant\}/);

  assert.equal(kids.sections.find((section) => section.kind === 'halls')?.sourceFirstHallOnly, true);
  assert.equal(maxi.sections.find((section) => section.kind === 'halls')?.sourceFirstHallOnly, true);
});
