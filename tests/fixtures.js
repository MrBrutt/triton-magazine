// Общие заглушки для тестов: сайт никогда не ходит в боевой Firebase и вообще наружу.
//  - firestore.googleapis.com отвечает данными из data/issues.json (или тем, что задал тест);
//  - www.gstatic.com/firebasejs/* отдаёт маленькие модули из tests/stubs/ вместо SDK;
//  - любые другие внешние адреса (Google Диск и т. п.) обрываются.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ISSUES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issues.json'), 'utf8'));
/* Часы тестов: страницы собраны на дату последней загрузки номера, app.js считает годы от «сегодня». */
export const NOW = new Date('2026-11-03T12:00:00+03:00');

const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
};
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));
const DOCS = 'projects/triton-magazine/databases/(default)/documents';
/* Ответ runQuery REST API Firestore. */
export const runQueryBody = (issues) => issues.map(({ id, ...rest }) => ({
  document: { name: `${DOCS}/issues/${id}`, fields: toFields(rest), createTime: '2026-01-01T00:00:00Z', updateTime: '2026-01-01T00:00:00Z' },
  readTime: '2026-11-03T09:00:00Z',
}));

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

export const test = base.extend({
  /* Что отвечает «база». Тест может переопределить: test.use({ firebase: { issues: [...] } }) или { down: true }. */
  firebase: [{ issues: ISSUES, announcement: { enabled: false }, down: false }, { option: true }],
  firebaseLog: async ({}, use) => { await use([]); },
  page: async ({ page, firebase, firebaseLog }, use) => {
    await page.clock.setFixedTime(NOW);
    // Для SDK-заглушки (редакция): те же данные, что отдаёт REST.
    await page.addInitScript((fb) => { window.__fsIssues = fb.issues; window.__fsAnnouncement = fb.announcement || null; }, firebase);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
      const url = new URL(route.request().url());
      firebaseLog.push(`${route.request().method()} ${url.host}${url.pathname}`);
      if (firebase.down && /googleapis\.com|gstatic\.com/.test(url.host)) return route.abort('connectionrefused');
      if (url.host === 'firestore.googleapis.com') {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        if (url.pathname.endsWith(':runQuery')) {
          return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(runQueryBody(firebase.issues)) });
        }
        if (url.pathname.endsWith(':batchGet')) {
          const names = JSON.parse(route.request().postData() || '{}').documents || [];
          const rows = names.map((name) => (name === `${DOCS}/settings/announcement` && firebase.announcement
            ? { found: { name, fields: toFields(firebase.announcement) }, readTime: '2026-11-03T09:00:00Z' }
            : { missing: name, readTime: '2026-11-03T09:00:00Z' }));
          return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(rows) });
        }
        return route.fulfill({ status: 400, headers: CORS, body: '{}' });
      }
      if (url.host === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
        const file = path.join(ROOT, 'tests/stubs', path.basename(url.pathname));
        if (fs.existsSync(file)) return route.fulfill({ status: 200, headers: CORS, contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') });
      }
      return route.abort('blockedbyclient');
    });
    await use(page);
  },
});

export { expect };

/* Ждём, пока app.js дорисует страницу и сходит в «базу». */
export async function settled(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
