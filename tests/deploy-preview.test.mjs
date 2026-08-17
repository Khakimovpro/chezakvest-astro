import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertPublicPreview } from '../scripts/public-preview-contract.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public preview is verified and published only by GitHub Actions', async () => {
  const [deploy, workflow, ciRequirements, packageJson] = await Promise.all([
    read('migration/deploy_preview.sh'),
    read('.github/workflows/deploy-preview.yml'),
    read('requirements-ci.txt'),
    read('package.json'),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(deploy, /gh workflow run deploy-preview\.yml/u);
  assert.doesNotMatch(deploy, /git push/u);
  assert.match(workflow, /name: Deploy public preview/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /timeout-minutes: 30/u);
  assert.match(workflow, /npm run ci/u);
  assert.match(workflow, /npm run verify:github-pages/u);
  assert.match(workflow, /PREVIEW_DEPLOY_KEY/u);
  assert.match(workflow, /rsync -a --delete --exclude \.git dist\/ preview-publication\//u);
  assert.match(workflow, /preview-publication\/\.preview-release/u);
  assert.match(workflow, /git -C preview-publication push origin HEAD:main/u);
  assert.match(workflow, /Verify GitHub Pages publication/u);
  assert.match(workflow, /curl --fail --silent --show-error/u);
  assert.doesNotMatch(workflow, /Preview already contains artifact for this revision\."\n\s+exit 0/u);
  assert.doesNotMatch(workflow, /encrypt_site|dist-enc|PREVIEW_PASSWORD|password/iu);
  assert.doesNotMatch(workflow, /push .*--force/u);
  assert.match(ciRequirements, /beautifulsoup4/u);
  assert.doesNotMatch(ciRequirements, /cryptography/u);
  assert.match(scripts['verify:github-pages'], /npm run verify:public-preview/u);
  assert.equal(scripts['verify:public-preview'], 'node scripts/public-preview-contract.mjs');
});

test('public preview contract rejects a password loader', () => {
  assert.throws(
    () => assertPublicPreview('<h1>Чё за Квест</h1><input type="password">'),
    /password-loader marker/u,
  );
});
