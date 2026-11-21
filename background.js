import { applyRules, clearRules, RULE_IDS } from './rules.js';
import { getSettings } from './store.js';

const SCRIPT_IDS = ['tracker', 'spa', 'ua', 'cookie', 'unframe'];

const hostMatches = (hosts) => hosts.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);

function enableActionClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(enableActionClick);
chrome.runtime.onStartup.addListener(enableActionClick);

function contentScript(id, file, world, extra = {}) {
  return {
    id,
    js: [file],
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_start',
    world,
    persistAcrossSessions: false,
    ...extra,
  };
}

// すべてのスクリプトは location.ancestorOrigins を見て、パネル直下のフレーム以外では何もしない。
function contentScripts(settings) {
  const scripts = [
    contentScript('tracker', 'tracker.js', 'ISOLATED'),
    contentScript('spa', 'spa.js', 'MAIN'),
    contentScript('cookie', 'cookie-shim.js', 'MAIN'),
  ];
  if (settings.mobileUA) {
    const excludeMatches = hostMatches(settings.desktopHosts);
    scripts.push(
      contentScript('ua', 'ua.js', 'MAIN', excludeMatches.length ? { excludeMatches } : {}),
    );
  }
  return scripts;
}

// 登録していない ID を渡すと呼び出し全体が失敗するので、登録済みのものだけを外す
async function unregisterContentScripts() {
  const registered = await chrome.scripting.getRegisteredContentScripts().catch(() => []);
  const ids = registered.map((script) => script.id).filter((id) => SCRIPT_IDS.includes(id));
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
}

async function register(scripts) {
  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (error) {
    console.warn('Failed to register content scripts', error);
  }
}

async function enable() {
  const settings = await getSettings();
  await applyRules(settings);
  await unregisterContentScripts();
  await register(contentScripts(settings));
  // サイトの指定に問題があっても、ほかのスクリプトは登録されたままにする
  if (settings.unframedHosts.length) {
    await register([
      contentScript('unframe', 'unframe.js', 'MAIN', {
        matches: hostMatches(settings.unframedHosts),
      }),
    ]);
  }
  return settings;
}

async function disable() {
  await clearRules().catch(() => {});
  await unregisterContentScripts();
}

async function isEnabled() {
  const rules = await chrome.declarativeNetRequest.getSessionRules().catch(() => []);
  return rules.some((rule) => RULE_IDS.includes(rule.id));
}

let queue = Promise.resolve();

function serialize(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function reply(promise, sendResponse) {
  promise
    .then((settings) => sendResponse({ ok: true, settings }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
}

// #7: ルールとスクリプトはパネルが開いている間だけ有効にする。
// パネルは名前付きポートで接続し続ける。Service Worker が止まると切断されるが、
// パネルがすぐ再接続するので、切断が「最後のパネルが閉じた」ことを意味するのは
// Service Worker が生きている場合だけになる。
const panels = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  panels.add(port);
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (panels.size) return;
    serialize(async () => {
      if (!panels.size) await disable();
    });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'prepare') return reply(serialize(enable), sendResponse);

  if (message?.type === 'settings-changed') {
    // オプションページからの変更は、パネルが開いているときだけルールに反映する
    return reply(
      serialize(async () => ((await isEnabled()) ? enable() : getSettings())),
      sendResponse,
    );
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-list') return;
  let windowId;
  try {
    windowId = (await chrome.windows.getCurrent()).id;
    await chrome.sidePanel.open({ windowId });
  } catch {
    // パネルを開けない環境でも、開いているパネルには通知する
  }
  chrome.runtime.sendMessage({ type: 'toggle-list', windowId }).catch(() => {
    // パネルが開いていない
  });
});
