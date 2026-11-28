import { getSettings, readLocal } from '../shared/store.js';
import { createBookmarks } from './bookmarks.js';
import { createTabs } from './tabs.js';
import { createViewer } from './viewer.js';

// バックグラウンドはこの接続がある間だけパネル用のルールを有効にする（#7）。
// Service Worker が止まると切断されるので、つなぎ直す。
function connect() {
  chrome.runtime
    .connect({ name: 'panel' })
    .onDisconnect.addListener(() => setTimeout(connect, 1000));
}
connect();

const prepared = await Promise.race([
  chrome.runtime.sendMessage({ type: 'prepare' }).catch(() => null),
  new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
]);
const settings = prepared?.settings ?? (await getSettings());

let viewer;
const tabs = createTabs();
const bookmarks = createBookmarks({
  tabs,
  getSearchEngine: () => viewer.settings.searchEngine,
  onOpen: (url, name, options) => viewer.openUrl(url, name, options),
});

viewer = createViewer({
  settings,
  tabs,
  onListShown: () => bookmarks.onListShown(),
  onLanguageChange: () => bookmarks.updateLanguage(),
  onSearchEngineChange: bookmarks.updateWebSearch,
});

// ホームページのように、パネルを開いたときに表示するものを設定で選べる
const last = readLocal('last', null);
if (settings.startup === 'url' && settings.startUrl) viewer.openUrl(settings.startUrl);
else if (settings.startup === 'last' && last?.url) viewer.openUrl(last.url, last.name ?? '');
if (viewer.isListOpen()) viewer.showList(true);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'toggle-list') return;
  chrome.windows.getCurrent((window) => {
    if (!message.windowId || message.windowId === window.id) viewer.toggleList();
  });
});
