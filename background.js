import { applyRules } from './rules.js';
import { getSettings } from './store.js';

const SCRIPT_IDS = ['tracker', 'spa', 'ua', 'cookie'];

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function registerContentScripts(settings) {
  await chrome.scripting.unregisterContentScripts({ ids: SCRIPT_IDS }).catch(() => {});

  const scripts = [
    {
      id: 'tracker',
      js: ['tracker.js'],
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start',
      world: 'ISOLATED',
      persistAcrossSessions: false,
    },
    {
      id: 'spa',
      js: ['spa.js'],
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: false,
    },
    {
      id: 'cookie',
      js: ['cookie-shim.js'],
      matches: ['<all_urls>'],
      allFrames: true,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: false,
    },
  ];

  if (settings.mobileUA) {
    const excludeMatches = settings.desktopHosts
      .filter((host) => /^[a-z0-9.-]+$/i.test(host))
      .flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
    scripts.push({
      id: 'ua',
      js: ['ua.js'],
      matches: ['<all_urls>'],
      ...(excludeMatches.length ? { excludeMatches } : {}),
      allFrames: true,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: false,
    });
  }

  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (error) {
    console.warn('Failed to register content scripts', error);
  }
}

let queue = Promise.resolve();

function serialize(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function prepare() {
  const settings = await getSettings();
  await applyRules(settings);
  await registerContentScripts(settings);
  return settings;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'prepare') {
    serialize(prepare)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === 'settings-changed') {
    serialize(async () => {
      const settings = await getSettings();
      await applyRules(settings);
      await registerContentScripts(settings);
      return settings;
    })
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
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
  try {
    await chrome.runtime.sendMessage({ type: 'toggle-list', windowId });
  } catch {
    // パネルが開いていない
  }
});
