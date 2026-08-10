# Чё за Квест — сайт на Astro (перенос с Tilda)

Сайт **чезаквест.рф** (Ростов-на-Дону), переписанный с Tilda на Astro: те же страницы и тот же
контент, только быстрее и чище. Перенесены все **58 страниц исходного официального sitemap** —
главная, 37 квестов, 4 VR-игры, 9 площадок, категория «Страшные квесты», «Контакты» и 5
праздничных страниц. Дополнительно опубликованы актуальные тематические кампании и каталог
`/kvesty-v-rostove-na-donu`; архивный `/new-year-2025` и дубль Уэнсдей закрыты noindex-фолбэками
до серверного 301 на актуальные канонические URL.

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

Последняя локальная проверка на главной: Lighthouse mobile — **100/97/100/100**
(Performance/Accessibility/Best Practices/SEO), CLS 0, LCP 1.26 с. Каталог и `among_us` также
прошли с Performance 100 и CLS 0. Метрики на выбранном боевом хосте нужно повторно снять после
переключения DNS.

## Разработка

```bash
npm install
python3 -m pip install --requirement requirements-ci.txt  # нужен для теста зашифрованного preview
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

Защищённое предпросмотр-представление GitHub Pages публикуется отдельным репозиторием
`Khakimovpro/chezakvest-preview`, ветка `main`; база пути — `/chezakvest-preview`.
Превью под паролем для показа заказчику — `./migration/deploy_preview.sh`, детали в журнале.
Автопубликация боевого домена намеренно не включена: CI собирает и проверяет `dist/`,
а порядок переключения DNS и хостинга описан в `docs/PRODUCTION_CUTOVER.md`.
