import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIRECTORY = join(PROJECT_ROOT, 'src', 'data', 'pages');
const LEGACY_QUEST_SLUG = 'wednesday_ukradennaya_vesch';

// The mapping is verified against the source captures and venue pages. It is
// intentionally explicit: address normalization must never choose a venue.
export const EXPECTED_VENUE_SLUGS = {
  among_us: '40letpobedy216',
  beguschij_v_labirinte: '40letpobedy216',
  'garri-potter-i-kubok-ognya': '40letpobedy216',
  igra_v_kalmara: '40letpobedy216',
  minecraft: '40letpobedy216',
  ono: '40letpobedy216',
  'party-games': '40letpobedy216',
  patologiya: 'nansena107',
  pirati: 'nagibina14',
  pobeg: 'nagibina14',
  'portal-strike': '40letpobedy216',
  'portal-strike-kids': '40letpobedy216',
  'portal-zombie': '40letpobedy216',
  pryatki_kids: '40letpobedy216',
  pryatki_portal: '40letpobedy216',
  pryatki_v_temnote: '40letpobedy216',
  puteshestvie: 'nagibina14',
  roblox: '40letpobedy216',
  'roblox-dors': '40letpobedy216',
  shizofreniya: 'mira27',
  'tekhasskaya-reznya-benzopiloj': '40letpobedy216',
  ugon: 'nagibina14',
  'wednesday-poteryannaya-dusha': '40letpobedy216',
  wednesday_ukradennaya_vesch: '40letpobedy216',
  zvonok: '40letpobedy216',
  'kvest_v_realnosti_psihbolnitsa': 'guardeskypereulog61',
  'kvest_v_realnosti_sherlock_holms': 'guardeskypereulog61',
  'kvest_v_realnosti_zapad': 'guardeskypereulog61',
  'kvest_v_realnosti_koralina': 'krasnormerskaya103',
  'kvest_v_realnosti_wednesday': 'krasnormerskaya103',
  'kvest_v_realnosti_zamok_drakuly': 'krasnormerskaya103',
  'kvest_v_realnosti_fantom': 'krasnormerskaya103',
  brawl_stars: 'magnitogorskaya1',
  indiana: 'nagibina14',
  'mystery_shack': 'nagibina14',
  'hostel-podval-pytok': 'nansena107',
  'kvest_v_realnosti_ograblenie_banka_bumazhniy_dom': 'socialicheskaya186',
  'kvest_v_realnosti_garri_potter_': 'socialicheskaya186',
  'kvest_v_realnosti_dom_prizrakov': 'sokolova23',
  'kvest_v_realnosti_harry_potter_i_krestrazh': 'sokolova23',
  'kvest_v_realnosti_noch_v_museum_ograblenie': 'sokolova23',
};

export async function loadPageData(pagesDirectory = PAGES_DIRECTORY) {
  const filenames = (await readdir(pagesDirectory)).filter((filename) => filename.endsWith('.json'));
  return Promise.all(filenames.map(async (filename) => ({
    filename,
    page: JSON.parse(await readFile(join(pagesDirectory, filename), 'utf8')),
  })));
}

export async function auditCatalogData({ pagesDirectory = PAGES_DIRECTORY } = {}) {
  const records = await loadPageData(pagesDirectory);
  const pages = records.map((record) => record.page);
  const quests = pages.filter((page) => page.type === 'quest');
  const venues = new Set(pages.filter((page) => page.type === 'venue').map((page) => page.slug));
  const errors = [];

  if (quests.length !== 41) errors.push(`expected 41 quest records, found ${quests.length}`);
  if (Object.keys(EXPECTED_VENUE_SLUGS).length !== 41) {
    errors.push('expected venue mapping must contain exactly 41 quest records');
  }

  for (const quest of quests) {
    const expectedVenueSlug = EXPECTED_VENUE_SLUGS[quest.slug];
    if (!expectedVenueSlug) {
      errors.push(`${quest.slug}: missing explicit expected venueSlug mapping`);
      continue;
    }
    if (quest.venueSlug !== expectedVenueSlug) {
      errors.push(`${quest.slug}: venueSlug must be ${expectedVenueSlug}, found ${quest.venueSlug || 'missing'}`);
    }
    if (!venues.has(quest.venueSlug)) {
      errors.push(`${quest.slug}: venueSlug ${quest.venueSlug || 'missing'} has no venue page`);
    }
  }

  for (const slug of Object.keys(EXPECTED_VENUE_SLUGS)) {
    if (!quests.some((quest) => quest.slug === slug)) {
      errors.push(`${slug}: expected venue mapping has no quest record`);
    }
  }

  const canonicalCatalog = quests.filter((quest) => quest.slug !== LEGACY_QUEST_SLUG);
  if (canonicalCatalog.length !== 40) {
    errors.push(`expected 40 canonical catalogue records, found ${canonicalCatalog.length}`);
  }

  return {
    errors,
    questCount: quests.length,
    canonicalCatalogCount: canonicalCatalog.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await auditCatalogData();
  if (report.errors.length > 0) {
    console.error(`Catalog data audit failed: ${report.errors.length} issue(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Catalog data audit passed: ${report.questCount} quests, ${report.canonicalCatalogCount} canonical catalogue entries.`);
  }
}
