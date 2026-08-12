import assert from 'node:assert/strict';
import test from 'node:test';

import { chromium } from 'playwright';

import {
  canonicalPromoState,
  decodedPromoImageReady,
  imageKey,
  imageParity,
  inspectPage,
  normaliseText,
  promoBackgroundReady,
  sectionPairs,
  sourceHeaderSpacer,
} from '../scripts/parity-visual.mjs';

const BROWSER = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

test('inspects top-level explicit parity records inside an artboard without duplicating nested or generic wrapper sections', async (t) => {
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(`
    <header class="hdr" style="height:24px">Header</header>
    <main>
      <section id="generic" style="height:36px"><h2>Generic section</h2></section>
      <section id="artboard-wrapper" style="height:70px">
        <div data-parity-record="rec100" style="height:52px">
          <h2>Explicit source record</h2>
          <div data-parity-record="rec101" style="height:20px">Nested record must not be captured twice</div>
        </div>
      </section>
      <div class="fixture-artboard" style="height:72px">
        <div id="artboard-spacer" style="height:20px" aria-hidden="true"></div>
        <section id="artboard-record" style="height:52px">
          <h2>Artboard fallback record</h2>
          <section id="artboard-nested" style="height:20px">Nested artboard content is not a record boundary</section>
        </section>
      </div>
      <article id="generic-article" style="height:36px"><h2>Generic article</h2></article>
    </main>
    <footer class="ft" data-parity-record="rec900" style="height:36px">Footer</footer>
  `);

  const inspection = await inspectPage(page, 'clone', []);
  assert.deepEqual(
    inspection.sections.map((section) => section.id),
    ['header.hdr', 'generic', 'rec100', 'artboard-spacer', 'artboard-record', 'generic-article', 'rec900'],
  );
  assert.equal(inspection.sections.filter((section) => section.id === 'rec100').length, 1);
  assert.equal(inspection.sections.some((section) => section.id === 'rec101'), false);
  assert.equal(inspection.sections.some((section) => section.id === 'artboard-wrapper'), false);
  assert.equal(inspection.sections.some((section) => section.id === 'artboard-nested'), false);
});

test('accepts a generated legacy redirect as an internal route during link inspection', async (t) => {
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<main><a href="/legacy-route/">Legacy page</a><a href="/missing-route/">Missing page</a></main>');

  const inspection = await inspectPage(page, 'clone', ['/legacy-route/']);
  assert.deepEqual(inspection.brokenLinks, ['/missing-route/']);
});

test('accepts only the explicitly frozen canonical home promo state', () => {
  assert.equal(canonicalPromoState({ activeIndex: '1', position: '1', visible: true }), true);
  assert.equal(canonicalPromoState({ activeIndex: '2', position: '2', visible: true }), false);
  assert.equal(canonicalPromoState({ activeIndex: '1', position: '0', visible: true }), false);
  assert.equal(canonicalPromoState({ activeIndex: '1', position: null, visible: true }), true);
  assert.equal(canonicalPromoState({ activeIndex: '1', position: '1', visible: false }), false);
});

test('requires decoded clone media and a loaded, visible source background for the canonical promo', () => {
  assert.equal(
    decodedPromoImageReady({ complete: true, naturalWidth: 1200, currentSrc: '/assets/q/mystery.webp', visible: true }),
    true,
  );
  assert.equal(
    decodedPromoImageReady({ complete: false, naturalWidth: 1200, currentSrc: '/assets/q/mystery.webp', visible: true }),
    false,
  );
  assert.equal(
    decodedPromoImageReady({ complete: true, naturalWidth: 0, currentSrc: '/assets/q/mystery.webp', visible: true }),
    false,
  );
  assert.equal(
    decodedPromoImageReady({ complete: true, naturalWidth: 1200, currentSrc: '', visible: true }),
    false,
  );
  assert.equal(
    promoBackgroundReady({
      backgroundImage: 'url("https://cdn.example/mystery.webp")',
      complete: true,
      naturalWidth: 1200,
      currentSrc: 'https://cdn.example/mystery.webp',
      loaded: true,
      visible: true,
    }),
    true,
  );
  assert.equal(
    promoBackgroundReady({
      backgroundImage: 'url("https://cdn.example/mystery.webp")',
      complete: true,
      naturalWidth: 1200,
      currentSrc: 'https://cdn.example/mystery.webp',
      loaded: false,
      visible: true,
    }),
    false,
  );
  assert.equal(
    promoBackgroundReady({
      backgroundImage: 'none',
      complete: true,
      naturalWidth: 1200,
      currentSrc: 'https://cdn.example/mystery.webp',
      loaded: true,
      visible: true,
    }),
    false,
  );
});

test('normalises call-tracking phones without erasing surrounding parity text', () => {
  assert.equal(normaliseText('Звоните: +7 (928) 216-36-23'), 'звоните <phone>');
});

test('matches localised Tilda media by its traceable Tilda asset id', () => {
  assert.equal(
    imageKey('/assets/static.tildacdn.com/tild3961-3061-4231-a636-326561336230/-/format/webp/photo.webp'),
    'tild3961-3061-4231-a636-326561336230',
  );
});

test('does not mistake an Astro content hash for a missing Tilda image', () => {
  const sourceId = 'tild3961-3061-4231-a636-326561336230';
  const comparison = imageParity([sourceId], ['ccb3695169']);
  assert.deepEqual(comparison.missingImages, []);
  assert.deepEqual(comparison.unmappedImages, [sourceId]);
});

test('reports a missing image only when the clone renders no qualifying images', () => {
  const sourceId = 'tild3961-3061-4231-a636-326561336230';
  const comparison = imageParity([sourceId], []);
  assert.deepEqual(comparison.missingImages, [sourceId]);
  assert.deepEqual(comparison.unmappedImages, [sourceId]);
});

test('pairs ordered sections by text and media signatures', () => {
  const pairs = sectionPairs(
    [{ text: 'Квесты в Ростове', heading: 'Квесты', images: ['tild1111-1111-1111-1111-111111111111'] }],
    [{ text: 'Квесты в Ростове-на-Дону', heading: 'Квесты', images: ['tild1111-1111-1111-1111-111111111111'] }],
  );
  assert.equal(pairs[0].cloneIndex, 0);
  assert.equal(pairs[0].orderOk, true);
});

test('pairs explicit source-record counterparts even when their visual boundary has no semantic copy', () => {
  const pairs = sectionPairs(
    [
      { index: 0, id: 'rec100', heading: '', text: '', images: [] },
      { index: 1, id: 'rec200', heading: '', text: '', images: [] },
    ],
    [
      { index: 0, id: 'rec100', parity_record: 'rec100', heading: '', text: '', images: [] },
      { index: 1, id: 'rec200', parity_record: 'rec200', heading: '', text: '', images: [] },
    ],
  );
  assert.deepEqual(
    pairs.map(({ originalIndex, cloneIndex, evidence }) => [originalIndex, cloneIndex, evidence]),
    [[0, 0, 'record'], [1, 1, 'record']],
  );
});

test('aligns two adjacent Tilda records with one clone macro section only when both copies are present', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: 'Выберите пакет праздника', text: 'Выберите пакет праздника отправьте заявку менеджер уточнит дату', images: [] },
      { index: 1, heading: '', text: 'Стандарт квест банкетная зона ведущий чай кофе праздничная программа', images: [] },
    ],
    [{
      index: 0,
      heading: 'Выберите пакет праздника',
      text: 'Выберите пакет праздника отправьте заявку менеджер уточнит дату стандарт квест банкетная зона ведущий чай кофе праздничная программа',
      images: [],
    }],
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].cloneIndex, 0);
  assert.deepEqual(pairs[0].originalIndexes, [0, 1]);
  assert.equal(pairs[0].macro, true);
});

test('does not swallow an adjacent unrelated record into a macro section', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: '', text: 'Политика обработки персональных данных индивидуального предпринимателя', images: [] },
      { index: 1, heading: 'Наши площадки', text: 'Наши площадки адреса квест комнат Ростова', images: [] },
    ],
    [{
      index: 0,
      heading: '',
      text: 'Политика обработки персональных данных индивидуального предпринимателя',
      images: [],
    }],
  );
  assert.deepEqual(
    pairs.map(({ originalIndex, cloneIndex, macro }) => [originalIndex, cloneIndex, Boolean(macro)]),
    [[0, 0, false], [1, -1, false]],
  );
});

test('does not form a macro across a non-adjacent source record', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: 'Выберите пакет праздника', text: 'Выберите пакет праздника отправьте заявку менеджер', images: [] },
      { index: 1, heading: 'Наши площадки', text: 'Наши площадки адреса квест комнат', images: [] },
      { index: 2, heading: '', text: 'Стандарт квест банкетная зона ведущий чай кофе', images: [] },
    ],
    [{
      index: 0,
      heading: 'Выберите пакет праздника',
      text: 'Выберите пакет праздника отправьте заявку менеджер стандарт квест банкетная зона ведущий чай кофе',
      images: [],
    }],
  );
  assert.deepEqual(
    pairs.map(({ originalIndex, cloneIndex, macro }) => [originalIndex, cloneIndex, Boolean(macro)]),
    [[0, 0, false], [1, -1, false], [2, -1, false]],
  );
});

test('does not fold a Tilda breadcrumb into the preceding hero macro', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: 'День рождения на VR арене', text: 'День рождения на VR арене технологичный праздник', images: [] },
      { index: 1, heading: '', text: 'Главная проведение праздников день рождения на VR арене', images: [] },
    ],
    [{
      index: 0,
      heading: 'День рождения на VR арене',
      text: 'День рождения на VR арене технологичный праздник проведение праздников',
      images: [],
    }],
  );
  assert.deepEqual(
    pairs.map(({ originalIndex, cloneIndex, macro }) => [originalIndex, cloneIndex, Boolean(macro)]),
    [[0, 0, false], [1, -1, false]],
  );
});

test('does not consume a clone section for an empty Tilda fragment', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: 'Замок Дракулы', text: 'Замок Дракулы квест хоррор', images: [] },
      { index: 1, heading: '', text: '', images: [] },
      { index: 2, heading: 'Онлайн бронирование', text: 'Онлайн бронирование стоимость участие', images: [] },
    ],
    [
      { index: 0, heading: 'Замок Дракулы', text: 'Замок Дракулы квест хоррор', images: [] },
      { index: 1, heading: 'Онлайн бронирование', text: 'Онлайн бронирование стоимость участие', images: [] },
    ],
  );
  assert.deepEqual(pairs.map(({ originalIndex, cloneIndex }) => [originalIndex, cloneIndex]), [[0, 0], [2, 1]]);
});

test('keeps semantic pair order instead of greedily crossing repeated content', () => {
  const pairs = sectionPairs(
    [
      { index: 0, heading: 'Первый сценарий', text: 'первый сценарий космическая экспедиция', images: [] },
      { index: 1, heading: 'Второй сценарий', text: 'второй сценарий подземное приключение', images: [] },
    ],
    [
      { index: 0, heading: 'Второй сценарий', text: 'второй сценарий подземное приключение', images: [] },
      { index: 1, heading: 'Первый сценарий', text: 'первый сценарий космическая экспедиция', images: [] },
    ],
  );
  const matched = pairs.filter((pair) => pair.cloneIndex >= 0);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].orderOk, true);
});

test('treats footer body and continuation as one semantic footer boundary', () => {
  const pairs = sectionPairs(
    [
      { index: 0, role: 'footer', heading: '', text: 'организация мероприятий', images: [] },
      { index: 1, role: 'footer_continuation', heading: '', text: 'чё за квест', images: [] },
    ],
    [{ index: 0, role: 'footer', heading: '', text: 'организация мероприятий чё за квест', images: [] }],
  );
  assert.deepEqual(pairs.map(({ originalIndex, cloneIndex }) => [originalIndex, cloneIndex]), [[0, 0]]);
});

test('only treats an empty short Tilda spacer as an implicit source header', () => {
  assert.equal(sourceHeaderSpacer({ height: 90, heading: '', text: '', images: [] }), true);
  assert.equal(sourceHeaderSpacer({ height: 410, heading: '', text: 'Политика обработки персональных данных', images: [] }), false);
});
