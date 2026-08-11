import assert from 'node:assert/strict';
import test from 'node:test';

import { imageKey, imageParity, normaliseText, sectionPairs, sourceHeaderSpacer } from '../scripts/parity-visual.mjs';

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
