// Откуда сайт берёт выпуски: сохранённая копия, база, и что бывает, когда база молчит.
import { test, expect, settled, ISSUES } from './fixtures.js';

test.describe('без Firebase', () => {
  test.use({ firebase: { issues: ISSUES, down: true } });

  test('все страницы работают на сохранённой копии', async ({ page, firebaseLog }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Сотрудничество — условие прогресса');
    await settled(page);
    await page.locator('.nav a, #menu a').filter({ hasText: 'Выпуски' }).first().evaluate((a) => a.click());
    await expect(page.locator('#grid .card')).toHaveCount(ISSUES.length);
    await page.locator('#q').fill('истоки');
    await expect(page.locator('#grid .card .t')).toHaveText(['Истоки']);
    await page.locator('#grid .card').first().click();
    await expect(page.locator('h1')).toHaveText('Истоки');
    await page.goto('/about/');
    await expect(page.locator('#hist-h')).toHaveText('Пять лет, десять номеров');
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
  const live = [...ISSUES.map((x) => (x.id === 'issue-10' ? { ...x, desc: 'Новое описание из админки.', toc: '3 Новый раздел' } : x)),
    { id: 'issue-11', title: 'Одиннадцатый', date: '2027-01', desc: 'Свежий номер.', pdfUrl: 'https://drive.google.com/file/d/abc/view', coverUrl: '', uploadedAt: '2027-01-20T10:00:00.000Z' }];
  test.use({ firebase: { issues: live, announcement: { enabled: false } } });

  test('страница перерисовывается данными из базы', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Одиннадцатый');
    await expect(page.locator('.badge b')).toHaveText('Выпуск №11');
    // Обложки нет на сайте и в Диске: цветная заглушка с номером.
    await expect.poll(() => page.locator('.hero-cv img').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

    await page.goto('/issues/10/');
    await expect(page.locator('.desc')).toHaveText('Новое описание из админки.');
    await expect(page.locator('.toc li')).toHaveText(['стр. 3Новый раздел']);
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
    await expect(ann.locator('.ann-b')).toHaveAttribute('href', '/issues/10/');
    await ann.getByRole('button', { name: 'Закрыть объявление' }).click();
    await expect(ann).toHaveCount(0);
    await page.reload();
    await settled(page);
    await expect(page.getByRole('region', { name: 'Объявление' })).toHaveCount(0);
  });
});
