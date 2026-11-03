// Локальный сервер, который отвечает как GitHub Pages:
// /path/ -> /path/index.html, /path -> редирект на /path/, неизвестный адрес -> 404.html с кодом 404.
// Запуск: node tests/serve.mjs [порт]   (по умолчанию 4173)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || /(^|\/)(\.git|node_modules)(\/|$)/.test(p)) return send(res, path.join(ROOT, '404.html'), 404);
  if (isDir(f)) {
    if (!p.endsWith('/')) { res.writeHead(301, { location: p + '/' }); return res.end(); }
    if (isFile(path.join(f, 'index.html'))) return send(res, path.join(f, 'index.html'), 200);
  }
  if (isFile(f)) return send(res, f, 200);
  send(res, path.join(ROOT, '404.html'), 404);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));

function send(res, file, status) {
  res.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}
