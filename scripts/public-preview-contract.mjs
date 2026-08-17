import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assertPublicPreview(root) {
  if (!root.includes('Чё за Квест')) {
    throw new Error('Public preview root does not contain the site content.');
  }

  for (const marker of ['type="password"', 'page.enc', 'czk-preview-key', 'crypto.subtle']) {
    if (root.includes(marker)) {
      throw new Error(`Public preview root retains password-loader marker: ${marker}`);
    }
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const root = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assertPublicPreview(root);
  console.log('Public preview contract passed: the root contains the site and no password loader.');
}
