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
  assert.match(component, /sourceAuthoredHeight/u);
  assert.match(component, /540 \* columnWidth \/ 960/u);
  assert.match(component, /const layoutT829 = \(record\) =>/u);
  assert.match(component, /Math\.min\(5, items\.length\)/u);
  assert.match(component, /querySelectorAll\('\[data-record-type="347"\]'\)/u);
});

test('recreates specialised slider geometry and deterministic parity capture state', async () => {
  const [component, parity] = await Promise.all([
    read('src/components/SourceSnapshotBody.astro'),
    read('scripts/parity-visual.mjs'),
  ]);
  assert.match(component, /const isT923 =/u);
  assert.match(component, /sliderItemsInRow/u);
  assert.match(component, /data-slider-image-height/u);
  assert.match(component, /const layoutT799 =/u);
  assert.match(component, /nlm095_900789451451 \.t552__tile_33/u);
  assert.match(component, /height: 450px !important/u);
  assert.match(parity, /async function normaliseTildaSliders/u);
  assert.match(parity, /wrapper\.dataset\.sliderStopped = 'true'/u);
  assert.match(parity, /async function normaliseT552Marquees/u);
  assert.match(parity, /async function captureWithFreshBrowser/u);
  assert.match(parity, /--disable-dev-shm-usage/u);
  assert.match(parity, /process\.env\.PARITY_RESUME === '1'/u);
  assert.match(parity, /PARITY_RECAPTURE_ROUTES requires PARITY_RESUME=1/u);
  assert.match(parity, /matrix = matrix\.filter\(\(row\) => !recaptureSet\.has\(row\.url\)\)/u);
  assert.match(parity, /visual-checkpoint\.json/u);
  assert.match(parity, /async function startLocalDistServer/u);
  assert.match(parity, /PARITY_SERVE_DIST requires a loopback/u);
  assert.match(parity, /await stopLocalDistServer\(localServer\)/u);
});

test('uses archived textarea schemas and hidden fields when materializing Zero Block forms', async () => {
  const generator = await read('_capture/build_source_snapshots.py');
  assert.match(generator, /\.tn-atom__inputs-textarea/u);
  assert.match(generator, /field_type == "hd"/u);
  assert.match(generator, /"type": "hidden"/u);
});

test('materializes responsive T396 geometry from the active source breakpoint', async () => {
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.match(component, /const geometry = elementGeometry\(element\);/u);
  assert.match(component, /responsiveAttribute\(element, 'field-heightmode'\)/u);
  assert.match(component, /axisPosition\(geometry\.axisX, geometry\.left, geometry\.width, boundary\)/u);
  assert.match(component, /heightMode !== 'hug'/u);
});

test('maps archived popup and broken relative links to local working targets', async () => {
  const generator = await read('_capture/build_source_snapshots.py');
  assert.match(generator, /"#openquiz": "#source-booking"/u);
  assert.match(generator, /"#sendzeroform": "#source-booking"/u);
  assert.match(generator, /"#menuopen": "#mobile-menu"/u);
  assert.match(generator, /"kvest_v_realnosti_dom_prizrakov": "\/kvest_v_realnosti_dom_prizrakov\/"/u);
});

test('audits rendered text ranges and restores local forms after submit probes', async () => {
  const audit = await read('scripts/quick-width-audit.mjs');
  assert.match(audit, /NodeFilter\.SHOW_TEXT/u);
  assert.match(audit, /range\.getClientRects\(\)/u);
  assert.match(audit, /\[data-lead-submit\]/u);
  assert.match(audit, /delete form\.dataset\.submitted/u);
  assert.match(audit, /element\.toggleAttribute\('hidden', hidden\)/u);
});
