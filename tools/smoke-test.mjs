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
const brave = await launchBrave(new URL('..', import.meta.url).pathname);
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

async function openBookmark(url) {
  const listOpen = await panel.evaluate('document.body.classList.contains("list")');
  if (!listOpen) {
    await panel.evaluate('document.getElementById("menu").click()');
    await sleep(450);
  }
  const clicked = await panel.evaluate(`(() => {
    const a = [...document.querySelectorAll('.bm')].find((el) => el.href === ${JSON.stringify(url)});
    if (!a) return false;
    a.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`bookmark not found: ${url}`);
  await sleep(500);
}

async function title() {
  return panel.evaluate('document.getElementById("title").textContent');
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
      `(() => ['menu','back','fwd','reload','popout'].every((id) => document.getElementById(id).getAttribute('aria-label')))()`,
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
  const tabCount = await panel.evaluate("document.querySelectorAll('#tabs button').length");
  check('#11 tab strip lists the open pages', tabCount >= 2, `tabs=${tabCount}`);
  const switched = await panel.evaluate(`(() => {
    const button = [...document.querySelectorAll('#tabs button')].find((item) => item.title.startsWith(${JSON.stringify(base2)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await sleep(300);
  check(
    '#11 tab strip switches pages without reloading',
    switched && (await logs()).logs.filter((entry) => entry.path === '/page-b').length === 1,
  );

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
  const listVisible = await panel.evaluate('document.body.classList.contains("list")');
  if (!listVisible) {
    await panel.evaluate('document.getElementById("menu").click()');
    await sleep(500);
  }
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
  await panel.evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = 'large-item';
    q.dispatchEvent(new Event('input'));
  })()`);
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
  await panel.evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = '';
    q.dispatchEvent(new Event('input'));
  })()`);
  await sleep(700);
  await panel.evaluate(`Promise.all([
    chrome.bookmarks.removeTree(${JSON.stringify(largeFolderId)}),
    chrome.bookmarks.remove(${JSON.stringify(extra.id)}),
  ])`);
  await sleep(500);

  // #14 keyboard navigation
  if (!(await panel.evaluate('document.body.classList.contains("list")'))) {
    await panel.evaluate('document.getElementById("menu").click()');
    await sleep(400);
  }
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
  await panel.evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = 'large-item';
    q.dispatchEvent(new Event('input'));
    q.focus();
  })()`);
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
