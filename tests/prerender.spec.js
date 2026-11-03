// Готовая вёрстка из build_pages.py должна совпадать с тем, что рисует app.js,
// а app.js не должен её трогать: тогда при загрузке ничего не прыгает.
import { test, expect, settled, ISSUES } from './fixtures.js';

const PAGES = ['/', '/issues/', '/about/', '/does-not-exist/', ...ISSUES.map((_, i) => `/issues/${i + 1}/`)];
const PARTS = ['#hdr', '#menu', '#main', '#ftr'];

test.describe('готовая страница', () => {
  test.skip(({ isMobile }) => isMobile, 'разметка одна для всех экранов');

  for (const url of PAGES) {
    test(`${url}: app.js рисует ту же разметку и не трогает DOM`, async ({ page, browser }) => {
      // 1. Страница без JavaScript: только то, что лежит в HTML.
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const raw = await ctx.newPage();
      await raw.goto(url);
      const before = {};
      for (const sel of PARTS) before[sel] = await raw.locator(sel).evaluate((el) => el.innerHTML);
      await ctx.close();
      expect(before['#main']).not.toBe('');

      // 2. Та же страница с app.js. Записываем каждое изменение DOM после разбора HTML.
      await page.addInitScript(() => {
        window.__mutations = [];
        new MutationObserver((list) => {
          if (document.readyState === 'loading') return;
          for (const m of list) {
            const el = m.target instanceof Element ? m.target : m.target.parentElement;
            if (el && el.closest('#main, #hdr, #ftr')) window.__mutations.push(`${m.type} ${el.tagName}#${el.id}.${el.className} ${m.attributeName || ''}`);
          }
        }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'class', 'hidden'] });
      });
      await page.goto(url);
      await settled(page);
      for (const sel of PARTS) {
        expect(await page.locator(sel).evaluate((el) => el.innerHTML), `${sel} совпадает`).toBe(before[sel]);
      }
      expect(await page.evaluate(() => window.__mutations)).toEqual([]);
      expect(await page.locator('#main').getAttribute('data-pre')).toBeNull();
    });
  }
});

test('у каждой страницы своя разметка schema.org', async ({ page }) => {
  const types = async (url) => {
    await page.goto(url);
    const json = await page.locator('script[type="application/ld+json"]').textContent();
    return JSON.parse(json)['@graph'].map((x) => x['@type']);
  };
  expect(await types('/')).toEqual(['WebSite', 'Periodical', 'PublicationIssue']);
  expect(await types('/issues/')).toEqual(['CollectionPage', 'Periodical', 'BreadcrumbList']);
  expect(await types('/about/')).toEqual(['AboutPage', 'Periodical', 'BreadcrumbList']);
  expect(await types('/issues/10/')).toEqual(['PublicationIssue', 'Periodical', 'BreadcrumbList']);
  const issue = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'][0];
  expect(issue).toMatchObject({ issueNumber: '10', name: 'Сотрудничество — условие прогресса', datePublished: '2026-07', image: 'https://triton-skolkovo.ru/covers/10.jpg' });
});

test('RSS: ссылка в шапке и все номера в ленте', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/rss.xml');
  const res = await request.get('/rss.xml');
  expect(res.ok()).toBe(true);
  const xml = await res.text();
  expect(xml.match(/<item>/g)).toHaveLength(ISSUES.length);
  expect(xml).toContain('<link>https://triton-skolkovo.ru/issues/10/</link>');
  const parsed = await page.evaluate((s) => {
    const doc = new DOMParser().parseFromString(s, 'application/xml');
    return { error: !!doc.querySelector('parsererror'), first: doc.querySelector('item > title')?.textContent };
  }, xml);
  expect(parsed).toEqual({ error: false, first: '№10. Сотрудничество — условие прогресса' });
});
