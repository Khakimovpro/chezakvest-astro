// Preserve the visible form inventory inherited from Tilda.
// The owner authorized new delivery and optional dates on 2026-09-14;
// fields, their order, popups, and contact choices remain protected.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import manifest from '../src/generated/source-snapshot-manifest.json' with { type: 'json' };
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshotDir = new URL('../src/source-snapshots/', import.meta.url);
const pageDir = new URL('../src/data/pages/', import.meta.url);
const nativeRoutes = async () => new Set((await Promise.all((await readdir(pageDir))
  .filter((name) => name.endsWith('.json'))
  .map(async (name) => JSON.parse(await readFile(new URL(name, pageDir), 'utf8')))))
  .filter((page) => page.render === 'native')
  .map((page) => `/${page.slug}/`));

const countAll = async (pattern) => {
  const native = await nativeRoutes();
  const files = Object.entries(manifest.routes)
    .filter(([route]) => !native.has(route))
    .map(([, metadata]) => metadata.snapshot);
  let total = 0;
  for (const name of files) {
    const html = await readFile(new URL(name, snapshotDir), 'utf8');
    total += (html.match(pattern) ?? []).length;
  }
  return total;
};

// Замер 13.09.2026 после перевода /igra_v_kalmara/ и /kids/ в нативный слой.
// Считаем только маршруты, которые по-прежнему рендерят снимок.
const FROZEN = {
  forms: 292,
  popups: 220,
  // 20.08.2026: три кнопки «Подобрать квест» на /kids/, /new-year/ и
  // /den-rozhdeniya-uznik-azkabana/ вели на общую форму вместо подбора программы.
  // Теперь там свой пошаговый подбор со своей заявкой, поэтому ссылок на три меньше.
  bookingLinks: 564,
  dateMarkers: 569,
  phoneWraps: 309,
  contactChoice: 183,
};

test('формы в снимках не поредели', async () => {
  assert.ok(await countAll(/<form\b/gu) >= FROZEN.forms, 'форм стало меньше');
  assert.ok(await countAll(/class="[^"]*\bt-popup\b/gu) >= FROZEN.popups, 'попапов стало меньше');
  assert.ok(await countAll(/href="#source-booking"/gu) >= FROZEN.bookingLinks, 'кнопок заявки стало меньше');
});

test('поля форм на месте: дата, телефон, выбор способа связи', async () => {
  assert.ok(await countAll(/t-datepicker|data-field-type="da"/gu) >= FROZEN.dateMarkers, 'полей даты стало меньше');
  assert.ok(await countAll(/t-input-phonemask__wrap/gu) >= FROZEN.phoneWraps, 'полей телефона стало меньше');
  assert.ok(await countAll(/sposob-svyazy|forma-svyazi|messenger-type/gu) >= FROZEN.contactChoice, 'выбор способа связи стал реже');
});

test('локальный диалог заявки и сборщик форм не выпилены', async () => {
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.match(component, /source-booking__dialog/u, 'диалог заявки');
  assert.match(component, /data-local-source-form/u, 'разметка локальной формы');
  const generator = await read('_capture/build_source_snapshots.py');
  assert.match(generator, /def materialize_zero_forms/u, 'сборщик Zero-block-форм');
});

// Owner authorized optional dates on 2026-09-14; field counts above stay frozen.
test('native request forms retain their date field without requiring it', async () => {
  for (const name of ['PartyForm', 'PrebookingForm']) {
    const component = await read(`src/components/${name}.astro`);
    const fields = component.match(/<input\b[^>]*type="date"[^>]*>/gu) || [];
    assert.equal(fields.length, 1, `${name}: date field remains`);
    assert.ok(fields.every(field => !/\brequired\b/u.test(field)), `${name}: date is optional`);
  }
});
