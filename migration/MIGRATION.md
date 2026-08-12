# Перенос чезаквест.рф с Tilda на Astro — журнал и правила

Обновлено: **11.08.2026**. Машиночитаемый реестр страниц — `migration/pages.csv`
(пересобирается `python3 migration/build_registry.py`).

## Статус одной строкой

**Текущий честный статус (12.08.2026):** последний полный круг R27 охватил 67 Astro-маршрутов и 268 кадров на 1440×900/390×844 (DPR 2, touch), но не прошёл визуальные пороги: 64 `needs_fix`, 2 `redirect_ok`, 1 `extra_clone`, медианы 65,285 % / 63,155 %. R28 был начат после следующей волны source-backed правок и остановлен на 238 из 268 кадров; он не слит с R27 и не используется как доказательство приёмки. CI и статические проверки после правок прошли, но чистый визуальный круг и новый mobile Lighthouse не завершены. Полный честный журнал: [`PARITY_AUDIT_2026-08-11.md`](PARITY_AUDIT_2026-08-11.md).

**Перенесены все 58 страниц исходного официального sitemap**: главная, 37 квестов,
4 VR-игры, 9 площадок, категория «Страшные квесты», «Контакты» и 5 праздничных страниц.
Добавлены две снятые с живого Tilda коммерческие страницы вне sitemap, настоящий каталог
и карта legacy-редиректов. Дубль Уэнсдей остаётся только noindex-фолбэком до 301 на хосте.

## Аудит parity — 11.08.2026 (финальный измеренный статус R15)

Полный R15 охватил все 67 Astro-маршрутов на 1440×900 и 390×844, DPR 2
(268 пар оригинал/клон). Runtime clone чистый: нулевые overflow, console errors,
failed/external requests, битые ссылки, нарушения размеров изображений и lazy
первого экрана. Полнота URL также подтверждена: в `pages-matrix.csv` 181 строка и
`missing=0`.

Однако это **не приёмка parity**. R15 дал медианы pixel similarity 64,07 % на
desktop и 62,98 % на mobile при требованиях 90 % и 88 %; 64 обычные страницы
остались `needs_fix`. Lighthouse mobile также не прошёл на всех обязательных URL:
Performance равен 73 на `/`, 81 на `/40letpobedy216/`, 77 на `/new-year-2025/`
и 92 на `/strashnye-kvesty/`; у последнего SEO 92. Детальный и честный журнал,
включая исторический R8, — [`PARITY_AUDIT_2026-08-11.md`](PARITY_AUDIT_2026-08-11.md).
Он фиксирует незакрытые пороги и не является сертификатом готовности.

## Цели переноса (в порядке важности)

1. **Скорость.** Держим планку главной: PageSpeed 100/9x/100/100 mobile и desktop, 0 внешних
   запросов, CSS инлайном, картинки webp + lazy, hero — preload.
2. **Детальная похожесть.** Страница повторяет оригинал по составу, порядку блоков, текстам,
   фото и логике. Мелкие расхождения допустимы там, где они улучшают скорость или доступность;
   структура и смысл — один в один.
3. **SEO сразу в перенос, цель топ-1.** Страница уезжает на Astro уже с оптимизацией, вторым
   заходом её не переделываем. Обязательный минимум — раздел «SEO-контур» ниже.

## Карта проекта

| Что | Где |
| --- | --- |
| Нативный сайт на Astro | `astro-clone/src/` |
| Реестр страниц и статусы | `astro-clone/migration/pages.csv` |
| Этот журнал | `astro-clone/migration/MIGRATION.md` |
| Скрипты съёма с оригинала | `astro-clone/_capture/*.mjs`, `*.py` (16 инструментов в гите; сырьё и скриншоты игнорируются) |
| Снимки страниц оригинала (20.07.2026) | `work/raw/pages/*.html` — 181 файл, 67 МБ |
| SEO-аудит, семантика, конкуренты | `work/` (`semantic-core.csv`, `gaps.md`, `STRATEGY.md`, `PROPOSAL.md`) |
| Живой оригинал | `https://чезаквест.рф` (`xn--80aehcht5ci1b.xn--p1ai`), Tilda, отвечает |
| Демо-деплой | парольный GitHub Pages `khakimovpro.github.io/chezakvest-preview`, база пути `/chezakvest-preview` |

## Хронология

- **20.07.2026 — SEO-аудит.** Обход сайта: 181 URL (160 живых), из них 58 в официальном sitemap.
  Собраны семантика (162 фразы Wordstat), конкуренты, позиции, коммерческое предложение. Всё в `work/`.
- **21.07.2026 — клон главной на Tilda-рантайме.** Пиксель-в-пиксель, все ассеты локально,
  трекеры вырезаны. Десктоп Lighthouse 55→69.
- **21.07.2026 — нативная переверстка главной (текущий подход).** Главная переписана на Astro
  без Tilda-JS: `pages/index.astro`, `components/QuestCard.astro`, `layouts/Layout.astro`,
  `data/site.json`, `styles/`, `scripts/main.js`. PageSpeed **mobile 100/96/100/100,
  desktop 100/97/100/100**, LCP 15с → 1.3с, 0 внешних запросов. Старый Tilda-клон оставлен на `/tilda`.
- **09.08.2026 — заведён реестр переноса** (`pages.csv` + этот журнал), страницы кластеризованы
  по шаблонам Tilda, задан порядок волн.
- **09.08.2026 — волна 1 и 2: перенесены все 41 страница квестов и VR.** Сделан шаблон квеста,
  данные сняты с живого сайта скрейпером, картинки (548 шт, 18 МБ) пережаты в webp и лежат локально.
  Все страницы проходят приёмку `check_pages.py`: title ≤ 60, description 100–180, один H1,
  Service + BreadcrumbList, og:image, alt у картинок. Заведены `sitemap.xml`, `robots.txt`, `404`.
  Lighthouse mobile на выборке: Performance 99–100, SEO 100, Best Practices 100, A11y 96.
- **09.08.2026 — волна 3: 9 площадок.** Шаблон `VenuePage`: как нас найти с фото ориентиров,
  карта снимком со ссылкой в Яндекс.Карты, квесты на локации, зал для праздника.
  Schema.org `EntertainmentBusiness` с адресом, часами и телефоном.
- **09.08.2026 — волна 4 частично: категория и контакты.** `CategoryPage` — тёмная сетка квестов
  с бейджами (возраст, вместимость, длительность подтягиваются из данных самих квестов),
  `InfoPage` — контакты со списком всех девяти площадок ссылками (на Tilda там якоря).
- **09.08.2026 — волна 4 закрыта: 5 праздничных страниц.** `HolidayPage` — блочный шаблон:
  данные страницы это не фиксированные поля, а СПИСОК СЕКЦИЙ (`hero`, `packages`, `timeline`,
  `halls`, `tiles`, `cards`, `stats`, `features`, `steps`, `gallery`, `faq`, `party-form`),
  поэтому пять разных макетов Tilda рисует один шаблон. Пакеты, тайминг и составы программ
  вытащены с оригинала целиком (см. «Что нашли» ниже), у каждой страницы появился блок FAQ
  с разметкой `FAQPage`, цены попали в `Offer`. Все 58 страниц проходят `check_pages.py`
  без замечаний.
- **10.08.2026 — автономная доводка и release gate.** Формы получили видимые подписи,
  клиентскую валидацию и WhatsApp-отправку; галереи перестали обрезаться; добавлены каталог,
  связка квест → площадка, `lastmod` в sitemap, SEO-проверка, нормализованные legacy-ссылки
  и карта из 103 записей (102 audited hidden URL + дубль Уэнсдей). С живого Tilda сняты `/new-year-2025` и
  `/prazdniki-pod-kluch`; их данные попали в реестр.
- **10.08.2026 — Wave 1 visible fixes.** The catalogue now imports its shared page styles; the
  site ships root favicon, Apple touch and Windows tile assets; encrypted preview pages embed their
  cipher in the loader and keep preview access for a rolling seven days.
- **10.08.2026 — Wave 1 capture provenance.** The original Tilda site has no standalone
  `/kvesty-v-rostove-na-donu/` route (both forms return 404); the equivalent catalogue is the
  root section `/#rec1662454701`. Fresh 1440/390 original-and-clone captures are stored under
  `/home/claude/che_za_kvest/work/recon-2026-08-10/raw/wave-1/`. After the ignored
  `raw/mobile/CATALOG-BROKEN-*` evidence was overwritten, a pre-wave static snapshot was captured
  again in `raw/wave-1/recovered-baseline/`; it faithfully reproduces the broken CSS state, while
  the original PNG bytes are not recoverable.
- **10.08.2026 — Wave 2 shared chrome and navigation.** Header, footer, desktop mega-navigation
  and the 320 px mobile accordion are now data-driven from `src/data/site.json`. The desktop
  menu uses the measured glass treatment and real internal destinations; all 56 distinct header,
  footer and mobile-menu internal destinations were checked locally without 4xx responses. The
  reconnaissance wording "41 catalogue links" was not reproducible from its supplied JSON: it
  contains 36 actionable links (the larger count includes headings/separators), so the code uses
  36 instead of inventing five destinations. The verified 1200/1100/480 px header breakpoints,
  separate orange drawer logo and keyboard focus containment are deliberate accessibility and
  fidelity choices.
- **10.08.2026 — Wave 2 messenger decision.** Replaced the permanent WhatsApp-only floater with
  one local, accessible three-channel panel used by Header, Footer and mobile navigation. Exact
  MAX, WhatsApp and Telegram links are held in `site.json`; no messenger script or any other
  third-party request is loaded before a user follows a link. `/new-year-2025` remains the
  temporary navigation destination until Wave 4 creates `/new-year`; this avoids a transient 404.
- **10.08.2026 — Wave 2 verification and simplification.** `npm run build`, focused navigation
  tests, browser QA and the full `npm run ci` gate passed. Captures and pixel-diff artifacts are
  in ignored `_capture/shots/wave2/`: header comparison was 93.86% at 1440 and 86.73% at 390;
  footer desktop comparison was 90.67%. The supplied mobile footer source is only a viewport crop,
  so it was retained as a visual reference rather than treated as a false full-section pixel metric.
  Lazyweb reporting was attempted twice as required by the UI workflow but its signed upload was
  rejected first by a fetch error and then by the 10 MB image cap; existing recon screenshots were
  used instead. This external-tool limitation does not change the implementation.
- **10.08.2026 — Wave 3 interactive media.** A single native `<dialog>` lightbox and `ZoomImg`
  trigger now cover the captured photo surfaces in the home, quest, category, holiday and venue
  templates. It uses the clicked image's `currentSrc || src`, so decrypted preview `blob:` URLs
  work without a second asset source; GIF placeholders do not open an empty dialog. Desktop gets
  arrows, keyboard and pointer zoom; touch gets swipe navigation/dismiss; reveal animations are
  opt-in desktop IntersectionObserver effects and completely opt out for reduced motion.
- **10.08.2026 — Wave 3 venues, map and quizzes.** The nine venue chips and their grouped game
  lists/coordinates are preserved in `src/data/venues.json` directly from the reconnaissance
  payload. Local tooltips implement delayed hover/focus, Escape and two-tap mobile behaviour.
  The poster has its actual local 1160×428 dimensions (the report's 385px height disagreed with
  the checked asset), and an interactive Yandex iframe with all nine markers is created only after
  “Показать карту”; it produces no foreign request at initial render. Public Marquiz IDs live in
  `site.json`; its script is appended only after a `[data-quiz]` click. Both home hero CTAs and
  the delayed local “БОНУС” pop keep a normal fallback href if loading fails.
- **10.08.2026 — final QA hardening.** Preview password handling no longer puts the plaintext
  password in a process argument or browser storage: the deploy reads it from stdin and forces the ignored
  local file to mode 0600; the loader remembers only its derived AES key in a `Secure`,
  `SameSite=Strict`, preview-path cookie for seven days. A new encryption salt deliberately asks
  for the password once rather than retaining plaintext to unlock silently. This remains a static
  demo gate, not server-side authentication: an owner who needs a hard boundary must move preview
  to a dedicated origin or put it behind real server-side access control. Form retries now retain
  the accepted state until a field changes, WhatsApp PII is never left in an anchor URL, and
  automatic Metrika outbound-link tracking stays disabled. Final visual QA also fixed the hidden
  quiz popover, tablet arrow overflow, mobile CTA clipping, review star semantics, and the
  oversized 760w hero candidate; the second slider image is no longer fetched before it is shown.
- **10.08.2026 — final QA verification.** The release gate now passes with 71 tests, 68 generated
  pages, 65 indexable routes, 103 checked legacy records and zero production/asset/dependency
  findings. Browser sweeps across 67 routes at 390/768/1024/1440 recorded zero horizontal
  overflows, console errors, failed requests and initial third-party requests; the popup delay,
  lazy map, and a rapid blank-recipient form double-click were rechecked (one WhatsApp draft only).
  Fresh local static mobile Lighthouse runs for home, catalogue and `among_us` were
  100/100/100/100 with CLS 0 (LCP 0.5 s / 0.5 s / 0.4 s). The live preview was republished and
  tested: a fresh visitor enters the password once, the next page does not flash the form, no
  plaintext vault remains in localStorage, and the path-scoped cookie is not visible at a sibling
  GitHub Pages path. Final 1440/390 home captures and diagnostic diffs are ignored under
  `_capture/shots/final-qa/`.
- **10.08.2026 — Wave 3 reviews and reconciled facts.** The MyReviews screenshot was replaced
  with semantic local cards from `raw/reviews/data.json`, including `Review` and
  `AggregateRating` microdata. For page weight the component shows the 12 newest 4–5-star reviews
  from the 103-record snapshot rather than reproducing the remote carousel and its scripts. The
  only displayed aggregate is the snapshot's `4429`; weighted `4.97` is deliberately truncated to
  the original visible `4.9`, not rounded to `5.0`. Three older holiday statistic blocks now use
  the same count. Earlier journal statements that Marquiz or the Yandex map were domain-locked are
  superseded: both public integrations were verified during reconnaissance, with lazy loading used
  for performance and privacy instead.
- **10.08.2026 — Wave 3 verification.** Focused contract tests, build and browser QA passed:
  no foreign initial request, no console errors, 12-photo carousel navigation/Escape, mobile
  swipe/dismiss, tooltip hover/tap and lazy map insertion all succeeded. New 1440/390 captures
  are ignored under `_capture/shots/wave3/`; full-home comparisons against supplied historical
  original captures are 37.29% (1440, height delta 1394px) and 56.39% (390 DPR-normalized,
  height delta 3106px), chiefly because the source includes the third-party widget and old
  page composition. Mobile Lighthouse on the current home: Performance 97, Accessibility 93,
  Best Practices 100, SEO 100, CLS 0, LCP 2.45s.
- **10.08.2026 — Wave 4 quest parity.** The six source-proven difficulty values are now rendered
  as five visual keys in the quest hero (`among_us`/`portal-strike`/`zvonok`/`psihbolnitsa`: 3;
  `igra_v_kalmara`: 4; `sherlock_holms`: 5). The obsolete static slot calendars remain excluded,
  but each audited page now has an honest preliminary-booking fallback with its verified calendar
  identifier (84, 91, 84, 8, 87, 9). The three multi-venue celebrations render both real halls
  in full. Four supplied source videos were copied locally and stay click-started; Portal Strike
  deliberately has no invented video.
- **10.08.2026 — Wave 4 shared location and content parity.** Every venue map uses its captured
  public Yandex constructor URL only after the visitor activates the local poster; no initial HTML
  contains an iframe. Magnitogorskaya now contains all 14 source games. Quest, holiday, category,
  venue and contact layouts reuse the local review/venue/map components. The horror category has
  its page-wide dark theme, source card order and difficulty marks. Missing source-specific
  campaign art was simplified to existing local thematic assets, and the absent VR birthday video
  was represented with the locally available celebration video; this is deliberate rather than a
  remote dependency. The source's special call-tracking header on `/vypusknoj-kalmar` remains
  simplified to the shared header because no approved tracking number is configured.
- **10.08.2026 — Wave 4 campaign routing.** `/minecraft-lend`, `/roblox-land`,
  `/amongus-land`, `/igra-v-kalmara-lend` and `/new-year` are ordinary, indexable holiday routes,
  included in the sitemap and registry instead of redirect stubs. Their legacy-map rows are `200`
  self routes, so all three redirect artifacts are regenerated without self redirects. Navigation
  now points to `/new-year`; the archival `/new-year-2025` stays outside navigation. The new
  seasonal page is intentionally labelled 2027 while its older source capture says 2026, to avoid
  publishing an already stale campaign year.
- **10.08.2026 — Wave 4 verification.** `npm run ci` passed after the route, SEO and production
  contracts were extended to 65 indexable pages. Fresh affected-page captures at 1440 and 390 are
  retained under ignored `_capture/shots/wave4/` with side-by-side diffs against all available
  original captures. Those historical captures have mixed viewport/DPR and old third-party blocks,
  so their aggregate pixel scores are diagnostic only rather than a false release threshold.
- **10.08.2026 — Wave 5 lead delivery and consent.** Callback, party and preliminary-booking
  forms share `src/scripts/lead-form.js`. `site.leads.recipient` is deliberately the empty string:
  this produces no background request, preserves the entered fields, shows the honest confirmation
  “Заявка принята, перезвоним” and opens a prefilled WhatsApp draft. Filling that single value with
  an approved lead endpoint enables one JSON POST for all forms. Consent is opt-in, duplicate
  submissions are guarded, date fields use `Europe/Moscow`, and the emitted `lead:accepted` event
  carries no personal data. The catalogue now also has the common callback form.
- **10.08.2026 — Wave 5 analytics, accessibility and link graph.** `Analytics.astro` is inert
  until the numeric `site.analytics.metrikaId` is supplied; then it lazy-adds Metrika and reports
  only `lead_accepted`, phone-click and WhatsApp-click goals. No analytics request is present now.
  Consent controls were raised to 24 px and their legal links use the accessible orange text token.
  The privacy policy is an indexable breadcrumbed page in `sitemap.xml`. Footer event links now use
  published local routes, including the previously orphaned `/prazdnik-maxi`. The desktop mega menu
  is now viewport-anchored without a hidden 121 px horizontal overflow.
- **10.08.2026 — Wave 5 seasonal and redirect decision.** The obsolete 2025 New Year page is
  retired rather than kept as an indexable duplicate: `/new-year-2025` is a noindex static fallback
  to `/new-year`, while server hosts issue a 301. Its two numeric aliases also target `/new-year`.
  The redirect generator now writes all three deployment formats: `public/_redirects`, root
  `.htaccess`, and `docs/nginx-legacy-redirects.conf`; the map has 96 exact permanent redirects.
- **10.08.2026 — Wave 5 asset audit.** `scripts/asset-audit.mjs` checks runtime source and emitted
  build references separately, preserving lazy/data assets and reporting ordinary unused images
  without deleting them. It removed only 37 proven-unreachable Tilda executables/index artifacts
  (1,773,789 bytes); 428 unreferenced image/report-only assets remain intentionally because
  reachability alone is not evidence that a visual asset is safe to discard.
- **10.08.2026 — Wave 5 owner switches.** Before real lead delivery, set the approved endpoint in
  `src/data/site.json` at `leads.recipient`; it is intentionally blank in the committed build.
  Before analytics, set the numeric value at `analytics.metrikaId`. Before a production cutover,
  choose the owner-controlled host and apply the matching redirect artifact documented in
  `docs/PRODUCTION_CUTOVER.md`; all three formats are ready and no DNS was touched.
- **10.08.2026 — Wave 5 verification.** The full `npm run ci` gate passed (68 tests, production
  build, root and GitHub Pages builds, redirect/SEO/asset/production contracts and dependency audit).
  Targeted browser QA recorded zero initial foreign requests, console errors, failed requests and
  horizontal overflows across home, catalogue, privacy, a quest and the new campaign. The blank
  recipient flow was exercised on mobile: consent started unchecked, one `lead:accepted` event was
  emitted, input remained visible and the WhatsApp draft was correct. Fresh 1440/390 captures and
  diffs are ignored under `_capture/shots/wave5/`; historical source/clone full-page dimensions
  differ materially, so their 20.65%/11.46% catalogue and 36.57%/23.02% quest pixel scores are
  diagnostic only. Fresh mobile Lighthouse: home **100/97/100/100**, catalogue **100/100/100/100**,
  `among_us` **100/100/100/100** (Performance/Accessibility/Best Practices/SEO), all with CLS 0.
- **11.08.2026 — Full parity audit R8–R15.** Every round captured the complete 67-route
  set at 1440×900 and 390×844 rather than a sample. The final R15 source includes
  source-faithful home/party composition, local privacy assets aware of `SITE_BASE`,
  holiday content and anchors, campaign hero layers, quest cadence, category treatment
  and visible form labels. A WebP hero experiment in R14 was rejected because it did
  not preserve the required source-faithful result; its source change was reverted
  before the final R15 capture. The R15 inventory has no missing routes and no runtime
  findings, but visual and performance gates remain open: pixel medians are 64.07% /
  62.98% and only `/ono/` reaches the required mobile Performance 95. See
  `migration/PARITY_AUDIT_2026-08-11.md`, `migration/parity/visual-matrix.csv` and
  `migration/parity/known-gaps.csv`; R15 is documented as a measured non-certificate,
  not as a successful parity acceptance.

## Шаблоны: 57 страниц сводятся к 6 макетам

Кластеры считаются по отпечатку блоков Tilda (`data-record-type`) в снимках, порог сходства 0.80.

| Кластер | Стр. | Что это | Работа |
| --- | --- | --- | --- |
| c1 | 33 | квест-лендинг, базовый макет (+ площадки 40letpobedy216, magnitogorskaya1) | 1 шаблон → штамповка |
| c2 | 9 | квест-лендинг, расширенный вариант | правки поверх c1 |
| c3 | 7 | страница площадки (адрес) | 1 шаблон → штамповка |
| c4/c5/c8/c9/c11 | 5 | праздничные: `/kids`, `/prazdnik-maxi`, 2× день рождения, выпускной | блочный `HolidayPage`: один шаблон, разный набор секций |
| c7 | 1 | категория `/strashnye-kvesty` | индивидуально |
| c6/c10 | 2 | `/contacts`, `/brawl_stars` | индивидуально |

Вывод: **49 из 57 страниц закрылись тремя шаблонами**, оставшиеся макеты — блочным `HolidayPage`. Дорогая часть — первый экземпляр каждого
шаблона; дальше страница стоит дёшево (данные + фото + сверка).

## Расписание слотов — не переносим (решение Эда, 09.08.2026)

На Tilda расписание живёт блоком T131 и занимает 14 583 px из 21 839 на странице квеста:
конкретные даты и времена, вбитые в контент. На статике это протухнет за неделю, поэтому
**блок расписания в перенос не идёт**. Бронирование считаем внешним модулем и подключаем
отдельно; на его месте в шаблоне — блок брони с кнопкой и формой заявки. Перенос из-за
этого модуля не тормозим.

## Шаблон квеста — готов (09.08.2026)

Первый макет перенесён и работает: `src/layouts/QuestPage.astro` + данные `src/data/pages/<slug>.json`.
Роут один на все внутренние страницы — `src/pages/[...slug].astro`, слаг берётся из имени файла данных.

Порядок секций повторяет оригинал: герой (фото, пилюли «60 мин.» / «2-24», кружок возраста, H1,
две кнопки, круг play) → хлебные крошки → предыстория в две колонки → особенности (лид + ряд
карточек) → бронирование → «Другие квесты» → форма праздника → площадка с адресом → видео →
сценарии дня рождения → форма «Есть вопрос?».

Сквозные части вынесены в компоненты и переиспользуются всеми будущими типами страниц:
`Header`, `Footer`, `Breadcrumbs`, `CardsRow` (ряды карточек), `PartyForm`, `CallbackForm`.
`Layout.astro` теперь принимает title/description/canonical/og/preload/JSON-LD — главная от этого
не изменилась ни на пиксель (сверка до/после: 100 % на 1440 и 390).

**Замер на `/zvonok`, Lighthouse mobile: Performance 100, SEO 100, Best Practices 100,
A11y 96** (упирается только в контраст брендового оранжа, как и на главной).
LCP 1.7 с, CLS 0, TBT 10 мс.

Видео квеста не грузится вместе со страницей: лежит постер, локальный ролик подставляется
по клику. Исходник из снимка Tilda сохранён в `public/assets/video/`, поэтому при показе нет
внешнего запроса к старому хосту.

### Что нашли на оригинале по ходу переноса

- **`/kvest_v_realnosti_zapad`: блок «Другие квесты» отдаёт `Error get alias`** — на живом сайте
  перелинковки нет вообще, страница-сирота. В переносе такие случаи закрывает запасной блок:
  если данных нет, «Другие квесты» собираются из остальных перенесённых страниц.
- **Структура квестов плавает**: у части страниц вместо карточки площадки идёт «Нужен банкетный
  зал?» с галереей, у части нет видео или сценариев. Нераспознанные блоки не выбрасываются —
  они переносятся секцией `extra` (заголовок + текст + фото), поэтому контент не теряется.
- **Карточки особенностей на Tilda различаются только кеглем и насыщенностью** (22px/700 против
  18px/300) — по тексту заголовок от подписи не отделить, парсер смотрит на стили.
- **Title у 5 страниц длиннее 60 знаков, description у 7 вне 100–180** — при переносе
  нормализуются: длинный title собирается как «Название — квест в Ростове-на-Дону», длинный
  description режется по границе предложения.

### Известные расхождения с оригиналом

- Нет ряда иконок-ключей «уровень сложности» в герое — на Tilda это картинка без данных о числе ключей.
- Расписание слотов отсутствует намеренно (см. решение выше), поэтому страница короче оригинала
  примерно на 1 700 px.
- Карта и виджет отзывов, как и на главной, доменно-залочены и живьём не работают.

## Праздничные страницы — что нашли и как перенесли (09.08.2026)

- **Пакеты праздника вбиты в PNG.** На `/kids` три вкладки («Праздник в квесте», «в VR»,
  «с играми»), в каждой — три карточки-картинки со всем составом программы. Контент вкладки
  живёт в DOM только когда она открыта, поэтому вкладки снимали кликом
  (`_capture/tabs_shot.mjs`), а текст читали со скриншотов. В переносе это 9 текстовых
  карточек: состав с таймингом, список включённого, длительность. Вкладки переключаются
  радиокнопками и CSS — весь текст лежит в разметке сразу, его видит поиск, JS не нужен.
  Те же картинки стоят на `/den-rozhdeniya-uznik-azkabana` (пакеты «в квесте») и
  `/den-rozhdeniya-na-vr-arene` (пакеты «в VR») — тексты переиспользованы.
- **Слайды каруселей залов не видны Playwright.** «1 из 3» на Tilda — это три отдельных
  rec-блока, скрытых стилями. Достаём их из HTML-снимка `_capture/extract_recs.py`. Так нашлись
  залы на Магнитогорской, 1 и комнаты отдыха в квеструмах (`/kids`), Нагибина, 14а
  (`/prazdnik-maxi`). В переносе карусели нет: все залы показываем карточками сразу,
  каждая ведёт на страницу своей площадки.
- **Подписи плиток разъезжались с фото.** У шоу-программ подпись лежит поверх картинки,
  а часть картинок на оригинале — заглушки `noroot`; сопоставление по порядку давало чужие
  фото. Сопоставляем по координатам (подпись внутри прямоугольника фона). Плитка без фото
  на оригинале так и остаётся без фото — рисуем фирменный блок вместо дыры.
- **Квиз и виджет отзывов не переносятся** (Marquiz и виджет доменно-залочены). Все кнопки
  «Рассчитать стоимость», «Узнать стоимость пакетов», попапы допуслуг и стрелки слайдеров
  ведут на форму заявки `#prazdnik` — ссылок в никуда не осталось.
- **Ссылки на карточках квестов вели в квиз.** На `/vypusknoj-kalmar` и `/prazdnik-maxi`
  карточки сценариев открывали попап. В переносе они ведут на страницы этих квестов
  (`/beguschij_v_labirinte`, `/minecraft`, `/among_us`, `/portal-strike`, …) — это закрывает
  провал аудита по сиротским страницам.
- **Два H1 на `/den-rozhdeniya-uznik-azkabana`.** На оригинале заголовок и подзаголовок оба
  размечены как H1. В переносе H1 один, вторая строка ушла в подзаголовок.
- **Цены.** `/prazdnik-maxi` — 30 900 ₽ за 8 участников, +1000 ₽ за каждого следующего ребёнка;
  `/vypusknoj-kalmar` — от 2700 ₽ за ребёнка (цифра из title оригинала). Обе попали в `Offer`.
- **FAQ добавлен на все пять страниц** — вопросы собраны только из фактов самой страницы
  (возраст, вместимость, длительность, состав, адреса), ничего не придумано.
- **Замер, Lighthouse mobile:** Performance 99, Accessibility 96, Best Practices 100, SEO 100,
  CLS 0, TBT 0 мс, LCP 1.9–2.1 с. Для сравнения в тех же условиях уже принятая `/zvonok`
  даёт 99 и LCP 2.0 с — то есть праздничные страницы на уровне остальных.
  Accessibility упирается в контраст брендового оранжа, как и везде.

### Известные расхождения праздничных страниц с оригиналом

- Карусели (залы, ленты фото) заменены сетками: весь контент виден сразу.
- Виджеты квиза и отзывов отсутствуют, на их месте формы заявки.
- `/vypusknoj-kalmar` на оригинале идёт со своей тёмной шапкой и отдельным телефоном
  +7 (958) 717 65 23 (номер call-tracking). В переносе шапка и футер общие для всего сайта.
- Лид-магниты Tilda («скачайте каталог», конструктор пригласительных) перенесены как текст
  с шагами: сами формы работали на скриптах Tilda.

### Хвост, который не входит в 58 страниц sitemap

Праздничные страницы раньше ссылались на Tilda-лендинги вне sitemap. В Astro внутренние
ссылки нормализованы на канонические квесты; старые пути `/igra-v-kalmara-lend`,
`/minecraft-lend`, `/roblox-land`, `/amongus-land`, поддомен Гарри Поттера, `/privacy` и
`/new-year` покрыты картой legacy-редиректов или локальным noindex-фолбэком.

## Превью под паролем (для показа заказчику)

**Ссылка:** https://khakimovpro.github.io/chezakvest-preview/ — репозиторий
`Khakimovpro/chezakvest-preview`, ветка `main`, Pages из корня.

GitHub Pages на бесплатном тарифе не отдаёт сайты из приватных репозиториев, поэтому доступ
закрыт не настройками хостинга, а шифрованием: на сервере лежат только зашифрованные данные.

- Each page cipher is embedded in its loader, so the password loader needs no secondary `page.enc`
  request. A legacy fallback remains only for an already cached old loader.
- Каждая картинка шифруется в `<имя>.enc`; в разметке вместо `src` стоит `data-enc`,
  лоадер расшифровывает картинки и подставляет blob-ссылки уже после ввода пароля.
- AES-256-GCM uses a PBKDF2-HMAC-SHA256 key with 250,000 iterations. The salt is shared per build
  and each file has its own nonce. Only the ready AES key is stored for a rolling seven days, in a
  `Secure`, `SameSite=Strict` cookie scoped to `/chezakvest-preview/`; the plaintext password is
  never stored in the browser. A new build has a new salt, so it deliberately asks once again.
  This is preview convenience, not server-side access control or a hard same-origin boundary.
- **Скорость.** Ключ считается один раз на страницу: с солью на каждый файл разблокировка
  главной занимала 3.7 с, стало ~0.35 с. Картинки расшифровываются лениво — сразу только
  первые два экрана, остальное по мере скролла (IntersectionObserver, запас 800 px).
- Отложенные картинки Tilda и слайдера (`data-src`) тоже шифруются, иначе слайды ломались.
  Фон-паттерн страницы прописан в CSS через `url()` и остаётся открытым: подменить его
  blob-ссылкой нельзя, а содержимого он не выдаёт.
- Access persists across tabs and browser restarts for a rolling seven days. Append `?logout` to any
  preview URL to clear it immediately.
- `robots.txt` в превью запрещает индексацию целиком, `sitemap.xml` из превью удаляется.

**Обновить превью и снять пароль — одной командой:**

```bash
./migration/deploy_preview.sh          # под паролем: собрать, зашифровать, выложить
./migration/deploy_preview.sh --open   # снять пароль: выложить обычный сайт
```

Пароль лежит в `astro-clone/.preview-password` (в `.gitignore`, в репозиторий не попадает); скрипт
передаёт его в шифратор через stdin и перед сборкой выставляет файлу права `0600`.
Пароль снимаем только после приёмки: пока сайт не доделан, заказчик не должен видеть его целиком
(решение Эда от 09.08.2026). После `--open` в превью остаётся `robots.txt` с полным запретом
индексации — превью не должно конкурировать с боевым доменом в поиске.

## Инструменты переноса

| Скрипт | Что делает |
| --- | --- |
| `_capture/scrape_page.mjs <slug>…` | снимает страницу с живого сайта в `_capture/pages/<slug>.json` + скриншоты 1440/390 |
| `_capture/build_quest.py <slug>…` | превращает снимок в данные страницы, качает и жмёт картинки в `public/assets/q/` |
| `_capture/build_holiday.py <slug>…` | черновик блочных данных праздничной страницы (секции + картинки) |
| `_capture/dump_page.py <slug>` | читаемый дамп снимка: секции, тексты, ссылки, картинки — для разбора нестандартных макетов |
| `_capture/extract_recs.py <slug> [rec…]` | текст и картинки rec-блоков из HTML-снимка: скрытые слайды каруселей |
| `_capture/tabs_shot.mjs <slug> <rec>` | кликает по вкладкам Tilda и снимает содержимое каждой |
| `_capture/crop_section.py <slug> <top> <h>` | вырезает кусок скриншота оригинала, чтобы прочитать текст, вбитый в картинку |
| `_capture/fetch_images.py [ширина] <url…>` | тянет картинки поимённо в общий пул и печатает локальные пути |
| `_capture/check_assets.py` | проверяет, что каждая картинка из данных страниц есть в `public/` |
| `_capture/shot.mjs <url> <имя>` | скриншоты 1440/390 любой страницы |
| `_capture/compare.py A.png B.png` | процент совпадения и полосы расхождений |
| `_capture/check_pages.py` | приёмка сборки: SEO-контур каждой страницы и внутренние ссылки без страницы |
| `migration/build_registry.py` | пересборка реестра `pages.csv` |

## Конвейер переноса одной страницы

1. **Съём с живого оригинала.** Playwright-скрипт в `_capture/` открывает URL, ждёт рендер Tilda,
   вытаскивает тексты, порядок блоков, ссылки, ассеты. Позиции Zero-блоков в CSS отсутствуют —
   их задаёт JS в рантайме, поэтому данные снимаются с отрендеренной страницы, не с HTML.
2. **Данные в JSON.** Контент страницы кладём в `src/data/pages/<slug>.json`. Никакого текста
   в `.astro`-разметке — шаблон читает JSON, это и делает штамповку дешёвой.
3. **Картинки.** Скачиваем, пережимаем в webp q82, кап 1600px по длинной стороне
   (`_capture/optimize_images.py`), кладём в `public/assets/`. Hero — адаптивный (760/1600, если источник это позволяет) + preload.
4. **Рендер шаблоном.** Страница = Astro-компонент типа (`QuestPage`, `VenuePage`, …) + JSON.
5. **Сверка с оригиналом.** Playwright скриншотит оригинал и клон в 1440 и 390, считает совпадение.
   В чат выносится только процент и список расхождений — не HTML.
6. **Запись в реестр.** `python3 migration/build_registry.py` — статус берётся из наличия файла
   страницы, вручную статусы не правим.

## Страница считается перенесённой, когда

- Совпадение с оригиналом ≥ 95 % на 1440 и на 390 (расхождения — только автослайдеры и виджеты).
- Lighthouse mobile: Performance ≥ 95, SEO и Best Practices 100, CLS 0, 0 внешних запросов.
- Есть SEO-контур целиком (список ниже).
- Все внутренние ссылки ведут на существующие пути (перенесённые или ещё-Tilda — но не в 404).
- Страница попала в `pages.csv` со статусом `done` после прогона генератора.

## SEO-контур (обязателен на каждой странице, цель — топ-1)

- **Title/description** — переписываем под целевой кластер из `work/semantic-core.csv`
  (колонка `target_or_proposed_url`), а не копируем Tilda. Title ≤ 60 знаков, description 120–160.
- **Один H1**, ключ + гео («в Ростове-на-Дону»), заголовки H2/H3 под подзапросы.
- **Schema.org JSON-LD**: квест и VR — `Service` + `Offer` (цена, валюта, длительность,
  возраст, вместимость); площадка — `LocalBusiness`/`EntertainmentBusiness` с адресом, гео,
  часами, телефоном; блок вопросов — `FAQPage`; хлебные крошки — `BreadcrumbList`.
  `Event` только для реальных датированных событий (решение аудита от 20.07).
- **Canonical** на кириллический домен в punycode, единый вид URL (без хвостового слэша).
- **Перелинковка**: квест ↔ площадка, где он идёт; квест ↔ тематическая категория;
  «похожие квесты» блоком внизу. Это закрывает главный провал аудита — сиротские страницы.
- **Открытый граф** (og:title/description/image, 1200×630) + `twitter:card`.
- **Alt** у смысловых картинок; пустой alt только у декоративных.
- **Скорость как ранжирующий фактор** — см. цель №1, отдельным заходом не улучшаем.
- Сверка выдачи и позиций — по методике `work/decisions.md`: без выдуманных позиций.

## План волн

| Волна | Страницы | Смысл | Статус |
| --- | --- | --- | --- |
| 1 | шаблон квеста + 6–8 квестов | самый массовый макет, отладка конвейера | готово |
| 2 | остальные квесты c1/c2 (≈28) + 4 VR | штамповка | готово |
| 3 | 9 площадок | локальное SEO, карточки организаций | готово |
| 4 | `/kids`, `/prazdnik-maxi`, дни рождения, выпускной, `/strashnye-kvesty`, `/contacts` | самые денежные интенты, каждая индивидуально | готово |
| 5 | новые страницы под спрос из аудита (корпоратив, каникулы, тематические лендинги праздников) | `/new-year-2025` и `/prazdniki-pod-kluch` сняты с Tilda; прочие не создаются без источника | частично закрыта |

## Сколько страниц за один чат

Контекст ест не количество страниц, а количество **разных макетов** и объём сырья, попавшего в чат.
Поэтому:

- **Новый шаблон** (первый экземпляр макета) — 1–2 за чат, дальше качество падает.
- **Штамповка по готовому шаблону** — 20–25 за чат, если сырьё не тащить в чат: скрипты пишут
  JSON и скриншот-диффы в файлы, в диалог возвращается только сводка.
- **Смешанный чат** (шаблон + штамповка) — шаблон + 8–10 страниц.

Что держит планку: не читать снимки Tilda целиком (600 КБ каждый), не печатать HTML в чат,
сверку делать скриптом с числовым выводом, реестр обновлять генератором.

## Грабли (проверены на главной)

- **tildacdn отдаёт JS/CSS gzip'ом всегда** — разжимать по magic-байтам `1f 8b`, иначе рендер пустой.
- **Zero-blocks (t396)**: позиции и высоты задаёт JS из `data-artboard-height`/`data-field-*`;
  в CSS их нет. Данные снимаем с отрендеренной страницы через `elementsFromPoint`, а не парсингом HTML.
- **Карточки квестов** — не группы, а разнесённые абсолютные `.t396__elem`; `zoom` ломает bbox.
- **Бейджи карточек запечены в PNG-оверлей** (ключи, возраст, «2-10 чел / 60 мин», «Новинка») —
  в DOM их нет.
- **`aspect-ratio` + `min-height`** на узкой ширине раздувает ширину — на мобайле `aspect-ratio: auto`.
- **Фон вместо `<img>`** не ленится: галереи переводить в `<img loading="lazy">`.
- **Слайдеры**: первый слайд `src`, остальные `data-src` + догрузка на idle.
- **bs4 ре-сериализация ломает инлайн-JS** (`&&` → `&amp;`) — HTML править строками/regex.
- **Внешние хосты Tilda зашиты внутри её JS/CSS** (шрифты, флаги масок, stat, forms) — переписывать
  на локальные `/assets`, иначе из РФ запросы висят через ddos-guard и страница «грузится вечно».
- **Карта Яндекса и виджет отзывов доменно-залочены** — на своём хосте не работают, на главной
  стоят статичные скриншоты. Для площадок нужно решение: своя карта или статика.
- **Телефон**: в клоне настоящий +7 928 216-36-23, на живом сайте Roistat подменяет его на
  трекинговый. При переезде вернуть подмену или отказаться от неё — вопрос к клиенту.
- **A11y 96-97 вместо 100** — упирается в контраст брендового оранжа `#ff6b00`. Цвета клиента,
  не меняем без его решения.

## Внешние решения

Единый, намеренно короткий список фактов, которые нельзя вывести из исходных снимков или кода,
ведётся в [`docs/OWNER_INPUTS.md`](../docs/OWNER_INPUTS.md). Пока таких решений нет, production
не переключается: парольное preview остаётся единственной опубликованной средой.
