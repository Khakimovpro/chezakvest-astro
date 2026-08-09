// Карта сайта: собирается из тех же данных, что и страницы, — руками ничего не поддерживаем.
const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';

export async function GET() {
  const files = import.meta.glob('../data/pages/*.json', { eager: true });
  const inner = Object.entries(files).map(([path, mod]) => {
    const page = mod.default ?? mod;
    return page.slug || path.split('/').pop().replace('.json', '');
  });

  const urls = [
    { loc: ORIGIN + '/', priority: '1.0' },
    ...inner.sort().map((slug) => ({ loc: `${ORIGIN}/${slug}`, priority: '0.8' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
