// @ts-check
import { defineConfig } from 'astro/config';

// БАЗА подставляется при деплое на GitHub Pages (проектный сайт под /<repo>/).
// Локально base пустой — страница отдаётся из корня.
const BASE = process.env.SITE_BASE || undefined;

export default defineConfig({
  site: 'https://khakimovpro.github.io',
  base: BASE,
  // Static-directory hosts such as GitHub Pages normalize routes to `/slug/`.
  // Emit that form everywhere to avoid canonical and internal-link redirects.
  trailingSlash: 'always',
  compressHTML: true,
  build: {
    assets: '_astro',
    inlineStylesheets: 'always', // инлайним весь CSS нативной главной (нет render-blocking запроса)
  },
});
