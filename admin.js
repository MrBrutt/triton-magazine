/* «Тритон», редакция: вход, выпуски, объявление.
   Загружается только на /admin/. Пароли нигде не хранятся: вход целиком через Firebase Auth. */

let A = null;                 // помощники из app.js
let fbAuth = null, auth = null, user = null, authReady = null;
const S = { tab: 'list', editingId: null, confirmId: null, list: [], ann: null };

const ICON = {
  eye: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M2 11s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="11" r="2.8" stroke="currentColor" stroke-width="1.8"/></svg>',
  eyeOff: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M2 11s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="11" r="2.8" stroke="currentColor" stroke-width="1.8"/><path d="M3 19 19 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M11 3 5 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="#2F3B40" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id)?.value || '').trim();
const fmtDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d);
const issuesWord = (n) => `${n} ${A.plural(n, 'номер', 'номера', 'номеров')}`;

export async function mount(api, stale) {
  A = api;
  if (!authReady) authReady = initAuth().catch((e) => { authReady = null; throw e; });
  await authReady;
  if (stale()) return;
  route(true);
}

async function initAuth() {
  const { m, auth: a } = await A.authLib();
  fbAuth = m;
  auth = a;
  await new Promise((resolve) => {
    let first = true;
    m.onAuthStateChanged(a, (u) => {
      user = u || null;
      if (first) { first = false; resolve(); return; }
      if (/^\/admin\/?$/.test(location.pathname)) route(false);
    });
  });
}

function route(fresh) {
  if (user) {
    if (!fresh && A.app.querySelector('.adm')) return;
    panel();
  } else {
    if (!fresh && A.app.querySelector('#login-form')) return;
    login();
  }
}

function showMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('ok', ok);
  el.hidden = !text;
}

/* ---------------- вход ---------------- */
function authError(e) {
  const c = String(e?.code || '');
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Неверная почта или пароль.';
  if (c.includes('too-many-requests')) return 'Слишком много попыток входа. Подождите несколько минут или восстановите пароль.';
  if (c.includes('network-request-failed')) return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  if (c.includes('user-disabled')) return 'Этот аккаунт отключён.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}

function login() {
  S.editingId = null;
  S.confirmId = null;
  A.app.dataset.kind = 'admin';
  document.title = 'Вход для редакции — Тритон';
  A.app.innerHTML = `<div class="login">
<div class="login-top"><div class="wrap"><a class="mark" href="/" aria-label="Тритон, на главную">тритон</a><a class="backlink" href="/">${ICON.back}Вернуться на сайт</a></div></div>
<main class="login-main" id="main" tabindex="-1">
<form class="lcard" id="login-form" novalidate aria-labelledby="login-h">
<h1 id="login-h" tabindex="-1">Вход для редакции</h1>
<p class="sub">Здесь редакция публикует номера и объявления.</p>
<label class="lbl first" for="em">Почта</label>
<input id="em" class="inp" type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com">
<label class="lbl" for="pw">Пароль</label>
<div class="pw"><input id="pw" class="inp" type="password" name="password" autocomplete="current-password"><button type="button" class="pw-t" id="pw-t" aria-label="Показать пароль" aria-pressed="false">${ICON.eye}</button></div>
<div class="msg" id="login-msg" role="alert" hidden></div>
<button type="submit" class="btn" id="login-btn">Войти</button>
<button type="button" class="linkbtn" data-show="reset">Забыли пароль?</button>
</form>
<form class="lcard" id="reset-form" novalidate aria-labelledby="reset-h" hidden>
<h1 id="reset-h" tabindex="-1">Новый пароль</h1>
<p class="sub">Пришлём на почту ссылку, по ней вы зададите новый пароль.</p>
<label class="lbl first" for="rem">Почта</label>
<input id="rem" class="inp" type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false">
<div class="msg" id="reset-msg" role="alert" hidden></div>
<button type="submit" class="btn" id="reset-btn">Отправить ссылку</button>
<button type="button" class="linkbtn" data-show="login">Вернуться ко входу</button>
</form>
</main></div>`;
  A.loadIssues().then((d) => A.setColor(d.list[0]?.color || A.DEFAULT_COLOR)).catch(() => A.setColor(A.DEFAULT_COLOR));

  const lf = $('login-form'), rf = $('reset-form');
  $('pw-t').addEventListener('click', () => {
    const show = $('pw').type === 'password';
    $('pw').type = show ? 'text' : 'password';
    $('pw-t').setAttribute('aria-pressed', String(show));
    $('pw-t').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    $('pw-t').innerHTML = show ? ICON.eyeOff : ICON.eye;
  });
  A.app.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const toReset = b.dataset.show === 'reset';
    lf.hidden = toReset;
    rf.hidden = !toReset;
    showMsg($('login-msg'), '');
    showMsg($('reset-msg'), '');
    if (toReset) { $('rem').value = val('em'); $('rem').focus(); } else { $('em').focus(); }
  }));

  lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = val('em'), pass = $('pw').value;
    if (!email || !pass) { showMsg($('login-msg'), 'Введите почту и пароль.'); (email ? $('pw') : $('em')).focus(); return; }
    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Входим…';
    try {
      const cred = await fbAuth.signInWithEmailAndPassword(auth, email, pass);
      user = cred?.user || auth.currentUser || user;
      route(false);
    } catch (err) {
      showMsg($('login-msg'), authError(err));
      btn.disabled = false;
      btn.textContent = 'Войти';
      $('pw').focus();
      $('pw').select();
    }
  });

  rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = val('rem');
    if (!email) { showMsg($('reset-msg'), 'Введите почту.'); $('rem').focus(); return; }
    const btn = $('reset-btn');
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    try {
      await fbAuth.sendPasswordResetEmail(auth, email);
      showMsg($('reset-msg'), `Письмо со ссылкой отправлено на ${email}. Проверьте почту и папку «Спам».`, true);
    } catch (err) {
      const c = String(err?.code || '');
      showMsg($('reset-msg'), c.includes('invalid-email') ? 'Проверьте адрес почты.' : c.includes('network') ? 'Нет связи с сервером. Проверьте интернет.' : 'Не получилось отправить письмо. Попробуйте ещё раз.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить ссылку';
    }
  });
}

/* ---------------- админка ---------------- */
const tabBtn = (id, label) => `<button type="button" role="tab" class="tab" id="tab-${id}" data-tab="${id}" aria-controls="p-${id}" aria-selected="${S.tab === id}" tabindex="${S.tab === id ? 0 : -1}">${label}</button>`;

function formHtml() {
  const sw = A.PALETTE.map((p, i) => `<label class="sw" title="${p.name}"><input type="radio" name="f-color" value="${p.hex}" aria-label="${p.name}"${i === 0 ? ' checked' : ''}><span style="background:${p.hex}">${ICON.check}</span></label>`).join('');
  return `<h2 id="form-h">Новый выпуск</h2>
<div class="row2"><div style="flex:0 0 120px"><label class="f-lbl" for="f-num">Номер</label><input id="f-num" class="fld" type="number" min="1" max="999" step="1" inputmode="numeric"></div>
<div style="flex:1 1 200px"><label class="f-lbl" for="f-date">Месяц и год</label><input id="f-date" class="fld" type="month" placeholder="ГГГГ-ММ"></div></div>
<p class="hint" id="f-num-hint">Номер можно не заполнять: сайт посчитает его по дате.</p>
<label class="f-lbl" for="f-title">Название</label><input id="f-title" class="fld" type="text" maxlength="200">
<label class="f-lbl" for="f-desc">Описание</label><textarea id="f-desc" class="fld" rows="4"></textarea>
<p class="hint" id="f-desc-c">Два-три предложения о номере. 0 из 400 знаков.</p>
<label class="f-lbl" for="f-toc">Содержание (необязательно)</label><textarea id="f-toc" class="fld" rows="4" placeholder="7 Литературные герои на приёме у психолога&#10;12 Можно ли переделать человека?"></textarea>
<p class="hint">Одна строка на материал: номер страницы, пробел, название.</p>
<label class="f-lbl" for="f-quote">Цитата из номера (необязательно)</label><textarea id="f-quote" class="fld" rows="2"></textarea>
<label class="f-lbl" for="f-quoteby">Чьи слова</label><input id="f-quoteby" class="fld" type="text" placeholder="Имя Фамилия, роль. Откуда цитата">
<label class="f-lbl" for="f-pdf">Ссылка на PDF в Google Диске</label><input id="f-pdf" class="fld" type="url" inputmode="url" placeholder="https://drive.google.com/file/d/…/view">
<p class="hint">Откройте файлу доступ «Все, у кого есть ссылка», иначе читатели его не увидят.</p>
<label class="f-lbl" for="f-cover">Ссылка на обложку (необязательно)</label><input id="f-cover" class="fld" type="url" inputmode="url">
<p class="hint">Без ссылки сайт возьмёт первую страницу PDF.</p>
<img class="cover-prev" id="f-prev" alt="Так обложка будет выглядеть на сайте" hidden>
<fieldset class="fs"><legend class="legend">Цвет шапки сайта</legend><div class="swatches">${sw}</div>
<p class="hint">Возьмите цвет с обложки. Пока номер новый, в этот цвет окрашены шапка и первый экран.</p></fieldset>
<details class="more" id="f-more"><summary>Английская версия (необязательно)</summary>
<label class="f-lbl" for="f-title-en">Название по-английски</label><input id="f-title-en" class="fld" type="text" maxlength="200">
<label class="f-lbl" for="f-desc-en">Описание по-английски</label><textarea id="f-desc-en" class="fld" rows="3"></textarea>
<label class="f-lbl" for="f-quote-en">Цитата по-английски</label><textarea id="f-quote-en" class="fld" rows="2"></textarea>
<label class="f-lbl" for="f-quoteby-en">Чьи слова, по-английски</label><input id="f-quoteby-en" class="fld" type="text">
</details>
<div class="msg" id="f-msg" role="alert" hidden></div>
<div class="f-acts"><button type="submit" class="btn btn-s" id="f-submit">Опубликовать</button><button type="button" class="btn btn-o btn-s" id="f-cancel" hidden>Отменить правку</button></div>`;
}

function annFormHtml() {
  return `<h2 id="ann-h">Объявление</h2>
<p class="hint">Плашка над шапкой сайта.</p>
<div class="prev-ann" id="a-prev" aria-hidden="true"></div>
<p class="hint" id="a-status"></p>
<label class="check" style="margin-top:12px"><input type="checkbox" id="a-on">Показывать плашку</label>
<label class="f-lbl" for="a-title">Заголовок</label><input id="a-title" class="fld" type="text" maxlength="120">
<label class="f-lbl" for="a-text">Текст</label><textarea id="a-text" class="fld" rows="3" maxlength="300"></textarea>
<div class="row2"><div style="flex:1 1 140px"><label class="f-lbl" for="a-btn">Кнопка</label><input id="a-btn" class="fld" type="text" maxlength="30"></div>
<div style="flex:1 1 180px"><label class="f-lbl" for="a-target">Куда ведёт</label><select id="a-target" class="fld"><option value="latest">Свежий номер</option><option value="custom">Своя ссылка</option></select></div></div>
<div id="a-link-box" hidden><label class="f-lbl" for="a-link">Ссылка</label><input id="a-link" class="fld" type="text" inputmode="url" placeholder="https://… или /about/"></div>
<div class="row2"><div style="flex:1 1 150px"><label class="f-lbl" for="a-from">Показывать с</label><input id="a-from" class="fld" type="date"></div>
<div style="flex:1 1 150px"><label class="f-lbl" for="a-until">по<span class="sr"> какое число показывать</span></label><input id="a-until" class="fld" type="date"></div></div>
<fieldset class="fs"><legend class="legend">Где показывать</legend>
<label class="check radio"><input type="radio" name="a-where" value="all">На всех страницах</label>
<label class="check radio"><input type="radio" name="a-where" value="home">Только на главной</label></fieldset>
<details class="more" id="a-more"><summary>Английская версия (необязательно)</summary>
<label class="f-lbl" for="a-title-en">Заголовок по-английски</label><input id="a-title-en" class="fld" type="text" maxlength="120">
<label class="f-lbl" for="a-text-en">Текст по-английски</label><textarea id="a-text-en" class="fld" rows="3" maxlength="300"></textarea>
<label class="f-lbl" for="a-btn-en">Кнопка по-английски</label><input id="a-btn-en" class="fld" type="text" maxlength="30">
</details>
<div class="msg" id="a-msg" role="alert" hidden></div>
<button type="submit" class="btn btn-s" id="a-submit" style="margin-top:20px">Сохранить объявление</button>`;
}

function panel() {
  S.editingId = null;
  S.confirmId = null;
  A.app.dataset.kind = 'admin';
  document.title = 'Редакция — Тритон';
  A.app.innerHTML = `<div class="adm" data-tab="${S.tab}">
<header class="adm-h"><div class="wrap"><div class="adm-brand"><a class="mark" href="/" aria-label="Тритон, на сайт">тритон</a><span class="adm-tag">Редакция</span></div>
<div class="adm-user"><span class="adm-email">${A.esc(user?.email || '')}</span><a class="adm-site" href="/">Открыть сайт</a><button type="button" class="btn-ow" id="logout">Выйти</button></div></div></header>
<main class="wrap adm-main" id="main" tabindex="-1">
<h1 tabindex="-1">Редакция «Тритона»</h1>
<div class="tabs" role="tablist" aria-label="Разделы редакции">${tabBtn('list', 'Выпуски')}${tabBtn('form', 'Новый')}${tabBtn('ann', 'Объявление')}</div>
<div class="adm-cols">
<form class="pcard p-form" id="p-form" novalidate aria-labelledby="form-h">${formHtml()}</form>
<form class="pcard p-ann" id="p-ann" novalidate aria-labelledby="ann-h">${annFormHtml()}</form>
</div>
<section class="pcard p-list" id="p-list" aria-labelledby="list-h"><div class="list-h"><h2 id="list-h">Выпуски на сайте</h2><p id="list-count"></p></div><div id="alist"><p class="hint">Загружаем выпуски…</p></div></section>
</main></div>`;
  bindPanel();
  loadList();
  loadAnn();
}

function setTab(tab, focus = false) {
  S.tab = tab;
  const adm = A.app.querySelector('.adm');
  if (!adm) return;
  adm.dataset.tab = tab;
  adm.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
}

function bindPanel() {
  $('logout').addEventListener('click', async () => {
    try { await fbAuth.signOut(auth); } catch (e) { /* всё равно показываем вход */ }
    user = null;
    A.toast('Вы вышли из редакции');
    if (!A.app.querySelector('#login-form')) login();
  });

  const tabs = A.app.querySelector('.tabs');
  tabs.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = ['list', 'form', 'ann'];
    const i = ids.indexOf(S.tab);
    setTab(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length], true);
    e.preventDefault();
  });

  // форма выпуска
  const form = $('p-form');
  const counter = () => {
    const n = val('f-desc').length;
    $('f-desc-c').textContent = `Два-три предложения о номере. ${n} из 400 знаков.`;
    $('f-desc-c').classList.toggle('over', n > 400);
  };
  $('f-desc').addEventListener('input', counter);
  let pt = 0;
  const prevSoon = () => { clearTimeout(pt); pt = setTimeout(updatePreview, 350); };
  $('f-cover').addEventListener('input', prevSoon);
  $('f-pdf').addEventListener('input', prevSoon);
  form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', saveIssue);
  $('f-cancel').addEventListener('click', () => { const id = S.editingId; resetForm(); renderList(); const b = A.app.querySelector(`.arow[data-id="${CSS.escape(id || '')}"] [data-act="edit"]`); if (b) b.focus(); });

  // список
  $('alist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.arow')?.dataset.id;
    const act = b.dataset.act;
    if (act === 'reload') { A.invalidateIssues(); loadList(); return; }
    if (!id) return;
    if (act === 'edit') startEdit(id);
    else if (act === 'del') { S.confirmId = id; renderList(); A.app.querySelector(`.arow[data-id="${CSS.escape(id)}"] [data-act="del-no"]`)?.focus(); }
    else if (act === 'del-no') { S.confirmId = null; renderList(); A.app.querySelector(`.arow[data-id="${CSS.escape(id)}"] [data-act="del"]`)?.focus(); }
    else if (act === 'del-yes') deleteIssue(id, b);
  });

  // объявление
  const af = $('p-ann');
  af.addEventListener('input', annPreview);
  af.addEventListener('change', annPreview);
  af.addEventListener('submit', saveAnn);
}

function selectedColor() {
  return A.app.querySelector('input[name="f-color"]:checked')?.value || A.DEFAULT_COLOR;
}
function updatePreview() {
  const cov = val('f-cover'), pdf = val('f-pdf');
  const x = { coverUrl: A.isHttps(cov) ? cov : '', pdfUrl: A.isHttps(pdf) ? pdf : '', n: '', color: selectedColor() };
  const src = A.coverSrc(x);
  const img = $('f-prev');
  if (!img) return;
  img.hidden = !src;
  if (src) { img.dataset.ph = A.placeholder(x); img.src = src; } else img.removeAttribute('src');
}

async function loadList() {
  const box = $('alist');
  if (!box) return;
  box.innerHTML = '<p class="hint">Загружаем выпуски…</p>';
  let d;
  try {
    d = await A.loadIssues();
    if (!d.live) throw d.error || new Error('база недоступна');
  } catch (e) {
    A.invalidateIssues();
    if (!$('alist')) return;
    $('list-count').textContent = '';
    $('alist').innerHTML = '<div class="msg" role="alert">Не удалось загрузить выпуски из базы. Проверьте интернет и обновите список.</div><button type="button" class="btn2" data-act="reload" style="margin-top:14px">Обновить список</button>';
    return;
  }
  if (!$('alist')) return;
  S.list = d.list;
  renderList();
  const next = Math.max(0, ...S.list.map((x) => x.n)) + 1;
  if (!S.editingId) $('f-num').placeholder = String(next);
  const opt = A.app.querySelector('#a-target option[value="latest"]');
  if (opt && S.list[0]) opt.textContent = `Свежий номер (№${S.list[0].n})`;
}

function rowHtml(x) {
  const e = A.esc;
  const confirm = S.confirmId === x.id;
  const acts = confirm
    ? `<span class="q">Удалить №${x.n} насовсем?</span><button type="button" class="del del-yes" data-act="del-yes">Да, удалить</button><button type="button" class="btn2" data-act="del-no">Отмена</button>`
    : `<button type="button" class="btn2" data-act="edit">Изменить<span class="sr"> №${x.n}</span></button><button type="button" class="del" data-act="del">Удалить<span class="sr"> №${x.n}</span></button>`;
  return `<li class="arow${S.editingId === x.id ? ' editing' : ''}" data-id="${e(x.id)}">
<img src="${e(A.coverSrc(x) || A.placeholder(x))}" data-ph="${e(A.placeholder(x))}" alt="" loading="lazy" width="44" height="62">
<div class="ainfo"><span class="am">№${x.n} · ${e(A.fmtMonthRu(x.date))}</span><a class="at" href="/issues/${x.n}/" target="_blank" rel="noopener">${e(x.titleView)}<span class="sr">, откроется в новой вкладке</span></a></div>
<div class="aacts">${acts}</div></li>`;
}
function renderList() {
  const box = $('alist');
  if (!box) return;
  $('list-count').textContent = issuesWord(S.list.length);
  box.innerHTML = S.list.length
    ? `<ul class="alist" role="list">${S.list.map(rowHtml).join('')}</ul>`
    : '<p class="hint">Выпусков пока нет. Добавьте первый в форме «Новый выпуск».</p>';
}

function fill(v) {
  const set = (id, s) => { const el = $(id); if (el) el.value = s ?? ''; };
  set('f-num', v.number); set('f-date', v.date); set('f-title', v.title); set('f-desc', v.desc);
  set('f-toc', v.toc); set('f-quote', v.quote); set('f-quoteby', v.quoteBy); set('f-pdf', v.pdfUrl); set('f-cover', v.coverUrl);
  set('f-title-en', v.title_en); set('f-desc-en', v.desc_en); set('f-quote-en', v.quote_en); set('f-quoteby-en', v.quoteBy_en);
  const r = A.app.querySelector(`input[name="f-color"][value="${v.color}"]`) || A.app.querySelector('input[name="f-color"]');
  if (r) r.checked = true;
  $('f-more').open = !!(v.title_en || v.desc_en || v.quote_en || v.quoteBy_en);
  $('f-desc').dispatchEvent(new Event('input'));
  updatePreview();
}

function startEdit(id) {
  const x = S.list.find((i) => i.id === id);
  if (!x) return;
  S.editingId = id;
  S.confirmId = null;
  showMsg($('f-msg'), '');
  A.app.querySelectorAll('#p-form [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  fill({
    number: x.number ?? '', date: x.date, title: x.title, desc: x.desc, toc: x.eff.toc, quote: x.eff.quote, quoteBy: x.eff.quoteBy,
    pdfUrl: x.pdfUrl, coverUrl: x.coverUrl, color: x.color,
    title_en: x.eff.title_en, desc_en: x.eff.desc_en, quote_en: x.eff.quote_en, quoteBy_en: x.eff.quoteBy_en,
  });
  $('f-num').placeholder = String(x.n);
  $('f-num-hint').textContent = `Сейчас у выпуска №${x.n}. Пустое поле: номер по дате.`;
  $('form-h').textContent = `Изменить выпуск №${x.n}`;
  $('f-submit').textContent = 'Сохранить изменения';
  $('f-cancel').hidden = false;
  $('tab-form').textContent = 'Правка';
  setTab('form');
  renderList();
  $('p-form').scrollIntoView({ block: 'start' });
  $('f-title').focus({ preventScroll: true });
}

function resetForm() {
  const form = $('p-form');
  if (!form) return;
  form.reset();
  S.editingId = null;
  $('f-more').open = false;
  $('form-h').textContent = 'Новый выпуск';
  $('f-submit').textContent = 'Опубликовать';
  $('f-cancel').hidden = true;
  $('tab-form').textContent = 'Новый';
  $('f-num-hint').textContent = 'Номер можно не заполнять: сайт посчитает его по дате.';
  $('f-num').placeholder = String(Math.max(0, ...S.list.map((x) => x.n)) + 1);
  showMsg($('f-msg'), '');
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  $('f-desc').dispatchEvent(new Event('input'));
  updatePreview();
}

function collect() {
  const msg = $('f-msg');
  const fail = (id, text) => { const el = $(id); el.setAttribute('aria-invalid', 'true'); showMsg(msg, text); el.focus(); return null; };
  const numS = val('f-num'), date = val('f-date'), title = val('f-title'), pdf = val('f-pdf'), cover = val('f-cover');
  let number = null;
  if (numS) {
    number = Number(numS);
    if (!Number.isInteger(number) || number < 1 || number > 999) return fail('f-num', 'Номер выпуска: целое число от 1 до 999.');
    const dup = S.list.find((x) => x.n === number && x.id !== S.editingId);
    if (dup) return fail('f-num', `Номер ${number} уже у выпуска «${dup.titleView}». Укажите другой или оставьте поле пустым.`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return fail('f-date', 'Укажите месяц и год выхода, например 2026-07.');
  if (!title) return fail('f-title', 'Введите название выпуска.');
  if (title.length > 200) return fail('f-title', 'Название длиннее 200 знаков. Сократите его.');
  if (!A.isHttps(pdf)) return fail('f-pdf', 'Вставьте ссылку на PDF. Она начинается с https://');
  if (cover && !A.isHttps(cover)) return fail('f-cover', 'Ссылка на обложку должна начинаться с https://');
  showMsg(msg, '');
  return {
    number, date, title, desc: val('f-desc'), toc: val('f-toc'), quote: val('f-quote'), quoteBy: val('f-quoteby'),
    pdfUrl: pdf, coverUrl: cover || null, color: selectedColor(),
    title_en: val('f-title-en'), desc_en: val('f-desc-en'), quote_en: val('f-quote-en'), quoteBy_en: val('f-quoteby-en'),
  };
}

function fsError(e, what) {
  const c = String(e?.code || '');
  if (c.includes('permission-denied')) return `База не дала ${what}. Выйдите и войдите снова; если не поможет, проверьте правила Firestore.`;
  if (c.includes('unauthenticated')) return 'Сессия закончилась. Выйдите и войдите снова.';
  if (c.includes('unavailable') || e?.message === 'timeout') return `Нет ответа от базы, не получилось ${what}. Проверьте интернет и обновите список: изменения могли сохраниться.`;
  return `Не получилось ${what}. ${e?.message || ''}`.trim();
}

async function saveIssue(e) {
  e.preventDefault();
  const data = collect();
  if (!data) return;
  const editing = S.editingId;
  const btn = $('f-submit');
  btn.disabled = true;
  btn.textContent = editing ? 'Сохраняем…' : 'Публикуем…';
  try {
    const { m, db } = await A.firestore();
    if (editing) await A.withTimeout(m.updateDoc(m.doc(db, 'issues', editing), data), 15000);
    else await A.withTimeout(m.addDoc(m.collection(db, 'issues'), { ...data, uploadedAt: new Date().toISOString() }), 15000);
    A.invalidateIssues();
    resetForm();
    A.toast(editing ? 'Изменения сохранены' : 'Выпуск опубликован');
    await loadList();
    if (!editing) setTab('list');
  } catch (err) {
    showMsg($('f-msg'), fsError(err, editing ? 'сохранить изменения' : 'опубликовать выпуск'));
  } finally {
    btn.disabled = false;
    btn.textContent = S.editingId ? 'Сохранить изменения' : 'Опубликовать';
  }
}

async function deleteIssue(id, btn) {
  const x = S.list.find((i) => i.id === id);
  if (!x) return;
  btn.disabled = true;
  try {
    const { m, db } = await A.firestore();
    await A.withTimeout(m.deleteDoc(m.doc(db, 'issues', id)), 15000);
    A.invalidateIssues();
    S.confirmId = null;
    if (S.editingId === id) resetForm();
    A.toast(`Выпуск №${x.n} удалён`);
    await loadList();
  } catch (err) {
    S.confirmId = null;
    renderList();
    A.toast(fsError(err, 'удалить выпуск'), 'err');
  }
}

/* ---------------- объявление ---------------- */
async function loadAnn() {
  A.resetAnnouncement();
  const a = await A.loadAnnouncement();
  if (!$('p-ann')) return;
  S.ann = a;
  const set = (id, s) => { const el = $(id); if (el) el.value = s ?? ''; };
  $('a-on').checked = !!a.enabled;
  set('a-title', a.ru?.title); set('a-text', a.ru?.text); set('a-btn', a.ru?.button);
  set('a-title-en', a.en?.title); set('a-text-en', a.en?.text); set('a-btn-en', a.en?.button);
  $('a-target').value = a.target === 'custom' ? 'custom' : 'latest';
  set('a-link', a.link); set('a-from', a.from); set('a-until', a.until);
  const w = A.app.querySelector(`input[name="a-where"][value="${a.where === 'home' ? 'home' : 'all'}"]`);
  if (w) w.checked = true;
  annPreview();
  annStatus();
}

function annStatus() {
  const a = S.ann, el = $('a-status');
  if (!a || !el) return;
  const today = A.todayStr();
  let s;
  if (!a.enabled) s = 'Сейчас плашка выключена.';
  else if (a.from && today < a.from) s = `Плашка появится ${fmtDay(a.from)}.`;
  else if (a.until && today > a.until) s = 'Срок показа закончился, плашки на сайте нет.';
  else s = `Плашка сейчас на сайте${a.where === 'home' ? ', только на главной' : ''}${a.until ? `, до ${fmtDay(a.until)} включительно` : ''}.`;
  if (a.source === 'code') s += a.error ? ' База пока не отдаёт объявление (нужны новые правила Firestore), поэтому показан текст из кода сайта.' : ' Текст пока хранится в коде сайта, после сохранения он будет в базе.';
  el.textContent = s;
}

function annPreview() {
  const on = $('a-on').checked, title = val('a-title'), text = val('a-text'), btn = val('a-btn');
  const custom = $('a-target').value === 'custom';
  $('a-link-box').hidden = !custom;
  const p = $('a-prev');
  p.classList.toggle('off', !on);
  p.innerHTML = `<span class="t">${title ? `<b>${A.esc(title)}</b> ` : ''}${A.esc(text)}${on ? '' : ' (плашка выключена)'}</span>${btn ? `<span class="b">${A.esc(btn)}</span>` : ''}`;
}

async function saveAnn(e) {
  e.preventDefault();
  const msg = $('a-msg');
  const fail = (id, text) => { const el = $(id); el.setAttribute('aria-invalid', 'true'); showMsg(msg, text); el.focus(); };
  A.app.querySelectorAll('#p-ann [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  const enabled = $('a-on').checked;
  const target = $('a-target').value === 'custom' ? 'custom' : 'latest';
  const link = val('a-link'), from = val('a-from'), until = val('a-until');
  if (enabled && !val('a-title') && !val('a-text')) return fail('a-title', 'Добавьте заголовок или текст объявления.');
  if (target === 'custom' && val('a-btn') && !(A.isHttps(link) || /^\/(?!\/)/.test(link))) return fail('a-link', 'Ссылка должна начинаться с https:// или с / для страницы сайта.');
  if (from && until && from > until) return fail('a-until', 'Дата окончания раньше даты начала.');
  const data = {
    enabled, from, until, target, link: target === 'custom' ? link : '',
    where: A.app.querySelector('input[name="a-where"]:checked')?.value === 'home' ? 'home' : 'all',
    ru: { title: val('a-title'), text: val('a-text'), button: val('a-btn') },
    en: { title: val('a-title-en'), text: val('a-text-en'), button: val('a-btn-en') },
    updatedAt: new Date().toISOString(),
  };
  const btn = $('a-submit');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';
  try {
    const { m, db } = await A.firestore();
    await A.withTimeout(m.setDoc(m.doc(db, 'settings', 'announcement'), data), 15000);
    A.resetAnnouncement();
    S.ann = { ...data, source: 'db' };
    showMsg(msg, '');
    annStatus();
    A.toast('Объявление сохранено');
  } catch (err) {
    const denied = String(err?.code || '').includes('permission-denied');
    showMsg(msg, denied ? 'База не дала сохранить объявление: в правилах Firestore ещё нет раздела settings. Опубликуйте новые правила и попробуйте снова.' : fsError(err, 'сохранить объявление'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить объявление';
  }
}
