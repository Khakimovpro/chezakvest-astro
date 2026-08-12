import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MATRIX = join(process.cwd(), 'migration', 'parity', 'visual-matrix.csv');
const THRESHOLD_NOTE = ' Итог порога не утверждается этой строкой: его дают только verdict и метрики R28.';

function normaliseRoute(value) {
  const raw = String(value || '').trim().replace(/[?#].*$/u, '');
  if (!raw || raw === '/') return '/';
  return '/' + raw.replace(/^\/+|\/+$/gu, '') + '/';
}

function setGroup(target, routes, text) {
  for (const route of routes) target.set(normaliseRoute(route), text + THRESHOLD_NOTE);
}

const captions = new Map();

setGroup(captions, [
  '/among_us/', '/beguschij_v_labirinte/', '/garri-potter-i-kubok-ognya/',
  '/hostel-podval-pytok/', '/igra_v_kalmara/', '/indiana/',
  '/kvest_v_realnosti_dom_prizrakov/', '/kvest_v_realnosti_fantom/',
  '/kvest_v_realnosti_garri_potter_/', '/kvest_v_realnosti_harry_potter_i_krestrazh/',
  '/kvest_v_realnosti_koralina/', '/kvest_v_realnosti_noch_v_museum_ograblenie/',
  '/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom/', '/kvest_v_realnosti_psihbolnitsa/',
  '/kvest_v_realnosti_sherlock_holms/', '/kvest_v_realnosti_wednesday/',
  '/kvest_v_realnosti_zamok_drakuly/', '/minecraft/', '/mystery_shack/',
  '/patologiya/', '/pirati/', '/pobeg/', '/pryatki_kids/', '/pryatki_portal/',
  '/pryatki_v_temnote/', '/puteshestvie/', '/roblox-dors/', '/roblox/',
  '/shizofreniya/', '/tekhasskaya-reznya-benzopiloj/', '/ugon/',
  '/wednesday-poteryannaya-dusha/', '/zvonok/',
], 'Общая ветка QuestPage с пустым sourceParity воспроизводит T396 booking: две строки и scheduler hint, высоты 300/260px (три измеренных desktop-варианта в данных), без clone-only phone/WhatsApp pills; PrebookingForm сохранён как документированная mask-замена внешнего календаря.');

setGroup(captions, [
  '/party-games/', '/portal-strike-kids/', '/portal-strike/', '/portal-zombie/',
], 'Data-gated vr-source ветка QuestPage рендерит T1196 feature rail, T396 booking, T121 related/scenario records и измеренные route seams; invented phone/WhatsApp/fallback-calendar controls отсутствуют только в этой ветке.');

setGroup(captions, ['/brawl_stars/'], 'Data-gated brawl-source ветка рендерит captured T265 feature strips, T1033 information и source-order 13-card non-rail T774 grid; generic PartyForm отсутствует только здесь.');
setGroup(captions, ['/kvest_v_realnosti_zapad/'], 'ZapadSourceArtboard, gated by zapad-source, рендерит 14 R27 source boundaries, обе visible alias records и source-order information/booking/callback stack; generic related cards и PartyForm отсутствуют только в этой ветке.');
setGroup(captions, ['/ono/'], 'Ono-only sourceParity blocks рендерят T347 video, T121 scenario rail и T396 two-hall artboard/navigation с captured geometry; shared qvenue не меняется для других routes.');

for (const [route, component] of Object.entries({
  '/amongus-land/': 'AmongUsArtboard',
  '/den-rozhdeniya-na-vr-arene/': 'VrBirthdayArtboard',
  '/den-rozhdeniya-uznik-azkabana/': 'AzkabanArtboard',
  '/igra-v-kalmara-lend/': 'KalmarLandingArtboard',
  '/kids/': 'KidsArtboard',
  '/minecraft-lend/': 'MinecraftArtboard',
  '/new-year/': 'NewYearArtboard',
  '/prazdnik-maxi/': 'MaxiArtboard',
  '/roblox-land/': 'RobloxArtboard',
  '/vypusknoj-kalmar/': 'VypusknojKalmarArtboard',
})) {
  setGroup(captions, [route], 'Route-gated ' + component + ' рендерит captured source record stack и local source assets; generic HolidayPage siblings suppressed only for this composition.');
}

setGroup(captions, ['/prazdniki-pod-kluch/'], 'Route-gated PodKluchArtboard, PodKluchGameGrid, PodKluchServices и PodKluchClosingArtboard рендерят captured source game/service/venue/review records и local collections.');
setGroup(captions, ['/strashnye-kvesty/'], 'HorrorCategoryArtboard, gated only for this category, рендерит 14 captured source boundaries: 13-card source-order grid, gallery, certificate, callback, venue and footer stack.');

setGroup(captions, [
  '/40letpobedy216/', '/guardeskypereulog61/', '/krasnormerskaya103/',
  '/mira27/', '/nagibina14/', '/nansena107/', '/socialicheskaya186/', '/sokolova23/',
], 'VenuePage uses page-data source game groups; venue-games fallback emits one nonduplicated inventory group instead of a copied remainder.');
setGroup(captions, ['/magnitogorskaya1/'], 'MagnitVenueHall is selected only for hall.layout=magnit-t396 and renders the captured photo-rail/detail-panel overlap and 1440/390 geometry; its source popup remains the documented working phone-action replacement.');
setGroup(captions, ['/contacts/'], 'InfoPage retains measured source contact-record order and omits clone-only conversion blocks; the visible telephone is the documented normalized call-tracking value.');
setGroup(captions, ['/privacy/'], 'Privacy uses exact source policy copy, repeated source tile and source order venues → local map → footer; LazyMap is the documented intentional local map replacement.');
setGroup(captions, ['/'], 'Root-only T604 promo and T395 tab records use captured source markers and 1440/390 geometry; slider capture normalization/order is unchanged.');
setGroup(captions, ['/new-year-2025/'], 'LegacyRedirectPage deliberately targets /new-year; this row records redirect behaviour, not a distinct source-layout threshold.');
setGroup(captions, ['/wednesday_ukradennaya_vesch/'], 'LegacyRedirectPage deliberately targets /wednesday-poteryannaya-dusha; this row records redirect behaviour, not a distinct source-layout threshold.');
setGroup(captions, ['/kvesty-v-rostove-na-donu/'], 'Astro-only catalogue is classified extra_clone; no live-source analogue or visual-parity pass is asserted.');

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
  return {
    headers,
    rows: body.filter((values) => values.some(Boolean))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function captionForRoute(route) {
  return captions.get(normaliseRoute(route)) || null;
}

function applyCaptions(rows) {
  return rows.map((row) => {
    const fixed = captionForRoute(row.url);
    if (!fixed) throw new Error('No factual fixed caption mapped for ' + row.url);
    return { ...row, fixed };
  });
}

async function main() {
  const matrix = csvRows(await readFile(MATRIX, 'utf8'));
  if (!matrix.headers.includes('fixed')) throw new Error('visual-matrix.csv has no fixed column');
  const rows = applyCaptions(matrix.rows);
  const output = matrix.headers.join(',') + '\n'
    + rows.map((row) => matrix.headers.map((header) => csvEscape(row[header])).join(',')).join('\n') + '\n';
  await writeFile(MATRIX, output);
  console.log(JSON.stringify({ routes: rows.length, captions: rows.filter((row) => row.fixed).length, output: 'migration/parity/visual-matrix.csv' }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

export { applyCaptions, captionForRoute, normaliseRoute };
