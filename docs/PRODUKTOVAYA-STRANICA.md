# Продуктовая страница квеста

Дизайн, токены, иконки и компоненты: [Дизайн продуктовых страниц](DIZAYN-PRODUKTOVYH-STRANIC.md).

Продуктовый макет включается полем `"render": "native"` в JSON квеста. Оно отключает архивный Tilda-снимок для маршрута и исключает его из следующей полной генерации снимков. Поле не зависит от slug: та же схема подходит каждому квесту.

Порядок блоков: hero → коротко → галерея → видео → сюжет и особенности → кому подойдёт → бронирование → отзывы → фото игроков → безопасность → праздник → FAQ → карта → другие квесты и сценарии → финальный CTA. Блок выводится, только если модель получила для него данные.

## Схема данных

`product.rating`: `{ value, count, href }` — рейтинг компании с подтверждённой ссылкой на отзывы.

`product.short`: подтверждённый вводный текст, строка или массив абзацев. `gallery` и `players` — массивы `{ src, alt }`; первая галерея требует минимум три фотографии. `videoSlug` — ключ из `src/data/video-hls.json`. Необязательные `videoIntro` и `videoPoints: [{ t, sub? }]` задают вводный текст и короткие пункты рядом с роликом; факты повторяют подтверждённые данные страницы.

`fit.for` и `fit.important` — списки подтверждённых форматов и правил. `reviewIndexes` — индексы дословных записей из `reviews.json`; подпись блока обязана говорить об отзывах компании, если квест или площадка в отзыве не названы. Связанные карточки с тем же маршрутом или названием, что текущая страница, общий рендер исключает.

`safety` — только подтверждённые факты. `party` содержит `title` и минимум три фото залов. `faq` — массив `{ q, a }`: эти же вопросы становятся FAQPage. `finalCta` содержит `{ title, text }`.

## Перевод квеста на продуктовый макет

1. Подтвердите факты, фотографии, отзывы, видео и карту в источниках проекта.
2. Заполните `product` и поставьте `render: native`; сохраните SEO-поля без непроверенных изменений.
3. Проверьте, что есть бронь с `calendarId`, телефон, WhatsApp и якоря `#story`, `#prazdnik`, `#booking`, `#video`, `#karta`.
4. Запустите тесты, SEO-аудит, сборку и проверьте снимки 390, 768, 1440 px.
5. При полной пересборке снимков используйте генератор без `--routes`: нативный маршрут не попадёт в манифест.

## Праздничные лендинги

Праздничная страница использует тот же флаг `render: native`, но её модель живёт в `sections[]`. Нативный диспетчер `HolidayPage.astro` берёт из данных только заполненные блоки и не меняет артборды страниц без флага.

Порядок: hero → `players` → `video` → `included` → `stats` → `packages` → `timeline` → `safety` → `reviews` → сценарии `cards` и квиз → `tiles` и `steps` → `halls` → `map` → `faq` → финальный `party-form`. `video.videoSlug` или `video.videoSlugs` ссылаются на `video-hls.json`; ролики `kind: party` подписываются как видео с праздников. `reviews.reviewIndexes` — на локальные отзывы; `map` содержит локальный постер и ленивый iframe. FAQ выводится через `<details>` и одновременно становится FAQPage. Несколько групп `packages` становятся вкладками после загрузки JavaScript, а без него остаются полным списком.

Чтобы перевести лендинг, сохраните SEO, добавьте `render: native`, заполните только подтверждённые секции и оставьте единственный финальный `party-form` с `id: prazdnik`. Hero должен вести «Узнать стоимость» к этой форме, а телефон и WhatsApp берутся из `site.json`. После изменения проверьте HTML без `source-snapshot-shell`, FAQ, карту, форму, телефон, WhatsApp и снимки на 390, 768 и 1440 px.

## Подача продуктовых блоков

Актуальные визуальные правила, токены и приёмка находятся в [дизайн-системе продуктовых страниц](DIZAYN-PRODUKTOVYH-STRANIC.md). Источники значений — `src/styles/product/tokens.css` и `src/styles/product.css`. Межсекционные поля растут от 56 до 96 px на ширинах 390–1440, ширина текста ограничена `--product-measure: 64ch`.

`ProductVideo` принимает `title`, `intro`, `points: [{ t, sub? }]` и `slug` либо `items: [{ slug, title? }]`. Праздник может передать `video.intro` и `video.points`; без собственных пунктов используются дословные `included.items`. Кадр сохраняет пропорции из HLS-реестра. Несколько роликов на телефоне образуют горизонтальную ленту с превью следующего кадра; точная геометрия по брейкпоинтам описана в дизайн-системе.

`ProductPackages` reserves a 28 px badge slot in every card header, followed by 8 px gaps before the name and duration. Lists keep their natural row heights with 12 px item gaps and 16 px between lists; spare card height stays before the bottom-aligned action. `ProductReviews` separates metadata from the full review text by 12 px, groups the author and source at the card bottom with 16 px top padding, and keeps a 24 px gap before its actions even after expansion.

Count-based variants apply across product pages: four safety items use two columns on desktop and one on mobile; five tiles use five columns when their content container reaches 1080 px, three below that, and two below the 768 px viewport breakpoint. Other tile groups retain the existing four/two-column grid. Within `product-final`, callback forms have 32 px side padding on desktop and a 24 px field gap; two fields share a row only when each can occupy at least 240 px. Mobile form padding and the 17 px input text are preserved.


Product controls share the spacing tokens with `MobileCtaBar`, including when the holiday bar is outside `.product-page`. The mobile bar has 8 px padding and gap, 48 px actions, and an additional bottom safe-area inset. Product anchor sections and forms reserve the measured `.hdr` height plus 16 px; the shared bar component updates the header token through `ResizeObserver`.

Package layout follows the `product-packages` content container: below 680 px, one card uses the available width minus 36 px; from 680 to 991 px, two cards use `(width - 52px) / 2`; from 992 px, three columns share the row. Both rails use a 16 px gap and a 20 px preview of the next card. Badge and selected-tab text use `--cta-ink` on brand orange; badge text is 15 px. Product PartyForm labels use #666 on white and remain above the name and phone inputs with an 8 px gap, so focused and filled values stay readable.

`ProductBooking` makes the service's available `.click_load_item` time spans keyboard buttons after the schedule loads, preserving their `data-id` and click handler. Enter and Space activate them; unavailable `.close_item` slots have `aria-disabled=true` and leave the tab order. Product schedule slots and the expand action have a minimum 44 px target, 15 px text, and dark text on orange. The initial seven days and fallback remain unchanged; archived schedules keep their original adapter and styling.

Shared `.product-more[hidden]` removes expanded gallery and review actions from layout and keyboard navigation. Mobile photo-rail arrows are 44 px with 4 px gaps; tablet and desktop arrows remain 48 px. `ProductMap` reserves its area with aspect-ratio (4/3 on mobile, 16/10 from 768 px); the iframe fills the same area. At 768–1023 px the address precedes the full-width map in one column. Video facts use icon chips, followed by the same primary action and anchor as the corresponding product hero.

`scripts/video/poster.sh` samples ten frames evenly across 10–90% of the source duration. It ranks full-range grayscale mean and variance with equal min/max-normalized weights, selecting the earliest candidate on a tie. The selected frame is encoded within 81,920 bytes; an unsuccessful encode preserves the previous poster. Candidate times, metrics, selected frame, quality and size are emitted as JSON to stderr; stdout retains the output path. Inspect the generated scene before publication. Posters are served from the local paths in the HLS registry.

`ProductStats` reserves a minimum 24 px prefix slot through `--product-space-24` in its three-column layout (viewport >= 768 px), including cards without `item.up`. Number and caption starts align across the row. Below 768 px the single-column cards retain natural prefix heights, including zero for an empty prefix.
