import { test, expect, settled, N, LATEST, LIST, YEARS, byN, issuesRu, cap, monthRu } from './fixtures.js';

// Ожидания про «последний номер» и их число берутся из data/issues.json (см. fixtures.js);
// тесты про конкретный №10 проверяют его собственные тексты.
const T10 = 'Сотрудничество — условие прогресса';

/* Ошибки в консоли — повод упасть: сайт не должен сыпать ими даже без базы. */
const consoleErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_(BLOCKED_BY_CLIENT|CONNECTION_REFUSED|FAILED)|404 \(Not Found\)/.test(m.text())) errors.push(m.text()); });
  consoleErrors.set(page, errors);
});
test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'ошибки в консоли').toEqual([]);
});

test('главная: свежий номер, полка, о журнале', async ({ page, firebaseLog }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Тритон — журнал студентов Международной гимназии Сколково');
  await expect(page.locator('h1')).toHaveText(LATEST.titleView);
  await expect(page.locator('.badge')).toContainText(`Выпуск №${LATEST.n}`);
  await expect(page.locator('.hero-cv img')).toHaveAttribute('alt', new RegExp(`Обложка №${LATEST.n}`));
  await expect(page.locator('.hero .acts a').first()).toHaveAttribute('href', /^https:/.test(LATEST.pdfUrl || '') ? `/issues/${LATEST.n}/read/` : `/issues/${LATEST.n}/`);
  await expect(page.locator('.shelf .card')).toHaveCount(N - 1);
  await expect(page.locator('#about-h')).toHaveText('О журнале');
  await settled(page);
  // Посетителю SDK Firebase не нужен: только REST-запросы к базе.
  expect(firebaseLog.filter((x) => x.includes('gstatic'))).toEqual([]);
  expect(firebaseLog.some((x) => x.includes(':runQuery'))).toBe(true);
});

test('обложка в WebP, JPG остаётся запасным', async ({ page }) => {
  await page.goto('/issues/10/');
  const img = page.locator('.ihero-cv img');
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el) => el.currentSrc)).toMatch(/\/covers\/10(-360)?\.webp$/);
  await expect(img).toHaveAttribute('src', '/covers/10.jpg');
  await expect(page.locator('.ihero-cv source')).toHaveAttribute('type', 'image/webp');
});

test('обложка WebP не загрузилась: показывается JPG', async ({ page }) => {
  await page.route(/\/covers\/10(-360)?\.webp$/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/issues/10/');
  const img = page.locator('.ihero-cv img');
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0 && el.currentSrc)).toMatch(/\/covers\/10\.jpg$/);
});

test('список номеров: все выпуски и годы', async ({ page }) => {
  await page.goto('/issues/');
  await expect(page).toHaveTitle('Все выпуски — Тритон');
  await expect(page.locator('#since')).toHaveText(`${cap(issuesRu(N))} с октября 2021 года.`);
  await expect(page.locator('#grid .card')).toHaveCount(N);
  await expect(page.locator('#grid .card').first()).toContainText(`№${LATEST.n}, ${monthRu(LATEST.date)} · новый`);
  await expect(page.locator('.chip')).toHaveText(['Все', ...YEARS.map(String)]);
  await expect(page.locator('#found')).toHaveText(`Найдено: ${N}`);
});

test('поиск по номерам: слово, номер, год, пусто и сброс', async ({ page }) => {
  await page.goto('/issues/');
  await settled(page);
  const q = page.locator('#q');
  const titles = page.locator('#grid .card .t');

  // Ищет и по описанию: «отправная точка» есть в описании №1.
  await q.fill('точка');
  await expect(titles).toHaveText(['Точка', 'Путь']);
  await expect(page).toHaveURL(/\?q=%D1%82%D0%BE%D1%87%D0%BA%D0%B0$/);

  await q.fill('№3');
  await expect(titles).toHaveText(['Пируэт событий']);

  await q.fill('Лёд до встречи');
  await expect(titles).toHaveText(['Лед, до встречи!']);

  await q.fill('');
  await page.locator('.chip', { hasText: '2024' }).click();
  await expect(titles).toHaveText(['Ценность времени', 'Культурный код: миры, истории, открытия']);
  await expect(page.locator('.chip', { hasText: '2024' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\?year=2024$/);

  await q.fill('квазар');
  await expect(page.locator('#nores')).toBeVisible();
  await expect(page.locator('#found')).toHaveText('Найдено: 0');
  await page.locator('#reset').click();
  await expect(titles).toHaveCount(N);
  await expect(page).toHaveURL(/\/issues\/$/);
  await expect(q).toBeFocused();
});

test('поиск открывается по ссылке с параметрами', async ({ page }) => {
  await page.goto('/issues/?q=время');
  await expect(page.locator('#q')).toHaveValue('время');
  await expect(page.locator('#grid .card .t')).toHaveText(['Ценность времени']);
});

test('страница номера: описание, содержание, цитата, соседние номера', async ({ page }) => {
  await page.goto('/issues/10/');
  await expect(page).toHaveTitle(`№10. ${T10} — Тритон`);
  await expect(page.locator('h1')).toHaveText(T10);
  await expect(page.locator('.ihero .meta').first()).toHaveText('Выпуск №10 · июль 2026');
  await expect(page.locator('.toc li')).toHaveCount(6);
  await expect(page.locator('.toc li').first()).toContainText('Литературные герои на приёме у психолога');
  await expect(page.locator('.quote blockquote')).toContainText('«Тритон растет вместе со студентами');
  await expect(page.locator('.pn-a')).toHaveCount(byN(11) ? 2 : 1);
  await expect(page.locator('.pn-a').first()).toHaveAttribute('href', '/issues/9/');
  await expect(page.locator('a.btn-o[href*="drive.google.com"]')).toHaveAttribute('target', '_blank');

  await page.goto('/issues/5/');
  await expect(page.locator('.pn-a')).toHaveCount(2);
  await expect(page.locator('h1')).toHaveText('Культурный код: миры, истории, открытия');
});

test('переходы по сайту без перезагрузки', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await page.evaluate(() => { window.__same = true; });
  const [latest, second] = LIST;
  await page.locator('.shelf .card').first().click();
  await expect(page).toHaveURL(new RegExp(`/issues/${second.n}/$`));
  await expect(page.locator('h1')).toHaveText(second.titleView);
  await page.locator('.pn-a', { hasText: 'Следующий номер' }).click();
  await expect(page).toHaveURL(new RegExp(`/issues/${latest.n}/$`));
  await page.goBack();
  await expect(page.locator('h1')).toHaveText(second.titleView);
  expect(await page.evaluate(() => window.__same)).toBe(true);
});

test('читалка: открывается поверх номера и закрывается', async ({ page }) => {
  await page.goto('/issues/10/');
  await settled(page);
  await page.locator('.ihero .acts a.btn', { hasText: 'Читать на сайте' }).click();
  await expect(page).toHaveURL(/\/issues\/10\/read\/$/);
  const reader = page.getByRole('dialog', { name: 'Выпуск №10, читалка' });
  await expect(reader).toBeVisible();
  await expect(reader.locator('iframe')).toHaveAttribute('src', 'https://drive.google.com/file/d/1-NGpdotq6chwGty0tU-z_zsjYlbm5yU2/preview');
  await expect(reader.locator('.rdr-title')).toHaveText(`№10 · ${T10}`);
  await expect(reader.locator('.rdr-back')).toBeFocused();
  expect(await page.locator('#app').evaluate((el) => el.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/issues\/10\/$/);
  expect(await page.locator('#app').evaluate((el) => el.inert)).toBe(false);
});

test('читалка по прямой ссылке, кнопка «К выпуску»', async ({ page }) => {
  // Адрес читалки отдаёт 404.html: его «Страница не найдена» не должна мелькать.
  await page.addInitScript(() => {
    window.__seen = [];
    const tick = () => {
      const main = document.getElementById('main');
      const h = main?.querySelector('h1');
      if (h && getComputedStyle(main).visibility === 'visible' && !window.__seen.includes(h.textContent)) window.__seen.push(h.textContent);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto('/issues/3/read/');
  await settled(page);
  expect(await page.evaluate(() => window.__seen)).not.toContain('Страница не найдена');
  const reader = page.getByRole('dialog', { name: 'Выпуск №3, читалка' });
  await expect(reader).toBeVisible();
  await reader.locator('.rdr-back').click();
  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/issues\/3\/$/);
  await expect(page.locator('h1')).toHaveText('Пируэт событий');
});

test('о журнале: история по годам, редакция, как попасть', async ({ page }) => {
  await page.goto('/about/');
  await expect(page).toHaveTitle('О журнале — Тритон');
  await expect(page.locator('#hist-h')).toHaveText(`Пять лет, ${issuesRu(N)}`);
  await expect(page.locator('.yr h3')).toHaveText([...YEARS].reverse().map(String));
  await expect(page.locator('.yr a')).toHaveCount(N);
  await expect(page.locator('.person')).toContainText(['Главный редакторУмар Гаджикулиев']);
  await expect(page.locator('#join a[href="https://t.me/mrbrutt"]')).toBeVisible();
});

test('404.html не показывает «Страница не найдена» на адресах номера, пока app.js не загрузился', async ({ page }) => {
  await page.route('**/app.js*', (r) => r.abort());
  for (const [url, visible] of [['/issues/3/read/', 'hidden'], ['/issues/42/', 'hidden'], ['/no-such-page/', 'visible']]) {
    await page.goto(url);
    expect(await page.locator('#main').evaluate((el) => getComputedStyle(el).visibility), url).toBe(visible);
  }
  consoleErrors.set(page, []);
});

test('404: неизвестный адрес и номер, которого нет', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Страница не найдена');
  await expect(page).toHaveTitle('Страница не найдена — Тритон');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

  await page.goto('/issues/99/');
  await expect(page.locator('h1')).toHaveText('Выпуска №99 нет');
  await expect(page.locator('.nf p')).toHaveText(`На сайте ${issuesRu(N)}. Выберите выпуск из списка.`);
});

test('английская версия', async ({ page }) => {
  await page.goto('/issues/10/');
  await settled(page);
  await page.locator('.hdr button[data-lang="en"]:visible').click();
  await expect(page.locator('h1')).toHaveText('Collaboration: a condition for progress');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Collaboration: a condition for progress');
  await expect(page.locator('.nav a').first()).toHaveText('Issues');
});

test.describe('мобильное меню', () => {
  test.skip(({ isMobile }) => !isMobile, 'бургер есть только на узком экране');

  test('открывается, ведёт по ссылке и закрывается', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    const burger = page.locator('.burger');
    const menu = page.locator('#menu');
    await expect(menu).toBeHidden();
    await burger.click();
    await expect(menu).toBeVisible();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(burger).toHaveAttribute('aria-label', 'Закрыть меню');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(burger).toBeFocused();

    await burger.click();
    await menu.getByRole('link', { name: 'О журнале' }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('h1')).toHaveText('О журнале');

    await page.locator('.burger').click();
    await page.locator('h1').click();
    await expect(page.locator('#menu')).toBeHidden();
  });

  test('страница не шире экрана', async ({ page }) => {
    for (const url of ['/', '/issues/', '/issues/10/', '/about/']) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), url).toBe(true);
    }
  });
});

test('сдвиги вёрстки при загрузке меньше 0.05', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  for (const url of ['/', '/issues/', '/issues/10/', '/about/']) {
    await page.goto(url);
    await settled(page);
    expect(await page.evaluate(() => window.__cls), url).toBeLessThan(0.05);
  }
});
