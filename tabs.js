// パネルがあるウィンドウで開いているタブ。<all_urls> のホスト権限があるので、
// tabs 権限なしで http(s) のタブの URL とタイトルを読める。

export function createTabs() {
  let windowId = null;
  const ready = chrome.windows
    .getCurrent()
    .then((window) => {
      windowId = window.id;
    })
    .catch(() => {});

  async function list(filter = {}) {
    await ready;
    let tabs = [];
    try {
      const scope = windowId === null ? { currentWindow: true } : { windowId };
      tabs = await chrome.tabs.query({ ...scope, ...filter });
    } catch {
      tabs = [];
    }
    return tabs
      .filter((tab) => /^https?:/i.test(tab.url ?? ''))
      .map(({ id, url, title }) => ({ id, url, title: title || '' }));
  }

  async function current() {
    const [tab] = await list({ active: true });
    return tab ?? null;
  }

  async function open(url) {
    await ready;
    if (windowId === null || !/^https?:\/\//i.test(url)) throw new Error('No web tab destination');
    return chrome.tabs.create({ windowId, url, active: true });
  }

  /** chrome.bookmarks.search と同じく、すべての語を含むタブを返す。 */
  async function search(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (await list()).filter((tab) => {
      const text = `${tab.title}\n${tab.url}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }

  async function activate(id) {
    try {
      const tab = await chrome.tabs.update(id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      // タブがもうない
    }
  }

  function onChange(notify) {
    const mine = (id) => id === windowId;
    chrome.tabs.onCreated.addListener((tab) => mine(tab.windowId) && notify());
    chrome.tabs.onRemoved.addListener((_id, info) => mine(info.windowId) && notify());
    chrome.tabs.onMoved.addListener((_id, info) => mine(info.windowId) && notify());
    chrome.tabs.onAttached.addListener((_id, info) => mine(info.newWindowId) && notify());
    chrome.tabs.onDetached.addListener((_id, info) => mine(info.oldWindowId) && notify());
    chrome.tabs.onUpdated.addListener((_id, info, tab) => {
      if (mine(tab.windowId) && ('url' in info || 'title' in info)) notify();
    });
  }

  return { list, current, open, search, activate, onChange };
}
