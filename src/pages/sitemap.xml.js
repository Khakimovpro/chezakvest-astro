// Карта сайта: собирается из тех же данных, что и страницы, — руками ничего не поддерживаем.
import { canonicalUrl } from '../lib/urls.js';
import {
  LEGACY_SITEMAP_SLUGS,
  dataPathFromGlobPath,
  lastModifiedForSources,
} from '../lib/sitemap.js';

export async function GET() {
  const files = import.meta.glob('../data/pages/*.json', { eager: true });
  const inner = Object.entries(files).map(([path, mod]) => {
    const page = mod.default ?? mod;
    return {
      slug: page.slug || path.split('/').pop().replace('.json', ''),
      source: dataPathFromGlobPath(path),
    };
  }).filter((page) => !LEGACY_SITEMAP_SLUGS.has(page.slug));

  const urls = [
    {
      loc: canonicalUrl('/'),
      priority: '1.0',
      lastmod: lastModifiedForSources(['src/pages/index.astro', 'src/data/site.json']),
    },
    {
      loc: canonicalUrl('/kvesty-v-rostove-na-donu'),
      priority: '0.9',
      lastmod: lastModifiedForSources([
        'src/pages/kvesty-v-rostove-na-donu.astro',
        ...inner.filter(({ slug }) => !['contacts', 'strashnye-kvesty'].includes(slug)).map(({ source }) => source),
      ]),
    },
    ...inner.sort((a, b) => a.slug.localeCompare(b.slug, 'ru')).map(({ slug, source }) => ({
      loc: canonicalUrl(`/${slug}`),
      priority: '0.8',
      lastmod: lastModifiedForSources([source]),
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
