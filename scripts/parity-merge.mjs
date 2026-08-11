import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const PARITY_DIR = join(PROJECT_ROOT, 'migration', 'parity');
const ROUND = Number(process.env.PARITY_ROUND ?? '1');
const suffixes = process.argv.slice(2).filter(Boolean);

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
  if (cell || row.length) {
    row.push(cell.replace(/\r$/u, ''));
    rows.push(row);
  }
  const [headers = [], ...body] = rows;
  return {
    headers,
    rows: body.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
  };
}

function escape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  if (!suffixes.length) throw new Error('Provide one or more parity output suffixes to merge.');
  const parts = await Promise.all(suffixes.map(async (suffix) => {
    const [matrix, detail] = await Promise.all([
      readFile(join(PARITY_DIR, `visual-matrix-${suffix}.csv`), 'utf8'),
      readFile(join(PARITY_DIR, `round-${ROUND}-${suffix}`, 'visual-detail.json'), 'utf8'),
    ]);
    return { suffix, matrix: csvRows(matrix), detail: JSON.parse(detail) };
  }));
  const headers = parts[0].matrix.headers;
  const rows = parts.flatMap((part) => part.matrix.rows);
  const duplicate = rows.find((row, index) => rows.findIndex((candidate) => candidate.url === row.url) !== index);
  if (duplicate) throw new Error(`Duplicate visual row: ${duplicate.url}`);
  rows.sort((left, right) => left.url.localeCompare(right.url));
  const routes = Object.assign({}, ...parts.map((part) => part.detail.routes));
  if (Object.keys(routes).length !== rows.length) throw new Error('Visual detail and CSV route counts differ.');
  await mkdir(join(PARITY_DIR, `round-${ROUND}`), { recursive: true });
  await Promise.all([
    writeFile(join(PARITY_DIR, 'visual-matrix.csv'), `${headers.join(',')}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(',')).join('\n')}\n`),
    writeFile(join(PARITY_DIR, `round-${ROUND}`, 'visual-detail.json'), `${JSON.stringify({ generated_at: new Date().toISOString(), round: ROUND, routes }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ routes: rows.length, output: 'migration/parity/visual-matrix.csv' }, null, 2));
}

await main();
