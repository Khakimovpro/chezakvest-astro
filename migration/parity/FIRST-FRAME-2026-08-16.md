# First-frame source snapshot audit — 16.08.2026

Финальная обычная сборка проверена последовательно одним Chromium на mobile viewport 390×844.

| Показатель | Результат |
| --- | ---: |
| Маршрутов R89 | 67 |
| Маршрутов с `.source-snapshot-shell` | 66 |
| Failures | 0 |
| Начальное состояние | `display:none`, `visibility:hidden`, `aria-busy=true` на всех 66 |
| Конечное состояние | `display:block`, `visibility:visible`, `aria-busy` removed, non-zero height на всех 66 |
| Settle interval | 742–1148 ms |
| Minimum shell height | 2754 px |
| Page errors / horizontal overflow | 0 / 0 |

Этот audit проверяет first-frame state, добавленный после финального R89. Settled source fidelity и visual thresholds остаются доказанными `visual-matrix-final-r89.csv` и R89 checkpoint.
