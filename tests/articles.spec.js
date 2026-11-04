// Статьи номеров: /issues/N/slug/. Тексты лежат в data/articles/N/slug.txt, страницы собирает build_pages.py.
import { test, expect, settled, ISSUES, ARTICLES, ARTICLE_URLS, articleText, newIssue, NEW_N } from './fixtures.js';

const SITE = 'https://triton-skolkovo.ru';
const A10 = ARTICLES['10'];
const SLUG = 'literaturnye-geroi';
const TITLE = 'Литературные герои на приёме у психолога';
const URL = `/issues/10/${SLUG}/`;
const J = A10.findIndex((a) => a.slug === SLUG);
const blocksOf = (text) => text.replace(/\r/g, '').split('\n\n').slice(1).join('\n\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
/* Подписи авторов, иллюстраторов и фотографов на страницах статей не публикуются. */
const SIGNATURE = /(^|\n)\s*(Соавтор\S*|Интервью (провел|провела|провели|подготовил|подготовила|подготовили)|Материал (подготовил|подготовила|подготовили|подготовлен)\S*|Подборк\S* подготовил\S*|Рассказ и иллюстрация|Иллюстраци\S*\s*:|Фото\S*\s*:|Текст\s*:|Автор\s*:)|[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+,\s*\d{1,2}\s?[А-ЯA-Z]?(\s*класс)?\s*($|\n)/;

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

test('страница статьи: заголовок, номер, PDF, соседние статьи, разметка для поисковиков', async ({ page }) => {
  await page.goto(URL);
  await settled(page);
  await expect(page).toHaveTitle(`${TITLE} — Тритон №10`);
  await expect(page.locator('h1')).toHaveText(TITLE);
  await expect(page.locator('h1')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.ahd .meta')).toHaveText('Выпуск №10 · июль 2026 · стр. 7');
  await expect(page.locator('.ahd .crumbs a').last()).toHaveAttribute('href', '/issues/10/');
  await expect(page.locator('.hdr .nav a').first()).toHaveAttribute('aria-current', 'true');

  const prose = page.locator('.prose');
  await expect(prose).toHaveAttribute('lang', 'ru');
  await expect(prose).toContainText('Психолог: Здравствуйте, садитесь, пожалуйста.');
  await expect(prose.locator('p, h2')).toHaveCount(blocksOf(articleText(10, SLUG)).length);
  expect(await prose.innerText()).not.toMatch(SIGNATURE);

  await expect(page.locator('.art-end .btn').first()).toHaveAttribute('href', '/issues/10/');
  await expect(page.locator('.art-end a[href="/issues/10/read/"]')).toHaveText('Читать номер в PDF');
  await expect(page.locator('.art-end a[href*="drive.google.com"]')).toHaveAttribute('target', '_blank');

  const prev = A10[J - 1], next = A10[J + 1];
  await expect(page.locator('.pn-art .pn-a')).toHaveCount((prev ? 1 : 0) + (next ? 1 : 0));
  if (prev) await expect(page.locator('.pn-art .pn-a', { hasText: 'Предыдущая статья' })).toHaveAttribute('href', `/issues/10/${prev.slug}/`);
  if (next) await expect(page.locator('.pn-art .pn-a', { hasText: 'Следующая статья' })).toHaveAttribute('href', `/issues/10/${next.slug}/`);

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SITE + URL);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  const firstPara = blocksOf(articleText(10, SLUG)).find((b) => !b.startsWith('## '));
  expect(firstPara.startsWith(await page.locator('meta[name="description"]').getAttribute('content'))).toBe(true);

  const json = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(json)['@graph'];
  expect(graph.map((x) => x['@type'])).toEqual(['Article', 'PublicationIssue', 'BreadcrumbList']);
  expect(graph[0]).toMatchObject({
    headline: TITLE, url: SITE + URL, inLanguage: 'ru', datePublished: '2026-07', pageStart: '7',
    isPartOf: { '@id': `${SITE}/issues/10/#issue` }, author: { '@type': 'Organization', name: 'Тритон' },
  });
  expect(json).not.toContain('"Person"');
});

test('содержание номера ведёт на статьи, где пункт совпадает точно', async ({ page }) => {
  await page.goto('/issues/10/');
  await settled(page);
  const linked = A10.filter((a) => a.toc);
  await expect(page.locator('.toc a')).toHaveCount(linked.length);
  for (const a of linked) await expect(page.locator('.toc a', { hasText: a.toc })).toHaveAttribute('href', `/issues/10/${a.slug}/`);
  // Пункт без статьи на сайте остаётся текстом.
  await expect(page.locator('.toc li', { hasText: 'Международности быть!' }).locator('a')).toHaveCount(0);

  await page.evaluate(() => { window.__same = true; });
  await page.locator('.toc a', { hasText: TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
  await expect(page.locator('h1')).toHaveText(TITLE);
  await expect(page).toHaveTitle(`${TITLE} — Тритон №10`);
  const next = A10[J + 1];
  await page.locator('.pn-art .pn-a', { hasText: 'Следующая статья' }).click();
  await expect(page.locator('h1')).toHaveText(next.title);
  await page.goBack();
  await expect(page.locator('h1')).toHaveText(TITLE);
  await page.locator('.art-end .btn', { hasText: 'Весь выпуск №10' }).click();
  await expect(page).toHaveURL(/\/issues\/10\/$/);
  expect(await page.evaluate(() => window.__same)).toBe(true);
});

test('английский интерфейс: подписи по-английски, текст статьи на русском', async ({ page }) => {
  await page.goto(URL);
  await settled(page);
  const ru = await page.locator('.prose').innerHTML();
  await page.locator('.hdr button[data-lang="en"]:visible').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.ahd .meta')).toHaveText('Issue 10 · July 2026 · p. 7');
  await expect(page.locator('h1')).toHaveText(TITLE);
  await expect(page.locator('h1')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.prose')).toHaveAttribute('lang', 'ru');
  expect(await page.locator('.prose').innerHTML()).toBe(ru);
  await expect(page).toHaveTitle(`${TITLE} — Triton No. 10`);
  await expect(page.locator('.art-end .btn').first()).toHaveText('The whole issue 10');
  await page.reload();
  await expect(page.locator('.ahd .meta')).toHaveText('Issue 10 · July 2026 · p. 7');
  expect(await page.locator('.prose').innerHTML()).toBe(ru);
});

test('все статьи в sitemap.xml, у каждой canonical и нет подписей авторов', async ({ request }) => {
  expect(ARTICLE_URLS.length).toBeGreaterThan(0);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const u of ARTICLE_URLS) {
    expect(sitemap, u).toContain(`<loc>${SITE}${u}</loc>`);
    const res = await request.get(u);
    expect(res.status(), u).toBe(200);
    const html = await res.text();
    expect(html, u).toContain(`<link rel="canonical" href="${SITE}${u}">`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1].replace(/<\\\//g, '</'));
    const article = ld['@graph'][0];
    expect(article['@type'], u).toBe('Article');
    expect(article.isPartOf['@id'], u).toMatch(/\/issues\/\d+\/#issue$/);
    expect(article.author, u).toMatchObject({ '@type': 'Organization', name: 'Тритон' });
    const prose = html.match(/<div class="prose" lang="ru">(.*?)<\/div>/s)[1].replace(/<br>/g, '\n').replace(/<\/(p|h2)>/g, '\n').replace(/<[^>]+>/g, '');
    expect(prose, u).not.toMatch(SIGNATURE);
  }
});

test('статьи, которой нет: страница не найдена', async ({ page }) => {
  const res = await page.goto('/issues/10/no-such-article/');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Страница не найдена');
  await page.goto('/issues/99/literaturnye-geroi/');
  await expect(page.locator('h1')).toHaveText('Страница не найдена');
});

test.describe('новый номер из базы без статей', () => {
  test.use({ firebase: { issues: [...ISSUES, newIssue({ number: NEW_N, toc: '3 Первая статья\n5 Вторая статья' })], announcement: { enabled: false } } });

  test('страница номера работает как раньше: содержание без ссылок', async ({ page }) => {
    await page.goto(`/issues/${NEW_N}/`);
    await expect(page.locator('h1')).toHaveText('Новый номер из базы');
    await expect(page.locator('.toc li')).toHaveCount(2);
    await expect(page.locator('.toc a')).toHaveCount(0);
    await page.goto(`/issues/${NEW_N}/pervaya-statya/`);
    await expect(page.locator('h1')).toHaveText('Страница не найдена');
  });
});

test('список статей не загрузился: номер показывается, содержание без ссылок', async ({ page }) => {
  await page.route('**/data/articles.json*', (r) => r.abort());
  await page.goto('/issues/10/');
  await settled(page);
  await expect(page.locator('h1')).toHaveText('Сотрудничество — условие прогресса');
  await expect(page.locator('.toc li')).toHaveCount(6);
  await expect(page.locator('.toc a')).toHaveCount(0);
});
