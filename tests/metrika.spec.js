// Яндекс.Вебмастер, Яндекс.Метрика, плашка о cookies, награда на «О журнале».
// tag.js в тестах не грузится (внешние запросы обрываются), поэтому вызовы Метрики видны в очереди window.ym.a.
import { test, expect, settled, ISSUES } from './fixtures.js';

const ORIGIN = 'http://127.0.0.1:4173';
const calls = (page) => page.evaluate(() => (window.ym?.a || []).map((a) => Array.from(a)));
const hits = async (page) => (await calls(page)).filter((c) => c[1] === 'hit').map((c) => ({ url: c[2], ...c[3] }));

test.describe('Яндекс.Вебмастер', () => {
  test.skip(({ isMobile }) => isMobile, 'разметка одна для всех экранов');
  test('meta yandex-verification только на главной', async ({ request }) => {
    const pages = ['/', '/issues/', '/issues/10/', '/about/', '/admin/', '/404.html'];
    for (const url of pages) {
      const html = await (await request.get(url)).text();
      const n = (html.match(/<meta name="yandex-verification" content="f0bd390f630c6588">/g) || []).length;
      expect(n, url).toBe(url === '/' ? 1 : 0);
    }
  });
});

test.describe('Яндекс.Метрика', () => {
  test.skip(({ isMobile }) => isMobile, 'хватает одного экрана');

  test('init с нужными параметрами, tag.js после load, первый просмотр', async ({ page, firebaseLog }) => {
    await page.addInitScript(() => {
      window.__tagState = null;
      new MutationObserver(() => {
        if (window.__tagState === null && document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')) window.__tagState = document.readyState;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/issues/10/', { referer: 'https://ya.ru/' });
    await settled(page);
    const all = await calls(page);
    expect(all[0]).toEqual([114053772, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false }]);
    expect(await page.evaluate(() => window.__tagState)).toBe('complete');
    expect(await page.locator('script[src="https://mc.yandex.ru/metrika/tag.js"]').count()).toBe(1);
    expect(await hits(page)).toEqual([{ url: `${ORIGIN}/issues/10/`, title: '№10. Сотрудничество — условие прогресса — Тритон', referer: 'https://ya.ru/' }]);
    expect(firebaseLog.some((x) => x.startsWith('GET mc.yandex.ru/metrika/tag.js'))).toBe(true);
  });

  test('адрес просмотра без строки поиска', async ({ page }) => {
    await page.goto('/issues/?q=время&year=2024');
    await settled(page);
    await page.locator('#q').fill('точка');
    await expect(page).toHaveURL(/\?q=%D1%82/);
    await settled(page);
    expect((await hits(page)).map((h) => h.url)).toEqual([`${ORIGIN}/issues/`]);
  });

  test('переходы внутри сайта: referer — прошлый адрес, title — новой страницы', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await page.locator('.nav a', { hasText: 'Выпуски' }).click();
    await page.locator('#q').fill('точка');
    await page.locator('#grid .card', { hasText: 'Точка' }).click();
    await expect(page.locator('h1')).toHaveText('Точка');
    await page.locator('.langs [data-lang="en"]').click();
    await expect(page.locator('h1')).toHaveText('The Point');
    await page.locator('.ihero .acts a.btn').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hits(page)).toEqual([
      { url: `${ORIGIN}/`, title: 'Тритон — журнал студентов Международной гимназии Сколково', referer: '' },
      { url: `${ORIGIN}/issues/`, title: 'Все выпуски — Тритон', referer: `${ORIGIN}/` },
      { url: `${ORIGIN}/issues/8/`, title: '№8. Точка — Тритон', referer: `${ORIGIN}/issues/` },
      { url: `${ORIGIN}/issues/8/read/`, title: 'No. 8. The Point — Triton', referer: `${ORIGIN}/issues/8/` },
      { url: `${ORIGIN}/issues/8/`, title: 'No. 8. The Point — Triton', referer: `${ORIGIN}/issues/8/read/` },
    ]);
    expect((await calls(page)).filter((c) => c[1] === 'init')).toHaveLength(1);
  });

  test('на /admin/ Метрики нет, в том числе при переходе с сайта', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.locator('#login-form')).toBeVisible();
    await settled(page);
    expect(await page.evaluate(() => typeof window.ym)).toBe('undefined');
    expect(await page.locator('script[src*="mc.yandex.ru"]').count()).toBe(0);

    await page.goto('/about/');
    await settled(page);
    expect(await hits(page)).toHaveLength(1);
    await page.locator('.ftr a[href="/admin/"]').click();
    await expect(page.locator('#login-form')).toBeVisible();
    await settled(page);
    expect(await page.evaluate(() => typeof window.ym)).toBe('undefined');
    expect(await page.locator('script[src*="mc.yandex.ru"]').count()).toBe(0);
  });
});

test.describe('Метрика и фоновая перерисовка', () => {
  test.skip(({ isMobile }) => isMobile, 'хватает одного экрана');
  const live = ISSUES.map((x) => (x.date === '2026-07' ? { ...x, desc: 'Новое описание из админки.' } : x));
  test.use({ firebase: { issues: live, announcement: { enabled: false } } });

  test('перерисовка из базы не считается просмотром', async ({ page }) => {
    await page.goto('/issues/10/');
    await expect(page.locator('.desc')).toHaveText('Новое описание из админки.');
    await settled(page);
    expect(await hits(page)).toHaveLength(1);
  });
});

test.describe('плашка о cookies', () => {
  test('видна, меняет язык, закрывается и помнит это', async ({ page }) => {
    await page.goto('/');
    const bar = page.getByRole('region', { name: 'Уведомление о cookies' });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Мы используем cookies и Яндекс.Метрику, чтобы считать посещения сайта.');
    await expect(bar.getByRole('button')).toHaveText('Понятно');
    expect(await bar.evaluate((el) => [el.parentElement.tagName, getComputedStyle(el).position, el.closest('#app')])).toEqual(['BODY', 'fixed', null]);

    await page.locator('.hdr button[data-lang="en"]:visible').click();
    const en = page.getByRole('region', { name: 'Cookie notice' });
    await expect(en).toContainText('We use cookies and Yandex Metrica to count visits to the site.');
    await expect(en.getByRole('button')).toHaveText('Got it');

    await en.getByRole('button', { name: 'Got it' }).click();
    await expect(en).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('triton_cookies_ok'))).toBe('1');
    await page.reload();
    await settled(page);
    await expect(page.locator('.cookie')).toBeHidden();
  });

  test('работает, когда localStorage недоступен', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('denied'); };
      Storage.prototype.setItem = () => { throw new Error('denied'); };
    });
    await page.goto('/about/');
    const bar = page.locator('.cookie');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Понятно' }).click();
    await expect(bar).toBeHidden();
    await page.locator('.nav a, #menu a').filter({ hasText: 'Выпуски' }).first().evaluate((a) => a.click());
    await expect(page.locator('h1')).toHaveText('Все выпуски');
    await expect(bar).toBeHidden();
  });

  test('ниже читалки и без сдвигов вёрстки', async ({ page }) => {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/issues/10/');
    await settled(page);
    await expect(page.locator('.cookie')).toBeVisible();
    expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.01);
    await page.goto('/issues/10/read/');
    await expect(page.getByRole('dialog')).toBeVisible();
    const box = await page.locator('.cookie').boundingBox();
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.rdr, .cookie')?.className, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top).toBe('rdr');
  });

  test('на /admin/ не показывается', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('.cookie')).toHaveCount(0);
  });
});

test('награда на странице «О журнале» под вводным абзацем', async ({ page }) => {
  await page.goto('/about/');
  const ps = page.locator('.ahero .wrap > p');
  await expect(ps).toHaveCount(2);
  await expect(ps.nth(1)).toHaveText('Победитель всероссийского конкурса «Волшебное слово» в номинации «Лучшее школьное СМИ» (2026)');
  await expect(ps.nth(1)).toHaveClass('award');
  await settled(page);
  await page.locator('.hdr button[data-lang="en"]:visible').click();
  await expect(page.locator('.ahero .award')).toHaveText('Winner of the all-Russian “Magic Word” competition in the Best School Media category (2026)');
});
