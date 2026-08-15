import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(1);

const PROJECT_ROOT = process.cwd();
const PARITY_DIR = join(PROJECT_ROOT, 'migration', 'parity');
const SHOTS_DIR = join(PARITY_DIR, 'shots');
const ROUND = Number(process.env.PARITY_ROUND ?? '9');
const MATRIX_FILE = process.env.PARITY_MATRIX ?? 'visual-matrix.csv';
const REPORT_DATE = process.env.PARITY_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const OUTPUT = join(PARITY_DIR, 'parity-report.html');
const MAX_REPORT_BYTES = 40 * 1024 * 1024;

if (!/^visual-matrix(?:-[a-z0-9_-]+)?\.csv$/iu.test(MATRIX_FILE)) {
  throw new Error(`Unsupported parity matrix filename: ${MATRIX_FILE}`);
}

function csvRows(text) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/u, '')]);
  const [headers = [], ...body] = rows;
  return body.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function routeSlug(route) {
  return route === '/' ? 'home' : route.replace(/^\/+|\/+$/gu, '').replaceAll('/', '__');
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function normaliseRoute(pathname) {
  const raw = String(pathname ?? '').trim();
  if (!raw) return '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Keep an opaque malformed pathname observable instead of making up a route.
  }
  const clean = decoded.replace(/\/+/gu, '/').replace(/[?#].*$/u, '');
  if (!clean || clean === '/') return '/';
  return `/${clean.replace(/^\/+|\/+$/gu, '')}/`;
}

function routeFromEvidenceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(?:data|javascript|mailto|tel):/iu.test(raw)) return '';
  try {
    return normaliseRoute(new URL(raw, 'https://parity-evidence.invalid').pathname);
  } catch {
    return raw.startsWith('/') ? normaliseRoute(raw) : '';
  }
}

function changedContentDrift(rows) {
  return rows
    .filter((row) => row.status && row.status !== 'unchanged')
    .map((row) => ({ ...row, route: routeFromEvidenceUrl(row.url) }))
    .sort((left, right) => left.url.localeCompare(right.url, 'ru'));
}

function measuredState(value, predicate) {
  const number = numeric(value);
  if (number === null) return 'info';
  return predicate(number) ? 'pass' : 'fail';
}

function zeroState(value) {
  const number = numeric(value);
  if (number === null) return 'info';
  return number === 0 ? 'pass' : 'fail';
}

function booleanState(value) {
  if (value === 'true') return 'pass';
  if (value === 'false') return 'fail';
  return 'info';
}

function ruleDiagnostics(row) {
  const sectionState = row.missing_sections ? 'fail' : 'pass';
  const textState = row.missing_texts ? 'fail' : 'pass';
  const imageState = row.missing_images ? 'fail' : 'pass';
  const present = (value, fallback) => String(value ?? '').trim() || fallback;
  return [
    { rule: 'Секции', value: `${present(row.sections_orig, 'n/a')} → ${present(row.sections_clone, 'n/a')}${row.missing_sections ? `; ${row.missing_sections}` : ''}`, state: sectionState },
    { rule: 'Тексты', value: row.missing_texts || 'Нет зафиксированных пропусков', state: textState },
    { rule: 'Изображения', value: row.missing_images || 'Нет зафиксированных пропусков', state: imageState },
    { rule: 'Пиксели desktop ≥ 90%', value: present(row.px_1440, 'n/a') === 'n/a' ? 'n/a' : `${row.px_1440}%`, state: measuredState(row.px_1440, (value) => value >= 90) },
    { rule: 'Пиксели mobile ≥ 88%', value: present(row.px_390, 'n/a') === 'n/a' ? 'n/a' : `${row.px_390}%`, state: measuredState(row.px_390, (value) => value >= 88) },
    { rule: 'Высота desktop ≤ 10%', value: present(row.height_delta_1440, 'n/a') === 'n/a' ? 'n/a' : `${row.height_delta_1440}%`, state: measuredState(row.height_delta_1440, (value) => value <= 10) },
    { rule: 'Высота mobile ≤ 10%', value: present(row.height_delta_390, 'n/a') === 'n/a' ? 'n/a' : `${row.height_delta_390}%`, state: measuredState(row.height_delta_390, (value) => value <= 10) },
    { rule: 'Mobile overflow = 0', value: present(row.overflow_390, 'n/a') === 'n/a' ? 'n/a' : `${row.overflow_390}px`, state: zeroState(row.overflow_390) },
    { rule: 'Console errors = 0', value: present(row.console_errors, 'n/a'), state: zeroState(row.console_errors) },
    { rule: 'Failed requests = 0', value: present(row.failed_requests, 'n/a'), state: zeroState(row.failed_requests) },
    { rule: 'External requests = 0', value: present(row.external_requests, 'n/a'), state: zeroState(row.external_requests) },
    { rule: 'Broken links = 0', value: present(row.broken_links, '0'), state: zeroState(row.broken_links || '0') },
    { rule: 'Missing image dimensions = 0', value: present(row.missing_img_dimensions, '0'), state: zeroState(row.missing_img_dimensions || '0') },
    { rule: 'First-screen lazy images = 0', value: present(row.first_screen_lazy, '0'), state: zeroState(row.first_screen_lazy || '0') },
    { rule: 'SEO match', value: present(row.seo_match, 'n/a'), state: booleanState(row.seo_match) },
    { rule: 'Порядок заголовков', value: present(row.headings_match, 'n/a'), state: booleanState(row.headings_match) },
    ...(row.notes ? [{ rule: 'Notes / metric masks', value: row.notes, state: 'info' }] : []),
  ];
}

function routeStatus(row) {
  if (row.verdict === 'redirect_ok') return `Legacy URL: permanent redirect to ${String(row.notes ?? '').replace(/^visual target\s*/u, '') || 'mapped target'}.`;
  if (row.visual_scope === 'extra_clone') return 'Astro-only route; it has no corresponding current live page.';
  if (row.verdict === 'pass') return 'Round capture passed the automated parity gates.';
  const diagnostics = [
    row.missing_sections && `sections: ${row.missing_sections}`,
    row.missing_texts && `text: ${row.missing_texts}`,
    row.missing_images && `images: ${row.missing_images}`,
    numeric(row.px_1440) !== null && numeric(row.px_1440) < 90 && `desktop pixels ${row.px_1440}%`,
    numeric(row.px_390) !== null && numeric(row.px_390) < 88 && `mobile pixels ${row.px_390}%`,
    numeric(row.height_delta_1440) !== null && numeric(row.height_delta_1440) > 10 && `desktop height delta ${row.height_delta_1440}%`,
    numeric(row.height_delta_390) !== null && numeric(row.height_delta_390) > 10 && `mobile height delta ${row.height_delta_390}%`,
    numeric(row.overflow_390) > 0 && `mobile overflow ${row.overflow_390}px`,
    numeric(row.console_errors) > 0 && `console errors ${row.console_errors}`,
    numeric(row.failed_requests) > 0 && `failed requests ${row.failed_requests}`,
    numeric(row.external_requests) > 0 && `external requests ${row.external_requests}`,
    row.seo_match === 'false' && 'SEO mismatch',
    row.headings_match === 'false' && 'heading order mismatch',
  ].filter(Boolean);
  return diagnostics.length ? `Needs repair: ${diagnostics.join('; ')}.` : 'Needs repair: see the matrix diagnostics.';
}

function valuesForRoute(rows, route) {
  return rows.filter((row) => routeFromEvidenceUrl(row.url) === route);
}

function changedFieldNames(row) {
  return String(row.changed_fields ?? '').split('|').map((field) => field.trim()).filter(Boolean);
}

function buildRouteCaption(row, knownGaps = [], contentDrift = []) {
  const route = routeFromEvidenceUrl(row.url);
  const gaps = valuesForRoute(knownGaps, route);
  const drift = contentDrift.filter((entry) => entry.route === route);
  const fixed = String(row.fixed ?? '').trim();
  return {
    problem: routeStatus(row),
    resolution: fixed
      ? `В поле fixed матрицы зафиксировано: ${fixed}.`
      : 'В поле fixed матрицы нет подтверждённого route-specific исправления; отчёт не делает такой вывод самостоятельно.',
    replacements: gaps.length
      ? gaps.map((gap) => `${gap.section || 'section'}: ${gap.что_не_так || 'difference'} → ${gap.что_вместо || 'replacement not stated'}`).join('; ')
      : 'Для этого маршрута нет отдельной строки сознательной замены в known-gaps.csv.',
    drift: drift.length
      ? drift.map((entry) => `status=${entry.status}; поля: ${changedFieldNames(entry).join(', ') || 'не указаны'}`).join('; ')
      : 'Изменения live-контента с момента съёма для этого маршрута не зафиксированы в content-drift.csv.',
  };
}

async function newestScreenshot(files, stem) {
  const candidates = files.filter((file) => file.startsWith(stem) && /\.(?:webp|jpe?g|png)$/iu.test(file));
  if (!candidates.length) return '';
  const ranked = await Promise.all(candidates.map(async (file) => ({ file, mtime: (await stat(join(SHOTS_DIR, file)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
  return ranked.sort((left, right) => right.mtime - left.mtime)[0].file;
}

async function thumbnailDataUri(filename, mobile) {
  if (!filename) return '';
  try {
    const image = sharp(join(SHOTS_DIR, filename));
    const buffer = await image
      .rotate()
      .resize({
        width: mobile ? 210 : 440,
        height: mobile ? 620 : 700,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 60, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function imageCell(dataUri, label) {
  if (!dataUri) return `<div class="missing-shot">Screenshot unavailable: ${esc(label)}</div>`;
  return `<img loading="lazy" alt="${esc(label)}" src="${dataUri}">`;
}

async function optionalCsv(filename) {
  try {
    return csvRows(await readFile(join(PARITY_DIR, filename), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function stateLabel(state) {
  if (state === 'pass') return 'pass';
  if (state === 'fail') return 'fail';
  return 'n/a';
}

function renderRuleDiagnostics(row) {
  const diagnostics = ruleDiagnostics(row);
  const failures = diagnostics.filter((item) => item.state === 'fail').length;
  const items = diagnostics.map((item) => `<div class="diagnostic ${item.state}"><dt>${esc(item.rule)}</dt><dd>${esc(item.value)} <span>${stateLabel(item.state)}</span></dd></div>`).join('');
  return `<details class="diagnostics"><summary>Посекционные и rule diagnostics: ${failures} fail</summary><dl>${items}</dl></details>`;
}

function renderCaption(caption) {
  return `<section class="caption"><dl>
    <div><dt>Что было не так</dt><dd>${esc(caption.problem)}</dd></div>
    <div><dt>Что исправлено / подтверждено</dt><dd>${esc(caption.resolution)}</dd></div>
    <div><dt>Сознательные замены</dt><dd>${esc(caption.replacements)}</dd></div>
    <div><dt>Свежесть live-контента</dt><dd>${esc(caption.drift)}</dd></div>
  </dl></section>`;
}

const DRIFT_FIELD_LABELS = {
  title: 'title',
  description: 'description',
  h1: 'H1',
};

function renderDriftValues(row) {
  const fields = changedFieldNames(row);
  if (!fields.length) return 'Для этого статуса сравнимые поля не перечислены.';
  return `<details><summary>Показать предыдущее → текущее значение</summary>${fields.map((field) => {
    const previous = row[`previous_${field}`] || '—';
    const current = row[`current_${field}`] || '—';
    return `<p><b>${esc(DRIFT_FIELD_LABELS[field] || field)}</b><br><del>${esc(previous)}</del><br><ins>${esc(current)}</ins></p>`;
  }).join('')}</details>`;
}

function renderContentDriftRows(drift) {
  if (!drift.length) return '<tr><td colspan="5">В доступном content-drift.csv нет строк со статусом, отличным от unchanged.</td></tr>';
  return drift.map((row) => `<tr><td>${esc(row.url)}</td><td>${esc(row.route || 'нет clone-route')}</td><td>${esc(row.status)}</td><td>${esc(changedFieldNames(row).join(', ') || '—')}</td><td>${renderDriftValues(row)}<small>${esc(row.previous_last_modified || '—')} → ${esc(row.current_last_modified || '—')}</small></td></tr>`).join('');
}

function renderKnownGapRows(knownGaps) {
  if (!knownGaps.length) return '<tr><td colspan="5">known-gaps.csv отсутствует или не содержит строк.</td></tr>';
  return knownGaps.map((gap) => `<tr><td>${esc(gap.url)}</td><td>${esc(gap.section)}</td><td>${esc(gap.что_не_так)}</td><td>${esc(gap.почему_нельзя)}</td><td>${esc(gap.что_вместо)}</td></tr>`).join('');
}

function buildSummary(rows) {
  const counts = rows.reduce((result, row) => ({ ...result, [row.verdict]: (result[row.verdict] ?? 0) + 1 }), {});
  return {
    total: rows.length,
    pass: counts.pass ?? 0,
    needsFix: counts.needs_fix ?? 0,
    redirects: counts.redirect_ok ?? 0,
    extras: counts.extra_clone ?? 0,
    desktopMedian: median(rows.filter((row) => row.visual_scope === 'page').map((row) => numeric(row.px_1440))),
    mobileMedian: median(rows.filter((row) => row.visual_scope === 'page').map((row) => numeric(row.px_390))),
    overflow: rows.reduce((sum, row) => sum + (numeric(row.overflow_390) ?? 0), 0),
    consoleErrors: rows.reduce((sum, row) => sum + (numeric(row.console_errors) ?? 0), 0),
    failedRequests: rows.reduce((sum, row) => sum + (numeric(row.failed_requests) ?? 0), 0),
    externalRequests: rows.reduce((sum, row) => sum + (numeric(row.external_requests) ?? 0), 0),
  };
}

async function main() {
  const [matrixText, knownGaps, contentDriftRows, files] = await Promise.all([
    readFile(join(PARITY_DIR, MATRIX_FILE), 'utf8'),
    optionalCsv('known-gaps.csv'),
    optionalCsv('content-drift.csv'),
    readdir(SHOTS_DIR).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }),
  ]);
  const rows = csvRows(matrixText).sort((left, right) => left.url.localeCompare(right.url, 'ru'));
  if (!rows.length) throw new Error(`${MATRIX_FILE} has no route rows; refusing to make an evidence report.`);
  const summary = buildSummary(rows);
  const contentDrift = changedContentDrift(contentDriftRows);
  const pages = [];
  const missingPairs = [];
  let embeddedScreenshots = 0;
  for (const row of rows) {
    const slug = routeSlug(row.url);
    const images = {};
    for (const viewport of ['1440', '390']) {
      const isMobile = viewport === '390';
      for (const side of ['original', 'clone']) {
        const screenshot = await newestScreenshot(files, `${slug}--r${ROUND}--${viewport}--${side}`);
        const image = await thumbnailDataUri(screenshot, isMobile);
        const key = `${viewport}-${side}`;
        images[key] = image;
        if (!image) missingPairs.push(`${row.url} ${viewport} ${side}`);
        else embeddedScreenshots += 1;
      }
    }
    const caption = buildRouteCaption(row, knownGaps, contentDrift);
    const facts = [
      `sections ${esc(row.sections_orig)} → ${esc(row.sections_clone)}`,
      `pixels ${esc(row.px_1440)}% / ${esc(row.px_390)}%`,
      `heights ${esc(row.h_orig_1440)}→${esc(row.h_clone_1440)} / ${esc(row.h_orig_390)}→${esc(row.h_clone_390)}`,
      `overflow ${esc(row.overflow_390)}px`,
      `errors ${esc(row.console_errors)}, failed ${esc(row.failed_requests)}, external ${esc(row.external_requests)}`,
    ].join(' · ');
    pages.push(`
      <article class="route ${esc(row.verdict)}">
        <header><h2>${esc(row.url)}</h2><span class="badge">${esc(row.verdict)}</span></header>
        <p class="facts">${facts}</p>
        <p class="status">${esc(routeStatus(row))}</p>
        ${renderCaption(caption)}
        ${renderRuleDiagnostics(row)}
        <div class="viewports">
          <section><h3>Desktop 1440 × 900</h3><div class="pair"><figure><figcaption>Original</figcaption>${imageCell(images['1440-original'], `${row.url} original desktop`)}</figure><figure><figcaption>Clone</figcaption>${imageCell(images['1440-clone'], `${row.url} clone desktop`)}</figure></div></section>
          <section><h3>Mobile 390 × 844</h3><div class="pair mobile"><figure><figcaption>Original</figcaption>${imageCell(images['390-original'], `${row.url} original mobile`)}</figure><figure><figcaption>Clone</figcaption>${imageCell(images['390-clone'], `${row.url} clone mobile`)}</figure></div></section>
        </div>
      </article>`);
  }
  if (missingPairs.length) {
    const preview = missingPairs.slice(0, 12).join(', ');
    const remainder = missingPairs.length > 12 ? ` (+${missingPairs.length - 12} more)` : '';
    throw new Error(`Required original/clone screenshot evidence is missing or unreadable for round ${ROUND}: ${preview}${remainder}`);
  }
  const gapRows = renderKnownGapRows(knownGaps);
  const driftRows = renderContentDriftRows(contentDrift);
  const number = (value, digits = 2) => value === null ? 'n/a' : Number(value).toFixed(digits);
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Parity audit · ${esc(REPORT_DATE)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#11131a;color:#e8edf7;font:14px/1.45 Inter,Arial,sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{font-size:17px;margin:0}h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#aab6cc;margin:18px 0 7px}.lede{color:#b7c2d7;margin:0 0 22px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:24px}.metric{background:#1b202c;border:1px solid #303a4e;border-radius:10px;padding:11px}.metric b{display:block;font-size:22px;color:#fff}.metric span{color:#aeb9cf}.route{background:#181d28;border:1px solid #30394b;border-radius:12px;padding:16px;margin:16px 0}.route header{display:flex;gap:12px;align-items:center;justify-content:space-between}.badge{border-radius:999px;padding:3px 9px;background:#29354a;color:#d8e4fb;font-size:12px;white-space:nowrap}.needs_fix .badge{background:#703537;color:#ffe0dc}.pass .badge{background:#265c44;color:#dcffea}.facts{color:#aeb9cc;font-size:12px;margin:7px 0}.status{margin:7px 0 0}.caption{margin:12px 0;padding:10px;background:#111722;border-left:3px solid #596b88}.caption dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 16px;margin:0}.caption dt{font-weight:700;color:#cbd7eb}.caption dd{margin:2px 0 0;color:#b7c2d7;overflow-wrap:anywhere}.diagnostics{margin:12px 0;background:#111722;border:1px solid #30394b;border-radius:7px;padding:8px}.diagnostics summary{cursor:pointer;color:#d5e2f9}.diagnostics dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;margin:8px 0 0}.diagnostic{padding:6px 8px;border-top:1px solid #283146}.diagnostic dt{font-weight:600}.diagnostic dd{margin:2px 0 0;color:#b5c0d5;overflow-wrap:anywhere}.diagnostic span{display:inline-block;margin-left:4px;border-radius:999px;padding:1px 5px;background:#30394b;color:#dce7fb;font-size:10px}.diagnostic.fail span{background:#703537;color:#ffe0dc}.diagnostic.pass span{background:#265c44;color:#dcffea}.viewports{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}.pair.mobile{max-width:460px}figure{margin:0;background:#0f1219;border-radius:7px;padding:6px;min-width:0}figcaption{font-size:12px;color:#b5c0d5;padding:0 0 4px}img{display:block;max-width:100%;height:auto;border-radius:4px;background:#282e3c}.missing-shot{min-height:140px;display:grid;place-items:center;color:#ffb7ad;background:#302025;border-radius:4px;padding:12px;text-align:center}table{border-collapse:collapse;width:100%;background:#181d28;margin:12px 0 26px}th,td{text-align:left;vertical-align:top;padding:8px;border:1px solid #30394b;overflow-wrap:anywhere}th{background:#242c3b}small{display:block;color:#aeb9cc;margin-top:6px}del{color:#ffb7ad}ins{color:#c6f5d4}@media(max-width:820px){main{padding:16px}.viewports{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.caption dl,.diagnostics dl{grid-template-columns:1fr}h1{font-size:23px}}
</style></head><body><main>
<h1>Parity audit: чезаквест.рф → Astro</h1><p class="lede">Полное evidence по маршрутам и вьюпортам, сгенерировано ${new Date().toISOString()} (round ${ROUND}). В отчёт встроены компактные self-contained копии всех обязательных пар; полноразмерные файлы остаются в <code>migration/parity/shots/</code>.</p>
<section class="summary"><div class="metric"><b>${summary.total}</b><span>маршрутов</span></div><div class="metric"><b>${embeddedScreenshots}</b><span>встроенных снимков</span></div><div class="metric"><b>${summary.pass}</b><span>pass</span></div><div class="metric"><b>${summary.needsFix}</b><span>needs fix</span></div><div class="metric"><b>${summary.redirects}</b><span>redirects</span></div><div class="metric"><b>${number(summary.desktopMedian)}%</b><span>медиана desktop</span></div><div class="metric"><b>${number(summary.mobileMedian)}%</b><span>медиана mobile</span></div><div class="metric"><b>${summary.overflow}</b><span>mobile overflow px</span></div><div class="metric"><b>${summary.consoleErrors}/${summary.failedRequests}/${summary.externalRequests}</b><span>console / failed / external</span></div></section>
<h2>Сайт изменился с момента съёма</h2><table><thead><tr><th>Оригинальный URL</th><th>Clone route</th><th>Статус</th><th>Поля</th><th>Предыдущее → текущее</th></tr></thead><tbody>${driftRows}</tbody></table>
<h2>Сознательные замены: exact registry</h2><table><thead><tr><th>URL</th><th>Секция</th><th>Что не так</th><th>Почему нельзя</th><th>Что вместо</th></tr></thead><tbody>${gapRows}</tbody></table>
${pages.join('\n')}
</main></body></html>`;
  const outputSize = Buffer.byteLength(html);
  if (outputSize > MAX_REPORT_BYTES) throw new Error(`Self-contained report is ${(outputSize / 1024 / 1024).toFixed(2)} MB; limit is 40 MB.`);
  await writeFile(OUTPUT, html);
  console.log(JSON.stringify({ output: 'migration/parity/parity-report.html', bytes: outputSize, megabytes: Number((outputSize / 1024 / 1024).toFixed(2)), routes: rows.length, embedded_screenshots: embeddedScreenshots, content_drift_rows: contentDrift.length }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

export {
  buildRouteCaption,
  buildSummary,
  changedContentDrift,
  csvRows,
  routeFromEvidenceUrl,
  routeSlug,
  ruleDiagnostics,
};
