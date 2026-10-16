# Аудит производительности (ветка `perf/optimization`)

| Файл | Содержание |
|---|---|
| [BASELINE_METRICS.md](BASELINE_METRICS.md) | Исходные замеры и методика |
| [BOTTLENECK_ANALYSIS.md](BOTTLENECK_ANALYSIS.md) | Узкие места и решение по каждому |
| [OPTIMIZATION_CHANGES.md](OPTIMIZATION_CHANGES.md) | Что изменено, почему безопасно, что отклонено |
| [BEFORE_AFTER_COMPARISON.md](BEFORE_AFTER_COMPARISON.md) | Таблица «Metric / Before / After / Improvement», A/B |
| [REGRESSION_TEST_RESULTS.md](REGRESSION_TEST_RESULTS.md) | Тесты, сверки, скриншоты, что не проверено |
| [REMAINING_PERFORMANCE_ISSUES.md](REMAINING_PERFORMANCE_ISSUES.md) | Что осталось, предложения (индекс, безопасность) |

## Итог в цифрах

| Metric | Before | After | Improvement |
|---|---:|---:|---:|
| Файлы, которые браузер перекачивает после деплоя без изменений фронтенда | 52 файла, 476 КБ gzip | 0 | −100 % |
| JS первой загрузки, перекачиваемый после деплоя с изменённым кодом (gzip) | 84,8 КБ | 26,5 КБ | −69 % |
| Docker-образ | 722 МБ | 573 МБ | −21 % |
| Старт сервера / память в простое | 742 мс / 114 МБ | 401 мс / 89 МБ | −46 % / −22 % |
| Ответ для панели «Касса» | 446 КБ, 39,9 мс | 12 КБ, 19,1 мс | −97 % / −52 % |
| Отчёт «за всё время» | 443 мс | 327 мс | −26 % |
| История перемещений | 902 КБ | 498 КБ (окно 180 дней — меньше) | −45 % |
| История продаж за месяц на телефоне (CPU 4×): до полной отрисовки | 6,9 с | 2,9 с | −57 % |
| Схема Prisma против миграций | 4 расхождения внешних ключей | совпадает | — |
| Скриншоты (30) | — | 28 идентичны, 2 — приветствие по времени суток | — |
| Тесты | — | 429 юнит + 11 интеграционных наборов + 3 сверки + 7 сравнений «старый/новый код» — зелёные | — |

Видимые изменения: кнопка «Показать перемещения старше 180 дней» в истории перемещений. Изменение схемы: удалён дублирующий индекс `devices_imei_idx`.

iOS Safari, PWA на iPhone и нативные сборки **не проверялись**.

## Повторить замеры

Нужен локальный Postgres из `docker-compose.yml`. Скрипты работают только с базой `perf_test`; проверку выполняет `scripts/perf-env.ts`.

```bash
npx tsx PERFORMANCE_AUDIT/scripts/setup-perf-db.ts        # тестовая база + шаблон (пароли → data/.perf-login.json, не в git)
npm run build && node PERFORMANCE_AUDIT/scripts/measure-bundle.mjs <label>
npx tsx PERFORMANCE_AUDIT/scripts/measure-runtime.ts <label>
npx tsx PERFORMANCE_AUDIT/scripts/screenshots.ts <label>
npx tsx PERFORMANCE_AUDIT/scripts/compare-screens.ts     # screens-before против screens-after
npx tsx PERFORMANCE_AUDIT/scripts/ab-server.ts <label>   # A/B сервера (SERVER_ENTRY=bundle — бандл, как в Docker)
npx tsx PERFORMANCE_AUDIT/scripts/report-equivalence.ts <label>   # все отчёты в JSON для побайтного сравнения
npx tsx PERFORMANCE_AUDIT/scripts/sales-history-bench.ts <label>  # история продаж за месяц в браузере
npx tsx PERFORMANCE_AUDIT/scripts/transfers-check.ts prepare|<label>
npx tsx PERFORMANCE_AUDIT/scripts/store-select-check.ts <label>
```
