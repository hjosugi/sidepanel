import {
  Cdp,
  closeTarget,
  extensionId,
  launchBrave,
  listTargets,
  newTab,
  waitFor,
} from './cdp.mjs';

// PROFILE_DIR=<ログイン済みプロファイルのコピー> で実際のサイトをサイドパネルに開く。
// HEADED=1 でウィンドウを表示（Cloudflare などはヘッドレスをボットと判定しやすい）、
// SITES=ChatGPT,Claude で対象を絞る。KEEP_PROFILE=1 でなければ終了時にプロファイルを消す。
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const allSites = [
  ['Keep', 'https://keep.google.com/'],
  ['Calendar', 'https://calendar.google.com/calendar/u/0/r'],
  ['Drive', 'https://drive.google.com/drive/my-drive'],
  ['Contacts', 'https://contacts.google.com/'],
  ['Tasks', 'https://tasks.google.com/'],
  ['Gmail', 'https://mail.google.com/'],
  ['Claude', 'https://claude.ai/'],
  ['ChatGPT', 'https://chatgpt.com/'],
  ['YouTube', 'https://www.youtube.com/'],
];
// SITES には名前のほか URL も書ける（SITES=ChatGPT,https://example.com/）
const only = (process.env.SITES ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const sites = only.length
  ? only.flatMap((item) =>
      /^https?:\/\//.test(item)
        ? [[new URL(item).hostname, item]]
        : allSites.filter(([name]) => name.toLowerCase() === item.toLowerCase()),
    )
  : allSites;

const brave = await launchBrave(new URL('..', import.meta.url).pathname, {
  profile: process.env.PROFILE_DIR || undefined,
  cleanupProfile: process.env.KEEP_PROFILE !== '1',
  headless: process.env.HEADED !== '1',
});
let panel;

async function snapshot() {
  const title = await panel.evaluate('document.getElementById("address").value');
  const notice = await panel.evaluate(
    'document.getElementById("notice").hidden ? "" : document.getElementById("notice-text").textContent',
  );
  const net = await panel.evaluate('window.__net.splice(0)');
  const tree = await panel.send('Page.getFrameTree');
  const frames = [];
  (function walk(node) {
    frames.push(node.frame.url);
    for (const child of node.childFrames ?? []) walk(child);
  })(tree.frameTree);
  return { title, notice, net, frames };
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
  const page = await Cdp.connect(launcherTarget.webSocketDebuggerUrl);
  await waitFor(() => page.evaluate('Boolean(chrome.windows)'), { timeout: 5000 });
  await page.evaluate(
    '(async () => { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); })()',
  );
  const panelTarget = await waitFor(async () => {
    const list = await listTargets(brave.port);
    return (
      list.find(
        (t) => t.url === `chrome-extension://${id}/sidepanel.html` && t.id !== launcher.id,
      ) ?? null
    );
  });
  panel = await Cdp.connect(panelTarget.webSocketDebuggerUrl);
  await waitFor(() => panel.evaluate('Boolean(document.getElementById("tree"))'));
  await closeTarget(brave.port, launcher.id);
  page.close();
  await sleep(300);

  await panel.evaluate(`(() => {
    window.__net = [];
    chrome.webRequest.onCompleted.addListener((d) => {
      if (d.type === 'sub_frame') window.__net.push({ url: d.url, status: d.statusCode, parent: d.parentFrameId });
    }, { urls: ['<all_urls>'], types: ['sub_frame'], tabId: -1 });
    chrome.webRequest.onErrorOccurred.addListener((d) => {
      if (d.type === 'sub_frame') window.__net.push({ url: d.url, error: d.error, parent: d.parentFrameId });
    }, { urls: ['<all_urls>'], types: ['sub_frame'], tabId: -1 });
  })()`);

  for (const [name, url] of sites) {
    await panel.evaluate(
      `chrome.bookmarks.create({ parentId: '1', title: ${JSON.stringify(name)}, url: ${JSON.stringify(url)} })`,
    );
    await sleep(300);
    const listOpen = await panel.evaluate('document.body.classList.contains("list")');
    if (!listOpen) {
      await panel.evaluate('document.getElementById("menu").click()');
      await sleep(400);
    }
    await panel.evaluate(
      `[...document.querySelectorAll('.bm')].find((a) => a.href === ${JSON.stringify(url)}).click()`,
    );
    await sleep(4000);
    console.log(JSON.stringify({ name, url, ...(await snapshot()) }));

    // #17 モバイル表示のチャレンジは案内バーからデスクトップ表示に切り替えて、通過するかを見る
    const offersDesktop = await panel.evaluate('!document.getElementById("notice-desktop").hidden');
    if (offersDesktop) {
      await panel.evaluate('document.getElementById("notice-desktop").click()');
      await waitFor(() => panel.evaluate('document.getElementById("notice").hidden'), {
        timeout: 20000,
      }).catch(() => {});
      await sleep(1500);
      console.log(JSON.stringify({ name, url, layout: 'desktop', ...(await snapshot()) }));
    }
  }
} finally {
  panel?.close();
  await brave.close();
  process.exit(0);
}
