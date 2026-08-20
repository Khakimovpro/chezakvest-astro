// Контракт родных окон Tilda в снимках.
//
// Кнопка обязана открывать то же окно, что и на оригинале. Связь живёт в
// data-source-popup, само окно — в снимке. Раньше и то и другое схлопывалось в
// одну самодельную форму «Забронировать игру», и посетитель получал её вместо
// «Купить сертификат», «Предварительное бронирование» и окон залов.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const snapshotDir = new URL('../src/source-snapshots/', import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const snapshots = async () => {
  const names = (await readdir(snapshotDir)).filter((name) => name.endsWith('.html'));
  return Promise.all(names.map(async (name) => [name, await readFile(new URL(name, snapshotDir), 'utf8')]));
};

// Замер 20.08.2026 после возврата связей: 316 кнопок на 66 снимках.
const FROZEN_LINKS = 300;

test('кнопки снимка помнят своё окно', async () => {
  const pages = await snapshots();
  const total = pages.reduce((sum, [, html]) => sum + (html.match(/data-source-popup="/gu) ?? []).length, 0);
  assert.ok(total >= FROZEN_LINKS, `связей кнопка→окно стало меньше: ${total}`);

  // Хотя бы там, где окно есть на этой же странице, связь обязана вести в него.
  const [, home] = pages.find(([name]) => name === 'home.html');
  assert.match(home, /data-source-popup="#popup:cert"/u, 'на главной потеряна кнопка сертификата');
  assert.match(home, /data-tooltip-hook="#popup:cert"/u, 'на главной потеряно окно сертификата');
});

test('снимки не уводят посетителя на боевой домен', async () => {
  const pages = await snapshots();
  const offenders = pages
    .filter(([, html]) => /href="https?:\/\/(?:xn--80aehcht5ci1b\.xn--p1ai|чезаквест\.рф)/u.test(html))
    .map(([name]) => name);
  assert.deepEqual(offenders, [], `ссылки на боевой домен в снимках: ${offenders.join(', ')}`);
});

test('живой слой открывает окно без обращения к адресной строке', async () => {
  const popups = await read('src/scripts/source-popups.js');
  assert.match(popups, /t-popup_show/u, 'класс показа окна Tilda');
  assert.doesNotMatch(popups, /location\.hash\s*=/u, 'окно снова меняет адрес и уводит страницу наверх');
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.doesNotMatch(component, /location\.hash = 'source-booking'/u, 'вернулся перехват всех кнопок в общую форму');
});
