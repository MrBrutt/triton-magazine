#!/usr/bin/env python3
"""Собирает HTML-оболочки страниц сайта «Тритон».

Сайт работает как одно приложение (app.js), но у каждой важной страницы есть свой
файл с заголовком и описанием для поиска и превью в Telegram:
  /index.html, /issues/index.html, /issues/N/index.html, /about/index.html,
  /admin/index.html, /404.html (для всех остальных адресов), sitemap.xml, robots.txt.

Запуск из корня репозитория:  python3 tools/build_pages.py
Перезапускать после правки app.js / admin.js / app.css (меняется версия файлов)
и после добавления нового номера (появится его страница /issues/N/).
"""
import hashlib, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://triton-skolkovo.ru'
# Цвета номеров по умолчанию, как в DEFAULTS в app.js
COLORS = {1: '#E3D3B5', 2: '#CFC6DE', 3: '#E3D3B5', 4: '#92B0B1', 5: '#E3D3B5', 6: '#D2D2CF',
          7: '#92B0B1', 8: '#C1D3AD', 9: '#D2D2CF', 10: '#B4C7B6'}
PALETTE = {'#B4C7B6', '#C1D3AD', '#92B0B1', '#D2D2CF', '#E3D3B5', '#CFC6DE'}
MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
RU1 = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать',
       'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']

e = lambda s: html.escape(str(s), quote=True)


def plural(n, one, few, many):
    a, b = abs(n) % 100, abs(n) % 10
    if 10 < a < 20:
        return many
    if 1 < b < 5:
        return few
    return one if b == 1 else many


def words(n):
    return RU1[n] if n < 20 else str(n)


def month(d):
    m = re.fullmatch(r'(\d{4})-(\d{2})', d or '')
    return f'{MONTHS[int(m[2]) - 1]} {m[1]}' if m and 1 <= int(m[2]) <= 12 else (d or '')


def clean_title(s):
    s = (s or '').strip()
    m = re.fullmatch(r'"([^"]*)"', s)
    return m[1] if m else s


def typo(s):
    s = re.sub(r' - ', ' — ', s or '')
    return re.sub(r'[ \t]*→[ \t]*$', '', s, flags=re.M).strip()


def short(s, limit=200):
    p = typo(s).split('\n')[0].strip()
    if len(p) <= limit:
        return p
    cut = p[:limit]
    dot = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
    return cut[:dot + 1] if dot > 80 else cut.rsplit(' ', 1)[0] + '…'


def load_issues():
    raw = json.loads((ROOT / 'data' / 'issues.json').read_text(encoding='utf-8'))
    raw = [x for x in raw if (x.get('title') or '').strip()]
    raw.sort(key=lambda x: (x.get('date') or '', x.get('uploadedAt') or ''))
    for i, x in enumerate(raw):
        try:
            n = int(x.get('number') or 0)
        except (TypeError, ValueError):
            n = 0
        x['n'] = n if n > 0 else i + 1
        x['color'] = x.get('color') if x.get('color') in PALETTE else COLORS.get(x['n'], '#B4C7B6')
    raw.sort(key=lambda x: -x['n'])
    return raw


def version():
    h = hashlib.sha1()
    for name in ('app.js', 'admin.js', 'app.css', 'data/issues.json'):
        h.update((ROOT / name).read_bytes())
    return h.hexdigest()[:10]


def image_size(path):
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def page(*, path, title, desc, color, v, og_title=None, image='/og-image.png', noindex=False, noscript=''):
    url = SITE + path
    img_path = ROOT / image.lstrip('/')
    size = (1200, 630) if image == '/og-image.png' else image_size(img_path)
    meta = [
        f'<meta name="description" content="{e(desc)}">',
        '<meta name="robots" content="noindex">' if noindex else f'<link rel="canonical" href="{e(url)}">',
        f'<meta name="theme-color" content="{e(color)}">',
        '<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<link rel="preload" href="/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/fonts/montserrat-cyrillic-800-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/fonts/montserrat-cyrillic-900-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preconnect" href="https://www.gstatic.com" crossorigin>',
        '<link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>',
        f'<link rel="stylesheet" href="/app.css?v={v}">',
        f'<script type="module" src="/app.js?v={v}"></script>',
    ]
    if not noindex:
        meta += [
            '<meta property="og:type" content="website">',
            '<meta property="og:site_name" content="Тритон">',
            '<meta property="og:locale" content="ru_RU">',
            f'<meta property="og:url" content="{e(url)}">',
            f'<meta property="og:title" content="{e(og_title or title)}">',
            f'<meta property="og:description" content="{e(desc)}">',
            f'<meta property="og:image" content="{e(SITE + image)}">',
        ]
        if size:
            meta += [f'<meta property="og:image:width" content="{size[0]}">', f'<meta property="og:image:height" content="{size[1]}">']
        meta.append(f'<meta name="twitter:card" content="{"summary_large_image" if image == "/og-image.png" else "summary"}">')
    head = '\n'.join(meta)
    return f'''<!doctype html>
<html lang="ru" style="--c:{color}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
{head}
</head>
<body>
<div id="app"><noscript><div class="wrap" style="padding:32px 20px 48px">{noscript}</div></noscript></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
'''


def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def main():
    issues = load_issues()
    v = version()
    latest = issues[0]
    n_all = len(issues)
    count = f'{words(n_all)} {plural(n_all, "номер", "номера", "номеров")}'
    nojs = '<p>Для работы сайта нужен JavaScript. Номера можно открыть в PDF:</p><ul>' + ''.join(
        f'<li><a href="{e(x["pdfUrl"])}">№{x["n"]}. {e(clean_title(x["title"]))}, {e(month(x["date"]))}</a></li>' for x in issues) + '</ul>'
    pages = {
        'index.html': page(path='/', title='Тритон — журнал студентов Международной гимназии Сколково',
                           desc=f'Все {count} журнала «Тритон» с октября 2021 года. Читайте на сайте или скачайте PDF.',
                           color=latest['color'], v=v, og_title='Тритон — журнал студентов Международной гимназии Сколково',
                           noscript='<h1>Тритон</h1><p>Журнал студентов Международной гимназии Сколково.</p>' + nojs),
        'issues/index.html': page(path='/issues/', title='Все выпуски — Тритон', og_title='Все выпуски «Тритона»',
                                  desc=f'{count.capitalize()} журнала студентов Международной гимназии Сколково с октября 2021 года. Поиск по названию, номеру и году.',
                                  color=latest['color'], v=v, noscript='<h1>Все выпуски</h1>' + nojs),
        'about/index.html': page(path='/about/', title='О журнале — Тритон', og_title='О журнале «Тритон»',
                                 desc='Кто делает журнал студентов Международной гимназии Сколково и как попасть в редакцию.',
                                 color=latest['color'], v=v,
                                 noscript='<h1>О журнале</h1><p>«Тритон» делают студенты Международной гимназии Сколково. Чтобы попасть в редакцию, напишите в Telegram: <a href="https://t.me/god_fa1her">@god_fa1her</a>.</p>'),
        'admin/index.html': page(path='/admin/', title='Вход для редакции — Тритон', desc='Вход для редакции журнала «Тритон».',
                                 color=latest['color'], v=v, noindex=True, noscript='<h1>Вход для редакции</h1><p>Для входа нужен JavaScript.</p>'),
        '404.html': page(path='/404.html', title='Страница не найдена — Тритон', desc='Такой страницы на сайте журнала «Тритон» нет.',
                         color=latest['color'], v=v, noindex=True, noscript='<h1>Страница не найдена</h1><p><a href="/">На главную</a></p>'),
    }
    for x in issues:
        n, title = x['n'], clean_title(x['title'])
        cover = f'/covers/{n}.jpg' if (ROOT / 'covers' / f'{n}.jpg').exists() else '/og-image.png'
        desc = short(x.get('desc') or '') or f'Выпуск №{n} журнала «Тритон», {month(x["date"])}.'
        pages[f'issues/{n}/index.html'] = page(
            path=f'/issues/{n}/', title=f'№{n}. {title} — Тритон', og_title=f'«Тритон» №{n}. {title}', desc=desc,
            color=x['color'], v=v, image=cover,
            noscript=f'<h1>№{n}. {e(title)}</h1><p>{e(month(x["date"]))}</p><p>{e(typo(x.get("desc") or ""))}</p><p><a href="{e(x["pdfUrl"])}">PDF на Google Диске</a></p>')
    for rel, text in pages.items():
        write(rel, text)
    urls = ['/', '/issues/', '/about/'] + [f'/issues/{x["n"]}/' for x in issues]
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + ''.join(f'  <url><loc>{SITE}{u}</loc></url>\n' for u in urls) + '</urlset>\n')
    write('robots.txt', f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    write('.nojekyll', '')
    print(f'version {v}: {len(pages)} pages, {len(urls)} urls in sitemap')


if __name__ == '__main__':
    main()
