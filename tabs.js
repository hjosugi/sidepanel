// パネルがあるウィンドウで開いているタブ。<all_urls> のホスト権限があるので、
// tabs 権限なしで http(s) のタブの URL とタイトルを読める。

export function createTabs({ onChange }) {
  let windowId = null;
  const ready = chrome.windows
    .getCurrent()
    .then((window) => {
      windowId = window.id;
    })
    .catch(() => {});

  async function list() {
    await ready;
    let tabs = [];
    try {
      tabs = await chrome.tabs.query(windowId === null ? { currentWindow: true } : { windowId });
    } catch {
      tabs = [];
    }
    return tabs
      .filter((tab) => /^https?:/i.test(tab.url ?? ''))
      .map(({ id, url, title }) => ({ id, url, title: title || '' }));
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

  const mine = (id) => id === windowId;
  chrome.tabs.onCreated.addListener((tab) => mine(tab.windowId) && onChange());
  chrome.tabs.onRemoved.addListener((_id, info) => mine(info.windowId) && onChange());
  chrome.tabs.onMoved.addListener((_id, info) => mine(info.windowId) && onChange());
  chrome.tabs.onAttached.addListener((_id, info) => mine(info.newWindowId) && onChange());
  chrome.tabs.onDetached.addListener((_id, info) => mine(info.oldWindowId) && onChange());
  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (mine(tab.windowId) && ('url' in info || 'title' in info)) onChange();
  });

  return { list, search, activate };
}
