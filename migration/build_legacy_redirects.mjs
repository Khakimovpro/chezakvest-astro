import { buildLegacyRedirectArtifacts } from './legacy-redirects.mjs';

const check = process.argv.includes('--check');
const report = await buildLegacyRedirectArtifacts({ check });

if (check) {
  if (report.stale.length > 0) {
    console.error('Legacy redirect artifacts are stale. Run: node migration/build_legacy_redirects.mjs');
    for (const filePath of report.stale) console.error(`- ${filePath}`);
    process.exitCode = 1;
  } else {
    console.log(`Legacy redirect artifacts are current: ${report.entries.length} URL records checked.`);
  }
} else {
  console.log(`Legacy redirect artifacts generated: ${report.entries.length} URL records, ${report.changed.length} file(s) changed.`);
}
