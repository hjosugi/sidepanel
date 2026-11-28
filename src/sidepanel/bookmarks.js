import { t } from '../shared/i18n.js';
import { readLocal, writeLocal } from '../shared/store.js';
import { iconSources, toUrl, webSearchUrl } from '../shared/urls.js';
import { createTreeNavigation } from './tree-navigation.js';

const SEARCH_PAGE = 200;
// 開いているタブのフォルダ。ブックマークの ID は数字なので重ならない
const TABS_ID = 'tabs';

export function createBookmarks({ tabs, onOpen, getSearchEngine }) {
  const q = document.getElementById('q');
  const webSearch = document.getElementById('web-search');
  const tree = document.getElementById('tree');
  const empty = document.getElementById('empty');
  const status = document.getElementById('status');
  const bmTemplate = document.getElementById('bm-template');
  const folderTemplate = document.getElementById('folder-template');
  const navigation = createTreeNavigation(tree, q);

  const expanded = new Set((readLocal('open', ['1']) ?? ['1']).map(String));
  let dirty = true;
  let renderSeq = 0;
  let renderedQuery = '';
  const rootCache = new Map();
  let timer;
  let tabsTimer;
  let tabsOpen = readLocal('tabsOpen', true) !== false;
  tabs.onChange(scheduleTabsRender);

  const visible = () => document.body.classList.contains('list');

  function announce(message) {
    status.textContent = message;
  }

  function persistExpanded() {
    writeLocal('open', [...expanded]);
  }

  function item(node) {
    if (node.url) {
      const a = bmTemplate.content.firstElementChild.cloneNode(true);
      a.dataset.id = node.id;
      updateBookmarkElement(a, node);
      return a;
    }

    const d = folderTemplate.content.firstElementChild.cloneNode(true);
    d.dataset.id = node.id;
    d.open = expanded.has(node.id);
    const summary = d.firstElementChild;
    summary.querySelector('span').textContent = node.title || t('bookmark.folder');
    summary.setAttribute('aria-expanded', String(d.open));
    return d;
  }

  function byId(id) {
    return tree.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  }

  function folderEl(id) {
    const el = byId(id);
    return el?.tagName === 'DETAILS' ? el : null;
  }

  function folderChildren(container) {
    return [...container.children].filter((el) => el.tagName !== 'SUMMARY');
  }

  function updateBookmarkElement(el, node) {
    el.querySelector('span').textContent = node.title || node.url;
    if (/^javascript:/i.test(node.url)) {
      el.removeAttribute('href');
      el.classList.add('unsupported');
      el.setAttribute('aria-disabled', 'true');
      el.title = `${node.title}\n${t('bookmark.unsupported')}`;
    } else {
      el.href = node.url;
      el.classList.remove('unsupported');
      el.removeAttribute('aria-disabled');
      el.title = `${node.title}\n${node.url}`;
    }
    Object.assign(el.querySelector('img'), iconSources(node.url));
  }

  function tabItem(tab) {
    const a = bmTemplate.content.firstElementChild.cloneNode(true);
    a.classList.add('tab');
    a.dataset.tabId = String(tab.id);
    a.href = tab.url;
    a.title = `${tab.title}\n${tab.url}`;
    a.querySelector('span').textContent = tab.title || tab.url;
    Object.assign(a.querySelector('img'), iconSources(tab.url));
    return a;
  }

  function fillTabsFolder(d, list) {
    for (const el of folderChildren(d)) el.remove();
    d.querySelector(':scope > summary .count').textContent = String(list.length);
    d.append(...list.map(tabItem));
  }

  /** 検索中は常に開く。開閉の状態は検索していないときだけ覚える */
  function tabsFolder(list, open = tabsOpen) {
    const d = folderTemplate.content.firstElementChild.cloneNode(true);
    d.dataset.id = TABS_ID;
    d.dataset.loaded = '1';
    d.classList.add('tabs');
    d.open = open;
    const summary = d.firstElementChild;
    summary.querySelector('span').textContent = t('tabs.folder');
    const count = document.createElement('span');
    count.className = 'count';
    summary.append(count);
    summary.setAttribute('aria-expanded', String(d.open));
    fillTabsFolder(d, list);
    return d;
  }

  function updateEmpty() {
    const hasRows = Boolean(tree.querySelector('summary, .bm'));
    tree.hidden = !hasRows;
    empty.hidden = hasRows;
    empty.textContent = q.value.trim() ? t('empty.search') : t('empty.none');
  }

  async function loadFolder(d) {
    if (d.dataset.loaded) return;
    d.dataset.loaded = '1';
    const id = d.dataset.id;
    let children;
    try {
      children = rootCache.get(id) ?? (await chrome.bookmarks.getChildren(id));
    } catch {
      delete d.dataset.loaded;
      expanded.delete(id);
      persistExpanded();
      d.open = false;
      return;
    }
    rootCache.delete(id);
    if (!d.isConnected) return;
    d.append(...children.map(item));
    loadOpenFolders(d);
    navigation.reset();
    updateEmpty();
  }

  function loadOpenFolders(root = tree) {
    for (const d of root.querySelectorAll('details[open]:not([data-loaded])')) loadFolder(d);
  }

  function renderSearch(hits, tabHits) {
    let shown = Math.min(hits.length, SEARCH_PAGE);
    tree.replaceChildren(
      ...(tabHits.length ? [tabsFolder(tabHits, true)] : []),
      ...hits.slice(0, shown).map(item),
    );
    if (shown === hits.length) return;

    const more = document.createElement('button');
    more.id = 'more';
    more.type = 'button';
    function updateCount() {
      more.textContent = t('search.more', { count: hits.length - shown });
    }
    more.addEventListener('click', () => {
      const next = hits.slice(shown, shown + SEARCH_PAGE).map(item);
      more.before(...next);
      shown += next.length;
      if (shown < hits.length) updateCount();
      else {
        if (document.activeElement === more) {
          next.find((el) => !el.classList.contains('unsupported'))?.focus();
        }
        more.remove();
      }
      navigation.reset();
    });
    updateCount();
    tree.append(more);
  }

  async function getRootFolders() {
    const roots = await chrome.bookmarks.getChildren('0').catch(() => []);
    return Promise.all(
      roots.map(async (root) => ({
        root,
        children: await chrome.bookmarks.getChildren(root.id).catch(() => []),
      })),
    );
  }

  async function render() {
    const seq = ++renderSeq;
    const query = q.value.trim();
    const scroll = tree.scrollTop;
    rootCache.clear();

    if (query) {
      const [hits, tabHits] = await Promise.all([
        chrome.bookmarks
          .search(query)
          .then((nodes) => nodes.filter((node) => node.url))
          .catch(() => []),
        tabs.search(query),
      ]);
      if (seq !== renderSeq || query !== q.value.trim()) return;
      renderSearch(hits, tabHits);
      announce(t('search.count', { count: hits.length + tabHits.length }));
    } else {
      const [folders, openTabs] = await Promise.all([getRootFolders(), tabs.list()]);
      if (seq !== renderSeq || q.value.trim()) return;
      const shown = [];
      for (const { root, children } of folders) {
        if (!children.length) continue;
        rootCache.set(root.id, children);
        shown.push(item(root));
      }
      tree.replaceChildren(...(openTabs.length ? [tabsFolder(openTabs)] : []), ...shown);
      loadOpenFolders();
    }

    renderedQuery = query;
    updateEmpty();
    tree.scrollTop = scroll;
    navigation.reset();
  }

  function scheduleRender() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!visible()) {
        dirty = true;
        return;
      }
      render();
    }, 150);
  }

  // タブはよく変わるので、検索していなければタブのフォルダだけ作り直す
  function scheduleTabsRender() {
    clearTimeout(tabsTimer);
    tabsTimer = setTimeout(() => {
      if (!visible()) {
        dirty = true;
        return;
      }
      if (q.value.trim()) render();
      else renderTabs();
    }, 150);
  }

  async function renderTabs() {
    const seq = renderSeq;
    const openTabs = await tabs.list();
    if (seq !== renderSeq || q.value.trim()) return;
    const d = tree.querySelector(`:scope > details[data-id="${TABS_ID}"]`);
    if (!openTabs.length) d?.remove();
    else if (d) fillTabsFolder(d, openTabs);
    else tree.prepend(tabsFolder(openTabs));
    navigation.reset();
    updateEmpty();
  }

  function invalidateFolder(id) {
    const d = folderEl(id);
    if (!d) return;
    delete d.dataset.loaded;
    for (const el of folderChildren(d)) el.remove();
  }

  async function refreshFolder(id) {
    if (id === '0' || id === undefined) {
      scheduleRender();
      return;
    }
    const d = folderEl(id);
    if (!d) return;
    if (!d.open) {
      invalidateFolder(id);
      return;
    }
    if (!d.dataset.loaded) return;
    const seq = renderSeq;
    let children;
    try {
      children = await chrome.bookmarks.getChildren(id);
    } catch {
      expanded.delete(id);
      persistExpanded();
      d.open = false;
      return;
    }
    if (seq !== renderSeq || !d.isConnected) return;
    for (const el of folderChildren(d)) el.remove();
    d.append(...children.map(item));
    loadOpenFolders(d);
    navigation.reset();
    updateEmpty();
  }

  chrome.bookmarks.onCreated.addListener((_id, node) => {
    rootCache.clear();
    if (!visible() || q.value.trim()) {
      dirty = true;
      return;
    }
    if (node.parentId === '0' || node.parentId === undefined) {
      scheduleRender();
      return;
    }
    const d = folderEl(node.parentId);
    if (!d) {
      scheduleRender();
      return;
    }
    if (!d.open) {
      invalidateFolder(node.parentId);
      return;
    }
    if (!d.dataset.loaded) {
      loadFolder(d);
      return;
    }
    if (typeof node.index !== 'number') {
      refreshFolder(node.parentId);
      return;
    }
    const children = folderChildren(d);
    d.insertBefore(item(node), children[node.index] ?? null);
    navigation.reset();
    updateEmpty();
  });

  chrome.bookmarks.onRemoved.addListener((id) => {
    rootCache.clear();
    const removed = byId(id);
    if (removed) {
      for (const nested of removed.querySelectorAll('[data-id]'))
        expanded.delete(nested.dataset.id);
    }
    expanded.delete(String(id));
    persistExpanded();
    if (!visible() || q.value.trim()) {
      dirty = true;
      return;
    }
    if (!removed) return;
    const root = removed.closest('#tree > details');
    removed.remove();
    if (root && !root.querySelector('.bm, details')) root.remove();
    navigation.reset();
    updateEmpty();
  });

  chrome.bookmarks.onChanged.addListener(async (id) => {
    rootCache.clear();
    if (!visible() || q.value.trim()) {
      dirty = true;
      return;
    }
    const el = byId(id);
    if (!el) return;
    let node;
    try {
      [node] = await chrome.bookmarks.get(id);
    } catch {
      return;
    }
    if (el.tagName === 'DETAILS') {
      el.querySelector('summary span').textContent = node.title || t('bookmark.folder');
    } else {
      updateBookmarkElement(el, node);
      navigation.reset();
    }
  });

  chrome.bookmarks.onMoved.addListener((_id, info) => {
    rootCache.clear();
    if (!visible() || q.value.trim()) {
      dirty = true;
      return;
    }
    refreshFolder(info.parentId);
    if (info.oldParentId !== info.parentId) refreshFolder(info.oldParentId);
  });

  chrome.bookmarks.onChildrenReordered.addListener((id) => {
    rootCache.clear();
    if (!visible() || q.value.trim()) {
      dirty = true;
      return;
    }
    refreshFolder(id);
  });

  chrome.bookmarks.onImportEnded.addListener(() => {
    rootCache.clear();
    dirty = false;
    if (visible()) render();
    else dirty = true;
  });

  tree.addEventListener(
    'toggle',
    (event) => {
      const d = event.target;
      if (d.tagName !== 'DETAILS') return;
      const id = d.dataset.id;
      const summary = d.querySelector(':scope > summary');
      summary?.setAttribute('aria-expanded', String(d.open));
      if (id === TABS_ID) {
        if (!q.value.trim()) {
          tabsOpen = d.open;
          writeLocal('tabsOpen', tabsOpen);
        }
        return;
      }
      if (d.open) expanded.add(id);
      else expanded.delete(id);
      persistExpanded();
      if (d.open) loadFolder(d);
    },
    true,
  );

  tree.addEventListener(
    'click',
    (event) => {
      const more = event.target.closest('#more');
      if (more) return;
      const a = event.target.closest('.bm');
      if (!a || a.classList.contains('unsupported')) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        // タブは新しいタブで開き直さず、そのタブに切り替える
        if (a.dataset.tabId) {
          event.preventDefault();
          tabs.activate(Number(a.dataset.tabId));
        }
        return;
      }
      event.preventDefault();
      onOpen(a.href, a.querySelector('span').textContent, { force: Boolean(a.dataset.tabId) });
    },
    true,
  );

  tree.addEventListener('auxclick', (event) => {
    const a = event.target.closest('.bm.tab');
    if (!a || event.button !== 1) return;
    event.preventDefault();
    tabs.activate(Number(a.dataset.tabId));
  });

  function updateWebSearch() {
    const query = q.value.trim();
    webSearch.hidden = !query;
    webSearch.querySelector('span').textContent = t('search.web', {
      engine: getSearchEngine(),
      query,
    });
  }

  webSearch.addEventListener('click', () => {
    const query = q.value.trim();
    if (query) onOpen(webSearchUrl(query, getSearchEngine()), '', { force: true });
  });
  q.addEventListener('input', () => {
    updateWebSearch();
    scheduleRender();
  });
  q.addEventListener('keydown', async (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigation.firstRow()?.focus();
    } else if (event.key === 'Enter' && !event.isComposing) {
      const query = q.value.trim();
      if (!query) return;
      event.preventDefault();
      if (renderedQuery !== query) {
        clearTimeout(timer);
        await render();
      }
      if (!visible() || q.value.trim() !== query || renderedQuery !== query) return;
      const first = tree.querySelector('.bm:not(.unsupported)');
      // 一致するものがなく、URL として読めるならそのページを開く
      const url = first ? null : toUrl(query);
      if (first) {
        first.click();
      } else if (url) {
        onOpen(url, '', { force: true });
      }
    }
  });

  return {
    updateWebSearch,
    onListShown() {
      if (dirty) {
        dirty = false;
        render();
      } else {
        navigation.reset();
      }
    },
    updateLanguage() {
      updateWebSearch();
      if (visible()) render();
      else dirty = true;
    },
  };
}
