const $ = (id) => document.getElementById(id);
const frame = $('frame');
const tree = $('tree');
const q = $('q');
const title = $('title');
const NONE = chrome.tabs.TAB_ID_NONE;

// サイドパネル内の iframe（タブに属さないリクエスト）だけ埋め込み禁止ヘッダーを外す。
// 通常のタブで開いたページには一切影響しない。
const ready = chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [1, 2],
  addRules: [
    {
      id: 1,
      action: { type: 'modifyHeaders', responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }] },
      condition: { resourceTypes: ['sub_frame'], tabIds: [NONE] },
    },
    {
      id: 2,
      action: { type: 'modifyHeaders', responseHeaders: [{ header: 'content-security-policy', operation: 'remove' }] },
      condition: {
        resourceTypes: ['sub_frame'],
        tabIds: [NONE],
        responseHeaders: [{ header: 'content-security-policy', values: ['*frame-ancestors*'] }],
      },
    },
  ],
});

/* ---------- ページ表示 ---------- */

let cur = '';
let label = '';
let fresh = false; // 自分で開いた直後のレスポンスならブックマーク名を残す

function show(url, name = '') {
  cur = url;
  label = name;
  title.textContent = name || url.replace(/^https?:\/\/(www\.)?/, '');
  title.title = url;
  localStorage.setItem('last', JSON.stringify({ url, name }));
}

async function go(url) {
  await ready;
  fresh = true;
  document.body.classList.add('busy');
  frame.src = url;
}

function open(url, name) {
  if (!/^https?:/i.test(url)) {
    // chrome:// や file:// は埋め込めないのでタブで開く。ブックマークレットは対象外。
    if (!/^javascript:/i.test(url)) chrome.tabs.create({ url });
    return;
  }
  show(url, name);
  for (const id of ['back', 'fwd', 'reload', 'popout']) $(id).disabled = false;
  showList(false);
  go(url);
}

function showList(on) {
  if (!cur) on = true;
  document.body.classList.toggle('list', on);
  if (on) q.focus();
  else frame.focus();
}

frame.addEventListener('load', () => document.body.classList.remove('busy'));

// iframe 内でリンクを辿ったときの URL を追う（「タブで開く」「再読み込み」用）
let frameId; // 自分の iframe の ID。最初の読み込みで確定し、他ウィンドウのパネルと区別する

chrome.webRequest.onResponseStarted.addListener(
  (d) => {
    if (d.parentFrameId !== 0 || (frameId !== undefined && d.frameId !== frameId)) return;
    if (fresh) {
      fresh = false;
      frameId = d.frameId;
      show(d.url, label);
    } else if (d.url !== cur) {
      show(d.url);
    }
  },
  { urls: ['<all_urls>'], types: ['sub_frame'], tabId: NONE },
);

$('menu').onclick = () => showList(!document.body.classList.contains('list'));
$('back').onclick = () => history.back();
$('fwd').onclick = () => history.forward();
$('reload').onclick = () => go(cur);
$('popout').onclick = () => chrome.tabs.create({ url: cur });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !q.value && document.body.classList.contains('list')) showList(false);
});

/* ---------- ブックマーク一覧 ---------- */

const expanded = new Set(JSON.parse(localStorage.getItem('open') ?? '["1"]'));

function item(n) {
  if (n.url) {
    const a = document.createElement('a');
    a.className = 'bm';
    a.href = n.url;
    a.title = `${n.title}\n${n.url}`;
    const img = new Image(16, 16);
    img.alt = '';
    img.loading = 'lazy';
    img.src = `/_favicon/?pageUrl=${encodeURIComponent(n.url)}&size=32`;
    const s = document.createElement('span');
    s.textContent = n.title || n.url;
    a.append(img, s);
    return a;
  }
  const d = document.createElement('details');
  d.dataset.id = n.id;
  const s = document.createElement('summary');
  s.append(document.createElement('span'));
  s.firstChild.textContent = n.title;
  d.append(s);
  d.open = expanded.has(n.id); // 子要素は toggle で開いたときに初めて読み込む
  return d;
}

tree.addEventListener(
  'toggle',
  async ({ target: d }) => {
    const id = d.dataset.id;
    if (d.open) expanded.add(id);
    else expanded.delete(id);
    localStorage.setItem('open', JSON.stringify([...expanded]));
    if (d.open && !d.dataset.loaded) {
      d.dataset.loaded = '1';
      d.append(...(await chrome.bookmarks.getChildren(id)).map(item));
    }
  },
  true,
);

tree.addEventListener('click', (e) => {
  const a = e.target.closest('.bm');
  // Ctrl/Shift/中クリックはブラウザ標準どおりタブ・ウィンドウで開く
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  open(a.href, a.textContent);
});

async function render() {
  const s = q.value.trim();
  tree.dataset.empty = s ? '見つかりません' : 'ブックマークがありません';
  if (s) {
    const hits = (await chrome.bookmarks.search(s)).filter((n) => n.url).slice(0, 200);
    tree.replaceChildren(...hits.map(item));
    return;
  }
  const roots = await chrome.bookmarks.getChildren('0');
  const sizes = await Promise.all(roots.map((r) => chrome.bookmarks.getChildren(r.id).then((c) => c.length)));
  tree.replaceChildren(...roots.filter((_, i) => sizes[i]).map(item));
}

function debounce(f, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(f, ms);
  };
}

const rerender = debounce(render, 150);
q.addEventListener('input', rerender);
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tree.querySelector('.bm')?.click();
});
for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
  chrome.bookmarks[ev].addListener(rerender);
}

render();

const last = JSON.parse(localStorage.getItem('last') ?? 'null');
if (last) open(last.url, last.name);
else showList(true);
