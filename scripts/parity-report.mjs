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
const OUTPUT = join(PARITY_DIR, 'parity-report.html');
const MAX_REPORT_BYTES = 40 * 1024 * 1024;

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

function routeStatus(row) {
  if (row.verdict === 'redirect_ok') return `Legacy URL: permanent redirect to ${row.notes.replace(/^visual target\s*/u, '') || 'mapped target'}.`;
  if (row.visual_scope === 'extra_clone') return 'Astro-only route; it has no corresponding current live page.';
  if (row.verdict === 'pass') return 'Round capture passed the automated parity gates.';
  const diagnostics = [
    row.missing_sections && `sections: ${row.missing_sections}`,
    row.missing_texts && `text: ${row.missing_texts}`,
    row.missing_images && `images: ${row.missing_images}`,
    numeric(row.px_1440) !== null && numeric(row.px_1440) < 90 && `desktop pixels ${row.px_1440}%`,
    numeric(row.px_390) !== null && numeric(row.px_390) < 88 && `mobile pixels ${row.px_390}%`,
    numeric(row.overflow_390) > 0 && `mobile overflow ${row.overflow_390}px`,
    numeric(row.console_errors) > 0 && `console errors ${row.console_errors}`,
    numeric(row.failed_requests) > 0 && `failed requests ${row.failed_requests}`,
    numeric(row.external_requests) > 0 && `external requests ${row.external_requests}`,
  ].filter(Boolean);
  return diagnostics.length ? `Needs repair: ${diagnostics.join('; ')}.` : 'Needs repair: see the matrix diagnostics.';
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
  const [matrixText, knownGapsText, files] = await Promise.all([
    readFile(join(PARITY_DIR, 'visual-matrix.csv'), 'utf8'),
    readFile(join(PARITY_DIR, 'known-gaps.csv'), 'utf8'),
    readdir(SHOTS_DIR),
  ]);
  const rows = csvRows(matrixText).sort((left, right) => left.url.localeCompare(right.url, 'ru'));
  const knownGaps = csvRows(knownGapsText);
  const summary = buildSummary(rows);
  const pages = [];
  for (const row of rows) {
    const slug = routeSlug(row.url);
    const images = {};
    for (const viewport of ['1440', '390']) {
      const isMobile = viewport === '390';
      for (const side of ['original', 'clone']) {
        const screenshot = await newestScreenshot(files, `${slug}--r${ROUND}--${viewport}--${side}`);
        images[`${viewport}-${side}`] = await thumbnailDataUri(screenshot, isMobile);
      }
    }
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
        <div class="viewports">
          <section><h3>Desktop 1440 × 900</h3><div class="pair"><figure><figcaption>Original</figcaption>${imageCell(images['1440-original'], `${row.url} original desktop`)}</figure><figure><figcaption>Clone</figcaption>${imageCell(images['1440-clone'], `${row.url} clone desktop`)}</figure></div></section>
          <section><h3>Mobile 390 × 844</h3><div class="pair mobile"><figure><figcaption>Original</figcaption>${imageCell(images['390-original'], `${row.url} original mobile`)}</figure><figure><figcaption>Clone</figcaption>${imageCell(images['390-clone'], `${row.url} clone mobile`)}</figure></div></section>
        </div>
      </article>`);
  }
  const gapRows = knownGaps.map((gap) => `<tr><td>${esc(gap.url)}</td><td>${esc(gap.section)}</td><td>${esc(gap.что_не_так)}</td><td>${esc(gap.что_вместо)}</td></tr>`).join('');
  const number = (value, digits = 2) => value === null ? 'n/a' : Number(value).toFixed(digits);
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Parity audit · 2026-08-11</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#11131a;color:#e8edf7;font:14px/1.45 Inter,Arial,sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{font-size:17px;margin:0}h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#aab6cc;margin:18px 0 7px}.lede{color:#b7c2d7;margin:0 0 22px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:24px}.metric{background:#1b202c;border:1px solid #303a4e;border-radius:10px;padding:11px}.metric b{display:block;font-size:22px;color:#fff}.metric span{color:#aeb9cf}.route{background:#181d28;border:1px solid #30394b;border-radius:12px;padding:16px;margin:16px 0}.route header{display:flex;gap:12px;align-items:center;justify-content:space-between}.badge{border-radius:999px;padding:3px 9px;background:#29354a;color:#d8e4fb;font-size:12px;white-space:nowrap}.needs_fix .badge{background:#703537;color:#ffe0dc}.pass .badge{background:#265c44;color:#dcffea}.facts{color:#aeb9cc;font-size:12px;margin:7px 0}.status{margin:7px 0 0}.viewports{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}.pair.mobile{max-width:460px}figure{margin:0;background:#0f1219;border-radius:7px;padding:6px;min-width:0}figcaption{font-size:12px;color:#b5c0d5;padding:0 0 4px}img{display:block;max-width:100%;height:auto;border-radius:4px;background:#282e3c}.missing-shot{min-height:140px;display:grid;place-items:center;color:#ffb7ad;background:#302025;border-radius:4px;padding:12px;text-align:center}table{border-collapse:collapse;width:100%;background:#181d28;margin:12px 0 26px}th,td{text-align:left;vertical-align:top;padding:8px;border:1px solid #30394b}th{background:#242c3b}@media(max-width:820px){main{padding:16px}.viewports{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}h1{font-size:23px}}
</style></head><body><main>
<h1>Parity audit: чезаквест.рф → Astro</h1><p class="lede">Full route and viewport evidence, generated ${new Date().toISOString()} (round ${ROUND}). Full-resolution pairs remain locally in <code>migration/parity/shots/</code>; this portable report embeds compact self-contained copies.</p>
<section class="summary"><div class="metric"><b>${summary.total}</b><span>routes captured</span></div><div class="metric"><b>${summary.pass}</b><span>pass</span></div><div class="metric"><b>${summary.needsFix}</b><span>needs fix</span></div><div class="metric"><b>${summary.redirects}</b><span>redirects</span></div><div class="metric"><b>${number(summary.desktopMedian)}%</b><span>desktop median</span></div><div class="metric"><b>${number(summary.mobileMedian)}%</b><span>mobile median</span></div><div class="metric"><b>${summary.overflow}</b><span>mobile overflow px</span></div><div class="metric"><b>${summary.consoleErrors}/${summary.failedRequests}/${summary.externalRequests}</b><span>console / failed / external</span></div></section>
<h2>Intentional replacements</h2><table><thead><tr><th>URL</th><th>Section</th><th>Difference</th><th>Replacement</th></tr></thead><tbody>${gapRows}</tbody></table>
${pages.join('\n')}
</main></body></html>`;
  await writeFile(OUTPUT, html);
  const outputSize = (await stat(OUTPUT)).size;
  if (outputSize > MAX_REPORT_BYTES) throw new Error(`Self-contained report is ${(outputSize / 1024 / 1024).toFixed(2)} MB; limit is 40 MB.`);
  console.log(JSON.stringify({ output: 'migration/parity/parity-report.html', bytes: outputSize, megabytes: Number((outputSize / 1024 / 1024).toFixed(2)), routes: rows.length }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

export { buildSummary, csvRows, routeSlug };
