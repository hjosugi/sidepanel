import { createAddressBar } from './address.js';
import { createCookieBridge } from './cookies.js';
import { createDock } from './dock.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { watchPanelFrames } from './net.js';
import { MAX_PINS, normalizeSettings, reorderPins, setSettings, writeLocal } from './store.js';
import { displayUrl, hostOf, matchPin } from './urls.js';
import { stepZoom, ZOOM_LEVELS, zoomFor, zoomPercent } from './zoom.js';

const LOGIN_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'signin.aws.amazon.com',
];
const ALLOW =
  'autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture; ' +
  'microphone; camera; geolocation; display-capture; web-share; screen-wake-lock; storage-access; ' +
  'publickey-credentials-get; publickey-credentials-create';

function isLoginHost(host) {
  return LOGIN_HOSTS.some((login) => host === login || host.endsWith(`.${login}`));
}

export function createViewer({
  settings: initialSettings,
  tabs,
  onListShown,
  onLanguageChange,
  onSearchEngineChange,
}) {
  const frames = document.getElementById('frames');
  const q = document.getElementById('q');
  const pin = document.getElementById('pin');
  const notice = document.getElementById('notice');
  const noticeText = document.getElementById('notice-text');
  const noticeOpen = document.getElementById('notice-open');
  const noticeDesktop = document.getElementById('notice-desktop');
  const noticeClose = document.getElementById('notice-close');
  const menu = document.getElementById('menu');
  const back = document.getElementById('back');
  const fwd = document.getElementById('fwd');
  const reload = document.getElementById('reload');
  const popout = document.getElementById('popout');
  const moveToTab = document.getElementById('move-to-tab');
  const closeTab = document.getElementById('menu-close-page');
  const actionError = document.getElementById('action-error');
  const ua = document.getElementById('ua');
  const langButton = document.getElementById('lang');
  const langValue = document.getElementById('lang-value');
  const overflow = document.getElementById('overflow');
  const overflowMenu = document.getElementById('overflow-menu');
  const zoomOut = document.getElementById('zoom-out');
  const zoomIn = document.getElementById('zoom-in');
  const zoomReset = document.getElementById('zoom-reset');

  let settings = initialSettings;
  const pages = new Map();
  const cookieBridge = createCookieBridge({ getPages: () => [...pages.values()] });
  let activeId = null;
  let nextId = 1;
  let clock = 0;
  let busyTimer;

  setLang(settings.lang ?? getLang());

  function active() {
    return pages.get(activeId) ?? null;
  }

  function isListOpen() {
    return document.body.classList.contains('list');
  }

  function setBusy(on) {
    clearTimeout(busyTimer);
    document.body.classList.toggle('busy', on);
    if (on) busyTimer = setTimeout(() => document.body.classList.remove('busy'), 15000);
    announce(on ? t('status.loading') : '');
  }

  function announce(message) {
    const status = document.getElementById('status');
    if (status) status.textContent = message;
  }

  function pageText(page) {
    return page.title || page.name || displayUrl(page.url) || t('page.untitled');
  }

  const address = createAddressBar({
    input: document.getElementById('address'),
    getSearchEngine: () => settings.searchEngine,
    onOpen: (url) => openUrl(url, '', { force: true }),
  });

  const dock = createDock({
    element: document.getElementById('dock'),
    onSelectPage(page) {
      setActive(page);
      showList(false);
    },
    onOpenPin: (item) => openUrl(item.url, item.name),
    onClosePage: closePage,
    onTogglePin: togglePin,
    onNewTab: () => showList(true),
    async onMovePin(from, to) {
      settings = await setSettings(({ pins }) => ({ pins: reorderPins(pins, from, to) }));
      updateDock();
    },
  });

  function updateAddress() {
    const page = active();
    address.update(page?.url ?? '');
    if (page) page.iframe.title = pageText(page) || t('app.name');
  }

  function updateDock() {
    dock.render({
      pins: settings.pins,
      pages: [...pages.values()],
      current: isListOpen() ? null : active(),
      label: pageText,
    });
  }

  function updateTitle(page) {
    if (page && page === active()) updateAddress();
  }

  function isDesktopHost(host) {
    return settings.desktopHosts.some((saved) => host === saved || host.endsWith(`.${saved}`));
  }

  function isMobileLayout(page) {
    const host = hostOf(page.url);
    return settings.mobileUA && Boolean(host) && !isDesktopHost(host);
  }

  function updateToolbar() {
    address.updateLabels();
    const page = active();
    back.disabled = !page?.canGoBack;
    fwd.disabled = !page?.canGoForward;
    reload.disabled = !page;
    popout.disabled = !page;
    moveToTab.disabled = !page || page.moving;
    closeTab.disabled = !page;
    ua.hidden = !page || !settings.mobileUA;
    ua.disabled = ua.hidden;
    if (page) {
      const desktop = isDesktopHost(hostOf(page.url));
      ua.dataset.mode = desktop ? 'desktop' : 'mobile';
      const label = t(desktop ? 'desktop.label' : 'mobile.label');
      ua.title = label;
      ua.setAttribute('aria-label', label);
    }
    const pinned = Boolean(page && matchPin(settings.pins, page.url));
    pin.disabled = !page || (!pinned && settings.pins.length >= MAX_PINS);
    pin.setAttribute('aria-pressed', String(pinned));
    pin.title = t(pinned ? 'pin.remove' : 'pin.add');
    pin.setAttribute('aria-label', pin.title);
    const listOpen = isListOpen();
    // 表示するページがなければ一覧は閉じられない
    menu.disabled = listOpen && !page;
    menu.setAttribute('aria-expanded', String(listOpen));
    menu.title = t(listOpen ? 'list.close' : 'list.open');
    menu.setAttribute('aria-label', menu.title);
    langValue.textContent = getLang().toUpperCase();
    langButton.setAttribute('aria-label', `${t('lang.label')}: ${getLang().toUpperCase()}`);
    updateZoomControls();
  }

  function pageZoom(page) {
    return zoomFor(hostOf(page.url), settings);
  }

  // iframe の CSS zoom はブラウザのズームと同じく、ページの表示幅と devicePixelRatio を変える
  function applyZoom(page) {
    const level = pageZoom(page);
    page.iframe.style.zoom = level === 1 ? '' : String(level);
  }

  function updateZoomControls() {
    const page = active();
    const level = page ? pageZoom(page) : settings.zoom;
    zoomReset.textContent = zoomPercent(level);
    zoomReset.title = t('zoom.reset', { percent: zoomPercent(settings.zoom) });
    zoomReset.setAttribute(
      'aria-label',
      `${t('zoom.label')} ${zoomPercent(level)}. ${zoomReset.title}`,
    );
    zoomReset.disabled = !page || level === settings.zoom;
    zoomOut.disabled = !page || level === ZOOM_LEVELS[0];
    zoomIn.disabled = !page || level === ZOOM_LEVELS.at(-1);
  }

  /** 表示中のサイトの倍率を変えて覚える。既定と同じならサイトごとの設定を消す */
  async function setSiteZoom(level) {
    const page = active();
    const host = page && hostOf(page.url);
    if (!host) return;
    const siteZoom = { ...settings.siteZoom };
    if (level === settings.zoom) delete siteZoom[host];
    else siteZoom[host] = level;
    settings = await setSettings({ siteZoom });
    for (const other of pages.values()) applyZoom(other);
    updateZoomControls();
    announce(`${t('zoom.label')} ${zoomPercent(level)}`);
  }

  function updateNotice() {
    const page = active();
    const kind = page?.notice;
    if (!kind) {
      notice.hidden = true;
      return;
    }
    notice.hidden = false;
    const params = kind === 'http' ? { status: page.httpStatus ?? '' } : {};
    // Cloudflare のチャレンジはモバイル UA では通らない（#17）。デスクトップ表示への切り替えを案内する
    const mobileChallenge = kind === 'challenge' && isMobileLayout(page);
    noticeText.textContent = t(
      mobileChallenge ? 'notice.challengeMobile' : `notice.${kind}`,
      params,
    );
    noticeDesktop.hidden = !mobileChallenge;
    noticeOpen.hidden = kind === 'unsupported';
  }

  function setNotice(page, kind, extra = {}) {
    page.notice = kind;
    page.httpStatus = extra.status;
    if (page === active()) updateNotice();
  }

  function clearNotice(page) {
    page.notice = null;
    if (page === active()) updateNotice();
  }

  function saveLast(page) {
    writeLocal('last', { url: page.url, name: page.name });
  }

  function setActive(page) {
    actionError.hidden = true;
    activeId = page.id;
    page.lastUsed = ++clock;
    for (const other of pages.values()) other.iframe.hidden = other !== page;
    updateAddress();
    updateToolbar();
    updateNotice();
    updateDock();
    saveLast(page);
  }

  function evict(page) {
    page.iframe.remove();
    pages.delete(page.id);
    if (page.id === activeId) activeId = null;
    updateDock();
  }

  function closePage(page) {
    const wasActive = page.id === activeId;
    evict(page);
    if (!wasActive) return;
    const next = [...pages.values()].sort((a, b) => b.lastUsed - a.lastUsed)[0];
    if (next) {
      setActive(next);
      return;
    }
    writeLocal('last', null);
    updateAddress();
    updateNotice();
    showList(true);
  }

  // 表示中のページは、他に候補がない場合（上限 1 で新しいページを開くとき）だけ破棄する。
  function trimPages(limit) {
    while (pages.size > limit) {
      const others = [...pages.values()].filter((page) => page.id !== activeId);
      const pool = others.length ? others : [...pages.values()];
      evict(pool.sort((a, b) => a.lastUsed - b.lastUsed)[0]);
    }
  }

  function createPage() {
    trimPages(settings.maxPages - 1);
    const iframe = document.createElement('iframe');
    iframe.allow = ALLOW;
    iframe.title = t('app.name');
    iframe.hidden = true;
    frames.append(iframe);
    const page = {
      id: nextId++,
      iframe,
      url: '',
      name: '',
      title: '',
      canGoBack: false,
      canGoForward: false,
      lastUsed: 0,
      notice: null,
      httpStatus: null,
      failedUrl: '',
    };
    pages.set(page.id, page);
    iframe.addEventListener('load', () => {
      iframe.classList.add('loaded');
      if (page === active()) setBusy(false);
    });
    return page;
  }

  function reusablePage(url) {
    let target;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    for (const page of pages.values()) {
      let current;
      try {
        current = new URL(page.url);
      } catch {
        continue;
      }
      if (current.origin === target.origin) return page;
    }
    return null;
  }

  function shouldNavigate(page, url) {
    try {
      const target = new URL(url);
      const current = new URL(page.url);
      const normalize = (value) => value.replace(/\/$/, '') || '/';
      const targetPath = normalize(target.pathname);
      const currentPath = normalize(current.pathname);
      if (target.href.replace(/#.*$/, '') === current.href.replace(/#.*$/, '')) return false;
      if (targetPath === '/') return false;
      if (currentPath.startsWith(targetPath)) {
        return (
          targetPath === currentPath && Boolean(target.search) && target.search !== current.search
        );
      }
      return true;
    } catch {
      return true;
    }
  }

  function navigate(page, url, name = '') {
    page.url = url;
    page.name = name;
    page.title = '';
    page.notice = null;
    page.httpStatus = null;
    page.failedUrl = '';
    page.canGoBack = false;
    page.canGoForward = false;
    page.iframe.classList.remove('loaded');
    applyZoom(page);
    page.iframe.src = url;
    page.iframe.title = t('app.name');
    setBusy(true);
    setActive(page);
  }

  /** force: 同じサイトのページがあっても、このURLへ移動する（アドレス欄からの入力） */
  function openUrl(url, name = '', { force = false } = {}) {
    if (!/^https?:/i.test(url)) {
      if (/^javascript:/i.test(url)) {
        const page = active();
        if (page) {
          setNotice(page, 'unsupported');
        } else {
          notice.hidden = false;
          noticeText.textContent = t('notice.unsupported');
          noticeOpen.hidden = true;
        }
        return;
      }
      chrome.tabs.create({ url }).catch(() => {});
      return;
    }

    const page = reusablePage(url);
    if (page) {
      if (force || (page.url !== url && shouldNavigate(page, url))) {
        navigate(page, url, name);
      } else {
        if (name) page.name = name;
        setActive(page);
      }
      showList(false);
      return;
    }
    navigate(createPage(), url, name);
    showList(false);
  }

  function showList(on) {
    if (!active()) on = true;
    actionError.hidden = true;
    document.body.classList.toggle('list', on);
    updateToolbar();
    updateDock();
    if (on) {
      q.focus();
      onListShown?.();
    } else {
      active()?.iframe.focus();
    }
  }

  function toggleList() {
    showList(!isListOpen());
  }

  function command(name) {
    const page = active();
    if (!page) return;
    postToPage(page, { type: 'command', command: name });
  }

  function reloadActive() {
    const page = active();
    if (!page) return;
    if (page.notice === 'http' || page.notice === 'error') {
      page.iframe.src = page.url;
      setBusy(true);
      clearNotice(page);
    } else {
      command('reload');
    }
  }

  function handlePage(page, data) {
    if (data.type === 'page') {
      page.url = data.url || page.url;
      page.title = data.title || '';
      page.canGoBack = Boolean(data.canGoBack);
      page.canGoForward = Boolean(data.canGoForward);
      const host = hostOf(page.url);
      if (isLoginHost(host)) {
        setNotice(page, 'login');
      } else if (data.challenge) {
        setNotice(page, 'challenge');
      } else if (page.failedUrl && page.failedUrl === page.url) {
        // 403 などのエラーページ自体が読み込まれた場合は表示を残す
      } else {
        clearNotice(page);
      }
      applyZoom(page);
      updateDock();
      if (page === active()) {
        updateTitle(page);
        updateToolbar();
        saveLast(page);
      }
      return;
    }
    if (data.type === 'loading') {
      page.iframe.classList.remove('loaded');
      if (page === active()) setBusy(true);
      return;
    }
    if (data.type === 'loaded') {
      page.iframe.classList.add('loaded');
      if (page === active()) setBusy(false);
    }
  }

  addEventListener('message', (event) => {
    for (const page of pages.values()) {
      if (page.iframe.contentWindow === event.source) {
        const data = event.data;
        if (data?.__sidepanel !== 1) return;
        if (cookieBridge.handle(event, page)) return;
        handlePage(page, data);
        return;
      }
    }
  });

  function pageForUrl(url) {
    return [...pages.values()].find((page) => page.url === url || page.failedUrl === url) ?? null;
  }

  function postToPage(page, message) {
    try {
      page.iframe.contentWindow.postMessage({ __sidepanel: 1, ...message }, '*');
    } catch {
      // フレームがまだない
    }
  }

  watchPanelFrames({
    onNestedBlocked(url) {
      for (const page of pages.values()) postToPage(page, { type: 'nested-blocked', url });
    },
    onHttpError(url, status) {
      const page = pageForUrl(url);
      if (!page) return;
      page.failedUrl = url;
      page.url = url;
      setNotice(page, 'http', { status });
      if (page === active()) setBusy(false);
    },
    onNetworkError(url) {
      const page = pageForUrl(url);
      if (!page) return;
      page.failedUrl = url;
      setNotice(page, 'error');
      if (page === active()) setBusy(false);
    },
  });

  menu.addEventListener('click', toggleList);

  async function togglePin(page, current) {
    if (!current && !page) return;
    const pin = current ?? { url: page.url, name: pageText(page) };
    settings = await setSettings(({ pins }) => {
      if (current) return { pins: pins.filter((item) => item.url !== pin.url) };
      if (pins.length >= MAX_PINS || matchPin(pins, pin.url)) return {};
      return { pins: [...pins, pin] };
    });
    updateToolbar();
    updateDock();
    if (current || matchPin(settings.pins, pin.url)) {
      announce(t(current ? 'pin.removed' : 'pin.added'));
    }
  }

  pin.addEventListener('click', () => {
    const page = active();
    if (page) togglePin(page, matchPin(settings.pins, page.url));
  });

  const openOptions = () => chrome.runtime.openOptionsPage().catch(() => {});
  document.getElementById('settings').addEventListener('click', openOptions);

  // ⋯ メニュー。項目を選んだら閉じる（ズームは続けて押せるよう開いたまま）
  const closeMenu = () => {
    if (overflowMenu.matches(':popover-open')) overflowMenu.hidePopover();
  };
  overflowMenu.addEventListener('toggle', (event) => {
    overflow.setAttribute('aria-expanded', String(event.newState === 'open'));
  });
  // パネル内のページを押すとフォーカスが iframe に移る。そのクリックは popover に届かない
  addEventListener('blur', closeMenu);
  document.getElementById('menu-settings').addEventListener('click', () => {
    closeMenu();
    openOptions();
  });
  zoomIn.addEventListener('click', () => {
    const page = active();
    if (page) setSiteZoom(stepZoom(pageZoom(page), 1));
  });
  zoomOut.addEventListener('click', () => {
    const page = active();
    if (page) setSiteZoom(stepZoom(pageZoom(page), -1));
  });
  zoomReset.addEventListener('click', () => setSiteZoom(settings.zoom));
  back.addEventListener('click', () => command('back'));
  fwd.addEventListener('click', () => command('forward'));
  reload.addEventListener('click', reloadActive);
  function showActionError(key) {
    actionError.dataset.i18n = key;
    actionError.textContent = t(key);
    actionError.hidden = false;
  }

  async function openCurrentTab() {
    closeMenu();
    const tab = await tabs.current();
    if (tab) openUrl(tab.url, tab.title, { force: true });
    else showActionError('tab.unavailable');
  }
  document.getElementById('current-tab').addEventListener('click', openCurrentTab);
  document.getElementById('menu-current-tab').addEventListener('click', openCurrentTab);
  closeTab.addEventListener('click', () => {
    closeMenu();
    const page = active();
    if (page) closePage(page);
  });

  async function openInBrowser(move) {
    closeMenu();
    const page = active();
    if (!page || page.moving) return;
    const url = page.url;
    actionError.hidden = true;
    if (move) {
      page.moving = true;
      updateToolbar();
    }
    try {
      await tabs.open(url);
      if (move && pages.has(page.id) && page.url === url) closePage(page);
    } catch {
      showActionError('tab.openFailed');
    } finally {
      if (move) {
        page.moving = false;
        updateToolbar();
      }
    }
  }
  moveToTab.addEventListener('click', () => openInBrowser(true));
  popout.addEventListener('click', () => openInBrowser(false));
  noticeOpen.addEventListener('click', () => openInBrowser(false));
  noticeClose.addEventListener('click', () => {
    const page = active();
    if (page) clearNotice(page);
  });

  async function setDesktop(page, desktop) {
    const host = hostOf(page.url);
    if (!host || isDesktopHost(host) === desktop) return;
    const desktopHosts = desktop
      ? [...settings.desktopHosts, host]
      : settings.desktopHosts.filter((saved) => host !== saved && !host.endsWith(`.${saved}`));
    settings = await setSettings({ desktopHosts });
    await chrome.runtime.sendMessage({ type: 'settings-changed' }).catch(() => {});
    updateToolbar();
    updateNotice();
    reloadActive();
  }

  noticeDesktop.addEventListener('click', () => {
    const page = active();
    if (page) setDesktop(page, true);
  });

  ua.addEventListener('click', () => {
    const page = active();
    if (page) setDesktop(page, !isDesktopHost(hostOf(page.url)));
  });

  // オプションページや別ウィンドウのパネルで変わった設定を反映する
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const previousEngine = settings.searchEngine;
    settings = normalizeSettings(changes.settings.newValue);
    if (settings.lang && settings.lang !== getLang()) {
      setLang(settings.lang);
      onLanguageChange?.();
    } else if (settings.searchEngine !== previousEngine) {
      onSearchEngineChange?.();
    }
    trimPages(settings.maxPages);
    for (const page of pages.values()) applyZoom(page);
    updateToolbar();
    updateNotice();
    updateDock();
  });

  langButton.addEventListener('click', async () => {
    closeMenu();
    const lang = setLang(LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length]);
    settings = await setSettings({ lang });
    updateToolbar();
    updateNotice();
    onLanguageChange?.();
  });

  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    // ブラウザと同じく Ctrl+L / Alt+D でアドレス欄へ（パネルにフォーカスがあるとき）
    if ((mod && !event.altKey && key === 'l') || (event.altKey && !mod && key === 'd')) {
      event.preventDefault();
      address.focus();
      return;
    }
    // ブラウザと同じ Ctrl + / Ctrl - / Ctrl 0 で、表示中のサイトの倍率を変える。
    // 日本語配列では + が ; のキーにあり、Chrome も Ctrl ; で拡大する
    const zoomKey = { '=': 1, '+': 1, ';': 1, '-': -1, 0: 0 }[event.key];
    if (mod && !event.altKey && active() && zoomKey !== undefined) {
      event.preventDefault();
      setSiteZoom(zoomKey ? stepZoom(pageZoom(active()), zoomKey) : settings.zoom);
      return;
    }
    // メニューが開いていれば、Esc はメニューを閉じるだけにする
    if (event.key !== 'Escape' || !isListOpen() || overflowMenu.matches(':popover-open')) return;
    if (q.value) {
      q.value = '';
      q.dispatchEvent(new Event('input'));
      q.focus();
    } else {
      showList(false);
    }
  });

  return {
    openUrl,
    showList,
    toggleList,
    isListOpen,
    updateLanguage() {
      updateAddress();
      updateToolbar();
      updateNotice();
      updateDock();
    },
    get settings() {
      return settings;
    },
  };
}
