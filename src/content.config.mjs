// Коллекция статей блога. Файлы — src/content/blog/<slug>.md, маршрут — /blog/<slug>/.
// Длины title и description проверяются прямо здесь: гейт должен падать на сборке,
// а не после выкатки, когда сниппет в выдаче уже обрезан.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(10).max(60),
    // Коридор описания — тот же, что seo-data-audit.mjs держит для остальных страниц сайта.
    description: z.string().min(120).max(160),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    image: z.string().startsWith('/assets/'),
    // Кадр, из которого собрана обложка: нужен, чтобы перегенерировать её без потери исходника.
    coverSource: z.string().startsWith('/assets/').optional(),
    imageAlt: z.string().min(10),
    readTime: z.string(),
    author: z.string().default('Юрий Мелешкин'),
    tags: z.array(z.string()).min(1),
    keywords: z.string().optional(),
    faq: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
    // Слаги страниц квестов для блока «Подходящие квесты». Существование проверяет
    // tests/blog.test.mjs — опечатка в слаге не должна доехать до выдачи.
    relatedQuests: z.array(z.string()).optional(),
    noindex: z.boolean().optional(),
  }),
});

export const collections = { blog };
