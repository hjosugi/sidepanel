// ストア掲載用の画像を .release/store-assets/ に生成する。架空のデモサイトだけを使う。
// usage: pnpm run release:store:assets   (BROWSER_BIN で Chromium 系ブラウザを指定できる)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import {
  Cdp,
  closeTarget,
  extensionId,
  launchBrave,
  listTargets,
  newTab,
  waitFor,
} from './cdp.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.release', 'store-assets');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEMOS = {
  mail: {
    title: 'Inbox — Mailbox',
    letter: 'M',
    color: '#d93025',
    heading: 'Inbox',
    rows: [
      ['Aiko Tanaka', 'Design review moved to Thursday'],
      ['Build bot', 'Release 1.2.0 passed all checks'],
      ['Sam Lee', 'Lunch next week?'],
      ['Travel desk', 'Your itinerary for Osaka'],
      ['Newsletter', 'Ten tips for a tidy browser'],
      ['Mika Sato', 'Slides for Monday'],
    ],
  },
  notes: {
    title: 'Notes',
    color: '#f9ab00',
    heading: 'Notes',
    rows: [
      ['Groceries', 'Rice, miso, green onions, tofu'],
      ['Ideas', 'Keep the side panel open while reading'],
      ['Meeting', 'Ship the settings page this week'],
      ['Books', 'Finish chapter 4 tonight'],
      ['Trip', 'Book the train to Kyoto'],
    ],
  },
  calendar: {
    title: 'Today — Calendar',
    letter: 'C',
    color: '#1a73e8',
    heading: 'Today',
    rows: [
      ['09:30', 'Stand-up'],
      ['11:00', 'Design review'],
      ['13:00', 'Lunch with Sam'],
      ['15:30', 'Focus time'],
      ['18:00', 'Gym'],
    ],
  },
  chat: {
    title: 'Assistant',
    color: '#7b61ff',
    heading: 'Assistant',
    rows: [
      ['You', 'Summarize the design review notes'],
      ['Assistant', 'Three decisions were made: …'],
      ['You', 'Draft a reply to Aiko'],
    ],
  },
  docs: { title: 'Docs', color: '#188038', heading: 'Docs', rows: [['Roadmap', 'Edited today']] },
  news: { title: 'News', color: '#5f6368', heading: 'News', rows: [['Top story', '…']] },
  recipes: {
    title: 'Recipes',
    color: '#e8710a',
    heading: 'Recipes',
    rows: [['Miso soup', '15 min']],
  },
};

function icon(color, letter) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="22" font-family="Arial" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function demoPage(name) {
  const demo = DEMOS[name];
  const rows = demo.rows
    .map(
      ([a, b]) =>
        `<li><span class="dot"></span><div><strong>${a}</strong><small>${b}</small></div></li>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${demo.title}</title><link rel="icon" href="${icon(demo.color, demo.letter ?? demo.title[0])}">
<style>
body{margin:0;font:14px/1.4 system-ui,sans-serif;color:#202124;background:#fff}
header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:${demo.color};color:#fff;font-size:18px;font-weight:600}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #eee}
.dot{flex:none;width:32px;height:32px;border-radius:50%;background:${demo.color}22}
strong{display:block}small{color:#5f6368}
</style></head><body><header>${demo.heading}</header><ul>${rows}</ul></body></html>`;
}

const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname.slice(1);
  if (!DEMOS[name]) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(demoPage(name));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
// *.localhost は Chrome が常にループバックへ解決する。サイトごとに別オリジンにしてタブ列を出す。
const site = (name) => `http://${name}.localhost:${server.address().port}/${name}`;

const brave = await launchBrave(root);

async function open(url, width, height) {
  const tab = await newTab(brave.port, url);
  const target = await waitFor(async () => {
    const item = (await listTargets(brave.port)).find((entry) => entry.id === tab.id);
    return item?.webSocketDebuggerUrl ? item : null;
  });
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  return { cdp, id: tab.id };
}

async function capture(cdp, width, height) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  return data;
}

async function render(html, width, height, file) {
  const { cdp, id } = await open('about:blank', width, height);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const { frameTree } = await cdp.send('Page.getFrameTree');
  await cdp.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  await sleep(500);
  const data = await capture(cdp, width, height);
  writeFileSync(join(out, file), Buffer.from(data, 'base64'));
  console.log(join('.release', 'store-assets', file));
  cdp.close();
  await closeTarget(brave.port, id);
}

const PANEL = { width: 400, height: 720 };
const iconData = readFileSync(join(root, 'icons/128.png')).toString('base64');

function composite({ panel, heading, lines }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;
  font-family:system-ui,sans-serif;color:#202124;background:linear-gradient(135deg,#e8f0fe,#f8f9fa 60%)}
.copy{flex:1}
.brand{display:flex;align-items:center;gap:14px;font-size:22px;font-weight:600;color:#1a73e8;margin-bottom:28px}
.brand img{width:48px;height:48px}
h1{margin:0 0 24px;font-size:44px;line-height:1.15;letter-spacing:-0.01em}
ul{margin:0;padding:0;list-style:none;font-size:21px;line-height:1.5;color:#3c4043}
li{margin:10px 0;padding-left:30px;position:relative}
li::before{content:"";position:absolute;left:0;top:11px;width:12px;height:12px;border-radius:50%;background:#1a73e8}
.panel{flex:none;width:${PANEL.width}px;height:${PANEL.height}px;border-radius:14px;overflow:hidden;
  box-shadow:0 18px 50px #0003,0 0 0 1px #0000001a;background:#fff}
.panel img{display:block;width:100%;height:100%}
</style></head><body><div class="copy">
<div class="brand"><img src="data:image/png;base64,${iconData}">Sidepanel Bookmarks</div>
<h1>${heading}</h1><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div>
<div class="panel"><img src="data:image/png;base64,${panel}"></div></body></html>`;
}

try {
  mkdirSync(out, { recursive: true });
  const id = await extensionId(brave.port);

  // ファビコンを登録するため、デモページを一度通常タブで開く
  for (const name of Object.keys(DEMOS)) {
    const tab = await newTab(brave.port, site(name));
    await sleep(300);
    await closeTarget(brave.port, tab.id);
  }

  const { cdp: panel, id: panelId } = await open(
    `chrome-extension://${id}/sidepanel.html`,
    PANEL.width,
    PANEL.height,
  );
  await waitFor(() => panel.evaluate('Boolean(document.getElementById("tree"))'));
  await panel.evaluate(`(async () => {
    const make = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, ...(url ? { url } : {}) });
    const work = await make('1', 'Work');
    await make(work.id, 'Mailbox', '${site('mail')}');
    await make(work.id, 'Calendar', '${site('calendar')}');
    await make(work.id, 'Docs', '${site('docs')}');
    const daily = await make('1', 'Daily');
    await make(daily.id, 'Notes', '${site('notes')}');
    await make(daily.id, 'Assistant', '${site('chat')}');
    await make(daily.id, 'Recipes', '${site('recipes')}');
    await make('1', 'News', '${site('news')}');
    localStorage.setItem('open', JSON.stringify(['1', work.id, daily.id]));
    localStorage.removeItem('last');
  })()`);
  await panel.send('Page.reload');
  await sleep(1500);
  await waitFor(() => panel.evaluate('document.querySelectorAll(".bm").length >= 7'));
  await sleep(800);
  const listShot = await capture(panel, PANEL.width, PANEL.height);

  const openBookmark = (title) =>
    panel.evaluate(`(() => {
      if (!document.body.classList.contains('list')) document.getElementById('menu').click();
      [...document.querySelectorAll('.bm')].find((a) => a.textContent.trim() === ${JSON.stringify(title)}).click();
    })()`);
  for (const title of ['Mailbox', 'Assistant', 'Notes']) {
    await openBookmark(title);
    await sleep(900);
  }
  const pageShot = await capture(panel, PANEL.width, PANEL.height);

  await panel.evaluate('document.getElementById("lang").click()');
  await panel.evaluate('document.getElementById("menu").click()');
  await sleep(600);
  const jaShot = await capture(panel, PANEL.width, PANEL.height);
  await panel.evaluate('document.getElementById("lang").click()');

  panel.close();
  await closeTarget(brave.port, panelId);

  await render(
    composite({
      panel: listShot,
      heading: 'Your bookmarks,<br>right in the side panel',
      lines: [
        'Folder tree with fast search',
        'Click to open the site inside the panel',
        'Keyboard navigation and screen reader support',
      ],
    }),
    1280,
    800,
    'screenshot-1.png',
  );
  await render(
    composite({
      panel: pageShot,
      heading: 'Browse without<br>leaving your tab',
      lines: [
        'Mobile layout that fits the narrow panel',
        'Back, forward, reload and open in a tab',
        'Sign-ins and site cookies work like a normal tab',
      ],
    }),
    1280,
    800,
    'screenshot-2.png',
  );
  await render(
    composite({
      panel: jaShot,
      heading: 'English and 日本語',
      lines: [
        'Switch the language from the header',
        'Settings for pages kept open and desktop sites',
        'No tracking, no remote code',
      ],
    }),
    1280,
    800,
    'screenshot-3.png',
  );
  await render(
    `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  font-family:system-ui,sans-serif;background:linear-gradient(135deg,#1a73e8,#4285f4);color:#fff}
img{width:88px;height:88px;filter:drop-shadow(0 6px 14px #0004)}
h1{margin:0;font-size:30px}p{margin:0;font-size:17px;opacity:.92}
</style></head><body><img src="data:image/png;base64,${iconData}"><h1>Sidepanel Bookmarks</h1>
<p>Open bookmarks in the side panel</p></body></html>`,
    440,
    280,
    'promo-small.png',
  );
} finally {
  await brave.close();
  server.close();
}
