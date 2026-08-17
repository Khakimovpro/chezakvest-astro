# Чё за Квест — сайт на Astro (перенос с Tilda)

Сайт **чезаквест.рф** (Ростов-на-Дону), переписанный с Tilda на Astro: те же страницы и тот же
контент, только быстрее и чище. В сборке опубликованы **67 маршрутов**: страницы исходного
официального sitemap, тематические кампании и каталог `/kvesty-v-rostove-na-donu`; архивный
`/new-year-2025` и дубль Уэнсдей закрыты noindex-фолбэками до серверного 301 на актуальные
канонические URL.

Журнал переноса, правила и известные расхождения — `migration/MIGRATION.md`,
реестр страниц со статусами — `migration/pages.csv`.

## Что сделано

- Вёрстка нативная, без Tilda-рантайма: страницы собираются шаблонами из JSON-данных
  (`src/layouts/*.astro` + `src/data/pages/<slug>.json`), роут один — `src/pages/[...slug].astro`.
- Все ассеты (CSS/JS/шрифты/картинки) **захостены локально**, обращений к tildacdn нет.
- Вырезаны сторонние трекеры и call-tracking (Roistat, Google); Метрика выключена до передачи
  ID в `src/data/site.json`, поэтому при начальной загрузке нет внешних запросов.
- Карта, отзывы и квиз не нужны при начальной загрузке: отзывы рендерятся локальным текстом,
  а публичные Yandex Map и Marquiz создаются только после явного действия посетителя.
- SEO в переносе, а не вторым заходом: свои title/description под кластер, один H1, Schema.org
  (`Service`/`EntertainmentBusiness`/`CollectionPage`, `Offer`, `FAQPage`, `BreadcrumbList`),
  canonical на боевой домен, перелинковка квест ↔ площадка ↔ категория, `sitemap.xml`, `robots.txt`.
- Сырой исторический снимок `src/html/body.html` и короткий архивный wrapper не являются
  Astro-маршрутами и исключены из production-сборки; они сохранены только для сверки переноса.

## Замеры

16.08.2026 собран `dist` и снят Lighthouse mobile на локальном `python3 -m http.server` (без
HTTP-сжатия; это не замер боевого CDN). Все числа ниже — фактические, порядок оценок:
Performance / Accessibility / Best Practices / SEO.

| Маршрут | До оптимизации | После оптимизации | LCP до → после | Передано до → после |
| --- | --- | --- | --- | --- |
| `/` | 58 / 86 / 100 / 100 | 57 / 86 / 100 / 100 | 22,8 с → 11,6 с | 4 709 KiB → 2 837 KiB |
| `/kids/` | 56 / 81 / 100 / 100 | 56 / 81 / 100 / 100 | 30,8 с → 21,9 с | 5 851 KiB → 4 219 KiB |
| `/ono/` | 58 / 89 / 100 / 100 | 58 / 89 / 100 / 100 | 11,5 с → 9,8 с | 2 912 KiB → 1 613 KiB |

Семь важных изображений перекодированы в WebP (4 480 546 B → 880 028 B), а MP4-видео запускается
только по клику; исходники сохранены вне `public/` в `migration/parity/source-media/`. Полный
протокол, включая проверку 67 маршрутов и ограничения локального замера, —
`migration/parity/REVALIDATION-2026-08-16.md`.

## Разработка

```bash
npm install
python3 -m pip install --requirement requirements-ci.txt  # нужен для тестов source-snapshot
npm run build          # -> dist/
npm run preview        # локальный предпросмотр
npm run ci             # unit-тесты, production SEO-контракт и dependency audit
npm run verify:seo     # SEO-ограничения 65 indexable-маршрутов
python3 _capture/check_pages.py    # legacy-диагностика миграции; не release gate
python3 _capture/check_assets.py   # все ли картинки из данных лежат в public/
node scripts/browser-audit.mjs      # локальный browser QA собранного dist (нужен Playwright)
```

Контент страниц — в `src/data/pages/*.json`, сквозные данные (телефон, меню, футер) — в
`src/data/site.json`. Скрипты съёма с оригинала и сборки данных — в `_capture/`
(в репозитории только сами инструменты, без сырья и скриншотов).

## Деплой

Публичный preview GitHub Pages публикуется отдельным репозиторием
`Khakimovpro/chezakvest-preview`, ветка `main`; база пути — `/chezakvest-preview`.
Единственный штатный путь публикации — GitHub Actions workflow
`Deploy public preview`: он повторно запускает `npm run ci`, собирает публичный артефакт,
а затем fast-forward публикует его и ждёт, пока GitHub Pages начнёт отдавать именно эту
ревизию. Запуск с локальной машины только ставит этот workflow в очередь:
`./migration/deploy_preview.sh [commit-or-branch]`.

Workflow использует `PREVIEW_DEPLOY_KEY` — SSH deploy key с правом записи только
в `Khakimovpro/chezakvest-preview`.
Автопубликация боевого домена намеренно не включена: порядок переключения DNS и хостинга
описан в `docs/PRODUCTION_CUTOVER.md`.
