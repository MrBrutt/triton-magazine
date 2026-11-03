# CLAUDE.md

Сайт журнала «Тритон» (triton-skolkovo.ru) на GitHub Pages. Чистый JS без сборщика. Подробности в README.md.

## Команды

```sh
python3 tools/build_pages.py   # после ЛЮБОЙ правки app.js, admin.js, app.css, data/issues.json; результат коммитить
npm test                       # Playwright (desktop + mobile); npm ci и npx playwright install chromium один раз
npm run serve                  # локальный сервер как GitHub Pages на :4173
```

Перед коммитом: `python3 tools/build_pages.py && npm test`, затем `git status` — собранные файлы тоже идут в коммит.
CI падает, если повторный запуск `build_pages.py` что-то меняет.

## Правила

- Не менять дизайн, тексты и адреса страниц без прямой просьбы.
- Не трогать `CNAME`, `.nojekyll`, `google2b801f514098efe5.html`.
- Не обращаться к боевому Firebase (проект `triton-magazine`): ни из тестов, ни из скриптов, ни из Lighthouse.
  Тесты подменяют Firestore и SDK в `tests/fixtures.js` и `tests/stubs/`. `tools/fetch_issues.py` только читает
  базу, и запускает его человек; для проверок есть переменная `FIRESTORE_URL`.
- Не править руками собранные файлы: `index.html`, `issues/**/index.html`, `about/index.html`, `admin/index.html`,
  `404.html`, `sitemap.xml`, `robots.txt`, `rss.xml`, `covers/*.webp`.
- Не пушить в `main` и не деплоить: всё через PR.

## Устройство, которое легко сломать

- **Шаблоны страниц живут в двух местах.** `app.js` (`vHome`, `vIssues`, `vIssue`, `vAbout`, `vNotFound`, `card`, `cover`,
  `tocSec`, `headerHtml`, `menuHtml`, `footerHtml`) и `tools/build_pages.py` (`v_home`, `v_issues`, … для русской версии).
  Разметка должна совпадать до символа после разбора HTML, иначе страница мигает при загрузке.
  `tests/prerender.spec.js` сравнивает их на всех страницах и проверяет, что `app.js` не меняет DOM.
- **Константы `PALETTE`, `DEFAULT_COLOR`, `LOCAL_COVERS`, `DEFAULTS`, `TEAM`, `COVER_SIZES` в `app.js` записаны строгим JSON**
  (ключи и строки в двойных кавычках, без запятой в конце): `build_pages.py` читает их из файла. Значки берутся из `ICON`.
- **`setHtml(el, html)` вместо `innerHTML`** для всего, что может совпасть с готовой страницей: так DOM не пересоздаётся.
  Заглушка «загружаем» (`skeleton`) показывается, только если на экране нет готовой страницы для этого адреса (`data-pre` у `<main>`).
- **Данные.** Посетители: сначала `/data/issues.json`, потом REST Firestore (`fetchLive`, `refreshLive`) после события `load`.
  Админка: `api.loadIssues()` = `loadIssues({ fresh: true })`, сначала база. Объявление читается через `:batchGet`, чтобы
  отсутствие документа не давало 404 в консоли.
- **Детерминированная сборка.** Год в подвале и «N лет» на странице «О журнале» `build_pages.py` берёт из даты последней
  загрузки номера (`uploadedAt`), а не из «сегодня». `app.js` считает от сегодняшней даты. WebP создаются, только если
  файла ещё нет. Тесты фиксируют часы на `NOW` из `tests/fixtures.js`.
- Обработчики событий страницы, которые вешаются на элементы, переживающие перерисовку, должны получать `{ signal: viewSignal() }`.
