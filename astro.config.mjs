// @ts-check
import { defineConfig } from 'astro/config';

// БАЗА подставляется при деплое на GitHub Pages (проектный сайт под /<repo>/).
// Локально base пустой — страница отдаётся из корня.
const BASE = process.env.SITE_BASE || undefined;

export default defineConfig({
  site: 'https://khakimovpro.github.io',
  base: BASE,
  trailingSlash: 'ignore',
  compressHTML: false,      // сохраняем инлайн-JS Tilda нетронутым
  build: {
    assets: '_astro',
    inlineStylesheets: 'never', // Tilda-CSS оставляем внешними файлами (кэшируются)
  },
});
