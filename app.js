/* «Тритон», журнал студентов Международной гимназии Сколково.
   Один модуль на весь публичный сайт: данные, адреса страниц, страницы, читалка.
   Админка лежит в admin.js и загружается только на /admin/.
   Firebase подгружается по требованию: если он недоступен, сайт показывает
   сохранённую копию выпусков из /data/issues.json. */

const V = new URL(import.meta.url).searchParams.get('v') || '';
const FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAHA1AtPsjf4X4gf5YliMnscDj4CmgWSgk',
  authDomain: 'triton-magazine.firebaseapp.com',
  projectId: 'triton-magazine',
  storageBucket: 'triton-magazine.firebasestorage.app',
  messagingSenderId: '859169446483',
  appId: '1:859169446483:web:39b308366df7e3eb9c04a6',
};
const TG_URL = 'https://t.me/god_fa1her';

/* Цвета шапки. Админка предлагает только их. */
const PALETTE = [
  { hex: '#B4C7B6', name: 'Шалфей' },
  { hex: '#C1D3AD', name: 'Олива' },
  { hex: '#92B0B1', name: 'Бирюза' },
  { hex: '#D2D2CF', name: 'Туман' },
  { hex: '#E3D3B5', name: 'Песок' },
  { hex: '#CFC6DE', name: 'Сирень' },
];
const DEFAULT_COLOR = '#B4C7B6';

/* Обложки, сохранённые на сайте: id файла в Google Диске -> /covers/N.jpg.
   Новые номера берут обложку из Диска. */
const LOCAL_COVERS = {
  '1q4ybub4LO-Cqy_5PJyrS2reoO5VeUFkm': 1,
  '1Zacug5Taw20GGVhntOtbSHIFt22NlNHE': 2,
  '1cZ7jrh5gtv4jGQMC0QckDefPCF5gm_Qv': 3,
  '14GaaZcGd2qztU3fUeHjAMMaUJVBu81oL': 4,
  '1I5yvXGNc2uhDFQsbx74moljKLNNnCYtP': 5,
  '1BzC1aZYFLz-v4TD17lNLyjmzxfTpO3KF': 6,
  '1ip07GGvqDtVPy7-h8Y7dXvYlagz3x2Bd': 7,
  '1R9LgMklIw55NrHAaYL7loAqdV81IgKZS': 8,
  '1URlL9_pE_uklQT_aiWvkodW7VYmDyzG1': 9,
  '1-NGpdotq6chwGty0tU-z_zsjYlbm5yU2': 10,
};

/* Значения по умолчанию для номеров, у которых этих полей нет в базе.
   Если поле заполнено в админке, берётся значение из базы. */
const DEFAULTS = {
  1: { color: '#E3D3B5' }, 2: { color: '#CFC6DE' }, 3: { color: '#E3D3B5' },
  4: { color: '#92B0B1' }, 5: { color: '#E3D3B5' }, 6: { color: '#D2D2CF' },
  7: { color: '#92B0B1' }, 8: { color: '#C1D3AD' }, 9: { color: '#D2D2CF' },
  10: {
    color: '#B4C7B6',
    toc: '7 Литературные герои на приёме у психолога\n12 Можно ли переделать человека?\n14 Вязаные истории\n29 Умные очки Xvision\n31 Международности быть!\n37 «А по Разъезжей бродит Достоевский»',
    quote: 'Тритон растет вместе со студентами, и его жизнь неразрывно связана с жизнью Гимназии',
    quoteBy: 'Умар Гаджикулиев, главный редактор. Из слова редактора',
    title_en: 'Collaboration: a condition for progress',
    desc_en: 'Triton turns five, and the editors devoted the tenth issue to collaboration. Students and a teacher wrote a play, “Literary Characters at the Psychologist’s”, and the issue opens with an excerpt from it. Inside: an interview with a business coach about communication, “Knitted Stories”, an article about Xvision smart glasses and pieces on international life.',
    quote_en: 'Triton grows together with the students, and its life is inseparable from the life of the Gymnasium',
    quoteBy_en: 'Umar Gadzhikuliev, editor-in-chief. From the editor’s letter',
    coverAlt: 'Обложка №10: сова и тритон за столом, между ними свеча в форме цифры 5',
    coverAlt_en: 'Cover of issue 10: an owl and a newt at a table with a candle shaped like the number 5',
  },
};

/* Редакция на странице «О журнале». Новые имена добавлять сюда, только с согласия людей. */
const TEAM = [
  { role: { ru: 'Главный редактор', en: 'Editor-in-chief' }, name: { ru: 'Умар Гаджикулиев', en: 'Umar Gadzhikuliev' } },
];

/* Объявление, если в базе его нет или база недоступна. Обычно его меняют в админке. */
const ANNOUNCEMENT_FALLBACK = {
  enabled: true,
  from: '2026-10-16',
  until: '2026-10-31',
  where: 'all',          // 'all' или 'home'
  target: 'latest',      // 'latest' — страница свежего номера, 'custom' — своя ссылка
  link: '',
  ru: { title: 'Вышел десятый номер «Тритона».', text: 'Журналу пять лет. Читайте юбилейный выпуск о сотрудничестве.', button: 'Читать' },
  en: { title: 'Triton issue 10 is out.', text: 'The magazine turns five. Read the anniversary issue on collaboration.', button: 'Read' },
};

/* ---------------- мелкие помощники ---------------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const str = (v) => (typeof v === 'string' ? v : '');
const isHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/i.test(u.trim());
const cmp = (a, b) => (a > b) - (a < b);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s) => str(s).toLowerCase().replace(/ё/g, 'е');
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const RU1 = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const RU10 = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const EN1 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const wordsRu = (n) => (n < 20 ? RU1[n] : n < 100 ? RU10[Math.floor(n / 10)] + (n % 10 ? ' ' + RU1[n % 10] : '') : String(n));
const wordsEn = (n) => (n < 20 ? EN1[n] : n < 100 ? EN10[Math.floor(n / 10)] + (n % 10 ? '-' + EN1[n % 10] : '') : String(n));
const issuesRu = (n) => `${wordsRu(n)} ${plural(n, 'номер', 'номера', 'номеров')}`;
const issuesEn = (n) => `${wordsEn(n)} ${n === 1 ? 'issue' : 'issues'}`;
const outRu = (n) => plural(n, 'вышел', 'вышло', 'вышло');

function yearsSinceStart() {
  const d = new Date();
  return Math.max(1, d.getFullYear() - 2021 - (d.getMonth() + 1 < 10 ? 1 : 0));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------- тексты интерфейса ---------------- */
const I = {
  ru: {
    skip: 'Перейти к содержанию', toHome: 'Тритон, на главную', navLabel: 'Разделы сайта',
    navIssues: 'Выпуски', navAbout: 'О журнале', navJoin: 'Как попасть в редакцию',
    langLabel: 'Язык сайта', switchLang: 'Switch to English', menuOpen: 'Открыть меню', menuClose: 'Закрыть меню',
    issueN: (n) => `Выпуск №${n}`, noN: (n) => `№${n}`,
    cardMeta: (n, d) => `№${n}, ${d}`, issueMeta: (n, d) => `Выпуск №${n} · ${d}`, coverAlt: (n) => `Обложка №${n}`,
    read: 'Читать номер', readSite: 'Читать на сайте', pdf: 'PDF на Google Диске', newTab: ', откроется в новой вкладке',
    copy: 'Скопировать ссылку', copied: 'Ссылка скопирована', copyFail: 'Не получилось скопировать ссылку',
    inside: 'В номере', insideHint: 'Номера страниц как в журнале.', page: 'стр.',
    allIssues: 'Все выпуски', allN: (n) => `Все ${n}`,
    since: (n) => `${cap(issuesRu(n))} с октября 2021 года`,
    aboutH: 'О журнале',
    aboutShort: (n) => `«Тритон» делают студенты Международной гимназии Сколково. Первый номер вышел в октябре 2021 года, с тех пор ${outRu(n)} ${wordsRu(n)}. В номерах интервью, рассказы, исследования, рисунки и фотографии студентов.`,
    joinH: 'Как попасть в редакцию',
    joinText: 'Редакция ищет авторов, иллюстраторов, фотографов и верстальщиков. Напишите в Telegram @god_fa1her: расскажите о себе и пришлите пример работы.',
    joinBtn: 'Написать в редакцию',
    footer: (y) => `Журнал студентов Международной гимназии Сколково, 2021–${y}`, editors: 'Вход для редакции',
    filtersLabel: 'Поиск и фильтр', searchLabel: 'Поиск по выпускам', searchPh: 'Название, номер или год',
    yearLabel: 'Год выпуска', allYears: 'Все', found: (n) => `Найдено: ${n}`, latestTag: 'новый', resultsLabel: 'Выпуски',
    noResH: 'Ничего не нашлось', noResP: 'Попробуйте другое слово или покажите все годы.', reset: 'Сбросить поиск',
    crumbs: 'Вы здесь', prev: 'Предыдущий номер', next: 'Следующий номер', others: 'Другие номера',
    noPdf: 'PDF этого номера пока не добавлен.',
    aboutLead: (n) => `«Тритон» делают студенты Международной гимназии Сколково. С октября 2021 года ${outRu(n)} ${issuesRu(n)}: интервью, рассказы, исследования, рисунки и фотографии студентов.`,
    aboutLead0: '«Тритон» делают студенты Международной гимназии Сколково. В номерах интервью, рассказы, исследования, рисунки и фотографии студентов.',
    histH: (y, n) => `${cap(wordsRu(y))} ${plural(y, 'год', 'года', 'лет')}, ${issuesRu(n)}`,
    histP: 'Журнал придумали студентка и учитель гимназии в 2021 году. Номера выходят зимой и летом, у каждого своя тема.',
    teamH: 'Редакция', teamP: 'Номер собирают студенты разных классов: пишут тексты, рисуют, фотографируют и верстают.',
    roles: [['Авторы', 'пишут интервью, рассказы и статьи'], ['Иллюстраторы', 'рисуют обложки и картинки к текстам'], ['Фотографы', 'снимают людей и события гимназии'], ['Верстальщики', 'собирают страницы номера']],
    nfH: 'Страница не найдена', nfP: 'Возможно, в ссылке опечатка или страница переехала.', toMain: 'На главную',
    noIssueH: (n) => `Выпуска №${n} нет`, noIssueP: (n) => `На сайте ${issuesRu(n)}. Выберите выпуск из списка.`,
    errH: 'Не удалось загрузить выпуски', errP: 'Проверьте интернет и попробуйте ещё раз.', retry: 'Попробовать снова',
    emptyH: 'Выпусков пока нет', emptyP: 'Первый номер появится здесь, когда редакция его опубликует.',
    loading: 'Загружаем выпуски…',
    readerLabel: (n) => `Выпуск №${n}, читалка`, readerTitle: (n, s) => `№${n} · ${s}`,
    back: 'К выпуску', drive: 'Открыть в Google Диске', closeReader: 'Закрыть читалку',
    fullscreen: 'На весь экран', exitFullscreen: 'Выйти из полноэкранного режима',
    opening: 'Открываем выпуск…', notLoaded: 'Выпуск не загрузился?', openIt: 'Откройте его в Google Диске', pdfFrame: (n) => `PDF выпуска №${n}`,
    annLabel: 'Объявление', annClose: 'Закрыть объявление',
    tHome: 'Тритон — журнал студентов Международной гимназии Сколково', tIssues: 'Все выпуски — Тритон',
    tIssue: (n, s) => `№${n}. ${s} — Тритон`, tAbout: 'О журнале — Тритон', tNotFound: 'Страница не найдена — Тритон',
    months: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    q: (s) => `«${s}»`,
  },
  en: {
    skip: 'Skip to content', toHome: 'Triton, home page', navLabel: 'Site sections',
    navIssues: 'Issues', navAbout: 'About', navJoin: 'Join the team',
    langLabel: 'Site language', switchLang: 'Переключить на русский', menuOpen: 'Open menu', menuClose: 'Close menu',
    issueN: (n) => `Issue ${n}`, noN: (n) => `No. ${n}`,
    cardMeta: (n, d) => `No. ${n}, ${d}`, issueMeta: (n, d) => `Issue ${n} · ${d}`, coverAlt: (n) => `Cover of issue ${n}`,
    read: 'Read the issue', readSite: 'Read on the site', pdf: 'PDF on Google Drive', newTab: ', opens in a new tab',
    copy: 'Copy link', copied: 'Link copied', copyFail: 'Could not copy the link',
    inside: 'In this issue', insideHint: 'Page numbers as in the print issue.', page: 'p.',
    allIssues: 'All issues', allN: (n) => `All ${n}`,
    since: (n) => `${cap(issuesEn(n))} since October 2021`,
    aboutH: 'About the magazine',
    aboutShort: (n) => `Triton is made by students of the International Gymnasium Skolkovo. Since the first issue in October 2021, ${issuesEn(n)} ${n === 1 ? 'has' : 'have'} come out. Each issue has interviews, stories, research, drawings and photos by students.`,
    joinH: 'Join the team',
    joinText: 'The editors are looking for writers, illustrators, photographers and layout designers. Message @god_fa1her on Telegram: tell us about yourself and send a sample of your work.',
    joinBtn: 'Message the editors',
    footer: (y) => `A magazine by students of the International Gymnasium Skolkovo, 2021–${y}`, editors: 'Editors’ login',
    filtersLabel: 'Search and filter', searchLabel: 'Search issues', searchPh: 'Title, number or year',
    yearLabel: 'Year', allYears: 'All', found: (n) => `Found: ${n}`, latestTag: 'new', resultsLabel: 'Issues',
    noResH: 'Nothing found', noResP: 'Try another word or show all years.', reset: 'Clear search',
    crumbs: 'You are here', prev: 'Previous issue', next: 'Next issue', others: 'Other issues',
    noPdf: 'The PDF of this issue has not been added yet.',
    aboutLead: (n) => `Triton is made by students of the International Gymnasium Skolkovo. Since October 2021, ${issuesEn(n)} ${n === 1 ? 'has' : 'have'} come out: interviews, stories, research, drawings and photos by students.`,
    aboutLead0: 'Triton is made by students of the International Gymnasium Skolkovo. Each issue has interviews, stories, research, drawings and photos by students.',
    histH: (y, n) => `${cap(wordsEn(y))} ${y === 1 ? 'year' : 'years'}, ${issuesEn(n)}`,
    histP: 'A student and a teacher at the Gymnasium started the magazine in 2021. Issues come out in winter and summer, each with its own theme.',
    teamH: 'Editorial team', teamP: 'Each issue is put together by students from different grades: they write, draw, take photos and lay out the pages.',
    roles: [['Writers', 'write interviews, stories and articles'], ['Illustrators', 'draw covers and pictures for the texts'], ['Photographers', 'take pictures of people and events at the Gymnasium'], ['Layout designers', 'put the pages of the issue together']],
    nfH: 'Page not found', nfP: 'The link may have a typo, or the page has moved.', toMain: 'Home page',
    noIssueH: (n) => `There is no issue ${n}`, noIssueP: (n) => `The site has ${issuesEn(n)}. Pick one from the list.`,
    errH: 'Could not load the issues', errP: 'Check your connection and try again.', retry: 'Try again',
    emptyH: 'No issues yet', emptyP: 'The first issue will appear here once the editors publish it.',
    loading: 'Loading issues…',
    readerLabel: (n) => `Issue ${n}, reader`, readerTitle: (n, s) => `No. ${n} · ${s}`,
    back: 'Back to the issue', drive: 'Open in Google Drive', closeReader: 'Close the reader',
    fullscreen: 'Full screen', exitFullscreen: 'Exit full screen',
    opening: 'Opening the issue…', notLoaded: 'Didn’t load?', openIt: 'Open it in Google Drive', pdfFrame: (n) => `PDF of issue ${n}`,
    annLabel: 'Announcement', annClose: 'Close the announcement',
    tHome: 'Triton, the student magazine of the International Gymnasium Skolkovo', tIssues: 'All issues — Triton',
    tIssue: (n, s) => `No. ${n}. ${s} — Triton`, tAbout: 'About — Triton', tNotFound: 'Page not found — Triton',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    q: (s) => `“${s}”`,
  },
};

let lang = (() => { try { return localStorage.getItem('triton_lang') === 'en' ? 'en' : 'ru'; } catch (e) { return 'ru'; } })();
function t(key, ...args) {
  const v = (I[lang] || I.ru)[key] ?? I.ru[key];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}

/* ---------------- даты, тексты номеров ---------------- */
function ym(d) {
  const m = /^(\d{4})-(\d{2})$/.exec(str(d));
  if (!m) return null;
  const mo = +m[2];
  return mo >= 1 && mo <= 12 ? { y: +m[1], m: mo } : null;
}
function fmtMonth(d, l = lang) {
  const p = ym(d);
  return p ? `${I[l].months[p.m - 1]} ${p.y}` : str(d);
}
/* Тире вместо дефиса между словами и без стрелок-«кнопок» в конце строк: только при показе, в базе текст не меняется. */
const typo = (s) => str(s).replace(/ - /g, ' — ').replace(/[ \t]*→[ \t]*$/gm, '').trim();
const paras = (s) => typo(s).split(/\n+/).map((p) => p.trim()).filter(Boolean);
function leadOf(s) {
  const p = paras(s)[0] || '';
  if (p.length <= 240) return p;
  const sent = p.match(/[^.!?…]+(?:[.!?…]+[»"”]?|$)\s*/g) || [p];
  return sent.slice(0, 2).join('').trim();
}
function parseToc(s) {
  return str(s).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d{1,3})[\s.:–—-]+(.+)$/.exec(l);
    return m ? { page: m[1], title: m[2].trim() } : { page: '', title: l };
  });
}
const cleanTitle = (s) => str(s).trim().replace(/^"([^"]*)"$/, '$1');

function driveId(u) {
  const s = str(u);
  const m = s.match(/\/file\/d\/([\w-]+)/) || s.match(/[?&]id=([\w-]+)/);
  return m ? m[1] : '';
}
function coverSrc(x) {
  const ids = [driveId(x.coverUrl), driveId(x.pdfUrl)];
  const local = LOCAL_COVERS[ids[0]] || (!isHttps(x.coverUrl) && LOCAL_COVERS[ids[1]]);
  if (local) return `/covers/${local}.jpg`;
  if (isHttps(x.coverUrl)) return ids[0] ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(ids[0])}&sz=w800` : x.coverUrl.trim();
  if (ids[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(ids[1])}&sz=w800`;
  return '';
}
function placeholder(x) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297"><rect width="210" height="297" fill="${x.color || DEFAULT_COLOR}"/><text x="18" y="268" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="44" fill="#2F3B40">№${x.n || ''}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function embedUrl(u) {
  if (!isHttps(u)) return '';
  const id = driveId(u);
  return id ? `https://drive.google.com/file/d/${id}/preview` : u.trim();
}

/* ---------------- Firebase и данные ---------------- */
let appP = null, fsP = null;
function fbApp() {
  if (!appP) appP = import(FB + 'firebase-app.js').then((m) => m.initializeApp(FIREBASE_CONFIG)).catch((e) => { appP = null; throw e; });
  return appP;
}
function firestore() {
  if (!fsP) {
    fsP = Promise.all([fbApp(), import(FB + 'firebase-firestore.js')])
      .then(([app, m]) => ({ m, db: m.getFirestore(app) }))
      .catch((e) => { fsP = null; throw e; });
  }
  return fsP;
}
function authLib() {
  return Promise.all([fbApp(), import(FB + 'firebase-auth.js')]).then(([app, m]) => ({ m, auth: m.getAuth(app) }));
}

function normalize(raw) {
  const list = raw.filter((x) => x && str(x.title).trim()).map((x) => ({ ...x }));
  list.sort((a, b) => cmp(str(a.date), str(b.date)) || cmp(str(a.uploadedAt), str(b.uploadedAt)));
  list.forEach((x, i) => {
    const num = parseInt(x.number, 10);
    x.n = num > 0 ? num : i + 1;
  });
  list.forEach((x) => {
    const d = DEFAULTS[x.n] || {};
    const pick = (k) => (typeof x[k] === 'string' ? x[k] : (d[k] || ''));
    x.titleView = cleanTitle(x.title);
    x.color = PALETTE.some((p) => p.hex === x.color) ? x.color : (d.color || DEFAULT_COLOR);
    x.eff = {};
    ['toc', 'quote', 'quoteBy', 'title_en', 'desc_en', 'quote_en', 'quoteBy_en'].forEach((k) => { x.eff[k] = pick(k); });
    x.eff.coverAlt = d.coverAlt || '';
    x.eff.coverAlt_en = d.coverAlt_en || '';
    x.tocItems = parseToc(x.eff.toc);
  });
  list.sort((a, b) => b.n - a.n || cmp(str(b.date), str(a.date)));
  return list;
}

let issuesP = null;
function loadIssues() {
  if (!issuesP) {
    issuesP = (async () => {
      try {
        const { m, db } = await firestore();
        const snap = await withTimeout(m.getDocs(m.query(m.collection(db, 'issues'), m.orderBy('uploadedAt', 'asc'))), 9000);
        return { list: normalize(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), live: true };
      } catch (error) {
        console.warn('[Тритон] база недоступна, показываю сохранённую копию выпусков', error);
        const r = await fetch('/data/issues.json' + (V ? '?v=' + V : ''));
        if (!r.ok) throw error;
        return { list: normalize(await r.json()), live: false, error };
      }
    })().catch((e) => { issuesP = null; throw e; });
  }
  return issuesP;
}
function invalidateIssues() { issuesP = null; }

let annP = null;
function loadAnnouncement() {
  if (!annP) {
    annP = (async () => {
      try {
        const { m, db } = await firestore();
        const snap = await withTimeout(m.getDoc(m.doc(db, 'settings', 'announcement')), 8000);
        if (snap.exists()) return { ...ANNOUNCEMENT_FALLBACK, ...snap.data(), source: 'db' };
        return { ...ANNOUNCEMENT_FALLBACK, source: 'code' };
      } catch (e) {
        // Нет доступа к settings (правила базы ещё старые) или нет сети: объявление из кода.
        return { ...ANNOUNCEMENT_FALLBACK, source: 'code', error: e };
      }
    })();
  }
  return annP;
}
function resetAnnouncement() { annP = null; }

/* ---------------- значки ---------------- */
const ICON = {
  burger: '<svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" stroke-width="2"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 3l12 12M15 3 3 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M11 3 5 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ext: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fs: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---------------- общие куски страниц ---------------- */
const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);
const mainEl = () => $('main');
const T = (x) => (lang === 'en' && x.eff.title_en ? x.eff.title_en : x.titleView);
const D = (x) => (lang === 'en' && x.eff.desc_en ? x.eff.desc_en : str(x.desc));
const altOf = (x) => (lang === 'en' ? x.eff.coverAlt_en : x.eff.coverAlt) || t('coverAlt', x.n);
const issuePath = (n) => `/issues/${n}/`;
const readPath = (n) => `/issues/${n}/read/`;

function setColor(c) {
  document.documentElement.style.setProperty('--c', c);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', c);
}

function cover(x, cls = '', alt = '', eager = false) {
  const src = coverSrc(x), ph = placeholder(x);
  return `<img class="cv${cls ? ' ' + cls : ''}" src="${esc(src || ph)}" data-ph="${esc(ph)}" alt="${esc(alt)}" width="420" height="594"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}
const ext = (href, label, cls) => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}<span class="sr">${esc(t('newTab'))}</span></a>`;

function card(x, isLatest = false) {
  const meta = t('cardMeta', x.n, fmtMonth(x.date)) + (isLatest ? ' · ' + t('latestTag') : '');
  return `<li><a class="card" href="${issuePath(x.n)}">${cover(x, '', '')}<span class="t">${esc(T(x))}</span><span class="m">${esc(meta)}</span></a></li>`;
}

function tocSec(x, withHint) {
  if (!x.tocItems.length) return '';
  const items = x.tocItems.map((it) => `<li><span class="pg">${it.page ? `<span class="sr">${esc(t('page'))} </span>${esc(it.page)}` : ''}</span><span class="tt">${esc(it.title)}</span></li>`).join('');
  return `<section class="sec" aria-labelledby="toc-h"><div class="wrap split"><div class="split-h"><h2 class="h2" id="toc-h">${esc(t('inside'))}</h2>${withHint ? `<p>${esc(t('insideHint'))}</p>` : ''}</div><ol class="toc" role="list">${items}</ol></div></section>`;
}

function joinBox() {
  return `<div class="join-box" id="join"><h2 class="h2">${esc(t('joinH'))}</h2><p>${esc(t('joinText'))}</p>${ext(TG_URL, esc(t('joinBtn')), 'btn btn-w')}</div>`;
}

function headerHtml(r) {
  const sec = r.name === 'issues' ? 'page' : r.name === 'issue' ? 'true' : '';
  const joinHref = r.name === 'home' ? '#join' : '/about/#join';
  const cur = (v) => (v ? ` aria-current="${v}"` : '');
  return `<div class="wrap">
<a class="mark" href="/" aria-label="${esc(t('toHome'))}">тритон</a>
<nav class="nav" aria-label="${esc(t('navLabel'))}"><a href="/issues/"${cur(sec)}>${esc(t('navIssues'))}</a><a href="/about/"${cur(r.name === 'about' ? 'page' : '')}>${esc(t('navAbout'))}</a><a href="${joinHref}">${esc(t('navJoin'))}</a></nav>
<div class="langs" role="group" aria-label="${esc(t('langLabel'))}"><button type="button" data-lang="ru" lang="ru" aria-pressed="${lang === 'ru'}">RU</button><button type="button" data-lang="en" lang="en" aria-pressed="${lang === 'en'}">EN</button></div>
<div class="hdr-m"><button type="button" class="hdr-lang" data-lang="${lang === 'ru' ? 'en' : 'ru'}" aria-label="${esc(t('switchLang'))}">${lang === 'ru' ? 'EN' : 'RU'}</button><button type="button" class="burger" aria-expanded="false" aria-controls="menu" aria-label="${esc(t('menuOpen'))}">${ICON.burger}</button></div>
</div>`;
}
function menuHtml(r) {
  const joinHref = r.name === 'home' ? '#join' : '/about/#join';
  const cur = (v) => (v ? ' aria-current="page"' : '');
  return `<div class="wrap"><nav aria-label="${esc(t('navLabel'))}"><ul role="list"><li><a href="/issues/"${cur(r.name === 'issues')}>${esc(t('navIssues'))}</a></li><li><a href="/about/"${cur(r.name === 'about')}>${esc(t('navAbout'))}</a></li><li><a href="${joinHref}">${esc(t('navJoin'))}</a></li></ul></nav></div>`;
}
const footerHtml = () => `<div class="wrap"><span>${esc(t('footer', new Date().getFullYear()))}</span><a href="/admin/">${esc(t('editors'))}</a></div>`;

function ensurePublicChrome(r) {
  if (app.dataset.kind !== 'public') {
    app.dataset.kind = 'public';
    app.innerHTML = `<a class="skip" href="#main"></a><div id="ann"></div><header class="hdr" id="hdr"></header><div class="menu" id="menu" hidden></div><main id="main" tabindex="-1"></main><footer class="ftr" id="ftr"></footer>`;
  }
  document.body.classList.toggle('is-home', r.name === 'home');
  app.querySelector('.skip').textContent = t('skip');
  $('hdr').innerHTML = headerHtml(r);
  $('menu').innerHTML = menuHtml(r);
  $('menu').hidden = true;
  $('ftr').innerHTML = footerHtml();
}

function toggleMenu(open) {
  const m = $('menu'), b = app.querySelector('.burger');
  if (!m || !b) return;
  const willOpen = open ?? m.hidden;
  m.hidden = !willOpen;
  b.setAttribute('aria-expanded', String(willOpen));
  b.setAttribute('aria-label', t(willOpen ? 'menuClose' : 'menuOpen'));
  b.innerHTML = willOpen ? ICON.close : ICON.burger;
}

/* ---------------- страницы ---------------- */
function errorHtml() {
  return `<section class="phero"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(t('errH'))}</h1><p>${esc(t('errP'))}</p><div class="acts"><button type="button" class="btn" data-retry>${esc(t('retry'))}</button></div></div></section>`;
}
function notFoundHtml(h, p) {
  return `<section class="nf"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(h)}</h1><p>${esc(p)}</p><div class="acts"><a class="btn" href="/">${esc(t('toMain'))}</a><a class="btn btn-o" href="/issues/">${esc(t('allIssues'))}</a></div></div></section>`;
}
const emptyHtml = () => `<section class="phero"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(t('emptyH'))}</h1><p>${esc(t('emptyP'))}</p></div></section>`;

async function vHome(r, stale) {
  mainEl().innerHTML = `<section class="hero" aria-busy="true"><div class="wrap hero-g"><p class="mast">тритон</p><p class="badge"><b>&nbsp;</b><span>${esc(t('loading'))}</span></p><div class="hero-cv"><div class="cv cv-xl sk"></div></div></div></section>`;
  const { list } = await loadIssues();
  if (stale()) return null;
  if (!list.length) { setColor(DEFAULT_COLOR); mainEl().innerHTML = emptyHtml(); return t('tHome'); }
  const x = list[0];
  setColor(x.color);
  const pdf = isHttps(x.pdfUrl) ? x.pdfUrl.trim() : '';
  const acts = pdf ? `<a class="btn" href="${readPath(x.n)}">${esc(t('read'))}</a>${ext(pdf, esc(t('pdf')), 'btn btn-o')}` : `<a class="btn" href="${issuePath(x.n)}">${esc(t('readSite'))}</a>`;
  const hero = `<section class="hero"><div class="wrap hero-g">
<p class="mast">тритон</p>
<p class="badge"><b>${esc(t('issueN', x.n))}</b><span>${esc(fmtMonth(x.date))}</span></p>
<h1 tabindex="-1">${esc(T(x))}</h1>
<p class="lead">${esc(leadOf(D(x)))}</p>
<div class="acts">${acts}</div>
<figure class="hero-cv"><a href="${issuePath(x.n)}" aria-label="${esc(t('issueN', x.n))}">${cover(x, 'cv-xl', altOf(x), true)}</a></figure>
</div></section>`;
  const rest = list.slice(1);
  const shelf = rest.length ? `<section class="shelf" aria-labelledby="all-h"><div class="wrap shelf-h"><h2 class="h2" id="all-h">${esc(t('allIssues'))}</h2><p>${esc(t('since', list.length))}</p><a class="shelf-all" href="/issues/">${esc(t('allN', list.length))}</a></div><div class="wrap flush"><ul class="grid5" role="list">${rest.map((y) => card(y)).join('')}</ul></div></section>` : '';
  const about = `<section class="about2" aria-labelledby="about-h"><div class="wrap"><div class="col"><h2 class="h2" id="about-h">${esc(t('aboutH'))}</h2><p>${esc(t('aboutShort', list.length))}</p></div>${joinBox()}</div></section>`;
  mainEl().innerHTML = hero + tocSec(x, false) + shelf + about;
  return t('tHome');
}

async function vIssues(r, stale) {
  const params = new URLSearchParams(location.search);
  let q = params.get('q') || '';
  let year = params.get('year') || '';
  mainEl().innerHTML = `<section class="phero"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(t('allIssues'))}</h1><p id="since">&nbsp;</p></div></section><div id="ilist"><div class="wrap state"><p>${esc(t('loading'))}</p></div></div>`;
  const { list } = await loadIssues();
  if (stale()) return null;
  setColor(list[0]?.color || DEFAULT_COLOR);
  $('since').textContent = list.length ? t('since', list.length) + '.' : t('emptyP');
  const years = [...new Set(list.map((x) => ym(x.date)?.y).filter(Boolean))].sort((a, b) => b - a);
  if (year && !years.includes(+year)) year = '';
  const chip = (val, label) => `<button type="button" class="chip" data-year="${val}" aria-pressed="${String(year === String(val))}">${esc(label)}</button>`;
  $('ilist').innerHTML = `<section class="filters" aria-label="${esc(t('filtersLabel'))}"><div class="wrap">
<div class="fsearch"><label class="lbl" for="q">${esc(t('searchLabel'))}</label><input id="q" class="inp" type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${esc(t('searchPh'))}" value="${esc(q)}"></div>
<div class="chips" role="group" aria-label="${esc(t('yearLabel'))}">${chip('', t('allYears'))}${years.map((y) => chip(y, String(y))).join('')}</div>
<p class="found" id="found" role="status"></p>
</div></section>
<section class="results" aria-label="${esc(t('resultsLabel'))}"><div class="wrap"><ul class="grid5" role="list" id="grid"></ul>
<div class="state" id="nores" hidden><h2>${esc(t('noResH'))}</h2><p>${esc(t('noResP'))}</p><button type="button" class="btn btn-o" id="reset">${esc(t('reset'))}</button></div></div></section>`;

  const latestN = list[0]?.n;
  const apply = () => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const shown = list.filter((x) => matches(x, tokens, year));
    $('grid').innerHTML = shown.map((x) => card(x, x.n === latestN)).join('');
    $('grid').hidden = !shown.length;
    $('nores').hidden = !!shown.length;
    $('found').textContent = t('found', shown.length);
    app.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.year === year)));
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (year) sp.set('year', year);
    const url = location.pathname + (sp.toString() ? '?' + sp : '');
    if (url !== location.pathname + location.search) {
      history.replaceState(history.state, '', url + location.hash);
      renderedPS = location.pathname + location.search;
    }
  };
  let timer = 0;
  $('q').addEventListener('input', (e) => { q = e.target.value; clearTimeout(timer); timer = setTimeout(apply, 120); });
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); apply(); e.target.blur(); } });
  app.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    year = b.dataset.year;
    apply();
  });
  $('reset').addEventListener('click', () => { q = ''; year = ''; $('q').value = ''; apply(); $('q').focus(); });
  apply();
  return t('tIssues');
}

function matches(x, tokens, year) {
  if (year && ym(x.date)?.y !== +year) return false;
  if (!tokens.length) return true;
  const title = norm([x.titleView, x.eff.title_en].join(' '));
  const hay = norm([x.titleView, x.eff.title_en, x.desc, x.eff.desc_en, fmtMonth(x.date, 'ru'), fmtMonth(x.date, 'en'), x.date].join(' '));
  return tokens.every((tk) => {
    const num = tk.replace(/^(№|no\.?|#)/, '');
    if (!num) return true;
    if (/^\d{1,3}$/.test(num)) return x.n === +num || new RegExp('(^|\\D)' + num + '(\\D|$)').test(title);
    if (/^\d{4}$/.test(num)) return ym(x.date)?.y === +num;
    return hay.includes(num);
  });
}

async function vIssue(r, stale) {
  mainEl().innerHTML = `<section class="ihero" aria-busy="true"><div class="wrap"><nav class="crumbs" aria-label="${esc(t('crumbs'))}"><a href="/issues/">${esc(t('navIssues'))}</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">${esc(t('noN', r.n))}</span></nav><div class="ihero-g"><div class="ihero-cv"><div class="cv cv-xl sk"></div></div><div class="ihero-t"><p class="meta">${esc(t('issueN', r.n))}</p><p class="sr">${esc(t('loading'))}</p></div></div></div></section>`;
  const { list } = await loadIssues();
  if (stale()) return null;
  const i = list.findIndex((x) => x.n === r.n);
  if (i < 0) {
    setColor(list[0]?.color || DEFAULT_COLOR);
    mainEl().innerHTML = notFoundHtml(t('noIssueH', r.n), t('noIssueP', list.length));
    return t('tNotFound');
  }
  const x = list[i];
  setColor(x.color);
  const pdf = isHttps(x.pdfUrl) ? x.pdfUrl.trim() : '';
  const acts = pdf ? `<a class="btn" href="${readPath(x.n)}">${esc(t('readSite'))}</a>${ext(pdf, esc(t('pdf')), 'btn btn-o')}` : `<p class="meta">${esc(t('noPdf'))}</p>`;
  const hero = `<section class="ihero"><div class="wrap">
<nav class="crumbs" aria-label="${esc(t('crumbs'))}"><a href="/issues/">${esc(t('navIssues'))}</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">${esc(t('noN', x.n))}</span></nav>
<div class="ihero-g"><figure class="ihero-cv">${cover(x, 'cv-xl', altOf(x), true)}</figure>
<div class="ihero-t"><p class="meta">${esc(t('issueMeta', x.n, fmtMonth(x.date)))}</p><h1 tabindex="-1">${esc(T(x))}</h1>
<div class="desc">${paras(D(x)).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
<div class="acts">${acts}<button type="button" class="btn-t" data-copy="${issuePath(x.n)}">${ICON.link}${esc(t('copy'))}</button></div></div></div></div></section>`;
  const qText = lang === 'en' ? x.eff.quote_en : x.eff.quote;
  const qBy = lang === 'en' ? x.eff.quoteBy_en : x.eff.quoteBy;
  let quote = '';
  if (qText.trim()) {
    const qq = qText.trim().replace(/\.+$/, '');
    const ends = /[?!…]$/.test(qq);
    const shown = lang === 'en' ? `“${qq}${ends ? '' : '.'}”` : `«${qq}»${ends ? '' : '.'}`;
    quote = `<section class="quote"><figure class="wrap"><blockquote><p>${esc(shown)}</p></blockquote>${qBy.trim() ? `<figcaption>${esc(qBy)}</figcaption>` : ''}</figure></section>`;
  }
  const prev = list[i + 1], next = list[i - 1];
  const pn = (y, label) => (y ? `<a class="pn-a" href="${issuePath(y.n)}">${cover(y, 'cv-s', '')}<span><small>${esc(label)}</small><b>${esc(t('noN', y.n))} ${esc(t('q', T(y)))}</b></span></a>` : '');
  const nav = `<nav class="pn" aria-label="${esc(t('others'))}"><div class="wrap"><div class="pn-l">${pn(prev, t('prev'))}${pn(next, t('next'))}</div><a class="btn btn-o" href="/issues/">${esc(t('allIssues'))}</a></div></nav>`;
  mainEl().innerHTML = hero + tocSec(x, true) + quote + nav;
  return t('tIssue', x.n, T(x));
}

async function vAbout(r, stale) {
  mainEl().innerHTML = `<section class="ahero"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(t('aboutH'))}</h1><p>&nbsp;</p></div></section>`;
  let list = [];
  try { ({ list } = await loadIssues()); } catch (e) { list = []; }
  if (stale()) return null;
  setColor(list[0]?.color || DEFAULT_COLOR);
  const n = list.length;
  const byYear = new Map();
  [...list].sort((a, b) => a.n - b.n).forEach((x) => {
    const y = ym(x.date)?.y;
    if (!y) return;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(x);
  });
  const years = [...byYear].map(([y, xs]) => `<div class="yr"><h3>${y}</h3>${xs.map((x) => `<a href="${issuePath(x.n)}">${cover(x, '', `${t('noN', x.n)}, ${T(x)}`)}</a>`).join('')}</div>`).join('');
  const hist = n ? `<section class="hist" aria-labelledby="hist-h"><div class="wrap"><h2 class="h2" id="hist-h">${esc(t('histH', yearsSinceStart(), n))}</h2><p class="intro">${esc(t('histP'))}</p><div class="years">${years}</div></div></section>` : '';
  const team = `<section class="team${n ? '' : ' hist'}" aria-labelledby="team-h"><div class="wrap"><h2 class="h2" id="team-h">${esc(t('teamH'))}</h2><p class="intro">${esc(t('teamP'))}</p><ul class="people" role="list">${TEAM.map((p) => `<li class="person"><span>${esc(p.role[lang])}</span><b>${esc(p.name[lang])}</b></li>`).join('')}</ul></div></section>`;
  const join = `<section class="joinsec" id="join" aria-labelledby="join-h"><div class="wrap"><div class="jt"><h2 class="h2" id="join-h">${esc(t('joinH'))}</h2><p>${esc(t('joinText'))}</p>${ext(TG_URL, esc(t('joinBtn')), 'btn btn-w')}</div><ul class="roles" role="list">${t('roles').map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join('')}</ul></div></section>`;
  mainEl().innerHTML = `<section class="ahero"><div class="wrap"><h1 class="h1big" tabindex="-1">${esc(t('aboutH'))}</h1><p>${esc(n ? t('aboutLead', n) : t('aboutLead0'))}</p></div></section>` + hist + team + join;
  return t('tAbout');
}

async function vNotFound() {
  try { const { list } = await loadIssues(); setColor(list[0]?.color || DEFAULT_COLOR); } catch (e) { /* цвет по умолчанию */ }
  mainEl().innerHTML = notFoundHtml(t('nfH'), t('nfP'));
  return t('tNotFound');
}

const VIEWS = { home: vHome, issues: vIssues, issue: vIssue, about: vAbout, notfound: vNotFound };

/* ---------------- объявление ---------------- */
const annKey = (a) => 'triton_ann_closed_' + [a.from, a.until, str(a.ru?.title)].join('|');
function annVisible(a, view) {
  if (!a || !a.enabled) return false;
  const today = todayStr();
  if (a.from && today < a.from) return false;
  if (a.until && today > a.until) return false;
  if (a.where === 'home' && view !== 'home') return false;
  return true;
}
function annHref(a, latest) {
  if (a.target === 'custom') {
    const l = str(a.link).trim();
    if (isHttps(l)) return { href: l, ext: true };
    if (/^\/(?!\/)/.test(l)) return { href: l, ext: false };
    return null;
  }
  return latest ? { href: issuePath(latest.n), ext: false } : null;
}
async function renderAnn(view, token) {
  const slot = $('ann');
  if (!slot) return;
  let a;
  try { a = await loadAnnouncement(); } catch (e) { return; }
  let latest = null;
  try { latest = (await loadIssues()).list[0] || null; } catch (e) { /* без ссылки на номер */ }
  if (token !== renderToken || !$('ann')) return;
  $('ann').innerHTML = '';
  if (!annVisible(a, view)) return;
  try { if (sessionStorage.getItem(annKey(a))) return; } catch (e) { /* без памяти о закрытии */ }
  const tx = lang === 'en' && (str(a.en?.title) || str(a.en?.text)) ? a.en : (a.ru || {});
  if (!str(tx.title) && !str(tx.text)) return;
  const link = annHref(a, latest);
  const btn = link && str(tx.button) ? (link.ext ? ext(link.href, esc(tx.button), 'ann-b') : `<a class="ann-b" href="${esc(link.href)}">${esc(tx.button)}</a>`) : '';
  $('ann').innerHTML = `<div class="ann" role="region" aria-label="${esc(t('annLabel'))}"><div class="wrap"><p class="ann-t">${str(tx.title) ? `<strong>${esc(tx.title)}</strong> ` : ''}${esc(str(tx.text))}</p>${btn}<button type="button" class="ann-x" aria-label="${esc(t('annClose'))}">${ICON.close}</button></div></div>`;
  $('ann').dataset.key = annKey(a);
}

/* ---------------- читалка ---------------- */
let readerEl = null, readerN = 0, lastFocus = null;
const FS_OK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

async function openReader(n) {
  if (readerEl && readerN === n) return;
  closeReaderDom(false);
  let x;
  try { x = (await loadIssues()).list.find((i) => i.n === n); } catch (e) { return; }
  if (!x || readerEl) return;
  const src = embedUrl(x.pdfUrl);
  const pdf = isHttps(x.pdfUrl) ? x.pdfUrl.trim() : '';
  readerN = n;
  lastFocus = document.activeElement;
  readerEl = document.createElement('div');
  readerEl.className = 'rdr';
  readerEl.setAttribute('role', 'dialog');
  readerEl.setAttribute('aria-modal', 'true');
  readerEl.setAttribute('aria-label', t('readerLabel', n));
  const driveLink = pdf ? `<a class="rdr-drive" href="${esc(pdf)}" target="_blank" rel="noopener" aria-label="${esc(t('drive'))}${esc(t('newTab'))}"><span>${esc(t('drive'))}</span>${ICON.ext}</a>` : '';
  readerEl.innerHTML = `<div class="rdr-bar">
<a class="rdr-back" href="${issuePath(n)}" data-reader-close="issue" aria-label="${esc(t('back'))}">${ICON.back}<span>${esc(t('back'))}</span></a>
<p class="rdr-title">${esc(t('readerTitle', n, T(x)))}</p>
${driveLink}
${FS_OK ? `<button type="button" class="rdr-ib rdr-fs" data-fs aria-label="${esc(t('fullscreen'))}">${ICON.fs}</button>` : ''}
<button type="button" class="rdr-ib rdr-x" data-reader-close="back" aria-label="${esc(t('closeReader'))}">${ICON.close}</button>
</div>
<div class="rdr-body">${src ? `<div class="rdr-frame"><p class="rdr-load">${esc(t('opening'))}</p><iframe src="${esc(src)}" title="${esc(t('pdfFrame', n))}" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
${pdf ? `<p class="rdr-note">${esc(t('notLoaded'))} <a href="${esc(pdf)}" target="_blank" rel="noopener">${esc(t('openIt'))}</a>.</p>` : ''}` : `<p class="rdr-note">${esc(t('noPdf'))}</p>`}</div>`;
  const frame = readerEl.querySelector('iframe');
  if (frame) frame.addEventListener('load', () => { const l = readerEl?.querySelector('.rdr-load'); if (l) l.remove(); }, { once: true });
  document.body.appendChild(readerEl);
  app.inert = true;
  document.documentElement.classList.add('locked');
  readerEl.querySelector('.rdr-back').focus();
}
function closeReaderDom(restoreFocus = true) {
  if (!readerEl) return;
  if (fsActive()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* уже вышли */ } }
  readerEl.remove();
  readerEl = null;
  readerN = 0;
  app.inert = false;
  document.documentElement.classList.remove('locked');
  if (restoreFocus) {
    const f = lastFocus && document.contains(lastFocus) ? lastFocus : app.querySelector('main h1');
    if (f) f.focus({ preventScroll: true });
  }
  lastFocus = null;
}
/* Закрыть читалку: если её открыли с сайта, шаг назад по истории; иначе — на страницу номера. */
function closeReader(mode) {
  const n = readerN;
  if (!n) return;
  const from = history.state?.from;
  if (from && (mode !== 'issue' || from === issuePath(n))) { history.back(); return; }
  navigate(issuePath(n), { replace: true });
}
function updateFsButton() {
  const b = readerEl?.querySelector('[data-fs]');
  if (b) b.setAttribute('aria-label', t(fsActive() ? 'exitFullscreen' : 'fullscreen'));
}
document.addEventListener('fullscreenchange', updateFsButton);
document.addEventListener('webkitfullscreenchange', updateFsButton);

/* ---------------- адреса и переходы ---------------- */
function parseRoute(path) {
  let p = path;
  try { p = decodeURI(path); } catch (e) { /* оставляем как есть */ }
  p = p.replace(/\/index\.html$/, '/');
  let m;
  if (p === '/' || p === '') return { name: 'home' };
  if (/^\/issues\/?$/.test(p)) return { name: 'issues' };
  if ((m = /^\/issues\/(\d{1,4})\/?$/.exec(p))) return { name: 'issue', n: +m[1] };
  if ((m = /^\/issues\/(\d{1,4})\/read\/?$/.exec(p))) return { name: 'issue', n: +m[1], read: true };
  if (/^\/about\/?$/.test(p)) return { name: 'about' };
  if (/^\/admin\/?$/.test(p)) return { name: 'admin' };
  return { name: 'notfound' };
}

let renderToken = 0, current = null, renderedPS = '';
const api = {
  app, esc, str, isHttps, PALETTE, DEFAULT_COLOR, ANNOUNCEMENT_FALLBACK, plural, todayStr, parseToc, withTimeout,
  loadIssues, invalidateIssues, firestore, authLib, loadAnnouncement, resetAnnouncement, annVisible, annHref,
  toast, navigate, setColor, coverSrc, placeholder, driveId, fmtMonthRu: (d) => fmtMonth(d, 'ru'),
};

async function render(opts = {}) {
  const token = ++renderToken;
  renderedPS = location.pathname + location.search;
  const r = parseRoute(location.pathname);
  const key = r.name === 'issue' ? 'issue:' + r.n : r.name;
  toggleMenu(false);
  if (current && current.key === key && current.lang === lang && r.name === 'issue') {
    if (r.read) openReader(r.n); else closeReaderDom();
    return;
  }
  closeReaderDom(false);
  current = { key, lang, name: r.name };
  if (r.name === 'admin') {
    document.body.classList.remove('is-home');
    if (app.dataset.kind !== 'admin') {
      app.dataset.kind = 'admin';
      app.innerHTML = '<div class="login"><main class="login-main" id="main" tabindex="-1"><p class="checking">Открываем редакцию…</p></main></div>';
    }
    if (opts.nav) window.scrollTo(0, 0);
    try {
      const mod = await import('./admin.js' + (V ? '?v=' + V : ''));
      if (token !== renderToken) return;
      await mod.mount(api, () => token !== renderToken);
    } catch (e) {
      console.error(e);
      if (token !== renderToken) return;
      app.dataset.kind = 'admin';
      app.innerHTML = '<div class="login"><main class="login-main" id="main" tabindex="-1"><div class="lcard"><h1>Не удалось открыть редакцию</h1><p class="sub">Проверьте интернет и обновите страницу.</p><button type="button" class="btn" data-reload>Обновить страницу</button></div></main></div>';
    }
    return;
  }
  ensurePublicChrome(r);
  const view = VIEWS[r.name] || vNotFound;
  const p = view(r, () => token !== renderToken);
  if (opts.nav && !location.hash) window.scrollTo(0, 0);
  let title;
  try {
    title = await p;
  } catch (e) {
    console.error(e);
    if (token !== renderToken) return;
    mainEl().innerHTML = errorHtml();
    title = t('errH');
  }
  if (token !== renderToken || title === null) return;
  document.title = title;
  renderAnn(r.name, token);
  if (r.read) openReader(r.n);
  if (typeof opts.keepScroll === 'number') window.scrollTo(0, opts.keepScroll);
  else if (opts.restore && typeof history.state?.scrollY === 'number') window.scrollTo(0, history.state.scrollY);
  else if (location.hash) {
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) el.scrollIntoView();
  }
  if (opts.nav && !location.hash && !r.read) {
    const h = mainEl()?.querySelector('h1');
    if (h) h.focus({ preventScroll: true });
  }
}

function navigate(to, { replace = false } = {}) {
  const u = new URL(to, location.href);
  const target = u.pathname + u.search + u.hash;
  const here = location.pathname + location.search + location.hash;
  if (!replace && target === here) { window.scrollTo(0, 0); return; }
  try {
    if (!replace) history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, '');
    const state = replace ? { from: history.state?.from || '' } : { from: location.pathname + location.search };
    history[replace ? 'replaceState' : 'pushState'](state, '', target);
  } catch (e) {
    location.assign(target);
    return;
  }
  render({ nav: true });
}

window.addEventListener('popstate', () => {
  if (location.pathname + location.search === renderedPS) return; // сменился только #якорь
  render({ restore: true });
});

/* ---------------- клики, клавиши ---------------- */
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* пробуем по-старому */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

let toastTimer = 0;
function toast(msg, type = '') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

function setLang(l, focusSel) {
  const next = l === 'en' ? 'en' : 'ru';
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem('triton_lang', lang); } catch (e) { /* язык не запомнится */ }
  document.documentElement.lang = lang;
  app.dataset.kind = '';
  current = null;
  const y = window.scrollY;
  render({ keepScroll: y }).then(() => { const b = app.querySelector(focusSel); if (b) b.focus({ preventScroll: true }); });
}

document.addEventListener('click', (e) => {
  const el = e.target;
  if (!(el instanceof Element)) return;
  const langBtn = el.closest('[data-lang]');
  if (langBtn) { setLang(langBtn.dataset.lang, langBtn.classList.contains('hdr-lang') ? '.hdr-lang' : `.langs [data-lang="${langBtn.dataset.lang}"]`); return; }
  if (el.closest('.burger')) { toggleMenu(); return; }
  const copyBtn = el.closest('[data-copy]');
  if (copyBtn) { copyText(location.origin + copyBtn.dataset.copy).then((ok) => toast(t(ok ? 'copied' : 'copyFail'), ok ? '' : 'err')); return; }
  if (el.closest('.ann-x')) {
    try { sessionStorage.setItem($('ann').dataset.key || '', '1'); } catch (err) { /* закроется до перезагрузки */ }
    $('ann').innerHTML = '';
    return;
  }
  if (el.closest('[data-retry]')) { invalidateIssues(); current = null; render({}); return; }
  if (el.closest('[data-reload]')) { location.reload(); return; }
  if (el.closest('[data-fs]') && readerEl) {
    if (!fsActive()) { const req = readerEl.requestFullscreen || readerEl.webkitRequestFullscreen; if (req) { const p = req.call(readerEl); if (p && p.catch) p.catch(() => {}); } }
    else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const closer = el.closest('[data-reader-close]');
  if (closer) { e.preventDefault(); closeReader(closer.dataset.readerClose); return; }

  // Внутренние ссылки открываем без перезагрузки страницы.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = el.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || /\.[a-z0-9]+$/i.test(url.pathname)) return;
  if ($('menu') && !$('menu').hidden && a.closest('#menu')) toggleMenu(false);
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // якорь на этой же странице
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

document.addEventListener('click', (e) => {
  const m = $('menu');
  if (m && !m.hidden && e.target instanceof Element && !e.target.closest('#menu, .burger')) toggleMenu(false);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (readerEl) { if (!fsActive()) closeReader('back'); return; }
  const m = $('menu');
  if (m && !m.hidden) { toggleMenu(false); app.querySelector('.burger')?.focus(); }
});

// Обложка не загрузилась: показываем цветную заглушку с номером.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.dataset.ph && img.src !== img.dataset.ph) img.src = img.dataset.ph;
}, true);

/* ---------------- запуск ---------------- */
document.documentElement.lang = lang;
try { history.scrollRestoration = 'manual'; } catch (e) { /* не везде есть */ }
loadAnnouncement();
render({});
