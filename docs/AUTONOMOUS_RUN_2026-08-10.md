# Автономный прогон переноса — 10.08.2026

## Итог

Клон собран как 67 статических HTML-страниц. Реестр содержит 61 запись: 60 `done` и один
`redirect`-фолбэк для дубля Уэнсдей. Два последовательных браузерных QA-круга по всем 66
публичным маршрутам не нашли новых функциональных проблем: `overflow=0`, `consoleErrors=0`,
`failedRequests=0`, `externalRequests=0`. Preview и production DNS в этом прогоне не менялись.

Единственный незакрываемый без новых исходников остаток — документированные ограничения
разрешения: 379 размещений (102 уникальных файла) не проходят буквально строгий raw-пixel 2×
критерий. Это не битые изображения и не апскейл: Tilda-оригинал меньше нужного размера либо
ограничен обязательным лимитом 1600 px. Пофайловый реестр с URL, размерами и причиной:
[`MEDIA_SOURCE_LIMITS_2026-08-10.csv`](MEDIA_SOURCE_LIMITS_2026-08-10.csv).

## Что было найдено и сделано

| Страница / область | Что было не так | Доказательство | Что сделано |
| --- | --- | --- | --- |
| Все формы, особенно `/roblox-dors/` | У имени и телефона были скрытые labels, дата визуально не выравнивалась; ошибка валидации не объявлялась. | `PartyForm.astro`, `CallbackForm.astro`, `lead-form.js`; contract-тесты форм. | Видимые `label[for]`, grid с логичным tab-order, `autocomplete`/`inputmode`, `aria-invalid`, status-region и WhatsApp-ссылка после проверки. В финальном artifact 115 валидных форм. |
| QuestPage, VenuePage, HolidayPage | Шаблоны резали галереи через `slice`. | `tests/capture-builders.test.mjs`; данные всех страниц. | Убраны срезы в шаблонах и capture-builders; все фотографии рендерятся с `loading="lazy"` и размерами. |
| Весь сайт, особенно праздничные страницы | В данных были Tilda delivery-версии 20–560 px, включая `resize/20x`. | Обратная карта URL → md5 filename; browser scan до ремонта: 1 034 raw-2× размещения. | Нормализатор снимает `cover`/`resize`/`resizeb`/`contain`; два q-прохода восстановили проверенные оригиналы q82 ≤1600. Во втором: 251 проверено, 138 заменено, 103 без более крупного оригинала, 10 без восстановленного URL. Главная: 95 проверено, 40 заменено. |
| `/kvest_v_realnosti_zapad/` | В галерею попадали декоративные иконки 18–110 px и растягивались до фото. | `src/data/pages/kvest_v_realnosti_zapad.json`, raw-size audit. | Иконки исключены из фото-галереи; текстовый блок сохранён. |
| `/` и карточки каталога | Карточки и hero загружали лишние крупные исходники; мобильная стрелка слайдера расширяла документ. | Mobile audit: `/` 442/390 px до исправления; Lighthouse cold run. | `srcset` 760/1600 + `sizes` для q-card/cards-row/category, preload home hero; стрелки зажаты в viewport. Свежая home Lighthouse: 96/100/100/100, CLS 0, LCP 2.674 с. |
| `/`, `/prazdniki-pod-kluch/`, `/new-year-2025/` | Горизонтальная прокрутка на 390 px. | Browser audit до исправления: 442, 427, 392 px. | Исправлены позиция стрелки, tile-grid и feature-grid; два финальных обхода: 0 overflow. |
| `/kvesty-v-rostove-na-donu/` | Отдельного каталога не было; «Все квесты» вели на `/#catalog`. | Header, Footer, BreadcrumbList и прежний `withCollectionBreadcrumbs`. | Создан static каталог: 40 канонических карточек, 6 фильтров; навигация, крошки и internal links переведены на него. |
| Все 41 квест | У части карточек отсутствовали адрес/ссылка на площадку. | `scripts/catalog-data-audit.mjs`: исходно неполные связи. | Введён обязательный `venueSlug`; 41/41 квест верифицированы, Service schema и карточки получают площадку из одного источника. |
| `/wednesday_ukradennaya_vesch/` | Дублировал `/wednesday-poteryannaya-dusha/`. | Оба Tilda-снимка совпадают по H1/предыстории/особенностям. | Канон — `wednesday-poteryannaya-dusha`; legacy-route noindex + canonical + fallback, будущий 301 в generated map; дубликат исключён из sitemap и indexable SEO. |
| 60 индексируемых маршрутов | Title без гео, description вне 120–160, copied keyword clusters и опечатки. | `scripts/seo-data-audit.mjs`. | Нормализованы metadata/keywords/орфография; тест проверяет все 60 indexable, home и каталог. |
| `sitemap.xml` | Не было `lastmod`; новый каталог и legacy Wednesday требовали политики. | `src/pages/sitemap.xml.js`. | `lastmod` берётся из git-даты с mtime-fallback для новых файлов; sitemap содержит 60 URL и исключает legacy Wednesday. |
| 102 live hidden URL + Wednesday | После смены хоста партнёрские и Tilda URL дали бы 404. | `work/raw/active_hidden_pages.csv`; generated map tests. | `migration/legacy-url-map.csv`: 103 записи = 100 правил 301 и 3 текущих canonical 200; `public/_redirects`, static noindex fallback и таблица в `PRODUCTION_CUTOVER.md` генерируются и тестируются. |
| `/new-year-2025/`, `/prazdniki-pod-kluch/` | Две индексируемые коммерческие страницы отсутствовали. | Снимки/данные Tilda в `_capture/pages/`. | Перенесены как holiday JSON, с BreadcrumbList, FAQ/Service где применимо, локальными asset и рабочей заявкой. |
| Подарочный блок `/new-year-2025/` | Generic HolidayPage оставлял только фон, без двух передних иллюстраций из Tilda. | `rec834726569` в `_capture/pages/new-year-2025.json`: `image-2.png` и `IMG.png`. | Оба оригинальных foreground-asset скачаны локально, добавлены в адаптивную композицию с исходной CTA; блок проверен на 1440 и 390 px. |
| `/ono/`, `/zvonok/`, `/tekhasskaya-reznya-benzopiloj/` | В видео был внешний `chezakvest.ru` URL, который ломался при `SITE_BASE`. | Built GitHub Pages artifact. | Видео локализовано в `public/assets/video/ono-zvonok-reznya.mp4`; URL стал base-aware. |
| Главный слайдер | Загружал скрытые баннеры, не имел автопаузы. | `main.js`, Tilda `with-cycle=true`. | Current+next lazy, 6-секундная автопрокрутка, play/pause 44×44, остановка по hover/focus/gesture/hidden/reduced-motion; 4 unit tests. |

## Проверки

### CI и статический artifact

- `npm run build` — 67 pages.
- `npm test` — 44/44 passed.
- `node scripts/catalog-data-audit.mjs` — 41 quests / 40 canonical catalogue entries.
- `python3 migration/build_registry.py` — 61 записей: 60 done, 1 redirect, 0 осталось.
- `npm run verify:redirects` и `verify:redirect-targets` — 103 records.
- `npm run verify:seo` — 60 indexable routes.
- `npm run verify:production` — 67 HTML passed.
- `npm run ci` — green: redirect/SEO/tests, root + GitHub Pages builds, both production contracts
  and production dependency audit (`0 vulnerabilities`).

### Два QA-круга

| Круг | Охват | Результат |
| --- | --- | --- |
| 1 | 66 маршрутов, 1440 и 390 | `overflow=0`, `console=0`, `failed=0`, `external=0`; 379 известных source/cap image exceptions после восстановления. |
| 2 | 66 маршрутов после свежей сборки, 1440 и 390 (6 изолированных browser-батчей) | Те же нулевые функциональные счётчики; 379 исключений стабильны и полностью внесены в media register. Новых проблем не найдено. |

Статическая выборка финального artifact: 776 локальных asset references, 0 отсутствующих; 1 426
`<img>`, у каждого есть `width` и `height`. Отдельный QA также подтвердил 40 catalog cards с
локальными 760w/1600w `srcset`, 115 форм и 60 sitemap URL.

### Lighthouse mobile

| Маршрут | Performance / Accessibility / Best Practices / SEO | CLS | LCP |
| --- | --- | --- | --- |
| `/` | 96 / 100 / 100 / 100 | 0 | 2.674 s |
| `/ono/` | 99 / 96 / 100 / 100 | 0 | 1.957 s |
| `/40letpobedy216/` | 97 / 96 / 100 / 100 | 0 | 2.630 s |
| `/new-year-2025/` | 99 / 96 / 100 / 100 | 0 | 1.883 s |
| `/strashnye-kvesty/` | 99 / 96 / 100 / 100 | 0 | 2.189 s |

Порог задания для Performance/SEO/Best Practices/CLS выполнен. A11y 96 на части маршрутов
объясняется сохранённым брендовым `#ff6b00` в ссылке согласия: цвет запрещено менять в задании.

### Визуальная сверка

Пиксельный порог 95 % **не сертифицирован** и намеренно не выдаётся за пройденный. Контрольные
сравнения `_capture/compare.py` с живыми Tilda-снимками дали: `/ono/` 38.48 % (1440) и 35.15 %
(390), `/40letpobedy216/` 32.66 % и 17.62 %, `/new-year-2025/` 5.74 % (1440),
`/strashnye-kvesty/` 18.92 % и 13.99 %. Это показывает исходный architectural visual gap
старого Astro-клона, а не новый сетевой регресс: Tilda использует закрытые booking/review/map
widgets и single-slide galleries, тогда как перенос заменяет виджеты формами и по требованию
выводит все изображения галереи. После сверки отдельно восстановлены две передние иллюстрации
подарочного блока New Year; остальные расхождения — не безопасные точечные CSS-правки. Для
`/ono/` высота также отличается на 808 px desktop и 93 px mobile. Функциональные и контентные
проверки выше зелёные, но точное воссоздание Tilda-дизайна остаётся отдельным большим UI-потоком,
не скрытым в этом выпуске.

## Ограничения, которые не были скрыты

- Нельзя получить raw 2× для desktop hero шириной 1200 px при обязательном cap 1600 px: нужно
  минимум 2400 px. Это касается 40 размещений; отдельная группа — 9 карт площадок, для которых
  не нашлась исходная Tilda URL.
- 12 размещений используют подтверждённо маленький Tilda original (например Fantom 718→1200,
  Wednesday 728→1200, ONO 901→1160). Апскейл намеренно не применялся.
- У двух страниц возраст в hero Tilda противоречит детскому сценарию. Возраст не был выдуман;
  это вынесено в [`OWNER_INPUTS.md`](OWNER_INPUTS.md).
- При проверке Astro 5.18.2 `npm audit --omit=dev --audit-level=high` вернул 2 high
  vulnerabilities, чьи исправления доступны только с Astro 7.2.0. Поэтому сохранён безопасный
  Astro 7.2.0 из CI-базовой точки, а не искусственно ослаблен release-gate.
- Production DNS/боевой домен/Tilda не менялись. Для внешних фактов и материалов — только
  короткий список в [`OWNER_INPUTS.md`](OWNER_INPUTS.md).
