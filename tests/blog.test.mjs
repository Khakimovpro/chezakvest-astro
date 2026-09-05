import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { addHeadingIds, applyBaseToHtml, collectHeadings, withTrailingSlash } from '../src/lib/blog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog');
const PAGES_DIR = join(ROOT, 'src', 'data', 'pages');
const PUBLIC_DIR = join(ROOT, 'public');

// Владелец подтвердил ровно эти суммы. Любая другая цена в блоге — выдумка,
// за которую отвечает деньгами он, а не автор статьи.
const ALLOWED_PRICES = new Set(['5000', '1000', '30900', '2700']);
const STATIC_ROUTES = new Set(['/', '/kvesty-v-rostove-na-donu/', '/privacy/', '/blog/', '/avtor-yuriy-meleshkin/']);
const LEGACY_SLUG = 'wednesday_ukradennaya_vesch';

function articles() {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const raw = readFileSync(join(BLOG_DIR, name), 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
      assert.ok(match, `${name}: файл без frontmatter`);
      return { name, slug: name.replace(/\.md$/, ''), frontmatter: match[1], body: match[2] };
    });
}

function frontmatterValue(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(frontmatter);
  return match ? match[1].trim() : '';
}

function frontmatterList(frontmatter, key) {
  const block = new RegExp(`^${key}:\\n((?:\\s+-\\s+.*\\n?)+)`, 'm').exec(frontmatter);
  if (!block) return [];
  return [...block[1].matchAll(/-\s+"?([^"\n]+)"?/g)].map((item) => item[1].trim());
}

const pageSlugs = new Set(
  readdirSync(PAGES_DIR).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')),
);

test('каждая статья блога описана метатегами в допустимых границах', () => {
  const posts = articles();
  assert.ok(posts.length > 0, 'в блоге нет ни одной статьи');
  for (const post of posts) {
    const title = frontmatterValue(post.frontmatter, 'title');
    const description = frontmatterValue(post.frontmatter, 'description');
    assert.ok(title.length > 0 && title.length <= 60, `${post.name}: длина title ${title.length}, допустимо до 60`);
    assert.ok(
      description.length >= 120 && description.length <= 160,
      `${post.name}: длина description ${description.length}, допустимо 120–160`,
    );
    assert.ok(frontmatterValue(post.frontmatter, 'author').length > 0, `${post.name}: не указан автор`);
    assert.match(frontmatterValue(post.frontmatter, 'date'), /^\d{4}-\d{2}-\d{2}$/, `${post.name}: дата не в формате ГГГГ-ММ-ДД`);
  }
});

test('обложка и все иллюстрации статьи лежат в public', () => {
  for (const post of articles()) {
    const cover = frontmatterValue(post.frontmatter, 'image');
    assert.ok(existsSync(join(PUBLIC_DIR, cover)), `${post.name}: нет файла обложки ${cover}`);
    for (const match of post.body.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = match[1];
      if (!src.startsWith('/')) continue;
      assert.ok(existsSync(join(PUBLIC_DIR, src)), `${post.name}: нет файла картинки ${src}`);
    }
  }
});

test('каждая внутренняя ссылка статьи ведёт на существующую страницу и оканчивается слешем', () => {
  const posts = articles();
  const blogSlugs = new Set(posts.map((post) => post.slug));
  for (const post of posts) {
    const links = [
      ...[...post.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1]),
      ...[...post.body.matchAll(/<a[^>]+href="(\/[^"]*)"/g)].map((match) => match[1]),
    ];
    for (const href of links) {
      const [path] = href.split('#');
      if (!path || path.startsWith('/assets/')) continue;
      assert.ok(path.endsWith('/'), `${post.name}: ссылка без слеша на конце — ${href}`);
      if (STATIC_ROUTES.has(path)) continue;
      const slug = path.replace(/^\/|\/$/g, '');
      if (slug.startsWith('blog/')) {
        assert.ok(blogSlugs.has(slug.slice('blog/'.length)), `${post.name}: ссылка на несуществующую статью — ${href}`);
        continue;
      }
      assert.ok(pageSlugs.has(slug), `${post.name}: ссылка на несуществующую страницу — ${href}`);
      assert.notEqual(slug, LEGACY_SLUG, `${post.name}: ссылка на устаревший маршрут — ${href}`);
    }
  }
});

test('блок «Подходящие квесты» ссылается только на существующие квесты', () => {
  for (const post of articles()) {
    const quests = frontmatterList(post.frontmatter, 'relatedQuests');
    assert.ok(quests.length > 0, `${post.name}: не заполнен relatedQuests`);
    for (const slug of quests) {
      assert.ok(pageSlugs.has(slug), `${post.name}: relatedQuests указывает на несуществующий квест — ${slug}`);
    }
  }
});

test('в статьях нет цен, кроме подтверждённых владельцем', () => {
  for (const post of articles()) {
    const text = `${post.frontmatter}\n${post.body}`;
    for (const match of text.matchAll(/(\d[\d  ]*)\s*(?:₽|руб)/gi)) {
      const value = match[1].replace(/[\s ]/g, '');
      assert.ok(ALLOWED_PRICES.has(value), `${post.name}: неподтверждённая цена ${match[0].trim()}`);
    }
  }
});

test('статьи не называют часы работы — в данных сайта они противоречивы', () => {
  for (const post of articles()) {
    const text = `${post.frontmatter}\n${post.body}`;
    const match = /\b\d{1,2}:\d{2}\b/.exec(text);
    assert.equal(match, null, `${post.name}: указано время ${match?.[0]} — часы работы не подтверждены владельцем`);
  }
});

test('в каждой статье достаточно разделов для оглавления', () => {
  for (const post of articles()) {
    const headings = [...post.body.matchAll(/^##\s+\S/gm)].length;
    assert.ok(headings >= 3, `${post.name}: разделов H2 всего ${headings}, нужно минимум 3`);
  }
});

test('тело статьи получает базовый префикс, слеши и якоря разделов', () => {
  const html = '<h2>Первый</h2><p><a href="/among_us">квест</a></p><h2 id="x">Второй</h2><img src="/assets/q/a.webp">';
  const withIds = addHeadingIds(html);
  assert.match(withIds, /<h2 id="razdel-1">/);
  assert.match(withIds, /<h2 id="razdel-2">/);
  assert.deepEqual(collectHeadings(withIds).map((item) => item.text), ['Первый', 'Второй']);

  const based = applyBaseToHtml(withIds, '/preview');
  assert.match(based, /href="\/preview\/among_us\/"/);
  assert.match(based, /src="\/preview\/assets\/q\/a\.webp"/);

  assert.equal(withTrailingSlash('/among_us'), '/among_us/');
  assert.equal(withTrailingSlash('/assets/q/a.webp'), '/assets/q/a.webp');
  assert.equal(withTrailingSlash('/blog/x#faq'), '/blog/x/#faq');
  assert.equal(withTrailingSlash('https://example.com/x'), 'https://example.com/x');
});
