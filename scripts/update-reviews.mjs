#!/usr/bin/env node
// Обновление отзывов из MyReviews.
//
// На оригинале карусель отзывов рисует сторонний виджет и тянет данные при каждой
// загрузке страницы. У нас блок свой, а данные лежат в src/data/reviews.json —
// поэтому их надо периодически освежать. Скрипт ходит в тот же API, что и виджет,
// и переписывает файл, сохраняя его формат.
//
//   node scripts/update-reviews.mjs           # обновить файл
//   node scripts/update-reviews.mjs --check   # только сказать, есть ли изменения
//
// Ключ виджета публичный: он же лежит в разметке оригинала.

import { readFile, writeFile } from 'node:fs/promises';

const FIRM_UUID = 'd2bff4d4-0fd5-4752-accd-31e8d95dcaec';
const API = 'https://myreviews.dev/v1';
const TARGET = new URL('../src/data/reviews.json', import.meta.url);
// Столько карточек показывает блок; больше держать в репозитории незачем.
const KEEP_REVIEWS = 73;

const checkOnly = process.argv.includes('--check');

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ответил ${response.status}`);
  return response.json();
}

// Названия площадок («Яндекс», «2Gis», «Google») лежат в отдельном справочнике:
// в данных фирмы у источника только его номер.
async function serviceNames() {
  const payload = await getJson(`${API}/firm/services`);
  const names = new Map();
  for (const service of payload.data ?? []) names.set(String(service.id), service.name);
  return names;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
}

async function build() {
  const [firm, names] = await Promise.all([
    getJson(`${API}/widget/get-firm/${FIRM_UUID}?config_id=1`),
    serviceNames(),
  ]);

  const widgetConfig = firm.data?.widgetConfig?.widget_config ?? {};
  const order = (firm.data?.widgetConfig?.widget_places ?? firm.data?.widget_places ?? [])
    .map((id) => String(id));

  const services = {};
  for (const [id, service] of Object.entries(firm.services ?? {})) {
    services[id] = {
      name: names.get(String(service.service_id ?? id)) ?? `Источник ${id}`,
      rating: String(service.rating ?? ''),
      count: Number(service.count ?? 0),
      url: String(service.url ?? ''),
    };
  }

  // Виджет оригинала показывает не все отзывы: в его настройках стоит
  // showReviewRatings [4, 5] — тройки и единицы в карусель не попадают.
  const allowedRatings = new Set(
    (Array.isArray(widgetConfig.showReviewRatings) && widgetConfig.showReviewRatings.length
      ? widgetConfig.showReviewRatings
      : [4, 5]).map(Number),
  );
  // Блок показывает только площадки, выбранные в виджете (Яндекс, 2Gis, Google);
  // у отзыва без тегов сервис присылает null — держим в файле пустой список,
  // иначе фильтр по тегам спотыкается на нём.
  const shownServices = new Set(order.length ? order : Object.keys(services));
  const reviews = (firm.reviews ?? [])
    .filter((review) => (review.message ?? '').trim())
    .filter((review) => allowedRatings.has(Number(review.rating)))
    .filter((review) => shownServices.has(String(review.service)))
    .slice(0, KEEP_REVIEWS)
    .map((review) => ({ ...review, tags: Array.isArray(review.tags) ? review.tags : [] }));

  return {
    name: 'Чё за Квест',
    address: 'Ростов-на-Дону',
    counts: { summary: Number(firm.counts?.summary ?? 0) },
    ratings: { summaryWeight: round(Number(firm.ratings?.summaryWeight ?? 0)) },
    // Теги-фильтры настраиваются в кабинете виджета; если их там нет,
    // берём существительные, которые сервис насчитал по отзывам.
    tags: (widgetConfig.tags ?? firm.nouns ?? []).map((tag) => String(tag)),
    servicesOrder: order.length ? order : Object.keys(services),
    feedbackUrl: `https://feed.myreviews.ru/firm/${FIRM_UUID}/preview?from=widget`,
    services,
    reviews,
  };
}

const next = await build();
if (!next.reviews.length) throw new Error('Сервис не отдал ни одного отзыва — файл не трогаем');

const serialized = `${JSON.stringify(next, null, 2)}\n`;
const current = await readFile(TARGET, 'utf8').catch(() => '');

if (serialized === current) {
  console.log('Отзывы уже свежие: изменений нет.');
  process.exit(0);
}

const previous = current ? JSON.parse(current) : { reviews: [] };
const summary = [
  `отзывов ${previous.reviews?.length ?? 0} → ${next.reviews.length}`,
  `оценка ${previous.ratings?.summaryWeight ?? '—'} → ${next.ratings.summaryWeight}`,
  `всего на картах ${previous.counts?.summary ?? '—'} → ${next.counts.summary}`,
].join(', ');

if (checkOnly) {
  console.log(`Есть свежие отзывы: ${summary}`);
  process.exit(1);
}

await writeFile(TARGET, serialized, 'utf8');
console.log(`Отзывы обновлены: ${summary}`);
