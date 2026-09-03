<!-- MAP-SIG: 2fa7b08f873eb1d38ca94cd1a72dc3b6f404ea35 | blessed: 2026-09-03 -->

# Навигационная карта «Чё за Квест»

Правила и рецепты находятся в [`AGENTS.md`](../../../AGENTS.md). Здесь только быстрые переходы
к большим файлам и связи, которые трудно найти без разведки. Номер строки — якорь: после
изменений рядом с ним проверь, что ссылка всё ещё указывает на описанную ответственность.

## Маршрутизация и представление

| Что нужно найти | Точка входа |
| --- | --- |
| Как JSON становится маршрутом | `getStaticPaths` в [`src/pages/[...slug].astro:11`](../../../src/pages/%5B...slug%5D.astro#L11): glob JSON, вычисление площадок и карточек, исключение legacy-дубля, выбор макета по `type` |
| Где снимок заменяет нативный макет | [`src/layouts/Layout.astro:41`](../../../src/layouts/Layout.astro#L41) получает snapshot, а [`Layout.astro:112`](../../../src/layouts/Layout.astro#L112) выбирает `SourceSnapshotBody` вместо `<slot />` |
| Как маршрут находится в манифесте | `sourceSnapshotFor` в [`src/lib/source-snapshots.js:14`](../../../src/lib/source-snapshots.js#L14) |
| Где живёт runtime снимка | [`src/components/SourceSnapshotBody.astro:18`](../../../src/components/SourceSnapshotBody.astro#L18): подготовка HTML; [`:68`](../../../src/components/SourceSnapshotBody.astro#L68): подключение поведения; [`:139`](../../../src/components/SourceSnapshotBody.astro#L139): восстановление Tilda-геометрии; стили начинаются у [`:967`](../../../src/components/SourceSnapshotBody.astro#L967) |
| Как строится автокаталог квестов | выбор `type: quest` в [`src/pages/kvesty-v-rostove-na-donu.astro:52`](../../../src/pages/kvesty-v-rostove-na-donu.astro#L52) |
| Как строится sitemap | обработчик в [`src/pages/sitemap.xml.js:9`](../../../src/pages/sitemap.xml.js#L9) |

## Макеты и Schema.org

| Тип | Макет и ключевые места |
| --- | --- |
| Общий документ | [`src/layouts/Layout.astro:16`](../../../src/layouts/Layout.astro#L16) — props `<head>`; [`:39`](../../../src/layouts/Layout.astro#L39) — canonical; [`:45`](../../../src/layouts/Layout.astro#L45) — глобальная схема |
| Квест | [`src/layouts/QuestPage.astro:27`](../../../src/layouts/QuestPage.astro#L27) — данные; [`:117`](../../../src/layouts/QuestPage.astro#L117) — `Service` и breadcrumbs |
| Площадка | [`src/layouts/VenuePage.astro:23`](../../../src/layouts/VenuePage.astro#L23) — данные и адрес; [`:40`](../../../src/layouts/VenuePage.astro#L40) — `EntertainmentBusiness` |
| Категория | [`src/layouts/CategoryPage.astro:23`](../../../src/layouts/CategoryPage.astro#L23) — данные; [`:58`](../../../src/layouts/CategoryPage.astro#L58) — `CollectionPage` |
| Инфостраница | [`src/layouts/InfoPage.astro:14`](../../../src/layouts/InfoPage.astro#L14) — данные; [`:31`](../../../src/layouts/InfoPage.astro#L31) — breadcrumbs |
| Праздник/акция | [`src/layouts/HolidayPage.astro:45`](../../../src/layouts/HolidayPage.astro#L45) — выбор hero/composition; [`:83`](../../../src/layouts/HolidayPage.astro#L83) — разметка; диспетчер обычных `sections` начинается у [`:283`](../../../src/layouts/HolidayPage.astro#L283) |
| Единые правила разметки | фабрики в [`src/lib/seo.js`](../../../src/lib/seo.js), человекочитаемый контракт — [`docs/SEO-RAZMETKA.md`](../../../docs/SEO-RAZMETKA.md) |

## Данные

| Задача | Владелец данных |
| --- | --- |
| Одна страница | [`src/data/pages/`](../../../src/data/pages/) — файл совпадает со `slug`; соседний JSON того же `type` служит структурным образцом |
| Телефон, шапка, футер, формы, главная | [`src/data/site.json`](../../../src/data/site.json); дубли страницы контактов — [`src/data/pages/contacts.json`](../../../src/data/pages/contacts.json) |
| Адреса и координаты | [`src/data/venues.json`](../../../src/data/venues.json); `venueSlug` квеста должен ссылаться сюда и на JSON площадки |
| Отзывы | [`src/data/reviews.json`](../../../src/data/reviews.json); загрузчик и защиту от пустого ответа смотри в [`scripts/update-reviews.mjs:43`](../../../scripts/update-reviews.mjs#L43) |
| Квизы | [`src/data/quizzes.json`](../../../src/data/quizzes.json), клиентское подключение — [`src/scripts/source-extras.js`](../../../src/scripts/source-extras.js) |

## Генераторы и проверки

| Что | Точка входа |
| --- | --- |
| Полная генерация снимков | `main` в [`_capture/build_source_snapshots.py:2339`](../../../_capture/build_source_snapshots.py#L2339); выбор raw/override — [`:380`](../../../_capture/build_source_snapshots.py#L380); встраивание локальных отзывов — [`:1153`](../../../_capture/build_source_snapshots.py#L1153) |
| Legacy-редиректы | источник `migration/legacy-url-map.csv`; полный набор выходов объявлен в [`migration/legacy-redirects.mjs:214`](../../../migration/legacy-redirects.mjs#L214) |
| SEO данных | [`scripts/seo-data-audit.mjs`](../../../scripts/seo-data-audit.mjs) |
| Schema.org | [`scripts/structured-data-audit.mjs`](../../../scripts/structured-data-audit.mjs) |
| Production HTML | [`scripts/production-contract.mjs`](../../../scripts/production-contract.mjs) |
| Все команды | `scripts` в [`package.json`](../../../package.json) |

## Релиз и эксплуатация

| Что | Точка входа |
| --- | --- |
| Релизный интерфейс и ограничения | [`deploy/README.md`](../../../deploy/README.md) |
| Реализация релиза | проверки рабочего дерева начинаются у [`deploy/deploy.sh:293`](../../../deploy/deploy.sh#L293), гейт — у [`:339`](../../../deploy/deploy.sh#L339), доставка релиза — у [`:374`](../../../deploy/deploy.sh#L374), транзакционная установка nginx-конфигов — у [`:529`](../../../deploy/deploy.sh#L529) |
| Откат | `rollback_to` в [`deploy/deploy.sh:254`](../../../deploy/deploy.sh#L254) |
| Домен и TLS | [`deploy/DOMEN.md`](../../../deploy/DOMEN.md) |
| Дежурство и аварии | [`deploy/EKSPLUATACIYA.md`](../../../deploy/EKSPLUATACIYA.md) |
| Cutover-контракт | release gate, редиректы и приёмочные проверки в [`docs/PRODUCTION_CUTOVER.md`](../../../docs/PRODUCTION_CUTOVER.md); текущая эксплуатация — в `deploy/` |

## Проверка свежести карты

`MAP-SIG` фиксирует имена и содержимое файлов, по которым построена карта. Из корня вычисли подпись:

```bash
git ls-files 'package.json' 'src/**' 'scripts/**' '_capture/*.py' 'migration/*.mjs' 'deploy/**' \
  | grep -vE '^(src/generated|src/source-snapshots|public/assets)/' \
  | LC_ALL=C sort | xargs sha1sum | sha1sum | cut -d' ' -f1
```

Если значение не совпадает с заголовком, проверь изменённые, добавленные, удалённые и переименованные
файлы, обнови затронутые строки карты и замени подпись. После правок в крупном файле всё равно открой
используемые якоря: подпись показывает факт изменения, но не доказывает точность описания.
