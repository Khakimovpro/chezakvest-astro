import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync, webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const PASSWORD = 'fixture-password';
const ITERATIONS = 250_000;
const STORE = 'czk-preview-key';
const WEEK = 7 * 24 * 60 * 60 * 1000;

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function decryptEmbeddedPage(loader) {
  const salt = loader.match(/const SALT_B64 = "([^"]+)";/u)?.[1];
  const cipher = loader.match(/<script id="d" type="text\/plain">([^<]+)<\/script>/u)?.[1];
  assert.ok(salt, 'loader must expose its PBKDF2 salt');
  assert.ok(cipher, 'loader must embed the encrypted page');

  const raw = Buffer.from(cipher, 'base64');
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(-16);
  const encrypted = raw.subarray(12, -16);
  const key = pbkdf2Sync(PASSWORD, Buffer.from(salt, 'base64'), ITERATIONS, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

class MemoryStorage {
  #values;

  constructor(entries = []) {
    this.#values = new Map(entries);
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  entries() {
    return [...this.#values.entries()];
  }
}

class MemoryCookieJar {
  #values;

  constructor(entries = []) {
    this.#values = new Map(entries);
  }

  get value() {
    return [...this.#values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  set(serialized) {
    const [pair, ...attributes] = String(serialized).split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator < 1) return;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (attributes.some((attribute) => /^max-age=0$/iu.test(attribute))) {
      this.#values.delete(name);
      return;
    }
    this.#values.set(name, value);
  }

  get(name) {
    return this.#values.get(name) ?? null;
  }

  entries() {
    return [...this.#values.entries()];
  }
}

function loaderScript(loader) {
  const script = loader.match(/<script>\n([\s\S]*?)\n<\/script>/u)?.[1];
  assert.ok(script, 'loader must contain executable JavaScript');
  return script;
}

async function eventually(check, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

function assertRollingWeek(exp, message) {
  const remaining = exp - Date.now();
  assert.ok(remaining >= WEEK - 5_000, `${message}: expiry must be no sooner than seven days`);
  assert.ok(remaining <= WEEK + 5_000, `${message}: expiry must be no later than seven days`);
}

function runLoader(loader, { cookies = new MemoryCookieJar(), localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage(), search = '', readyState = 'complete' } = {}) {
  const listeners = new Map();
  const formListeners = new Map();
  const elements = {
    b: { disabled: false },
    d: { textContent: loader.match(/<script id="d" type="text\/plain">([\s\S]*?)<\/script>/u)?.[1] ?? '' },
    e: { textContent: '' },
    f: { addEventListener(type, listener) { formListeners.set(type, listener); } },
    p: { value: '', focus() {} },
  };
  const writes = [];
  const requests = [];
  const document = {
    readyState,
    documentElement: { className: '' },
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    close() {},
    getElementById(id) { return elements[id] ?? null; },
    open() {},
    querySelectorAll() { return []; },
    write(html) { writes.push(html); },
    get cookie() { return cookies.value; },
    set cookie(value) { cookies.set(value); },
  };
  const context = {
    Blob,
    TextDecoder,
    TextEncoder,
    URL,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    crypto: webcrypto,
    document,
    cookies,
    fetch: async (url) => {
      requests.push(String(url));
      throw new Error(`Unexpected fetch: ${url}`);
    },
    localStorage,
    location: { search },
    sessionStorage,
  };
  context.window = context;
  const execution = vm.runInNewContext(loaderScript(loader), context, { timeout: 10_000 });
  let executionError;
  if (execution && typeof execution.catch === 'function') execution.catch((error) => { executionError = error; });

  return {
    document,
    elements,
    executionError: () => executionError,
    localStorage,
    requests,
    sessionStorage,
    writes,
    async finishParsing() {
      await eventually(
        () => {
          assert.equal(writes.length, 0, 'cached access must not replace the document before DOMContentLoaded');
          return listeners.has('DOMContentLoaded') || executionError;
        },
        'cached access did not wait for document parsing',
      );
      assert.equal(executionError, undefined, 'loader should not reject before DOMContentLoaded');
      assert.ok(listeners.has('DOMContentLoaded'), 'cached access must register a DOMContentLoaded listener');
      assert.equal(writes.length, 0, 'cached access must wait for DOMContentLoaded before writing');
      document.readyState = 'interactive';
      for (const listener of listeners.get('DOMContentLoaded') ?? []) listener();
      await eventually(() => writes.length > 0 || executionError, 'cached access did not render after DOMContentLoaded');
      assert.equal(executionError, undefined, 'loader should not reject while rendering cached access');
    },
    async submit(password) {
      const listener = formListeners.get('submit');
      assert.ok(listener, 'password form must register a submit handler');
      elements.p.value = password;
      await listener({ preventDefault() {} });
      assert.equal(executionError, undefined, 'loader should not reject after form submission');
    },
  };
}

test('encrypted preview embeds pages, preserves icons, and executes the seven-day access flow', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-preview-encryption-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, 'source');
  const output = join(root, 'encrypted');
  const redeployed = join(root, 'redeployed');
  const pages = ['one', 'two', 'three', 'four', 'five'];
  await mkdir(source, { recursive: true });
  await Promise.all(pages.map(async (name) => {
    const directory = join(source, name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), `<!doctype html><title>${name}</title><p>${name}</p>`);
  }));
  await writeFile(join(source, 'index.html'), `<!doctype html>
<html><head><title>Root preview</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 24x24 32x32 64x64">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="152x152">
  <link rel="preload" as="image" href="/photo.webp">
</head><body><img src="/photo.webp"></body></html>`);
  await writeFile(join(source, 'favicon.ico'), Buffer.from('ico'));
  await writeFile(join(source, 'apple-touch-icon.png'), Buffer.from('apple'));
  await writeFile(join(source, 'mstile-270x270.png'), Buffer.from('tile'));
  await writeFile(join(source, 'photo.webp'), Buffer.from('photo'));

  for (const destination of [output, redeployed]) {
    execFileSync('python3', [
      '_capture/encrypt_site.py', '--password-stdin',
      '--src', source,
      '--out', destination,
      '--base', '/preview',
    ], { encoding: 'utf8', input: `${PASSWORD}\n` });
  }

  for (const asset of ['favicon.ico', 'apple-touch-icon.png', 'mstile-270x270.png']) {
    assert.equal(await isFile(join(output, asset)), true, `${asset} must remain available before unlock`);
    assert.equal(await isFile(join(output, `${asset}.enc`)), false, `${asset} must not be encrypted`);
  }
  assert.equal(await isFile(join(output, 'photo.webp.enc')), true, 'ordinary images remain encrypted');
  assert.equal(await isFile(join(output, 'page.enc')), false, 'the root page must not need a second request');
  assert.equal(await isFile(join(output, 'one', 'page.enc')), false, 'nested pages must not need a second request');

  const loader = await readFile(join(output, 'index.html'), 'utf8');
  const nestedLoader = await readFile(join(output, 'one', 'index.html'), 'utf8');
  assert.match(loader, /\.box\{display:none/u, 'the password box should start hidden');
  assert.match(loader, /html\.ask \.box\{display:block\}/u, 'the password box should appear only when access is absent');
  assert.match(loader, /href="\/preview\/favicon\.ico"/u, 'the root loader must use the preview root for favicon URLs');
  assert.match(nestedLoader, /href="\/preview\/favicon\.ico"/u, 'nested loaders must not resolve favicon URLs relative to their page');
  assert.match(loader, /const STORE_PATH = "\/preview\/";/u, 'the seven-day credential must be scoped to the preview path');
  assert.match(loader, /SameSite=Strict; Secure/u, 'the browser credential must not be a broad cross-site cookie');
  assert.doesNotMatch(loader, /localStorage\.setItem\(STORE/u, 'the loader must not persist a plaintext-capable vault in origin-wide storage');
  const decrypted = decryptEmbeddedPage(loader);
  assert.match(decrypted, /sizes="16x16 24x24 32x32 64x64"/u, 'icon sizes must survive HTML rewriting');
  assert.match(decrypted, /sizes="152x152"/u, 'apple icon sizes must survive HTML rewriting');
  assert.doesNotMatch(decrypted, /rel="preload" as="image"/u, 'image preloads must not request encrypted assets before unlock');
  assert.match(decrypted, /data-enc="\/preview\/photo\.webp\.enc"/u, 'ordinary images must point to encrypted assets');

  const cookies = new MemoryCookieJar();
  const firstVisit = runLoader(loader, { cookies });
  await eventually(() => firstVisit.document.documentElement.className === 'ask', 'a fresh visitor must see the password form');
  await firstVisit.submit('wrong-password');
  assert.equal(firstVisit.elements.e.textContent, 'Неверный пароль', 'a wrong password should show an error');
  assert.equal(cookies.get(STORE), null, 'a wrong password must not create a vault');
  await firstVisit.submit(PASSWORD);
  await eventually(() => firstVisit.writes.length === 1, 'a correct password must render the encrypted page');
  assert.match(firstVisit.writes[0], /<title>Root preview<\/title>/u, 'the correct password must decrypt the page');
  const firstVault = JSON.parse(decodeURIComponent(cookies.get(STORE)));
  assert.equal(Buffer.from(firstVault.k, 'base64').length, 32, 'the vault must store the ready AES key');
  assert.equal('p' in firstVault, false, 'the vault must never persist the plaintext password');
  assertRollingWeek(firstVault.exp, 'the first vault');
  assert.equal(firstVisit.requests.filter((url) => url.endsWith('page.enc')).length, 0, 'unlock must not request page.enc');

  const obsoleteStorage = new MemoryStorage([[STORE, JSON.stringify({ ...firstVault, p: PASSWORD })]]);
  const afterLegacyStorage = runLoader(loader, { localStorage: obsoleteStorage });
  await eventually(() => afterLegacyStorage.document.documentElement.className === 'ask', 'a former localStorage vault must not unlock the new loader');
  assert.equal(obsoleteStorage.getItem(STORE), null, 'the loader must remove the old origin-wide vault');

  const migratedCookies = new MemoryCookieJar();
  const legacySession = new MemoryStorage([['czk-preview-pass', PASSWORD]]);
  const migrated = runLoader(loader, { cookies: migratedCookies, sessionStorage: legacySession });
  await eventually(() => migrated.writes.length === 1, 'legacy session access must migrate to the vault');
  assert.equal(legacySession.getItem('czk-preview-pass'), null, 'a successful migration must retire the legacy session password');
  const migratedVault = JSON.parse(decodeURIComponent(migratedCookies.get(STORE)));
  migratedVault.exp = Date.now() - 1;
  migratedCookies.set(`${STORE}=${encodeURIComponent(JSON.stringify(migratedVault))}`);
  const afterMigrationExpiry = runLoader(loader, { cookies: migratedCookies, sessionStorage: legacySession });
  await eventually(
    () => afterMigrationExpiry.document.documentElement.className === 'ask',
    'an expired migrated vault must not fall back to the retired session password',
  );

  for (const name of pages) {
    const saved = JSON.parse(decodeURIComponent(cookies.get(STORE)));
    saved.exp = Date.now() + 1_000;
    cookies.set(`${STORE}=${encodeURIComponent(JSON.stringify(saved))}`);
    const pageLoader = await readFile(join(output, name, 'index.html'), 'utf8');
    const navigation = runLoader(pageLoader, { cookies, readyState: 'loading' });
    assert.equal(navigation.document.documentElement.className, '', 'saved access must not reveal the form during navigation');
    await navigation.finishParsing();
    assert.match(navigation.writes[0], new RegExp(`<title>${name}</title>`, 'u'), `saved access must unlock /${name}/`);
    assert.equal(navigation.requests.filter((url) => url.endsWith('page.enc')).length, 0, 'saved access must not request page.enc');
    const refreshed = JSON.parse(decodeURIComponent(cookies.get(STORE)));
    assertRollingWeek(refreshed.exp, 'each navigation');
  }

  const restartedCookies = new MemoryCookieJar(cookies.entries());
  const afterRestart = runLoader(loader, { cookies: restartedCookies, readyState: 'loading' });
  await afterRestart.finishParsing();
  assert.equal(afterRestart.document.documentElement.className, '', 'the preview-scoped credential should survive a browser restart without a form');

  const redeployedLoader = await readFile(join(redeployed, 'index.html'), 'utf8');
  const afterRedeploy = runLoader(redeployedLoader, { cookies: restartedCookies });
  await eventually(() => afterRedeploy.document.documentElement.className === 'ask', 'a new encryption salt must require the password again');
  assert.equal(restartedCookies.get(STORE), null, 'an incompatible key must be removed rather than retained');

  const freshRedeployCookies = new MemoryCookieJar([[STORE, encodeURIComponent(JSON.stringify({ ...firstVault, exp: Date.now() - 1 }))]]);
  const expired = runLoader(redeployedLoader, { cookies: freshRedeployCookies });
  await eventually(() => expired.document.documentElement.className === 'ask', 'an expired vault must show the password form');
  assert.equal(freshRedeployCookies.get(STORE), null, 'an expired vault must be removed rather than retained indefinitely');

  restartedCookies.set(`${STORE}=${encodeURIComponent(JSON.stringify(firstVault))}`);
  const loggedOut = runLoader(loader, { cookies: restartedCookies, search: '?logout' });
  await eventually(() => loggedOut.document.documentElement.className === 'ask', '?logout must return to the password form');
  assert.equal(restartedCookies.get(STORE), null, '?logout must clear the saved access');
});

test('protected preview is verified, encrypted, and published only by GitHub Actions', async () => {
  const [deploy, encryptor, workflow, ciRequirements] = await Promise.all([
    readFile(new URL('../migration/deploy_preview.sh', import.meta.url), 'utf8'),
    readFile(new URL('../_capture/encrypt_site.py', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-preview.yml', import.meta.url), 'utf8'),
    readFile(new URL('../requirements-ci.txt', import.meta.url), 'utf8'),
  ]);

  assert.match(deploy, /gh workflow run deploy-preview\.yml/u);
  assert.doesNotMatch(deploy, /git push/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /npm run ci/u);
  assert.match(workflow, /PREVIEW_PASSWORD: \$\{\{ secrets\.PREVIEW_PASSWORD \}\}/u);
  assert.match(workflow, /encrypt_site\.py --password-stdin/u);
  assert.match(workflow, /PREVIEW_DEPLOY_TOKEN/u);
  assert.match(workflow, /git -C preview-publication push origin HEAD:main/u);
  assert.doesNotMatch(workflow, /push .*--force/u);
  assert.match(ciRequirements, /beautifulsoup4/u);
  assert.match(encryptor, /--password-stdin/u);
});
