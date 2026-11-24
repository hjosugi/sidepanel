import {
  Cdp,
  closeTarget,
  extensionId,
  launchBrave,
  listTargets,
  newTab,
  waitFor,
} from './cdp.mjs';
import { startServer } from './server.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const server = await startServer();
// EXTENSION_DIR で展開済みの配布 zip を検証できる（CI はこちらを使う）
const brave = await launchBrave(
  process.env.EXTENSION_DIR ?? new URL('..', import.meta.url).pathname,
);
let panel;
let launcherPage;
const errors = [];

async function logs() {
  return (await fetch(`${server.base}/__log`)).json();
}

async function reset() {
  await fetch(`${server.base}/__reset`);
}

async function addBookmark(url, title) {
  await panel.evaluate(
    `chrome.bookmarks.create({ parentId: '1', title: ${JSON.stringify(title)}, url: ${JSON.stringify(url)} })`,
  );
  await sleep(250);
}

async function ensureList(open) {
  if ((await panel.evaluate('document.body.classList.contains("list")')) !== open) {
    await panel.evaluate('document.getElementById("menu").click()');
    await sleep(450);
  }
}

async function openBookmark(url) {
  await ensureList(true);
  const clicked = await panel.evaluate(`(() => {
    const a = [...document.querySelectorAll('.bm')].find((el) => el.href === ${JSON.stringify(url)});
    if (!a) return false;
    a.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`bookmark not found: ${url}`);
  await sleep(500);
}

/** 一覧の検索欄に入力する（結果は 150ms 後に描画される） */
async function search(text) {
  await panel.evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = ${JSON.stringify(text)};
    q.dispatchEvent(new Event('input'));
    q.focus();
  })()`);
}

/** URL が prefix で始まるアイコンのバーの項目を押す */
async function clickDock(prefix) {
  const clicked = await panel.evaluate(`(() => {
    const item = [...document.querySelectorAll('#dock .dock-item')]
      .find((el) => el.dataset.url.startsWith(${JSON.stringify(prefix)}));
    item?.click();
    return Boolean(item);
  })()`);
  await sleep(300);
  return clicked;
}

// 表示中のページのタイトル（iframe の title に入る）
async function title() {
  return panel.evaluate(`document.querySelector('#frames iframe:not([hidden])')?.title ?? ''`);
}

async function settingsValue(key) {
  return panel.evaluate(
    `chrome.storage.local.get('settings').then(({ settings }) => settings?.[${JSON.stringify(key)}])`,
  );
}

async function patchSettings(patch) {
  await panel.evaluate(`(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...${JSON.stringify(patch)} } });
    await chrome.runtime.sendMessage({ type: 'settings-changed' });
  })()`);
  await sleep(200);
}

try {
  const id = await extensionId(brave.port);
  const launcher = await newTab(brave.port, `chrome-extension://${id}/sidepanel.html`);
  const launcherTarget = await waitFor(async () => {
    const target = (await listTargets(brave.port)).find((item) => item.id === launcher.id);
    return target?.url.startsWith('chrome-extension://') && target.webSocketDebuggerUrl
      ? target
      : null;
  });
  launcherPage = await Cdp.connect(launcherTarget.webSocketDebuggerUrl);
  await waitFor(() => launcherPage.evaluate('Boolean(chrome.windows)'), { timeout: 5000 });
  await launcherPage.evaluate(
    '(async () => { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); return w.id; })()',
  );

  const panelTarget = await waitFor(async () => {
    const list = await listTargets(brave.port);
    return (
      list.find(
        (target) =>
          target.url === `chrome-extension://${id}/sidepanel.html` && target.id !== launcher.id,
      ) ?? null
    );
  });
  panel = await Cdp.connect(panelTarget.webSocketDebuggerUrl);
  await panel.send('Runtime.enable');
  panel.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  panel.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') errors.push(args.map((arg) => arg.value ?? arg.description).join(' '));
  });
  await waitFor(() => panel.evaluate('Boolean(document.getElementById("tree"))'));
  await closeTarget(brave.port, launcher.id);
  launcherPage.close();
  launcherPage = null;
  await sleep(400);

  check('side panel opens', true);
  check(
    'default language is English',
    (await panel.evaluate('document.documentElement.lang')) === 'en',
  );
  check(
    'toolbar buttons have accessible names',
    await panel.evaluate(
      `(() => ['menu','back','fwd','reload','pin','address','popout'].every((id) => document.getElementById(id).getAttribute('aria-label')))()`,
    ),
  );

  // #1 Sec-Fetch-Dest rewrite
  await reset();
  await addBookmark(`${server.base}/secfetch`, 'SecFetch');
  await openBookmark(`${server.base}/secfetch`);
  await waitFor(async () => (await title()) === 'SecFetch OK', { timeout: 5000 }).catch(() => {});
  const secfetchLogs = (await logs()).logs.filter((entry) => entry.path === '/secfetch');
  check(
    '#1 panel request succeeds with Sec-Fetch-Dest rewrite',
    (await title()) === 'SecFetch OK',
    `title=${await title()}`,
  );
  check(
    '#6 iframe allow includes microphone/camera/passkeys',
    await panel.evaluate(`(() => {
      const frame = document.querySelector('#frames iframe');
      return ['microphone', 'camera', 'publickey-credentials-get', 'publickey-credentials-create', 'storage-access']
        .every((name) => frame.allow.includes(name));
    })()`),
  );
  check(
    '#1 server sees Sec-Fetch-Dest: document and Sec-Fetch-Site: none',
    secfetchLogs.length > 0 &&
      secfetchLogs.at(-1).headers['sec-fetch-dest'] === 'document' &&
      secfetchLogs.at(-1).headers['sec-fetch-site'] === 'none',
    JSON.stringify(secfetchLogs.at(-1)?.headers),
  );

  // X-Frame-Options / frame-ancestors removal
  await addBookmark(`${server.base}/xfo`, 'XFO');
  await openBookmark(`${server.base}/xfo`);
  await waitFor(async () => (await title()) === 'XFO Page', { timeout: 5000 }).catch(() => {});
  check(
    '#1 X-Frame-Options page renders',
    (await title()) === 'XFO Page',
    `title=${await title()}`,
  );

  // #3 SPA URL/title tracking
  await addBookmark(`${server.base}/spa`, 'SPA');
  await openBookmark(`${server.base}/spa`);
  await waitFor(async () => (await title()) === 'SPA Next', { timeout: 5000 }).catch(() => {});
  check('#3 SPA title follows pushState', (await title()) === 'SPA Next', `title=${await title()}`);
  check(
    '#3 back button enabled after pushState',
    (await panel.evaluate('!document.getElementById("back").disabled')) === true,
  );

  await reset();
  await panel.evaluate('document.getElementById("reload").click()');
  await waitFor(async () => (await logs()).logs.some((entry) => entry.path === '/spa/next'), {
    timeout: 5000,
  }).catch(() => {});
  const reloaded = (await logs()).logs.some((entry) => entry.path === '/spa/next');
  check('#3/#15 reload uses the current SPA URL', reloaded);

  // #2 mobile UA / Client Hints
  await reset();
  await addBookmark(`${server.base}/ua-report`, 'UA');
  await openBookmark(`${server.base}/ua-report`);
  await waitFor(async () => (await logs()).reports.length > 0, { timeout: 5000 }).catch(() => {});
  const uaLog = (await logs()).logs.filter((entry) => entry.path === '/ua-report').at(-1);
  const report = (await logs()).reports.at(-1);
  check(
    '#2 request headers use a mobile UA',
    uaLog?.headers['user-agent']?.includes('Android') &&
      uaLog?.headers['sec-ch-ua-mobile'] === '?1',
    uaLog?.headers['user-agent'],
  );
  check(
    '#2 navigator.userAgent / userAgentData are mobile',
    report?.ua?.includes('Android') && report?.mobile === 'true',
    JSON.stringify(report),
  );

  // #8 fallback on HTTP error
  await addBookmark(`${server.base}/error403`, 'Error');
  await openBookmark(`${server.base}/error403`);
  await sleep(1000);
  check(
    '#8 HTTP error shows fallback notice',
    await panel.evaluate(
      `!document.getElementById('notice').hidden && document.getElementById('notice-text').textContent.includes('403')`,
    ),
    await panel.evaluate('document.getElementById("notice-text").textContent'),
  );

  // #5 Cloudflare challenge fallback
  await addBookmark(`${server.base}/challenge`, 'Challenge');
  await openBookmark(`${server.base}/challenge`);
  await sleep(800);
  check(
    '#5 Cloudflare challenge shows fallback notice',
    await panel.evaluate(
      `!document.getElementById('notice').hidden && document.getElementById('notice-text').textContent.includes('Cloudflare')`,
    ),
    await panel.evaluate('document.getElementById("notice-text").textContent'),
  );

  // #17 challenges never pass with the mobile UA, so the notice offers desktop layout
  check(
    '#17 challenge in mobile layout offers desktop layout',
    await panel.evaluate('!document.getElementById("notice-desktop").hidden'),
  );
  await reset();
  await panel.evaluate('document.getElementById("notice-desktop").click()');
  await waitFor(async () => (await logs()).logs.some((entry) => entry.path === '/challenge'), {
    timeout: 5000,
  }).catch(() => {});
  const desktopLog = (await logs()).logs.filter((entry) => entry.path === '/challenge').at(-1);
  const desktopHosts = await panel.evaluate(
    "chrome.storage.local.get('settings').then(({ settings }) => settings?.desktopHosts ?? [])",
  );
  check(
    '#17 desktop layout button reloads the page with a desktop UA',
    desktopHosts.includes('127.0.0.1') &&
      Boolean(desktopLog) &&
      !desktopLog.headers['user-agent']?.includes('Android'),
    `${JSON.stringify(desktopHosts)} ${desktopLog?.headers['user-agent']}`,
  );
  await sleep(500);
  check(
    '#17 desktop layout hides the switch',
    await panel.evaluate('document.getElementById("notice-desktop").hidden'),
  );
  await panel.evaluate('document.getElementById("ua").click()');
  await sleep(800);

  // #17 the 403 challenge response is not an HTTP error, so the notice clears once it passes
  await addBookmark(`${server.base}/challenge?pass=1`, 'Challenge pass');
  await openBookmark(`${server.base}/challenge?pass=1`);
  await waitFor(async () => (await title()) === 'Passed', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(
    '#17 notice clears after the challenge passes',
    (await title()) === 'Passed' &&
      (await panel.evaluate('document.getElementById("notice").hidden')),
    `title=${await title()}`,
  );

  // #7 nested iframe observation
  await reset();
  await addBookmark(`${server.base}/nested`, 'Nested');
  await openBookmark(`${server.base}/nested`);
  await sleep(1500);
  await sleep(1200);
  const frameTree = await panel.send('Page.getFrameTree');
  const frameUrls = [];
  (function walk(node) {
    frameUrls.push(node.frame.url);
    for (const child of node.childFrames ?? []) walk(child);
  })(frameTree.frameTree);
  check(
    '#7 nested frame that would be blocked is removed',
    !frameUrls.some((url) => url.includes('/xfo')),
    frameUrls.join(' | '),
  );

  // normal tab isolation
  await reset();
  const tab = await newTab(brave.port, `${server.base}/nested?tab=1`);
  await sleep(1500);
  await closeTarget(brave.port, tab.id);
  const tabLog = (await logs()).logs.find((entry) => entry.url === '/xfo?tab=1');
  check(
    'normal tab requests are not rewritten',
    tabLog?.headers['sec-fetch-dest'] === 'iframe',
    JSON.stringify(tabLog?.headers),
  );

  // #11 keep multiple origins alive
  const base2 = server.base.replace('127.0.0.1', '127.0.0.2');
  await reset();
  await addBookmark(`${server.base}/page-a`, 'A');
  await addBookmark(`${base2}/page-b`, 'B');
  await openBookmark(`${server.base}/page-a`);
  await sleep(800);
  await openBookmark(`${base2}/page-b`);
  await sleep(800);
  await openBookmark(`${server.base}/page-a`);
  await sleep(800);
  const pageALogs = (await logs()).logs.filter((entry) => entry.path === '/page-a');
  check(
    '#11 reopening the same page does not reload it',
    pageALogs.length === 1,
    `requests=${pageALogs.length}`,
  );
  const tabCount = await panel.evaluate("document.querySelectorAll('#dock .dock-item').length");
  check('#11 dock lists the open pages', tabCount >= 2, `pages=${tabCount}`);
  const switched = await clickDock(base2);
  check(
    '#11 dock switches pages without reloading',
    switched && (await logs()).logs.filter((entry) => entry.path === '/page-b').length === 1,
  );

  // #11 back moves the visible page. history.back() walks the panel's joint session
  // history, so it would undo B's later pushState and leave the visible page A unchanged.
  await openBookmark(`${server.base}/spa`);
  await waitFor(async () => (await title()) === 'SPA Next', { timeout: 5000 }).catch(() => {});
  await addBookmark(`${base2}/spa`, 'SPA 2');
  await openBookmark(`${base2}/spa`);
  await waitFor(async () => (await title()) === 'SPA Next', { timeout: 5000 }).catch(() => {});
  await clickDock(server.base);
  await panel.evaluate('document.getElementById("back").click()');
  await waitFor(
    async () =>
      new URL(await panel.evaluate('document.getElementById("address").title')).pathname === '/spa',
    { timeout: 3000 },
  ).catch(() => {});
  const visibleAfterBack = await panel.evaluate('document.getElementById("address").title');
  check(
    '#11 back moves the visible page',
    new URL(visibleAfterBack).pathname === '/spa',
    visibleAfterBack,
  );

  // pins: the pin button adds the page to the dock, and the pin reopens it
  await clickDock(base2);
  await panel.evaluate('document.getElementById("pin").click()');
  await sleep(300);
  const pins = await settingsValue('pins');
  check(
    'pin button pins the current page',
    pins?.length === 1 &&
      pins[0].url.startsWith(base2) &&
      (await panel.evaluate('document.getElementById("pin").getAttribute("aria-pressed")')) ===
        'true',
    JSON.stringify(pins),
  );
  check(
    'pinned page shows as an icon in the dock',
    await panel.evaluate(`(() => {
      const item = document.querySelector('#dock .dock-item[data-pin="0"]');
      return Boolean(item?.querySelector('img')?.src.includes('/_favicon/')) && item.hasAttribute('data-alive');
    })()`),
  );
  await clickDock(server.base);
  await panel.evaluate('document.querySelector(\'#dock .dock-item[data-pin="0"]\').click()');
  await sleep(300);
  check(
    'clicking a pin shows its page',
    (await panel.evaluate('document.getElementById("address").title')).startsWith(base2),
  );
  await panel.evaluate('document.getElementById("pin").click()');
  await sleep(300);
  check('pin button unpins the page', (await settingsValue('pins'))?.length === 0);

  // options page: page limit applies to the open panel
  const optionsTab = await newTab(brave.port, `chrome-extension://${id}/options.html`);
  const optionsTarget = await waitFor(async () => {
    const target = (await listTargets(brave.port)).find((item) => item.id === optionsTab.id);
    return target?.webSocketDebuggerUrl ? target : null;
  });
  const options = await Cdp.connect(optionsTarget.webSocketDebuggerUrl);
  await waitFor(() => options.evaluate('document.getElementById("pages").options.length === 5'));
  await options.evaluate(`(() => {
    const pages = document.getElementById('pages');
    pages.value = '1';
    pages.dispatchEvent(new Event('change'));
  })()`);
  await sleep(500);
  check(
    'options: lowering the page limit closes older pages',
    (await panel.evaluate("document.querySelectorAll('#frames iframe').length")) === 1 &&
      (await panel.evaluate("document.querySelectorAll('#dock .dock-item').length")) === 1,
  );
  await options.evaluate(`(() => {
    const pages = document.getElementById('pages');
    pages.value = '3';
    pages.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  options.close();
  await closeTarget(brave.port, optionsTab.id);

  // #16 cookie shim
  const cookieTab = await newTab(brave.port, `${server.base}/cookie-set`);
  await sleep(700);
  await closeTarget(brave.port, cookieTab.id);
  await reset();
  await addBookmark(`${server.base}/cookie-check`, 'Cookies');
  await openBookmark(`${server.base}/cookie-check`);
  await waitFor(async () => (await logs()).reports.some((entry) => entry.phase === 'after'), {
    timeout: 6000,
  }).catch(() => {});
  let cookieReports = (await logs()).reports;
  const before = cookieReports.find((entry) => entry.phase === 'before');
  const after = cookieReports.find((entry) => entry.phase === 'after');
  check(
    '#16 document.cookie exposes Lax/Strict cookies to the page',
    before?.read?.includes('lax=1') && before?.read?.includes('strict=1'),
    before?.read,
  );
  check('#16 HttpOnly cookies are not exposed', before?.httponly === 'false', before?.read);
  check(
    '#16 JS cookie writes reach the cookie store',
    after?.read?.includes('written=1') &&
      (await panel.evaluate(
        `chrome.cookies.get({ url: ${JSON.stringify(`${server.base}/`)}, name: 'written' }).then((c) => c?.value)`,
      )) === '1',
    after?.read,
  );

  await reset();
  await addBookmark(`${server.base}/cookie-immediate`, 'Cookies immediate');
  await openBookmark(`${server.base}/cookie-immediate`);
  await waitFor(async () => (await logs()).reports.length > 0, { timeout: 4000 }).catch(() => {});
  cookieReports = (await logs()).reports;
  check(
    '#16 cached jar is available synchronously on the next load',
    cookieReports[0]?.read?.includes('written=1') && cookieReports[0]?.read?.includes('lax=1'),
    cookieReports[0]?.read,
  );

  // #9/#10 large folder: differential updates, scroll retention, content-visibility
  const largeFolderId = await panel.evaluate(`(async () => {
    const folder = await chrome.bookmarks.create({ parentId: '1', title: 'Large' });
    for (let start = 0; start < 600; start += 50) {
      await Promise.all(Array.from({ length: Math.min(50, 600 - start) }, (_, i) =>
        chrome.bookmarks.create({
          parentId: folder.id,
          title: 'large-item ' + (start + i),
          url: ${JSON.stringify(`${server.base}/large/`)} + (start + i),
        })));
    }
    return folder.id;
  })()`);
  await sleep(800);
  await ensureList(true);
  await panel.evaluate(`(() => {
    const d = document.querySelector('details[data-id="' + ${JSON.stringify(largeFolderId)} + '"]');
    if (d && !d.open) d.querySelector('summary').click();
  })()`);
  await waitFor(
    () =>
      panel.evaluate(
        `document.querySelectorAll('details[data-id="${largeFolderId}"] .bm').length >= 600`,
      ),
    { timeout: 10000 },
  );
  const marked = await panel.evaluate(`(() => {
    const first = document.querySelector('details[data-id="${largeFolderId}"] .bm');
    if (!first) return false;
    first.dataset.smokeMark = 'keep';
    document.getElementById('tree').scrollTop = 500;
    return true;
  })()`);
  const extra = await panel.evaluate(
    `chrome.bookmarks.create({ parentId: '1', title: 'outside', url: ${JSON.stringify(`${server.base}/outside`)} })`,
  );
  await sleep(600);
  check(
    '#9 unrelated bookmark change keeps the large folder DOM and scroll',
    marked &&
      (await panel.evaluate(
        `Boolean(document.querySelector('details[data-id="${largeFolderId}"] .bm[data-smoke-mark="keep"]')) && Math.abs(document.getElementById('tree').scrollTop - 500) < 8`,
      )),
    `scroll=${await panel.evaluate('document.getElementById("tree").scrollTop')}`,
  );
  check(
    '#10 large rows use content-visibility',
    (await panel.evaluate(
      `getComputedStyle(document.querySelector('details[data-id="${largeFolderId}"] .bm')).contentVisibility`,
    )) === 'auto',
  );
  await search('large-item');
  await sleep(500);
  const moreCount = await panel.evaluate(`document.getElementById('more')?.textContent ?? ''`);
  check(
    '#10 search results offer Show more beyond 200',
    moreCount.includes('400') || moreCount.includes('さらに表示'),
    moreCount,
  );
  await panel.evaluate(`(() => {
    document.getElementById('more').click();
  })()`);
  await sleep(300);
  check(
    '#10 Show more reveals the next page of results',
    (await panel.evaluate("document.querySelectorAll('#tree .bm').length")) === 400,
  );
  await search('');
  await sleep(700);
  await panel.evaluate(`Promise.all([
    chrome.bookmarks.removeTree(${JSON.stringify(largeFolderId)}),
    chrome.bookmarks.remove(${JSON.stringify(extra.id)}),
  ])`);
  await sleep(500);

  // #14 keyboard navigation
  await ensureList(true);
  const keyboard = await panel.evaluate(`(() => {
    const tree = document.getElementById('tree');
    const rows = [...tree.querySelectorAll('summary, .bm')].filter((el) => el.getClientRects().length);
    const first = rows[0];
    if (!first) return null;
    first.focus();
    const before = document.activeElement.textContent;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    return {
      before,
      after: document.activeElement.textContent,
      role: tree.getAttribute('role'),
      tabIndex: first.tabIndex,
    };
  })()`);
  check(
    '#14 arrow keys move focus inside the tree',
    keyboard && keyboard.role === 'tree' && keyboard.after !== keyboard.before,
    JSON.stringify(keyboard),
  );
  check('#14 the active row has a roving tabindex', keyboard?.tabIndex === 0);

  // #15 Esc clears the search, then closes the list
  await search('large-item');
  await sleep(300);
  await panel.evaluate(
    "dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
  );
  await sleep(200);
  const afterFirstEscape = await panel.evaluate(`({
    value: document.getElementById('q').value,
    list: document.body.classList.contains('list'),
  })`);
  check(
    '#15 first Esc clears the search and keeps the list open',
    afterFirstEscape.value === '' && afterFirstEscape.list,
    JSON.stringify(afterFirstEscape),
  );
  await panel.evaluate(
    "dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
  );
  await sleep(200);
  check(
    '#15 second Esc closes the list',
    (await panel.evaluate('document.body.classList.contains("list")')) === false,
  );

  // the menu button turns into a close button while the list is open
  await ensureList(true);
  const menuOpen = await panel.evaluate(`(() => {
    const menu = document.getElementById('menu');
    return {
      expanded: menu.getAttribute('aria-expanded'),
      close: getComputedStyle(menu.querySelector('.close')).display,
      open: getComputedStyle(menu.querySelector('.open')).display,
    };
  })()`);
  await ensureList(false);
  const menuClosed = await panel.evaluate(`(() => {
    const menu = document.getElementById('menu');
    return {
      expanded: menu.getAttribute('aria-expanded'),
      close: getComputedStyle(menu.querySelector('.close')).display,
      open: getComputedStyle(menu.querySelector('.open')).display,
    };
  })()`);
  check(
    'menu shows a close icon while the list is open',
    menuOpen.expanded === 'true' &&
      menuOpen.close !== 'none' &&
      menuOpen.open === 'none' &&
      menuClosed.expanded === 'false' &&
      menuClosed.close === 'none' &&
      menuClosed.open !== 'none',
    JSON.stringify({ menuOpen, menuClosed }),
  );

  // address bar: a typed address opens in the panel, other text searches the list
  await reset();
  const typed = `${server.base}/typed?x=1`;
  await panel.evaluate(`(() => {
    const address = document.getElementById('address');
    address.focus();
    address.value = ${JSON.stringify(typed.replace(/^http:\/\//, ''))};
    address.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  })()`);
  await waitFor(async () => (await title()) === '/typed', { timeout: 5000 }).catch(() => {});
  check(
    'address bar opens a typed address',
    (await title()) === '/typed' &&
      (await panel.evaluate('document.getElementById("address").title')) === typed &&
      !(await panel.evaluate('document.body.classList.contains("list")')),
    `title=${await title()}`,
  );
  await panel.evaluate(`(() => {
    const address = document.getElementById('address');
    address.focus();
    address.value = 'SecFetch';
    address.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  })()`);
  await sleep(500);
  check(
    'address bar searches the list for other text',
    await panel.evaluate(
      `document.body.classList.contains('list') && document.getElementById('q').value === 'SecFetch' &&
        [...document.querySelectorAll('#tree .bm')].some((a) => a.textContent === 'SecFetch')`,
    ),
  );
  await search('');
  await sleep(300);

  // open browser tabs are listed and open in the panel
  const tabUrl = `${server.base}/tab-source`;
  const browserTab = await newTab(brave.port, tabUrl);
  await waitFor(
    () =>
      panel.evaluate(
        `[...document.querySelectorAll('#tree .bm.tab')].some((a) => a.href === ${JSON.stringify(tabUrl)})`,
      ),
    { timeout: 5000 },
  ).catch(() => {});
  check(
    'list shows open browser tabs',
    await panel.evaluate(
      `[...document.querySelectorAll('#tree .bm.tab')].some((a) => a.href === ${JSON.stringify(tabUrl)} && a.textContent === '/tab-source')`,
    ),
  );
  await search('tab-source');
  await sleep(500);
  check(
    'search finds open browser tabs',
    await panel.evaluate(
      `[...document.querySelectorAll('#tree details.tabs .bm.tab')].some((a) => a.href === ${JSON.stringify(tabUrl)})`,
    ),
  );
  await panel.evaluate(
    `[...document.querySelectorAll('#tree .bm.tab')].find((a) => a.href === ${JSON.stringify(tabUrl)}).click()`,
  );
  await waitFor(async () => (await title()) === '/tab-source', { timeout: 5000 }).catch(() => {});
  check('clicking a tab opens it in the panel', (await title()) === '/tab-source');
  await closeTarget(brave.port, browserTab.id);
  await search('');

  // sites in unframedHosts see themselves as the top frame; other sites still see the frame
  await patchSettings({ unframedHosts: ['127.0.0.1'] });
  await addBookmark(`${server.base}/frame-check`, 'Frame check');
  await openBookmark(`${server.base}/frame-check`);
  await waitFor(async () => (await title()) !== 'pending', { timeout: 5000 }).catch(() => {});
  const unframedTitle = await title();
  await addBookmark(`${base2}/frame-check`, 'Frame check 2');
  await openBookmark(`${base2}/frame-check`);
  await waitFor(async () => (await title()) !== 'pending', { timeout: 5000 }).catch(() => {});
  const framedTitle = await title();
  check(
    'unframed site sees itself as the top frame, self still works',
    unframedTitle === 'top|top|ok',
    unframedTitle,
  );
  check('other sites still see the frame', framedTitle === 'framed|framed|ok', framedTitle);
  await patchSettings({ unframedHosts: ['claude.ai'] });

  // startup: a specific page opens when the panel opens
  await patchSettings({ startup: 'url', startUrl: `${server.base}/start` });
  const startTab = await newTab(brave.port, `chrome-extension://${id}/sidepanel.html`);
  const startTarget = await waitFor(async () => {
    const target = (await listTargets(brave.port)).find((item) => item.id === startTab.id);
    return target?.webSocketDebuggerUrl ? target : null;
  });
  const startPage = await Cdp.connect(startTarget.webSocketDebuggerUrl);
  const startSrc = await waitFor(
    () => startPage.evaluate("document.querySelector('#frames iframe')?.src ?? null"),
    { timeout: 5000 },
  ).catch(() => null);
  startPage.close();
  await closeTarget(brave.port, startTab.id);
  check('startup opens the chosen page', startSrc === `${server.base}/start`, String(startSrc));
  await patchSettings({ startup: 'last', startUrl: '' });

  // tab strip: the close button closes a page, + opens the list
  await openBookmark(`${base2}/page-b`);
  await sleep(500);
  const framesBefore = await panel.evaluate("document.querySelectorAll('#frames iframe').length");
  const closed = await panel.evaluate(`(() => {
    const tab = [...document.querySelectorAll('#dock .dock-item.tab')]
      .find((el) => el.dataset.url.startsWith(${JSON.stringify(base2)}));
    tab?.querySelector('.dock-close').click();
    return Boolean(tab);
  })()`);
  await sleep(300);
  check(
    'tab close button closes the page',
    closed &&
      (await panel.evaluate("document.querySelectorAll('#frames iframe').length")) ===
        framesBefore - 1 &&
      !(await panel.evaluate('document.getElementById("address").title')).startsWith(base2),
    `before=${framesBefore}`,
  );
  await ensureList(false);
  await panel.evaluate("document.querySelector('#dock .dock-new').click()");
  await sleep(300);
  check(
    'new tab button opens the list',
    await panel.evaluate(
      "document.body.classList.contains('list') && document.activeElement === document.getElementById('q')",
    ),
  );

  // zoom: the ⋯ menu and Ctrl + / - / 0 change the zoom of the visible site and remember it
  await openBookmark(`${server.base}/page-a`);
  const host = new URL(server.base).hostname;
  const frameZoom = () =>
    panel.evaluate("document.querySelector('#frames iframe:not([hidden])').style.zoom");
  const siteZoom = async () => (await settingsValue('siteZoom'))?.[host];
  await panel.evaluate('document.getElementById("overflow").click()');
  await sleep(200);
  check(
    '⋯ button opens the menu',
    await panel.evaluate(
      `document.getElementById('overflow-menu').matches(':popover-open') &&
        document.getElementById('overflow').getAttribute('aria-expanded') === 'true'`,
    ),
  );
  await panel.evaluate('document.getElementById("zoom-in").click()');
  await sleep(300);
  check(
    'zoom in enlarges the visible site and remembers it',
    (await frameZoom()) === '1.1' &&
      (await siteZoom()) === 1.1 &&
      (await panel.evaluate('document.getElementById("zoom-reset").textContent')) === '110%',
    `zoom=${await frameZoom()} saved=${await siteZoom()}`,
  );
  const ctrl = (key) =>
    panel.evaluate(
      `dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: true, bubbles: true }))`,
    );
  await ctrl('-');
  await sleep(200);
  await ctrl('-');
  await sleep(300);
  check(
    'Ctrl - zooms out',
    (await frameZoom()) === '0.9' && (await siteZoom()) === 0.9,
    `zoom=${await frameZoom()}`,
  );
  await ctrl('0');
  await sleep(300);
  check(
    'Ctrl 0 resets to the default and forgets the site',
    (await frameZoom()) === '' && (await siteZoom()) === undefined,
  );
  await panel.evaluate("document.getElementById('overflow-menu').hidePopover()");
  await patchSettings({ zoom: 1.25 });
  check('default zoom applies to open pages', (await frameZoom()) === '1.25');
  await reset();
  await openBookmark(`${server.base}/zoom-report`).catch(async () => {
    await addBookmark(`${server.base}/zoom-report`, 'Zoom report');
    await openBookmark(`${server.base}/zoom-report`);
  });
  // The page may first see the unzoomed view and get the zoom as a resize right after,
  // so wait for the report that has the zoom, not for any report.
  const zoomed = (entry) => Number(entry.dpr) === 1.25;
  await waitFor(async () => (await logs()).reports.some(zoomed), { timeout: 5000 }).catch(() => {});
  const zoomReports = (await logs()).reports;
  check(
    'the page sees the zoom like browser zoom',
    zoomReports.some(zoomed),
    `want a report with dpr 1.25, reports seen: ${JSON.stringify(zoomReports)}`,
  );
  await patchSettings({ zoom: 1, siteZoom: {} });

  // language switch
  await panel.evaluate('document.getElementById("lang").click()');
  await sleep(300);
  check(
    'language switches to Japanese',
    (await panel.evaluate('document.documentElement.lang')) === 'ja' &&
      (await panel.evaluate('document.getElementById("q").placeholder')).includes('ブックマーク'),
  );
  check(
    'language choice is saved',
    (await panel.evaluate(
      `chrome.storage.local.get('settings').then(({ settings }) => settings?.lang)`,
    )) === 'ja',
  );
  await panel.evaluate('document.getElementById("lang").click()');
  await sleep(300);
  check(
    'language switches back to English',
    (await panel.evaluate('document.documentElement.lang')) === 'en',
  );

  check('no uncaught errors in the side panel', errors.length === 0, errors.join(' | '));

  // #7 rules and content scripts only exist while a panel is open
  const worker = (await listTargets(brave.port)).find(
    (target) =>
      target.type === 'service_worker' && target.url === `chrome-extension://${id}/background.js`,
  );
  const sw = await Cdp.connect(worker.webSocketDebuggerUrl);
  const panelState = () =>
    sw.evaluate(`Promise.all([
      chrome.declarativeNetRequest.getSessionRules(),
      chrome.scripting.getRegisteredContentScripts(),
    ]).then(([rules, scripts]) => ({ rules: rules.length, scripts: scripts.length }))`);
  const whileOpen = await panelState();
  panel.close();
  panel = null;
  await closeTarget(brave.port, panelTarget.id);
  await waitFor(
    async () => {
      const state = await panelState();
      return state.rules === 0 && state.scripts === 0;
    },
    { timeout: 5000 },
  ).catch(() => {});
  const afterClose = await panelState();
  check(
    '#7 rules and content scripts are removed when the panel closes',
    whileOpen.rules > 0 &&
      whileOpen.scripts > 0 &&
      afterClose.rules === 0 &&
      afterClose.scripts === 0,
    JSON.stringify({ whileOpen, afterClose }),
  );
  sw.close();
} catch (error) {
  console.error('TEST ERROR', error);
  const targets = await listTargets(brave.port).catch(() => []);
  console.error(targets.map((target) => `${target.type} ${target.url}`).join('\n'));
  console.error(brave.output().slice(-2000));
  results.push({ name: 'harness', ok: false });
} finally {
  panel?.close();
  launcherPage?.close();
  await brave.close();
  await server.close();
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
