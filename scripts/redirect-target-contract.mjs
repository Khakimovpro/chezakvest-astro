import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLegacyUrlMap } from '../migration/legacy-redirects.mjs';

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function outputFileForRoute(distDir, route) {
  return route === '/' ? join(distDir, 'index.html') : join(distDir, route.slice(1), 'index.html');
}

/**
 * Ensures every redirect-map destination is an actual static route in the build.
 * This catches a valid-looking 301 map that would otherwise send traffic to a 404.
 */
export async function verifyRedirectTargets({ distDir = 'dist', entries } = {}) {
  const resolvedDistDir = isAbsolute(distDir) ? distDir : join(process.cwd(), distDir);
  const redirectEntries = entries ?? await loadLegacyUrlMap();
  const errors = [];

  for (const { source, target } of redirectEntries) {
    if (!await exists(outputFileForRoute(resolvedDistDir, target))) {
      errors.push(`${source}: redirect target ${target} is missing from dist`);
    }
  }

  return { targetsChecked: redirectEntries.length, errors };
}

async function main() {
  const report = await verifyRedirectTargets();
  if (report.errors.length > 0) {
    console.error(`Redirect target contract failed: ${report.errors.length} issue(s) across ${report.targetsChecked} URL records.`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Redirect target contract passed: ${report.targetsChecked} URL records checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
