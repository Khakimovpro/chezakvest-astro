import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('materializes archived Zero Block form contracts as local semantic forms', async () => {
  for (const route of ['ono', 'puteshestvie', 'roblox']) {
    const snapshot = await read(`src/source-snapshots/${route}.html`);
    assert.ok((snapshot.match(/<form\b[^>]*data-local-source-form/gu) ?? []).length >= 2, route);
    assert.match(snapshot, /Даю согласие на\s*обработку моих персональных данных/iu, route);
    assert.match(snapshot, /Я\s*даю согласие на\s*обработку моих персональных данных/iu, route);
    assert.match(snapshot, />Жду звонка!</u, route);
  }
});

test('keeps the safe responsive replacements for T347 and T829 in the local runtime', async () => {
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.match(component, /const layoutT347 = \(record\) =>/u);
  assert.match(component, /540 \* columnWidth \/ 960/u);
  assert.match(component, /const layoutT829 = \(record\) =>/u);
  assert.match(component, /Math\.min\(5, items\.length\)/u);
  assert.match(component, /querySelectorAll\('\[data-record-type="347"\]'\)/u);
});
