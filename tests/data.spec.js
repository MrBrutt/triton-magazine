// Откуда сайт берёт выпуски: сохранённая копия, база, и что бывает, когда база молчит.
import { test, expect, settled, ISSUES, N, LATEST, NEW_N, newIssue, issuesRu } from './fixtures.js';

test.describe('без Firebase', () => {
  test.use({ firebase: { issues: ISSUES, down: true } });

  test('все страницы работают на сохранённой копии', async ({ page, firebaseLog }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText(LATEST.titleView);
    await settled(page);
    await page.locator('.nav a, #menu a').filter({ hasText: 'Выпуски' }).first().evaluate((a) => a.click());
    await expect(page.locator('#grid .card')).toHaveCount(ISSUES.length);
    await page.locator('#q').fill('истоки');
    await expect(page.locator('#grid .card .t')).toHaveText(['Истоки']);
    await page.locator('#grid .card').first().click();
    await expect(page.locator('h1')).toHaveText('Истоки');
    await page.goto('/about/');
    await expect(page.locator('#hist-h')).toHaveText(`Пять лет, ${issuesRu(N)}`);
    expect(firebaseLog.length).toBeGreaterThan(0); // сайт пытался, но запросы оборвались
    expect(errors).toEqual([]);
  });

  test('без базы и без копии — понятная ошибка и кнопка «Попробовать снова»', async ({ page }) => {
    await page.route('**/data/issues.json*', (r) => r.fulfill({ status: 500, body: '' }));
    await page.goto('/issues/99/');
    await expect(page.locator('h1')).toHaveText('Не удалось загрузить выпуски');
    await page.unroute('**/data/issues.json*');
    await page.locator('[data-retry]').click();
    await expect(page.locator('h1')).toHaveText('Выпуска №99 нет');
  });
});

test.describe('в базе новее, чем в копии', () => {
  const live = [...ISSUES.map((x) => (x.date === '2026-07' ? { ...x, desc: 'Новое описание из админки.', toc: '3 Новый раздел' } : x)),
    newIssue({ pdfUrl: 'https://drive.google.com/file/d/abc/view' })];
  test.use({ firebase: { issues: live, announcement: { enabled: false } } });

  test('страница перерисовывается данными из базы', async ({ page }) => {
    await page.route(/drive\.google\.com\/thumbnail/, (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Новый номер из базы');
    await expect(page.locator('.badge b')).toHaveText(`Выпуск №${NEW_N}`);
    // Обложки нет на сайте, а из Диска она не загрузилась: цветная заглушка с номером.
    await expect.poll(() => page.locator('.hero-cv img').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

    await page.goto('/issues/10/');
    await expect(page.locator('.desc')).toHaveText('Новое описание из админки.');
    await expect(page.locator('.toc li')).toHaveText(['стр. 3Новый раздел']);
  });

  test('открытая читалка не перезагружается', async ({ page }) => {
    await page.route('https://firestore.googleapis.com/**', async (r) => { await new Promise((ok) => setTimeout(ok, 800)); await r.fallback(); });
    await page.goto('/issues/10/read/');
    const frame = page.locator('.rdr iframe');
    await expect(frame).toHaveCount(1);
    await frame.evaluate((el) => { el.dataset.first = '1'; });
    await expect(page.locator('#main .desc')).toHaveText('Новое описание из админки.');
    await expect(page.locator('.rdr iframe[data-first="1"]')).toHaveCount(1);
    await expect(page.locator('.rdr-back')).toBeFocused();
  });

  test('номер есть в базе, но не в копии: без «Страница не найдена» и «нет»', async ({ page }) => {
    await page.addInitScript(() => {
      window.__seen = [];
      const tick = () => {
        const main = document.getElementById('main');
        const h = main?.querySelector('h1');
        if (h && getComputedStyle(main).visibility === 'visible' && window.__seen.at(-1) !== h.textContent) window.__seen.push(h.textContent);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(`/issues/${NEW_N}/`);
    await expect(page.locator('h1')).toHaveText('Новый номер из базы');
    await settled(page);
    expect(await page.evaluate(() => window.__seen)).toEqual(['Новый номер из базы']);
  });

  test.describe('на телефоне', () => {
    test.skip(({ isMobile }) => !isMobile, 'бургер есть только на узком экране');
    test('открытое меню не закрывается, когда приходят данные из базы', async ({ page }) => {
      await page.route('https://firestore.googleapis.com/**', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.fallback(); });
      await page.goto('/issues/10/');
      await page.locator('.burger').click();
      await expect(page.locator('#menu')).toBeVisible();
      await expect(page.locator('#main .desc')).toHaveText('Новое описание из админки.');
      await expect(page.locator('#menu')).toBeVisible();
      await expect(page.locator('.burger')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  test('поле поиска в фокусе — страница не дёргается', async ({ page }) => {
    await page.route('https://firestore.googleapis.com/**', async (r) => { await new Promise((ok) => setTimeout(ok, 800)); await r.fallback(); });
    await page.goto('/issues/');
    await page.locator('#q').focus();
    await page.locator('#q').pressSequentially('то');
    await settled(page);
    await expect(page.locator('#q')).toHaveValue('то');
    await expect(page.locator('#q')).toBeFocused();
  });
});

test.describe('объявление', () => {
  test.use({ firebase: { issues: ISSUES, announcement: { enabled: true, from: '2026-11-01', until: '2026-11-30', where: 'all', target: 'latest', link: '', ru: { title: 'Тест.', text: 'Объявление из базы.', button: 'Читать' }, en: { title: '', text: '', button: '' } } } });

  test('берётся из базы и закрывается', async ({ page }) => {
    await page.goto('/about/');
    const ann = page.getByRole('region', { name: 'Объявление' });
    await expect(ann).toContainText('Тест. Объявление из базы.');
    await expect(ann.locator('.ann-b')).toHaveAttribute('href', `/issues/${LATEST.n}/`);
    await ann.getByRole('button', { name: 'Закрыть объявление' }).click();
    await expect(ann).toHaveCount(0);
    await page.reload();
    await settled(page);
    await expect(page.getByRole('region', { name: 'Объявление' })).toHaveCount(0);
  });
});
