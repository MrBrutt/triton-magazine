#!/usr/bin/env python3
"""Собирает HTML-страницы сайта «Тритон» из data/issues.json.

Сайт работает как одно приложение (app.js), но у каждой важной страницы есть свой файл
с готовой вёрсткой, заголовком, описанием и разметкой schema.org:
  /index.html, /issues/index.html, /issues/N/index.html, /about/index.html,
  /issues/N/slug/index.html (статьи из data/articles/N/slug.txt),
  /admin/index.html, /404.html (для всех остальных адресов), data/articles.json (список статей для app.js),
  sitemap.xml, robots.txt, rss.xml и обложки covers/N.webp, covers/N-360.webp.

Вёрстка здесь повторяет шаблоны app.js для русской версии сайта. app.js рисует страницу
заново и, если разметка совпала, не трогает DOM, так что ничего не прыгает. Поменяли шаблон
в app.js — поменяйте его и здесь; тест tests/prerender.spec.js сравнит оба варианта.

Константы (цвета, обложки, значения по умолчанию, редакция, значки) берутся прямо из app.js.

Запуск из корня репозитория:  python3 tools/build_pages.py
Перезапускать после правки app.js / admin.js / app.css (меняется версия файлов)
и после правки data/issues.json (новый номер получит свою страницу /issues/N/).
Повторный запуск без правок ничего не меняет: это проверяет CI.
"""
import functools, hashlib, html, json, pathlib, re, urllib.parse
from email.utils import format_datetime
from datetime import datetime, timezone, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://triton-skolkovo.ru'
APP_JS = (ROOT / 'app.js').read_text(encoding='utf-8')


def js_const(name):
    """Значение `const NAME = <строгий JSON>;` из app.js."""
    m = re.search(r'^const ' + name + r' = ', APP_JS, re.M)
    if not m:
        raise SystemExit(f'в app.js нет константы {name}')
    return json.JSONDecoder().raw_decode(APP_JS, m.end())[0]


def js_icons():
    block = re.search(r'^const ICON = \{\n(.*?)^\};', APP_JS, re.M | re.S)[1]
    return dict(re.findall(r"^\s+(\w+): '(<svg[^']*)',?$", block, re.M))


PALETTE = {p['hex'] for p in js_const('PALETTE')}
DEFAULT_COLOR = js_const('DEFAULT_COLOR')
LOCAL_COVERS = js_const('LOCAL_COVERS')
DEFAULTS = js_const('DEFAULTS')
TEAM = js_const('TEAM')
ICON = js_icons()
COVER_SIZES = js_const('COVER_SIZES')
TG_URL = re.search(r"^const TG_URL = '([^']+)';", APP_JS, re.M)[1]

MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
RU1 = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать',
       'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
RU10 = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
JOIN_TEXT = 'Редакция ищет авторов, иллюстраторов, фотографов и верстальщиков. Напишите в Telegram @mrbrutt: расскажите о себе и пришлите пример работы.'
ROLES = [('Авторы', 'пишут интервью, рассказы и статьи'), ('Иллюстраторы', 'рисуют обложки и картинки к текстам'),
         ('Фотографы', 'снимают людей и события гимназии'), ('Верстальщики', 'собирают страницы номера')]
PUBLISHER = 'Международная гимназия Сколково'
AWARD = 'Победитель всероссийского конкурса «Волшебное слово» в номинации «Лучшее школьное СМИ» (2026)'
YANDEX_VERIFICATION = 'f0bd390f630c6588'  # Яндекс.Вебмастер, только на главной

e = lambda s: html.escape(str(s), quote=True)


# ---------------- помощники, как в app.js ----------------
def plural(n, one, few, many):
    a = abs(n) % 100
    b = a % 10
    if 10 < a < 20:
        return many
    if 1 < b < 5:
        return few
    return one if b == 1 else many


def words(n):
    if n < 20:
        return RU1[n]
    if n < 100:
        return RU10[n // 10] + (' ' + RU1[n % 10] if n % 10 else '')
    return str(n)


cap = lambda s: s[:1].upper() + s[1:]
issues_ru = lambda n: f'{words(n)} {plural(n, "номер", "номера", "номеров")}'
out_ru = lambda n: plural(n, 'вышел', 'вышло', 'вышло')
s_ = lambda v: v if isinstance(v, str) else ''


def ym(d):
    m = re.fullmatch(r'(\d{4})-(\d{2})', s_(d), re.A)
    return (int(m[1]), int(m[2])) if m and 1 <= int(m[2]) <= 12 else None


def month(d):
    p = ym(d)
    return f'{MONTHS[p[1] - 1]} {p[0]}' if p else s_(d)


def typo(s):
    s = s_(s).replace(' - ', ' — ')
    return re.sub(r'[ \t]*→[ \t]*$', '', s, flags=re.M).strip()


def paras(s):
    return [p.strip() for p in re.split(r'\n+', typo(s)) if p.strip()]


def lead_of(s):
    p = (paras(s) or [''])[0]
    if len(p) <= 240:
        return p
    sent = re.findall(r'[^.!?…]+(?:[.!?…]+[»"”]?|$)\s*', p) or [p]
    return ''.join(sent[:2]).strip()


def parse_toc(s):
    out = []
    for line in s_(s).split('\n'):
        line = line.strip()
        if not line:
            continue
        m = re.fullmatch(r'(\d{1,3})[\s.:–—-]+(.+)', line, re.A)
        out.append({'page': m[1], 'title': m[2].strip()} if m else {'page': '', 'title': line})
    return out


def clean_title(s):
    s = s_(s).strip()
    m = re.fullmatch(r'"([^"]*)"', s)
    return m[1] if m else s


def is_https(u):
    return isinstance(u, str) and re.fullmatch(r'https://\S+', u.strip(), re.I) is not None


def drive_id(u):
    m = re.search(r'/file/d/([\w-]+)', s_(u), re.A) or re.search(r'[?&]id=([\w-]+)', s_(u), re.A)
    return m[1] if m else ''


def cover_src(x):
    ids = [drive_id(x.get('coverUrl')), drive_id(x.get('pdfUrl'))]
    local = LOCAL_COVERS.get(ids[0]) or (not is_https(x.get('coverUrl')) and LOCAL_COVERS.get(ids[1]))
    if local:
        return f'/covers/{local}.jpg'
    q = lambda i: 'https://drive.google.com/thumbnail?id=' + urllib.parse.quote(i, safe="-_.!~*'()") + '&sz=w800'
    if is_https(x.get('coverUrl')):
        return q(ids[0]) if ids[0] else x['coverUrl'].strip()
    return q(ids[1]) if ids[1] else ''


def placeholder(x):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297"><rect width="210" height="297" fill="{x.get("color") or DEFAULT_COLOR}"/>'
           f'<text x="18" y="268" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="44" fill="#2F3B40">№{x.get("n") or ""}</text></svg>')
    return 'data:image/svg+xml,' + urllib.parse.quote(svg, safe="-_.!~*'()")


def js_int(v):
    m = re.match(r'\s*([+-]?\d+)', str(v)) if v is not None and not isinstance(v, bool) else None
    return int(m[1]) if m else 0


def cmp(a, b):
    return (a > b) - (a < b)


def normalize(raw):
    items = [dict(x) for x in raw if isinstance(x, dict) and s_(x.get('title')).strip()]
    items.sort(key=functools.cmp_to_key(lambda a, b: cmp(s_(a.get('date')), s_(b.get('date'))) or cmp(s_(a.get('uploadedAt')), s_(b.get('uploadedAt')))))
    for i, x in enumerate(items):
        num = js_int(x.get('number'))
        x['n'] = num if num > 0 else i + 1
    for x in items:
        d = DEFAULTS.get(str(x['n']), {})
        pick = lambda k: x[k] if isinstance(x.get(k), str) else (d.get(k) or '')
        x['titleView'] = clean_title(x.get('title'))
        x['color'] = x['color'] if isinstance(x.get('color'), str) and x['color'] in PALETTE else (d.get('color') or DEFAULT_COLOR)
        x['eff'] = {k: pick(k) for k in ('toc', 'quote', 'quoteBy')}
        x['eff']['coverAlt'] = d.get('coverAlt') or ''
        x['tocItems'] = parse_toc(x['eff']['toc'])
        x['desc'] = s_(x.get('desc'))
    items.sort(key=functools.cmp_to_key(lambda a, b: (b['n'] - a['n']) or cmp(s_(b.get('date')), s_(a.get('date')))))
    return items


# ---------------- шаблоны, как в app.js (русская версия) ----------------
issue_path = lambda n: f'/issues/{n}/'
read_path = lambda n: f'/issues/{n}/read/'
alt_of = lambda x: x['eff']['coverAlt'] or f'Обложка №{x["n"]}'
pdf_of = lambda x: x['pdfUrl'].strip() if is_https(x.get('pdfUrl')) else ''
since = lambda n: f'{cap(issues_ru(n))} с октября 2021 года'


def ext(href, label, cls):
    return f'<a class="{cls}" href="{e(href)}" target="_blank" rel="noopener">{label}<span class="sr">{e(", откроется в новой вкладке")}</span></a>'


def cover(x, cls='', alt='', eager=False):
    src, ph = cover_src(x), placeholder(x)
    load = ' fetchpriority="high"' if eager else ' loading="lazy"'
    img = f'<img class="cv{" " + cls if cls else ""}" src="{e(src or ph)}" data-ph="{e(ph)}" alt="{e(alt)}" width="420" height="594"{load} decoding="async">'
    m = re.fullmatch(r'/covers/(\d+)\.jpg', src)
    if not m:
        return img
    n = m[1]
    return f'<picture><source type="image/webp" srcset="/covers/{n}-360.webp 360w, /covers/{n}.webp 640w" sizes="{COVER_SIZES.get(cls) or COVER_SIZES[""]}">{img}</picture>'


def card(x, latest=False, eager=False):
    meta = f'№{x["n"]}, {month(x.get("date"))}' + (' · новый' if latest else '')
    return f'<li><a class="card" href="{issue_path(x["n"])}">{cover(x, "", "", eager)}<span class="t">{e(x["titleView"])}</span><span class="m">{e(meta)}</span></a></li>'


def toc_sec(x, hint, links=None):
    if not x['tocItems']:
        return ''
    pg = lambda it: '<span class="sr">стр. </span>' + e(it['page']) if it['page'] else ''
    links = links or {}
    tt = lambda it: f'<a href="{e(links[it["title"]])}">{e(it["title"])}</a>' if it['title'] in links else e(it['title'])
    items = ''.join(f'<li><span class="pg">{pg(it)}</span><span class="tt">{tt(it)}</span></li>' for it in x['tocItems'])
    hint_html = '<p>Номера страниц как в журнале.</p>' if hint else ''
    return f'<section class="sec" aria-labelledby="toc-h"><div class="wrap split"><div class="split-h"><h2 class="h2" id="toc-h">В номере</h2>{hint_html}</div><ol class="toc" role="list">{items}</ol></div></section>'


def join_box():
    return f'<div class="join-box" id="join"><h2 class="h2">Как попасть в редакцию</h2><p>{e(JOIN_TEXT)}</p>{ext(TG_URL, "Написать в редакцию", "btn btn-w")}</div>'


def header_html(name):
    sec = 'page' if name == 'issues' else 'true' if name in ('issue', 'article') else ''
    join = '#join' if name == 'home' else '/about/#join'
    cur = lambda v: f' aria-current="{v}"' if v else ''
    return f'''<div class="wrap">
<a class="mark" href="/" aria-label="Тритон, на главную">тритон</a>
<nav class="nav" aria-label="Разделы сайта"><a href="/issues/"{cur(sec)}>Выпуски</a><a href="/about/"{cur("page" if name == "about" else "")}>О журнале</a><a href="{join}">Как попасть в редакцию</a></nav>
<div class="langs" role="group" aria-label="Язык сайта"><button type="button" data-lang="ru" lang="ru" aria-pressed="true">RU</button><button type="button" data-lang="en" lang="en" aria-pressed="false">EN</button></div>
<div class="hdr-m"><button type="button" class="hdr-lang" data-lang="en" aria-label="Switch to English">EN</button><button type="button" class="burger" aria-expanded="false" aria-controls="menu" aria-label="Открыть меню">{ICON["burger"]}</button></div>
</div>'''


def menu_html(name):
    join = '#join' if name == 'home' else '/about/#join'
    cur = lambda v: ' aria-current="page"' if v else ''
    return (f'<div class="wrap"><nav aria-label="Разделы сайта"><ul role="list"><li><a href="/issues/"{cur(name == "issues")}>Выпуски</a></li>'
            f'<li><a href="/about/"{cur(name == "about")}>О журнале</a></li><li><a href="{join}">Как попасть в редакцию</a></li></ul></nav></div>')


def footer_html(year):
    return f'<div class="wrap"><span>Журнал студентов Международной гимназии Сколково, 2021–{year}</span><a href="/admin/">Вход для редакции</a></div>'


def not_found_html(h, p):
    return (f'<section class="nf"><div class="wrap"><h1 class="h1big" tabindex="-1">{e(h)}</h1><p>{e(p)}</p><div class="acts">'
            '<a class="btn" href="/">На главную</a><a class="btn btn-o" href="/issues/">Все выпуски</a></div></div></section>')


def v_home(items):
    x = items[0]
    pdf = pdf_of(x)
    acts = (f'<a class="btn" href="{read_path(x["n"])}">Читать номер</a>{ext(pdf, "PDF на Google Диске", "btn btn-o")}' if pdf
            else f'<a class="btn" href="{issue_path(x["n"])}">Читать на сайте</a>')
    hero = f'''<section class="hero"><div class="wrap hero-g">
<p class="mast">тритон</p>
<p class="badge"><b>{e(f"Выпуск №{x['n']}")}</b><span>{e(month(x.get("date")))}</span></p>
<h1 tabindex="-1">{e(x["titleView"])}</h1>
<p class="lead">{e(lead_of(x["desc"]))}</p>
<div class="acts">{acts}</div>
<figure class="hero-cv"><a href="{issue_path(x["n"])}" aria-label="{e(f"Выпуск №{x['n']}")}">{cover(x, "cv-xl", alt_of(x), True)}</a></figure>
</div></section>'''
    n = len(items)
    rest = items[1:]
    shelf = (f'<section class="shelf" aria-labelledby="all-h"><div class="wrap shelf-h"><h2 class="h2" id="all-h">Все выпуски</h2><p>{e(since(n))}</p>'
             f'<a class="shelf-all" href="/issues/">Все {n}</a></div><div class="wrap flush"><ul class="grid5" role="list">{"".join(card(y) for y in rest)}</ul></div></section>') if rest else ''
    about_short = (f'«Тритон» делают студенты Международной гимназии Сколково. Первый номер вышел в октябре 2021 года, с тех пор {out_ru(n)} {words(n)}. '
                   'В номерах интервью, рассказы, исследования, рисунки и фотографии студентов.')
    about = f'<section class="about2" aria-labelledby="about-h"><div class="wrap"><div class="col"><h2 class="h2" id="about-h">О журнале</h2><p>{e(about_short)}</p></div>{join_box()}</div></section>'
    return hero + toc_sec(x, False) + shelf + about


def v_issues(items):
    years = sorted({ym(x.get('date'))[0] for x in items if ym(x.get('date'))}, reverse=True)
    chip = lambda val, label: f'<button type="button" class="chip" data-year="{val}" aria-pressed="{"true" if val == "" else "false"}">{e(label)}</button>'
    latest = items[0]['n']
    return (f'<section class="phero"><div class="wrap"><h1 class="h1big" tabindex="-1">Все выпуски</h1><p id="since">{e(since(len(items)) + ".")}</p></div></section>'
            f'''<div id="ilist"><section class="filters" aria-label="Поиск и фильтр"><div class="wrap">
<div class="fsearch"><label class="lbl" for="q">Поиск по выпускам</label><input id="q" class="inp" type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Название, номер или год" value=""></div>
<div class="chips" role="group" aria-label="Год выпуска">{chip("", "Все")}{"".join(chip(y, str(y)) for y in years)}</div>
<p class="found" id="found" role="status">Найдено: {len(items)}</p>
</div></section>
<section class="results" aria-label="Выпуски"><div class="wrap"><ul class="grid5" role="list" id="grid">{"".join(card(x, x["n"] == latest, i < 2) for i, x in enumerate(items))}</ul>
<div class="state" id="nores" hidden><h2>Ничего не нашлось</h2><p>Попробуйте другое слово или покажите все годы.</p><button type="button" class="btn btn-o" id="reset">Сбросить поиск</button></div></div></section></div>''')


def v_issue(items, i, arts=()):
    x = items[i]
    n = x['n']
    pdf = pdf_of(x)
    acts = (f'<a class="btn" href="{read_path(n)}">Читать на сайте</a>{ext(pdf, "PDF на Google Диске", "btn btn-o")}' if pdf
            else '<p class="meta">PDF этого номера пока не добавлен.</p>')
    desc = ''.join(f'<p>{e(p)}</p>' for p in paras(x['desc']))
    hero = f'''<section class="ihero"><div class="wrap">
<nav class="crumbs" aria-label="Вы здесь"><a href="/issues/">Выпуски</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">№{n}</span></nav>
<div class="ihero-g"><figure class="ihero-cv">{cover(x, "cv-xl", alt_of(x), True)}</figure>
<div class="ihero-t"><p class="meta">{e(f"Выпуск №{n} · {month(x.get('date'))}")}</p><h1 tabindex="-1">{e(x["titleView"])}</h1>
<div class="desc">{desc}</div>
<div class="acts">{acts}<button type="button" class="btn-t" data-copy="{issue_path(n)}">{ICON["link"]}Скопировать ссылку</button></div></div></div></div></section>'''
    quote = ''
    q_text, q_by = x['eff']['quote'], x['eff']['quoteBy']
    if q_text.strip():
        qq = re.sub(r'\.+$', '', q_text.strip())
        shown = f'«{qq}»' + ('' if re.search(r'[?!…]$', qq) else '.')
        cap_html = f'<figcaption>{e(q_by)}</figcaption>' if q_by.strip() else ''
        quote = f'<section class="quote"><figure class="wrap"><blockquote><p>{e(shown)}</p></blockquote>{cap_html}</figure></section>'
    prev = items[i + 1] if i + 1 < len(items) else None
    nxt = items[i - 1] if i > 0 else None
    pn = lambda y, label: (f'<a class="pn-a" href="{issue_path(y["n"])}">{cover(y, "cv-s", "")}<span><small>{label}</small><b>№{y["n"]} {e("«" + y["titleView"] + "»")}</b></span></a>' if y else '')
    nav = (f'<nav class="pn" aria-label="Другие номера"><div class="wrap"><div class="pn-l">{pn(prev, "Предыдущий номер")}{pn(nxt, "Следующий номер")}</div>'
           '<a class="btn btn-o" href="/issues/">Все выпуски</a></div></nav>')
    return hero + toc_sec(x, True, toc_links(x['n'], arts)) + quote + nav


# ---------------- статьи ----------------
ARTICLES = ROOT / 'data' / 'articles'
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
article_path = lambda n, slug: f'/issues/{n}/{slug}/'


def article_blocks(body):
    """Абзацы статьи: пустая строка между абзацами, «## » — подзаголовок, перенос строки внутри абзаца — <br>."""
    return [b.strip() for b in re.split(r'\n{2,}', body.replace('\r', '')) if b.strip()]


def read_article(path):
    text = path.read_text(encoding='utf-8').replace('\r', '')
    head, _, body = text.partition('\n\n')
    meta = dict(line.split(': ', 1) for line in head.split('\n') if ': ' in line)
    if not SLUG.fullmatch(path.stem) or path.stem == 'read':
        raise SystemExit(f'{path}: имя файла — латинский slug (a-z, 0-9, дефис), не «read»')
    if not meta.get('title', '').strip():
        raise SystemExit(f'{path}: нет строки «title: …» в начале файла')
    blocks = article_blocks(body)
    if not blocks:
        raise SystemExit(f'{path}: пустой текст')
    page_no = meta.get('page', '').strip()
    return {'slug': path.stem, 'title': meta['title'].strip(), 'page': page_no, 'toc': meta.get('toc', '').strip(), 'blocks': blocks}


def load_articles():
    """data/articles/N/*.txt -> {N: [статьи по порядку страниц]}."""
    out = {}
    for d in sorted(ARTICLES.glob('*/'), key=lambda d: d.name):
        if not re.fullmatch(r'\d{1,4}', d.name):
            continue
        arts = [read_article(f) for f in sorted(d.glob('*.txt'))]
        arts.sort(key=lambda a: (int(a['page']) if a['page'].isdigit() else 10 ** 6, a['slug']))
        if arts:
            out[int(d.name)] = arts
    return out


def toc_links(n, arts):
    """Пункт содержания ведёт на статью, только если его текст точно совпадает с полем toc статьи."""
    return {a['toc']: article_path(n, a['slug']) for a in arts if a['toc']}


def first_para(blocks):
    p = next((b for b in blocks if not b.startswith('## ')), blocks[0])
    return re.sub(r'^(## )?(\{en\} )?', '', p).replace('\n', ' ')


def block_html(b):
    """«## » — подзаголовок, «{en} » в начале — абзац на английском (lang="en"), перенос строки — <br>."""
    tag = 'h2' if b.startswith('## ') else 'p'
    s = b[3:] if tag == 'h2' else b
    lang = ''
    if s.startswith('{en} '):
        lang, s = ' lang="en"', s[5:]
    lines = s.split('\n')
    cls = ' class="v"' if tag == 'p' and len(lines) > 1 else ''
    return f'<{tag}{cls}{lang}>' + '<br>'.join(e(x) for x in lines) + f'</{tag}>'


def v_article(x, arts, j):
    a = arts[j]
    n = x['n']
    meta = f'Выпуск №{n} · {month(x.get("date"))}' + (f' · стр. {a["page"]}' if a['page'] else '')
    hero = (f'<section class="ahd"><div class="wrap"><nav class="crumbs" aria-label="Вы здесь"><a href="/issues/">Выпуски</a>'
            f'<span class="sep" aria-hidden="true">/</span><a href="{issue_path(n)}">№{n}</a></nav>'
            f'<p class="meta">{e(meta)}</p><h1 tabindex="-1" lang="ru">{e(a["title"])}</h1></div></section>')
    body = '<div class="wrap"><div class="prose" lang="ru">' + ''.join(block_html(b) for b in a['blocks']) + '</div></div>'
    pdf = pdf_of(x)
    acts = f'<a class="btn" href="{issue_path(n)}">{e(f"Весь выпуск №{n}")}</a>'
    if pdf:
        acts += f'<a class="btn btn-o" href="{read_path(n)}">Читать номер в PDF</a>{ext(pdf, "PDF на Google Диске", "btn-t")}'
    end = (f'<section class="art-end"><div class="wrap"><p class="meta">{e(f"Статья из выпуска №{n} «{x["titleView"]}».")}</p>'
           f'<div class="acts">{acts}</div></div></section>')
    prev = arts[j - 1] if j > 0 else None
    nxt = arts[j + 1] if j + 1 < len(arts) else None
    pn = lambda y, label: (f'<a class="pn-a" href="{article_path(n, y["slug"])}"><span><small>{label}</small><b lang="ru">{e(y["title"])}</b></span></a>' if y else '')
    nav = (f'<nav class="pn pn-art" aria-label="Другие статьи номера"><div class="wrap"><div class="pn-l">{pn(prev, "Предыдущая статья")}{pn(nxt, "Следующая статья")}</div></div></nav>'
           if prev or nxt else '')
    return hero + body + end + nav


def v_about(items, years_since):
    n = len(items)
    by_year = {}
    for x in sorted(items, key=lambda x: x['n']):
        p = ym(x.get('date'))
        if p:
            by_year.setdefault(p[0], []).append(x)
    link = lambda x: f'<a href="{issue_path(x["n"])}">{cover(x, "", "№" + str(x["n"]) + ", " + x["titleView"])}</a>'
    years = ''.join(f'<div class="yr"><h3>{y}</h3>' + ''.join(link(x) for x in xs) + '</div>' for y, xs in by_year.items())
    hist_h = f'{cap(words(years_since))} {plural(years_since, "год", "года", "лет")}, {issues_ru(n)}'
    hist = (f'<section class="hist" aria-labelledby="hist-h"><div class="wrap"><h2 class="h2" id="hist-h">{e(hist_h)}</h2>'
            '<p class="intro">Журнал придумали студентка и учитель гимназии в 2021 году. Номера выходят зимой и летом, у каждого своя тема.</p>'
            f'<div class="years">{years}</div></div></section>') if n else ''
    people = ''.join(f'<li class="person"><span>{e(p["role"]["ru"])}</span><b>{e(p["name"]["ru"])}</b></li>' for p in TEAM)
    team = (f'<section class="team{"" if n else " hist"}" aria-labelledby="team-h"><div class="wrap"><h2 class="h2" id="team-h">Редакция</h2>'
            '<p class="intro">Номер собирают студенты разных классов: пишут тексты, рисуют, фотографируют и верстают.</p>'
            f'<ul class="people" role="list">{people}</ul></div></section>')
    roles = ''.join(f'<li><b>{e(a)}</b> {e(b)}</li>' for a, b in ROLES)
    join = (f'<section class="joinsec" id="join" aria-labelledby="join-h"><div class="wrap"><div class="jt"><h2 class="h2" id="join-h">Как попасть в редакцию</h2>'
            f'<p>{e(JOIN_TEXT)}</p>{ext(TG_URL, "Написать в редакцию", "btn btn-w")}</div><ul class="roles" role="list">{roles}</ul></div></section>')
    lead = (f'«Тритон» делают студенты Международной гимназии Сколково. С октября 2021 года {out_ru(n)} {issues_ru(n)}: интервью, рассказы, исследования, рисунки и фотографии студентов.'
            if n else '«Тритон» делают студенты Международной гимназии Сколково. В номерах интервью, рассказы, исследования, рисунки и фотографии студентов.')
    return (f'<section class="ahero"><div class="wrap"><h1 class="h1big" tabindex="-1">О журнале</h1><p>{e(lead)}</p>'
            f'<p class="award">{e(AWARD)}</p></div></section>' + hist + team + join)


# ---------------- schema.org ----------------
PERIODICAL_ID = SITE + '/#periodical'


def periodical(items):
    return {
        '@type': 'Periodical', '@id': PERIODICAL_ID, 'name': 'Тритон', 'alternateName': 'Triton', 'url': SITE + '/',
        'description': 'Журнал студентов Международной гимназии Сколково.', 'inLanguage': 'ru', 'startDate': '2021-10',
        'image': SITE + '/og-image.png', 'publisher': {'@type': 'EducationalOrganization', 'name': PUBLISHER},
        'hasPart': [{'@id': SITE + issue_path(x['n']) + '#issue'} for x in items],
    }


def publication_issue(x, full=True):
    d = {'@type': 'PublicationIssue', '@id': SITE + issue_path(x['n']) + '#issue', 'issueNumber': str(x['n']),
         'name': x['titleView'], 'url': SITE + issue_path(x['n']), 'isPartOf': {'@id': PERIODICAL_ID}}
    if ym(x.get('date')):
        d['datePublished'] = x['date']
    if full:
        d['inLanguage'] = 'ru'
        if x['desc']:
            d['description'] = typo(x['desc'])
        src = cover_src(x)
        if src.startswith('/covers/'):
            d['image'] = SITE + src
    return d


def breadcrumbs(*crumbs):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': name, 'item': SITE + path} for i, (name, path) in enumerate(crumbs)]}


def ld_json(graph):
    data = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, separators=(',', ':'))
    return '<script type="application/ld+json">' + data.replace('</', '<\\/') + '</script>'


# ---------------- страницы ----------------
def version():
    h = hashlib.sha1()
    for name in ('app.js', 'admin.js', 'app.css', 'data/issues.json'):
        h.update((ROOT / name).read_bytes())
    # Тексты статей: app.js берёт их с той же версией в адресе, правка текста обновит кэш браузеров.
    for f in sorted(ARTICLES.glob('*/*.txt')):
        h.update(f.relative_to(ROOT).as_posix().encode() + b'\0' + f.read_bytes())
    return h.hexdigest()[:10]


def image_size(path):
    from PIL import Image
    with Image.open(path) as im:
        return im.size


def page(*, path, title, desc, color, v, og_title=None, image='/og-image.png', noindex=False, admin=False,
         main='', key='', ld=None, home=False, year=None, name='', og_type='website'):
    url = SITE + path
    size = (1200, 630) if image == '/og-image.png' else image_size(ROOT / image.lstrip('/'))
    meta = [
        f'<meta name="description" content="{e(desc)}">',
        *([f'<meta name="yandex-verification" content="{YANDEX_VERIFICATION}">'] if home else []),
        '<meta name="robots" content="noindex">' if noindex else f'<link rel="canonical" href="{e(url)}">',
        f'<meta name="theme-color" content="{e(color)}">',
        '<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<link rel="alternate" type="application/rss+xml" title="Тритон: новые номера" href="/rss.xml">',
        '<link rel="preload" href="/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/fonts/montserrat-cyrillic-800-normal.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/fonts/montserrat-cyrillic-900-normal.woff2" as="font" type="font/woff2" crossorigin>',
    ]
    # SDK Firebase нужен только редакции; посетители читают базу через REST.
    if admin:
        meta.append('<link rel="preconnect" href="https://www.gstatic.com" crossorigin>')
    meta += [
        '<link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>',
        f'<link rel="stylesheet" href="/app.css?v={v}">',
        f'<script type="module" src="/app.js?v={v}"></script>',
    ]
    if not noindex:
        meta += [
            f'<meta property="og:type" content="{og_type}">',
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
    if ld:
        meta.append(ld_json(ld))
    if key == 'notfound':
        # 404.html отдаётся и для читалки /issues/N/read/, и для номера, которого ещё нет в копии.
        # Там «Страница не найдена» мелькнула бы до app.js, поэтому прячем её, пока app.js не нарисует своё.
        meta.append("<script>if(/^\\/issues\\/\\d{1,4}(\\/read)?\\/?$/.test(location.pathname))document.documentElement.classList.add('pre-hide')</script>")
    head = '\n'.join(meta)
    if admin:
        body = '<div id="app"><noscript><div class="wrap" style="padding:32px 20px 48px"><h1>Вход для редакции</h1><p>Для входа нужен JavaScript.</p></div></noscript></div>'
    else:
        body = (f'<div id="app" data-kind="public"><a class="skip" href="#main">Перейти к содержанию</a><div id="ann"></div>'
                f'<header class="hdr" id="hdr">{header_html(name)}</header><div class="menu" id="menu" hidden>{menu_html(name)}</div>'
                f'<main id="main" tabindex="-1" data-pre="{e(key)}">{main}</main><footer class="ftr" id="ftr">{footer_html(year)}</footer></div>')
    return f'''<!doctype html>
<html lang="ru" style="--c:{color}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
{head}
</head>
<body{' class="is-home"' if home else ''}>
{body}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
'''


def write(rel, data):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        p.write_bytes(data)
    else:
        p.write_text(data, encoding='utf-8')


def short(s, limit=200, raw=False):
    p = ((s if raw else typo(s)).split('\n') or [''])[0].strip()
    if len(p) <= limit:
        return p
    cut = p[:limit]
    dot = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
    return cut[:dot + 1] if dot > 80 else cut.rsplit(' ', 1)[0] + '…'


def make_webp():
    """covers/N.jpg -> covers/N.webp (как есть) и covers/N-360.webp (360 px по ширине).
    Готовые файлы не пересобираются: другая версия Pillow дала бы другие байты."""
    from PIL import Image
    for jpg in sorted((ROOT / 'covers').glob('*.jpg')):
        for out, width in ((jpg.with_suffix('.webp'), None), (jpg.with_name(jpg.stem + '-360.webp'), 360)):
            if out.exists():
                continue
            with Image.open(jpg) as im:
                im = im.convert('RGB')
                if width and im.width > width:
                    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
                im.save(out, 'WEBP', quality=80, method=6)
            print('создан', out.relative_to(ROOT))


def rss(items, as_of):
    msk = timezone(timedelta(hours=3))

    def pub(x):
        p = ym(x.get('date'))
        return format_datetime(datetime(p[0], p[1], 1, 12, tzinfo=msk)) if p else None

    out = []
    for x in items:
        url = SITE + issue_path(x['n'])
        src = cover_src(x)
        enc = ''
        if src.startswith('/covers/') and (ROOT / src.lstrip('/')).exists():
            enc = f'\n      <enclosure url="{SITE}{src}" length="{(ROOT / src.lstrip("/")).stat().st_size}" type="image/jpeg"/>'
        date = pub(x)
        out.append(f'''    <item>
      <title>{e(f"№{x['n']}. {x['titleView']}")}</title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>{f"{chr(10)}      <pubDate>{date}</pubDate>" if date else ""}
      <description>{e(typo(x['desc']))}</description>{enc}
    </item>''')
    last = format_datetime(as_of.replace(tzinfo=timezone.utc))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Тритон</title>
    <link>{SITE}/</link>
    <description>Журнал студентов Международной гимназии Сколково: новые номера.</description>
    <language>ru</language>
    <lastBuildDate>{last}</lastBuildDate>
    <atom:link href="{SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>{SITE}/og-image.png</url>
      <title>Тритон</title>
      <link>{SITE}/</link>
    </image>
{chr(10).join(out)}
  </channel>
</rss>
'''


def as_of_date(raw):
    """Дата, на которую собраны страницы: последняя загрузка номера. Не «сегодня»,
    чтобы повторная сборка без правок давала те же файлы."""
    stamps = [s_(x.get('uploadedAt')) for x in raw if re.match(r'\d{4}-\d{2}-\d{2}T', s_(x.get('uploadedAt')))]
    if stamps:
        return datetime.strptime(max(stamps)[:19], '%Y-%m-%dT%H:%M:%S')
    dates = [ym(x.get('date')) for x in raw if ym(x.get('date'))]
    y, m = max(dates) if dates else (2021, 10)
    return datetime(y, m, 1)


def main():
    try:
        import PIL  # noqa: F401  размеры картинок для og:image и WebP-обложки
    except ImportError:
        raise SystemExit('Нужен Pillow: pip install Pillow. Без него страницы соберутся иначе, чем в CI.')
    raw = json.loads((ROOT / 'data' / 'issues.json').read_text(encoding='utf-8'))
    items = normalize(raw)
    if not items:
        raise SystemExit('в data/issues.json нет выпусков')
    make_webp()
    articles = load_articles()
    as_of = as_of_date(raw)
    year = as_of.year
    years_since = max(1, year - 2021 - (1 if as_of.month < 10 else 0))
    v = version()
    latest = items[0]
    n_all = len(items)
    count = issues_ru(n_all)
    common = dict(v=v, year=year)
    per = periodical(items)
    pages = {
        'index.html': page(path='/', title='Тритон — журнал студентов Международной гимназии Сколково',
                           desc=f'Все {count} журнала «Тритон» с октября 2021 года. Читайте на сайте или скачайте PDF.',
                           color=latest['color'], og_title='Тритон — журнал студентов Международной гимназии Сколково',
                           main=v_home(items), key='home', name='home', home=True,
                           ld=[{'@type': 'WebSite', '@id': SITE + '/#website', 'name': 'Тритон', 'url': SITE + '/', 'inLanguage': 'ru',
                                'about': {'@id': PERIODICAL_ID}}, per, publication_issue(latest)], **common),
        'issues/index.html': page(path='/issues/', title='Все выпуски — Тритон', og_title='Все выпуски «Тритона»',
                                  desc=f'{cap(count)} журнала студентов Международной гимназии Сколково с октября 2021 года. Поиск по названию, номеру и году.',
                                  color=latest['color'], main=v_issues(items), key='issues', name='issues',
                                  ld=[{'@type': 'CollectionPage', 'name': 'Все выпуски', 'url': SITE + '/issues/', 'inLanguage': 'ru',
                                       'isPartOf': {'@id': SITE + '/#website'}, 'about': {'@id': PERIODICAL_ID},
                                       'mainEntity': {'@type': 'ItemList', 'numberOfItems': n_all, 'itemListElement': [
                                           {'@type': 'ListItem', 'position': i + 1, 'item': publication_issue(x, full=False)} for i, x in enumerate(items)]}},
                                      per, breadcrumbs(('Тритон', '/'), ('Все выпуски', '/issues/'))], **common),
        'about/index.html': page(path='/about/', title='О журнале — Тритон', og_title='О журнале «Тритон»',
                                 desc='Кто делает журнал студентов Международной гимназии Сколково и как попасть в редакцию.',
                                 color=latest['color'], main=v_about(items, years_since), key='about', name='about',
                                 ld=[{'@type': 'AboutPage', 'name': 'О журнале', 'url': SITE + '/about/', 'inLanguage': 'ru', 'about': {'@id': PERIODICAL_ID}},
                                     per, breadcrumbs(('Тритон', '/'), ('О журнале', '/about/'))], **common),
        'admin/index.html': page(path='/admin/', title='Вход для редакции — Тритон', desc='Вход для редакции журнала «Тритон».',
                                 color=latest['color'], noindex=True, admin=True, **common),
        '404.html': page(path='/404.html', title='Страница не найдена — Тритон', desc='Такой страницы на сайте журнала «Тритон» нет.',
                         color=latest['color'], noindex=True, key='notfound', name='notfound',
                         main=not_found_html('Страница не найдена', 'Возможно, в ссылке опечатка или страница переехала.'), **common),
    }
    for i, x in enumerate(items):
        n, title = x['n'], x['titleView']
        cover_file = f'/covers/{n}.jpg' if (ROOT / 'covers' / f'{n}.jpg').exists() else '/og-image.png'
        desc = short(x['desc']) or f'Выпуск №{n} журнала «Тритон», {month(x.get("date"))}.'
        pages[f'issues/{n}/index.html'] = page(
            path=issue_path(n), title=f'№{n}. {title} — Тритон', og_title=f'«Тритон» №{n}. {title}', desc=desc,
            color=x['color'], image=cover_file, main=v_issue(items, i, articles.get(n, [])), key=f'issue:{n}', name='issue',
            ld=[publication_issue(x), {'@type': 'Periodical', '@id': PERIODICAL_ID, 'name': 'Тритон', 'url': SITE + '/'},
                breadcrumbs(('Тритон', '/'), ('Все выпуски', '/issues/'), (f'№{n}. {title}', issue_path(n)))], **common)
        arts = articles.get(n, [])
        for j, a in enumerate(arts):
            path = article_path(n, a['slug'])
            desc = short(first_para(a['blocks']), raw=True)
            article_ld = {
                '@type': 'Article', '@id': SITE + path + '#article', 'headline': a['title'], 'name': a['title'], 'url': SITE + path,
                'mainEntityOfPage': SITE + path, 'inLanguage': 'ru', 'description': desc,
                'isPartOf': {'@id': SITE + issue_path(n) + '#issue'},
                # Подписей авторов на сайте нет: автор — сам журнал.
                'author': {'@type': 'Organization', '@id': SITE + '/#magazine', 'name': 'Тритон', 'url': SITE + '/'},
                'publisher': {'@type': 'EducationalOrganization', 'name': PUBLISHER},
            }
            if ym(x.get('date')):
                article_ld['datePublished'] = x['date']
            if a['page'].isdigit():
                article_ld['pageStart'] = a['page']
            if cover_file != '/og-image.png':
                article_ld['image'] = SITE + cover_file
            pages[f'issues/{n}/{a["slug"]}/index.html'] = page(
                path=path, title=f'{a["title"]} — Тритон №{n}', og_title=a['title'], desc=desc, og_type='article',
                color=x['color'], main=v_article(x, arts, j), key=f'article:{n}:{a["slug"]}', name='article',
                ld=[article_ld, publication_issue(x, full=False),
                    breadcrumbs(('Тритон', '/'), ('Все выпуски', '/issues/'), (f'№{n}. {title}', issue_path(n)), (a['title'], path))], **common)
    missing = sorted(set(articles) - {x['n'] for x in items})
    for n in missing:
        print(f'внимание: статьи data/articles/{n}/ есть, а номера {n} в data/issues.json нет; их страницы не пересобраны')
    for rel, text in pages.items():
        write(rel, text)
    # Список статей для app.js: адреса, заголовки и пункты содержания. Тексты он берёт из data/articles/N/slug.txt.
    manifest = {str(n): [{'slug': a['slug'], 'title': a['title'], 'page': a['page'], 'toc': a['toc']} for a in arts]
                for n, arts in sorted(articles.items())}
    write('data/articles.json', json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    # Статью убрали из data/articles: её страница тоже уходит. Статьи номера, которого нет в данных, не трогаем.
    for old in sorted((ROOT / 'issues').glob('*/*/index.html')):
        rel = old.relative_to(ROOT).as_posix()
        m = re.fullmatch(r'issues/(\d+)/([^/]+)/index\.html', rel)
        if m and rel not in pages and int(m[1]) not in missing:
            old.unlink()
            if not any(old.parent.iterdir()):
                old.parent.rmdir()
            print('удалена', rel)
    # Номер убрали из данных: его старая страница не должна остаться на сайте.
    for old in sorted((ROOT / 'issues').glob('*/index.html')):
        rel = old.relative_to(ROOT).as_posix()
        if re.fullmatch(r'issues/\d+/index\.html', rel) and rel not in pages:
            old.unlink()
            if not any(old.parent.iterdir()):
                old.parent.rmdir()
            print('удалена', rel)
    urls = ['/', '/issues/', '/about/']
    for x in items:
        urls += [issue_path(x['n'])] + [article_path(x['n'], a['slug']) for a in articles.get(x['n'], [])]
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + ''.join(f'  <url><loc>{SITE}{u}</loc></url>\n' for u in urls) + '</urlset>\n')
    write('robots.txt', f'User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n')
    write('rss.xml', rss(items, as_of))
    if not (ROOT / '.nojekyll').exists():
        write('.nojekyll', '')
    print(f'version {v}: {len(pages)} pages, {len(urls)} urls in sitemap, {len(items)} items in rss.xml')


if __name__ == '__main__':
    main()
