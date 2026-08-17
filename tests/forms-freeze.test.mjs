// Заморозка форм.
//
// Формы сознательно выведены из работы до отдельного решения владельца (какой канал доставки
// заявок). Пока это решение не принято, формы должны остаться ровно такими, какие есть: их
// нельзя ни удалять, ни «упрощать», ни выкидывать вместе с попапами ради чистой метрики —
// один раз на этом проекте уже потеряли карту, отзывы и мессенджеры именно так.
//
// Числа снизу — фактический замер на 17.08.2026. Тест падает, если чего-то стало МЕНЬШЕ.
// Стало больше — тоже сигнал: значит формы трогали, и это нужно осознать, а не проглядеть.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshotDir = new URL('../src/source-snapshots/', import.meta.url);

const countAll = async (pattern) => {
  const files = (await readdir(snapshotDir)).filter((name) => name.endsWith('.html'));
  let total = 0;
  for (const name of files) {
    const html = await readFile(new URL(name, snapshotDir), 'utf8');
    total += (html.match(pattern) ?? []).length;
  }
  return total;
};

// Замер 17.08.2026 на коммите 77af508.
const FROZEN = {
  forms: 308,
  popups: 231,
  bookingLinks: 622,
  dateMarkers: 484,
  phoneWraps: 322,
  contactChoice: 210,
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
