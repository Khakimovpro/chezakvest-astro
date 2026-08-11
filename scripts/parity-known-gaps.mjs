import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const PARITY_DIR = join(PROJECT_ROOT, 'migration', 'parity');
const HEADERS = ['url', 'section', 'что_не_так', 'почему_нельзя', 'что_вместо'];

const REPLACEMENTS = {
  booking: {
    section: 'Tilda booking / lead widget (controlled capture)',
    issue: 'Live использует удалённый календарь или lead-widget; его состояние и служебный текст зависят от внешнего сервиса.',
    reason: 'Статический clone обязан работать без внешних запросов и не может воспроизводить нестабильный удалённый интерфейс.',
    replacement: 'Локальная PrebookingForm или PartyForm с тем же действием заявки.',
  },
  map: {
    section: 'Tilda map (controlled capture)',
    issue: 'Live встраивает интерактивную стороннюю карту.',
    reason: 'Сторонняя карта нарушает zero-external-requests и даёт недетерминированный результат.',
    replacement: 'Локальная LazyMap с явной активацией пользователем.',
  },
  reviews: {
    section: 'Tilda reviews widget (controlled capture)',
    issue: 'Live reviews-widget получает внешние данные и меняет состав/порядок карточек.',
    reason: 'Внешний виджет не допускается в статическом clone и не имеет стабильного снимка.',
    replacement: 'Локальный snapshot отзывов без внешних запросов.',
  },
};

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
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/u, '')]);
  const [headers = [], ...body] = rows;
  return body.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function escape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function masksFromNotes(notes) {
  const match = String(notes ?? '').match(/(?:^|;\s*)metric masks:\s*([^;]+)/iu);
  if (!match) return [];
  return [...new Set(match[1].split(',').map((value) => value.trim()).filter((value) => Object.hasOwn(REPLACEMENTS, value)))].sort();
}

function gapRows(matrix) {
  return matrix
    .filter((row) => row.visual_scope === 'page')
    .flatMap((row) => masksFromNotes(row.notes).map((kind) => ({ url: row.url, ...REPLACEMENTS[kind] })))
    .map(({ url, section, issue, reason, replacement }) => ({
      url,
      section,
      что_не_так: issue,
      почему_нельзя: reason,
      что_вместо: replacement,
    }))
    .sort((left, right) => left.url.localeCompare(right.url, 'ru') || left.section.localeCompare(right.section, 'ru'));
}

async function main() {
  const matrix = csvRows(await readFile(join(PARITY_DIR, 'visual-matrix.csv'), 'utf8'));
  const rows = gapRows(matrix);
  await writeFile(join(PARITY_DIR, 'known-gaps.csv'), `${HEADERS.join(',')}\n${rows.map((row) => HEADERS.map((header) => escape(row[header])).join(',')).join('\n')}\n`);
  console.log(JSON.stringify({ routes: new Set(rows.map((row) => row.url)).size, rows: rows.length, output: 'migration/parity/known-gaps.csv' }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

export { csvRows, gapRows, masksFromNotes };
