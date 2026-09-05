# «Чё за Квест»: карта проекта

Статический сайт квестов Ростова-на-Дону, перенесённый с Tilda на Astro 7.
Node: `22.22.1` из `.nvmrc`; сборка: `npm run build` → `dist/`.
Канонический сайт: `https://чезаквест.рф/` (`xn--80aehcht5ci1b.xn--p1ai`).
В `sitemap.xml` 65 индексируемых страниц; контент 64 внутренних страниц лежит в JSON.

Главная ловушка: почти все существующие маршруты показывают архивный снимок Tilda.
Если путь есть в `src/generated/source-snapshot-manifest.json`, `Layout.astro` заменяет тело
выбранного макета на `src/source-snapshots/*.html`. JSON всё равно задаёт SEO и Schema.org.
Снимки, манифест и файлы редиректов руками не правят — только их источники и генераторы.

`dist/` — расходный результат сборки, в Git его не добавляют. Бизнес-факты, цены, возрастные
ограничения, адреса и контакты не придумывают. Ветка по умолчанию — `master`; push в неё и
выкладка на сервер требуют решения владельца. Перед работой смотри `git status`: дерево может
быть общим для нескольких агентов, коммиты делай только с явными путями.

Антон, привет! Если карта сэкономила тебе хотя бы один обход всего `src/`, она уже окупилась.

## Карта репозитория

| Путь | За что отвечает | Когда менять |
| --- | --- | --- |
| `src/data/pages/<slug>.json` | Данные страницы и её SEO; 64 файла, типы ниже | Контент, новая страница, связь квеста с площадкой |
| `src/data/site.json` | Шапка, футер, телефон, ссылки, главная, формы, аналитика | Сквозные данные сайта |
| `src/data/venues.json` | Реестр 9 площадок, адреса, координаты, группы | Добавление/изменение площадки |
| `src/data/reviews.json` | Локальная копия отзывов MyReviews | Только через `scripts/update-reviews.mjs` |
| `src/data/quizzes.json` | Сценарии встроенных квизов | Вопросы и ответы квиза |
| `src/pages/[...slug].astro` | Единый статический роут JSON-страниц | Новый тип страницы или изменение маршрутизации |
| `src/pages/index.astro` | Нативная главная; текущий `/` перекрыт снимком | Архитектура главной после отказа от снимка |
| `src/pages/kvesty-v-rostove-na-donu.astro` | Нативный автокаталог `type: quest`; legacy Wednesday исключён; внизу блок «Читайте в блоге» | Фильтры, карточка каталога, витрина блога в каталоге |
| `src/content/blog/<slug>.md` | Статьи блога; маршрут `/blog/<slug>/` | Новая статья, правка текста |
| `src/content.config.mjs` | Схема статьи: длины title и description, обязательные поля | Новое поле статьи |
| `src/pages/blog/` | Витрина `/blog/` и маршрут статьи | Устройство раздела |
| `src/layouts/BlogPost.astro`, `src/lib/blog.js` | Страница статьи и обработка её тела (база, слеши, якоря разделов) | Структура статьи |
| `src/pages/avtor-yuriy-meleshkin.astro` | Страница автора блога, цель `author.url` в разметке | Данные об авторе |
| `scripts/blog-covers.mjs` | Генератор обложек 1200×630 из кадра квеста | После новой статьи или смены кадра |
| `src/layouts/` | Макеты `quest`, `venue`, `category`, `info`, `holiday`; общий `<head>` | Общая структура типа и SEO-подключение |
| `src/components/`, `src/styles/`, `src/scripts/` | Общие блоки, оформление и клиентское поведение | Изменение интерфейса или поведения |
| `src/source-snapshots/` | Сгенерированные очищенные тела Tilda | Не менять руками |
| `src/generated/` | Сгенерированные реестры снимков | Не менять руками |
| `_capture/` | Миграционные генераторы и диагностика снимков | Только при осознанной пересборке Tilda-слоя |
| `public/assets/` | Публичные локальные картинки, шрифты, видео и CSS снимков | Добавление подтверждённого медиа |
| `migration/` | Источники редиректов, реестр миграции и история переноса | Редиректы и миграционные задачи; история — `migration/MIGRATION.md` |
| `scripts/`, `tests/` | Контракты сборки, SEO, ассетов, редиректов и тесты | Вместе с меняемым поведением |
| `docs/` | SEO, миграционные и приёмочные контракты | `docs/SEO-RAZMETKA.md`; release gate и cutover-приёмка — `docs/PRODUCTION_CUTOVER.md` |
| `deploy/` | Атомарная выкладка, откат, nginx и эксплуатация | Только релизные задачи; вход — `deploy/README.md` |

Текущий эксплуатационный источник истины — `deploy/README.md`: релизный механизм и московский
сервер уже существуют. `docs/PRODUCTION_CUTOVER.md` хранит release gate, сгенерированную таблицу
редиректов и приёмочные проверки переключения домена.

## Связанные документы знаний

- [`.claude/skills/project-knowledge/map.md`](.claude/skills/project-knowledge/map.md) — точные точки входа и якоря в крупных файлах кода и эксплуатации.
- [`.claude/skills/project-knowledge/soderzhanie-sayta.md`](.claude/skills/project-knowledge/soderzhanie-sayta.md) — предметная карта контента, предложения и известных противоречий данных.
- [`docs/SEO-RAZMETKA.md`](docs/SEO-RAZMETKA.md) — человекочитаемый контракт SEO и Schema.org.
- [`docs/inventar-sayta.csv`](docs/inventar-sayta.csv) — компактный сгенерированный реестр страниц; полный машиночитаемый инвентарь лежит рядом в JSON.

## Как страница превращается в HTML

`src/data/pages/<slug>.json` → `import.meta.glob` в `src/pages/[...slug].astro` → поле `type` →
`QuestPage` / `VenuePage` / `CategoryPage` / `InfoPage` / `HolidayPage` → общий `Layout.astro` →
если маршрут зарегистрирован в snapshot-манифесте, тело макета заменяется снимком → `dist/<slug>/index.html`.

| `type` | Макет | Главные поля |
| --- | --- | --- |
| `quest` | `src/layouts/QuestPage.astro` | `seo`, `hero`, `venueSlug`, `breadcrumbs`, `story`, `features`, `booking`, `related` |
| `venue` | `src/layouts/VenuePage.astro` | `seo`, `breadcrumbs`, `howto`, `games`, `map`, `hall` |
| `category` | `src/layouts/CategoryPage.astro` | `seo`, `hero`, `breadcrumbs`, `games`, `venues` |
| `info` | `src/layouts/InfoPage.astro` | `seo`, `breadcrumbs` и данные конкретной страницы |
| `holiday` | `src/layouts/HolidayPage.astro` | `seo`, `breadcrumbs`, `serviceType`, `sections`, при необходимости `venueSlugs` |

Проверка режима: `jq -e --arg route "/<slug>/" '.routes[$route]' src/generated/source-snapshot-manifest.json`.
Успех означает, что видимое тело берётся из снимка; отсутствие записи — из макета и JSON.

## Сгенерированные артефакты

| Не править | Источник | Команда |
| --- | --- | --- |
| `public/_redirects`, `.htaccess`, `docs/nginx-legacy-redirects.conf`, таблица между маркерами в `docs/PRODUCTION_CUTOVER.md` | `migration/legacy-url-map.csv` | `npm run generate:redirects`; проверка — `npm run verify:redirects` |
| `src/source-snapshots/*.html`, `src/generated/source-snapshot-manifest.json`, `public/assets/source-css/` и `public/assets/source-runtime/` | архивы `../work/raw/pages/`, overrides `migration/parity/source-overrides/`, данные сайта | `python3 _capture/build_source_snapshots.py` из корня; частичный `--routes` создаёт частичный манифест, поэтому его не коммитят вместо полного |
| `dist/` | Весь проект | `npm run build`; каталог git-ignored |

## Рецепты

### Добавить новый квест

1. Выбери уникальный транслитерированный `<slug>` и скопируй близкий по структуре обычный
   `type: quest` JSON в `src/data/pages/<slug>.json`; имя файла и `slug` должны совпасть.
2. Заполни подтверждённые `seo.{title,description,keywords,h1}`, `hero.{h1,pills,buttons,bg}`,
   `venueSlug`, `breadcrumbs`, затем нужные `story`, `features`, `booking`, `related`. В `hero.pills`
   укажи видимые `N+`, длительность и диапазон игроков. Правила разметки — `docs/SEO-RAZMETKA.md`.
3. Положи изображения под `public/assets/` и запиши пути от `/assets/`; для адаптивного героя
   используй `hero.bgset` с ширинами `760`, `1200`, `1600`.
4. Убедись, что `venueSlug` есть и в `src/data/venues.json`, и среди JSON `type: venue`.
5. Каталог подхватит карточку автоматически, но вручную обнови числовой текст `catalog из 41 игры`
   в `src/pages/kvesty-v-rostove-na-donu.astro`. Главная, площадки и категории могут быть снимками:
   включение карточки туда делай через источник снимка и полную пересборку, а не правкой HTML.
6. Собери и проверь: `test -f dist/<slug>/index.html`; `rg -F '/<slug>/' dist/sitemap.xml`;
   `rg -F 'BreadcrumbList' dist/<slug>/index.html`; `rg -F '"@type":"Service"' dist/<slug>/index.html`.
   Открой страницу и проверь видимые хлебные крошки.
7. Тест `tests/seo-data.test.mjs` сейчас точно ожидает 65 индексируемых страниц. Постоянное
   добавление требует изменить ожидание, актуальные счётчики в `docs/SEO-RAZMETKA.md` и любые
   пользовательские числовые обещания вместе с новой страницей; после этого запусти полный гейт.

### Добавить статью в блог

1. Прочитать [`docs/blog-redakcionnyy-brif.md`](docs/blog-redakcionnyy-brif.md) — там запреты по ценам,
   часам работы и спорным возрастам, формат статьи и правила перелинковки.
2. Создать `src/content/blog/<slug>.md` по схеме `src/content.config.mjs`. `title` до 60 символов,
   `description` строго 120–160 — иначе сборка падает на схеме.
3. Картинки в теле брать только из существующих файлов `public/assets/`; каждая внутренняя
   ссылка обязана вести на существующий маршрут и заканчиваться слешем.
4. Сгенерировать обложку: `node scripts/blog-covers.mjs --write-frontmatter`. Скрипт кладёт
   `public/assets/blog/<slug>.webp`, прописывает `image` и сохраняет исходный кадр в `coverSource`.
5. Прогнать `node --test tests/blog.test.mjs`, затем общий гейт `npm run ci`.

Статья попадает в `sitemap.xml`, в витрину `/blog/`, в блок «Читайте в блоге» на каталоге и в
перелинковку соседних статей автоматически — руками эти списки не ведут.

### Изменить текст или картинку страницы

1. Найди `src/data/pages/<slug>.json`; сквозной текст ищи сначала в `src/data/site.json`.
2. Проверь маршрут командой из раздела выше. Без снимка меняй JSON и ассет в `public/assets/`.
3. Со снимком JSON меняет `<head>` и разметку, но видимое тело остаётся архивным. Для видимого
   изменения обнови канонический raw/`migration/parity/source-overrides/<slug>.html`, затем запусти
   полный `_capture/build_source_snapshots.py`. Не редактируй `src/source-snapshots/` и манифест.
4. Проверь страницу после сборки; SEO и Schema.org сверяй по `docs/SEO-RAZMETKA.md`.

### Добавить площадку

1. Создай `src/data/pages/<slug>.json` с `type: venue`, `seo`, `breadcrumbs`, `howto`, `games`,
   `map`, при наличии `hall`; ориентир по структуре — соседняя площадка.
2. Добавь тот же `slug` в `src/data/venues.json` → `chips[]`: `href`, видимый адрес `t`, точные
   `lat`, `lon`, нужные `groups`. Добавь ссылку в `src/data/site.json` → `footer.cols` при необходимости.
3. Укажи этот `venueSlug` у относящихся к площадке квестов. Координаты и адреса не угадывай.
4. Обнови точное ожидание индексируемых страниц в `tests/seo-data.test.mjs` и счётчики в
   `docs/SEO-RAZMETKA.md`, затем проверь страницу, карточки, карту, `EntertainmentBusiness` и `npm run ci`.

### Поменять телефон или контакты

1. Получи подтверждённые значения владельца.
2. Согласованно обнови `src/data/site.json`: `header.phone/phoneHref/wa`, `footer.phone/phoneHref/email/hours`,
   `messengers.items`, а также реквизиты/соцсети при их изменении.
3. Обнови дубли в `src/data/pages/contacts.json`: `contacts.items`, `contacts.links`, `contacts.raw`.
4. Полностью пересобери снимки: генератор берёт видимый номер и `tel:` из
   `site.header.phone/phoneHref`, а WhatsApp-fallback — из элемента `site.messengers.items` с
   `id: "wa"`, и сам заменяет архивные значения. Ради телефона raw/override руками не правят.
5. Запусти `node scripts/structured-data-audit.mjs`, сборку и поиск старого значения в `dist/`.

### Обновить отзывы

1. Выполни `node scripts/update-reviews.mjs --check`: код `0` означает «изменений нет», код `1` —
   «есть свежие отзывы» и является ожидаемым сигналом, а не аварией. Во втором случае отдельно
   запусти `node scripts/update-reviews.mjs`; не связывай эти команды через `&&`.
2. Проверь diff только `src/data/reviews.json`; пустой ответ API не должен затирать файл.
3. Пересобери снимки полной командой: генератор встраивает `reviews.json` в их HTML.
4. Запусти тесты и сборку. Еженедельная автоматика описана в `.github/workflows/refresh-reviews.yml`.

### Собрать лендинг акции

1. Создай JSON `type: holiday`; начни с простого `sections`, не добавляй `sourceParity` и кастомную
   `composition` без отдельной вёрстки. Минимум: `seo`, `serviceType`, `breadcrumbs`, `sections`.
2. Первый section — `kind: hero` с `h1`, `sub`, `bg`, `buttons`; дальше используй поддержанные
   `text`, `features`, `cards`, `packages`, `gallery`, `reviews`, `faq`, `party-form`.
3. Добавляй цену/`Offer`, FAQ и видео только при видимом подтверждённом содержимом; смотри
   `docs/SEO-RAZMETKA.md`. При ограничении площадок задай `venueSlugs`.
4. Обнови точное ожидание индексируемых страниц в `tests/seo-data.test.mjs` и счётчики в
   `docs/SEO-RAZMETKA.md`; проверь мобильную и широкую ширину, CTA-якоря, форму, sitemap и полный гейт.

### Выложить и откатить

1. Работай из корня, с чистым Git и разрешением владельца. План: `deploy/deploy.sh --dry-run`.
2. Релиз: `deploy/deploy.sh`; скрипт сам выполняет гейт, сборку, доставку, атомарное переключение,
   `nginx -t`, HTTP-смоук и оставляет три проверенных релиза. Подробности — `deploy/README.md`.
3. План отката: `deploy/deploy.sh --rollback --dry-run`; откат: `deploy/deploy.sh --rollback`.
4. Домен, TLS и возврат DNS описаны в `deploy/DOMEN.md`; эксплуатация — `deploy/EKSPLUATACIYA.md`.

## Так не делают

- Не правят вручную сгенерированные файлы, снимки Tilda и `dist/`.
- Не запускают частичную генерацию снимков и не коммитят обрезанный манифест.
- Не считают изменение JSON доказательством изменения видимого snapshot-тела.
- Не выдумывают цены, даты публикации, отзывы, адреса, координаты, возраст и контакты.
- Не коммитят `dist/`, секреты, `.env` и SSH-ключи.
- Не используют `git add -A`, `git commit -a` и pathless-коммиты в общем дереве.
- Не пушат в `master`, не выкладывают и не переключают DNS без решения владельца.
- Не пересказывают миграционную историю: при необходимости читают `migration/MIGRATION.md`.

## Как проверить себя

Быстро и без сборки: `npm run verify:redirects`, `npm run verify:seo`,
`node scripts/structured-data-audit.mjs`, `npm run test`.

После согласования единственной сборки с соседними потоками: `npm run build`, затем
`npm run verify:assets`, `npm run verify:redirect-targets`, `npm run verify:production`.
Перед релизом: `npm run ci`. Зелёный результат — exit code 0 у всех команд, нет ошибок контрактов,
нужный HTML присутствует в `dist/`, ссылка есть в sitemap, а `git status --short` содержит только
ожидаемые файлы. `npm run ci` тяжёлый и несколько раз собирает сайт; параллельно его не запускают.
