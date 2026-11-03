// Вход для редакции. Firebase Auth и Firestore подменены заглушками из tests/stubs/.
import { test, expect, settled } from './fixtures.js';

test.describe('форма входа', () => {
  test.skip(({ isMobile }) => isMobile, 'хватает одного экрана');

  test('проверяет поля и показывает ошибку входа', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page).toHaveTitle('Вход для редакции — Тритон');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const form = page.locator('#login-form');
    await expect(form).toBeVisible();

    await form.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('#login-msg')).toHaveText('Введите почту и пароль.');
    await expect(page.locator('#em')).toBeFocused();

    await page.locator('#em').fill('editor@example.com');
    await page.locator('#pw').fill('wrong');
    await page.locator('#pw-t').click();
    await expect(page.locator('#pw')).toHaveAttribute('type', 'text');
    await form.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('#login-msg')).toHaveText('Неверная почта или пароль.');
    await expect(form.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });

  test('восстановление пароля', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#em').fill('editor@example.com');
    await page.getByRole('button', { name: 'Забыли пароль?' }).click();
    await expect(page.locator('#reset-form')).toBeVisible();
    await expect(page.locator('#rem')).toHaveValue('editor@example.com');
    await page.getByRole('button', { name: 'Отправить ссылку' }).click();
    await expect.poll(() => page.evaluate(() => window.__authCalls)).toEqual(['reset:editor@example.com']);
  });

  test('после входа — список выпусков из базы', async ({ page, firebaseLog }) => {
    await page.goto('/admin/');
    await page.locator('#em').fill('editor@example.com');
    await page.locator('#pw').fill('secret');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('.adm')).toBeVisible();
    await expect(page.locator('#list-count')).toContainText('10');
    await settled(page);
    expect(firebaseLog.filter((x) => x.includes('gstatic.com')).sort()).toEqual([
      'GET www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
      'GET www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
      'GET www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js',
    ]);
  });
});
