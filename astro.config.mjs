// @ts-check
import { defineConfig } from 'astro/config';

// БАЗА подставляется при деплое на GitHub Pages (проектный сайт под /<repo>/).
// Локально base пустой — страница отдаётся из корня.
const BASE = process.env.SITE_BASE || undefined;

export default defineConfig({
  site: 'https://khakimovpro.github.io',
  base: BASE,
  trailingSlash: 'ignore',
  compressHTML: true,
  build: {
    assets: '_astro',
    inlineStylesheets: 'always', // инлайним весь CSS нативной главной (нет render-blocking запроса)
  },
});
