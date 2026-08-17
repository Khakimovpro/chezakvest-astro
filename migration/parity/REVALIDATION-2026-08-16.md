# Повторная проверка — 16.08.2026

## Результат

Рабочая копия содержит 67 опубликованных Astro-маршрутов и 66 source snapshots. Контент snapshot
не удалялся. После обычного запуска `_capture/build_source_snapshots.py` получено 66 маршрутов,
2 218 ресурсов и 100 style-файлов; семь архивных originals и MOV не появились повторно в
`public/assets`.

## Адаптив

- Полный `quick-width-audit` охватил 67 × 12 = 804 комбинации. 235 raw `clipped` относятся к
  намеренному line-clamp локальных отзывов, ещё к декоративным/своим scroll-rail случаям; 15
  содержательных offscreen срабатываний были в source-review slot пяти campaign-маршрутов.
- Исправленный slot проверен на `/amongus-land/`, `/igra-v-kalmara-lend/`, `/minecraft-lend/`,
  `/roblox-land/`, `/vypusknoj-kalmar/` при 390, 480, 640, 768, 1024, 1100 и 1440px: 35/35 без
  page overflow.
- Независимый layout review повторил проверку на 390/1024/1100px и подтвердил, что ширина
  документа равна viewport, desktop-геометрия после resize восстанавливается, а первые экраны
  `/`, `/kids/`, `/ono/` не содержат незагруженного background gap.

## Медиа и интерактив

| Изменение | Проверяемый результат |
| --- | --- |
| Две копии `kubok.mov` / `кубок.MOV` | Сохранены в `migration/parity/source-media/`, отсутствуют в `public/`; опубликован `public/assets/video/kubok.mp4` (23 446 681 B). |
| Видео на двух праздничных страницах | Источник — локальный MP4, `preload=none`; браузерный клик перевёл `currentTime` с 0 и снял play-overlay на обеих страницах. |
| Семь главных изображений | Archive originals: 4 480 546 B; published WebP: 880 028 B. Визуально сверены кадры до/после. |
| Живой слой | `live-layer-verify` прошёл на 20 representative routes в 1440 и 390px: нет initial external requests, ошибок страницы или document horizontal scroll; карта, отзывы, hover и бонус остаются доступны. |

Новые проверки `tests/live-layer-contract.test.mjs` удерживают локальный MP4 и проверяют реальный
click handler; `tests/home-slider.test.mjs` декодирует hero WebP, сравнивает исходные размеры и
проверяет снижение его размера более чем в четыре раза.

## Lighthouse mobile: локальный стенд

`dist` отдавался `python3 -m http.server`, поэтому gzip/brotli отсутствуют. Эти данные честно
показывают изменение кода и ассетов, но не являются данными production/CDN.

| Маршрут | До: P/A/BP/SEO, LCP, transfer | После: P/A/BP/SEO, LCP, transfer |
| --- | --- | --- |
| `/` | 58/86/100/100, 22,8 с, 4 709 KiB | 57/86/100/100, 11,6 с, 2 837 KiB |
| `/kids/` | 56/81/100/100, 30,8 с, 5 851 KiB | 56/81/100/100, 21,9 с, 4 219 KiB |
| `/ono/` | 58/89/100/100, 11,5 с, 2 912 KiB | 58/89/100/100, 9,8 с, 1 613 KiB |

Production metric requires a separately authorised deployment/host check, since this task explicitly
does not publish a preview or deploy.

## Финальные проверки

```text
python3 _capture/build_source_snapshots.py        # 66 routes, 2 218 resources
python3 _capture/check_assets.py                  # no broken asset paths
node scripts/asset-audit.mjs                       # passed
node scripts/live-layer-verify.mjs ...             # passed
node --test tests/live-layer-contract.test.mjs tests/home-slider.test.mjs  # 17/17
git diff --check                                   # passed
```

Lazyweb report was requested once as required for UI work. The provider returned
`FREE_MONTHLY_TOOL_QUOTA_EXHAUSTED`; no retry or fabricated report link was used.
