#!/usr/bin/env python3
"""Сохраняет выпуски из базы (Firestore) в data/issues.json.

Сайт сразу показывает эту копию, а потом сверяет её с базой: если копия устарела,
посетитель на мгновение видит старые данные, а страница перерисовывается.
Поэтому после правок в админке обновите копию и пересоберите страницы:

    python3 tools/fetch_issues.py
    python3 tools/build_pages.py

Читает базу так же, как сайт для посетителей: REST API без входа.
Ничего в базу не пишет. Адрес можно подменить переменной FIRESTORE_URL (для проверок).
"""
import json, os, pathlib, re, ssl, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_JS = (ROOT / 'app.js').read_text(encoding='utf-8')
PROJECT = re.search(r"projectId: '([^']+)'", APP_JS)[1]
API_KEY = re.search(r"apiKey: '([^']+)'", APP_JS)[1]
BASE = os.environ.get('FIRESTORE_URL', 'https://firestore.googleapis.com')
# Поля в том порядке, в каком они лежат в копии; остальные идут следом по алфавиту.
ORDER = ['id', 'number', 'title', 'date', 'desc', 'pdfUrl', 'coverUrl', 'color', 'toc', 'quote', 'quoteBy',
         'title_en', 'desc_en', 'quote_en', 'quoteBy_en', 'uploadedAt']


def value(v):
    if 'stringValue' in v:
        return v['stringValue']
    if 'integerValue' in v:
        return int(v['integerValue'])
    if 'doubleValue' in v:
        return float(v['doubleValue'])
    if 'booleanValue' in v:
        return v['booleanValue']
    if 'timestampValue' in v:
        return v['timestampValue']
    if 'mapValue' in v:
        return {k: value(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v:
        return [value(x) for x in v['arrayValue'].get('values', [])]
    return None


def main():
    url = f'{BASE}/v1/projects/{PROJECT}/databases/(default)/documents:runQuery?key={API_KEY}'
    body = json.dumps({'structuredQuery': {'from': [{'collectionId': 'issues'}],
                                           'orderBy': [{'field': {'fieldPath': 'uploadedAt'}, 'direction': 'ASCENDING'}]}}).encode()
    req = urllib.request.Request(url, data=body, headers={'content-type': 'application/json'})
    ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE')) if os.environ.get('SSL_CERT_FILE') else None
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        rows = json.load(r)
    issues = []
    for row in rows:
        doc = row.get('document')
        if not doc:
            continue
        x = {'id': doc['name'].rsplit('/', 1)[-1], **{k: value(v) for k, v in doc.get('fields', {}).items()}}
        issues.append({k: x[k] for k in sorted(x, key=lambda k: (ORDER.index(k) if k in ORDER else len(ORDER), k))})
    if not issues:
        sys.exit('база вернула пустой список, data/issues.json не тронут')
    path = ROOT / 'data' / 'issues.json'
    old = path.read_text(encoding='utf-8')
    new = json.dumps(issues, ensure_ascii=False, indent=1)
    if new == old:
        print(f'{len(issues)} выпусков, копия не изменилась')
        return
    path.write_text(new, encoding='utf-8')
    print(f'{len(issues)} выпусков сохранено в data/issues.json. Теперь: python3 tools/build_pages.py')


if __name__ == '__main__':
    main()
