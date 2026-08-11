import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('privacy repeats the exact Tilda policy background without global scaling', async () => {
  const page = await read('src/pages/privacy.astro');
  const asset = '/assets/static.tildacdn.com/tild3463-3931-4833-b565-346437376365/_GPT_light.png';

  assert.match(page, /<style is:inline>\{`[\s\S]*body\.privacy-page-body\s*\{[\s\S]*url\('\$\{base\}\/assets\/static\.tildacdn\.com\/tild3463-3931-4833-b565-346437376365\/_GPT_light\.png'\)[\s\S]*background-repeat:\s*repeat;[\s\S]*background-size:\s*auto;[\s\S]*background-position:\s*center;/u);
  assert.match(page, /url\('\$\{base\}\/assets\/fonts\.gstatic\.com\/s\/nunito\/v32\/XRXV3I6Li01BKofIMeaBXso\.woff2'\)/u);
  await access(resolve(process.cwd(), 'public', asset.slice(1)));
  const header = await readFile(resolve(process.cwd(), 'public', asset.slice(1)));
  assert.deepEqual([...header.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
