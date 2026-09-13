# HLS-видео

Реестр `src/data/video-hls.json` — единственный источник метаданных. Добавь запись со слагом
`<quest>-trailer`, `<page>-party-N` или `<page>-review-N`, подтверждённым источником, размерами,
длительностью и путём будущего постера. `uploadDate` и `uploadDateSource` добавляй только при
подтверждённой дате публикации.

Открой SOCKS-туннель потока A, если источником служит Rutube, затем запусти одну команду:

```bash
scripts/video/run.sh <slug>
```

Команда скачивает или копирует исходник, создаёт HLS 720p/480p без апскейла, делает WebP-постер,
заливает объекты в `che-za-kvest-videos`, проверяет CORS с Origin стенда и удаляет локальные
`raw/` и `hls/`. Бакет и CORS создаются один раз идемпотентно:

```bash
AWS_EC2_METADATA_DISABLED=true python3 scripts/video/sozdat_baket.py
```

Для рендера передай слаг в `<HlsVideo slug="…" />`. Если есть подтверждённая дата публикации,
передай ту же запись в `hlsVideoObjectJsonLd({ entry, slug, base, path, pageName })`.
