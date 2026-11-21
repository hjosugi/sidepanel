import { createCookieBridge } from './cookies.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { watchPanelFrames } from './net.js';
import { normalizeSettings, setSettings, writeLocal } from './store.js';
import { displayUrl, favicon, hostOf, matchPin, toUrl } from './urls.js';

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

function setIcon(img, url) {
  const small = favicon(url, 16);
  img.alt = '';
  img.width = 16;
  img.height = 16;
  img.src = small;
  img.srcset = `${small} 1x, ${favicon(url, 32)} 2x`;
}

export function createViewer({ settings: initialSettings, onListShown, onLanguageChange }) {
  const frames = document.getElementById('frames');
  const dock = document.getElementById('dock');
  const q = document.getElementById('q');
  const address = document.getElementById('address');
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
  const ua = document.getElementById('ua');
  const langButton = document.getElementById('lang');

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

  // アドレス欄は編集していないときはタイトル、編集中は URL を表示する
  function updateAddress() {
    const page = active();
    if (document.activeElement !== address) address.value = page ? pageText(page) : '';
    address.title = page?.url ?? '';
    if (page) page.iframe.title = pageText(page) || t('app.name');
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
    const page = active();
    back.disabled = !page?.canGoBack;
    fwd.disabled = !page?.canGoForward;
    reload.disabled = !page;
    popout.disabled = !page;
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
    pin.disabled = !page;
    pin.setAttribute('aria-pressed', String(pinned));
    pin.title = t(pinned ? 'pin.remove' : 'pin.add');
    pin.setAttribute('aria-label', pin.title);
    const listOpen = isListOpen();
    // 表示するページがなければ一覧は閉じられない
    menu.disabled = listOpen && !page;
    menu.setAttribute('aria-expanded', String(listOpen));
    menu.title = t(listOpen ? 'list.close' : 'list.open');
    menu.setAttribute('aria-label', menu.title);
    langButton.textContent = getLang().toUpperCase();
    langButton.title = t('lang.label');
    langButton.setAttribute('aria-label', t('lang.label'));
  }

  function dockButton(url, label, page) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dock-item';
    button.dataset.url = url;
    button.title = label;
    button.setAttribute('aria-label', label);
    const img = document.createElement('img');
    setIcon(img, url);
    button.append(img);
    if (page) {
      button.dataset.pageId = String(page.id);
      button.dataset.alive = '';
      if (page === active() && !isListOpen()) button.setAttribute('aria-current', 'page');
    }
    return button;
  }

  // Edge のサイドバーのように、ピン留めしたサイトと開いているページをアイコンで並べる。
  // ピンに当たるページはそのピンのアイコンで表し、残りのページは区切りの後ろに並べる
  function updateDock() {
    const pins = settings.pins;
    const pinned = new Map();
    const loose = [];
    for (const page of pages.values()) {
      const match = page.url ? matchPin(pins, page.url) : null;
      if (match && !pinned.has(match.url)) pinned.set(match.url, page);
      else loose.push(page);
    }
    dock.hidden = !pins.length && pages.size < 2;
    if (dock.hidden) {
      dock.replaceChildren();
      return;
    }
    const items = pins.map((item, index) => {
      const page = pinned.get(item.url);
      const label = page ? pageText(page) : item.name || displayUrl(item.url);
      const button = dockButton(item.url, label, page);
      button.dataset.pin = String(index);
      button.draggable = true;
      return button;
    });
    if (pins.length && loose.length) {
      const separator = document.createElement('span');
      separator.className = 'dock-separator';
      items.push(separator);
    }
    for (const page of loose) items.push(dockButton(page.url, pageText(page), page));
    dock.replaceChildren(...items);
    dock.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  dock.addEventListener('click', (event) => {
    const button = event.target.closest('.dock-item');
    if (!button) return;
    const page = pages.get(Number(button.dataset.pageId));
    if (page) {
      setActive(page);
      showList(false);
      return;
    }
    const item = settings.pins[Number(button.dataset.pin)];
    if (item) openUrl(item.url, item.name);
  });
  // 中クリックで開いているページを閉じる
  dock.addEventListener('mousedown', (event) => {
    if (event.button === 1 && event.target.closest('.dock-item[data-alive]')) {
      event.preventDefault();
    }
  });
  dock.addEventListener('auxclick', (event) => {
    const page = pages.get(Number(event.target.closest('.dock-item')?.dataset.pageId));
    if (event.button !== 1 || !page) return;
    event.preventDefault();
    closePage(page);
  });

  // ピンはドラッグで並べ替える
  const PIN_TYPE = 'application/x-sidepanel-pin';
  dock.addEventListener('dragstart', (event) => {
    const button = event.target.closest('.dock-item[data-pin]');
    if (!button) return;
    event.dataTransfer.setData(PIN_TYPE, button.dataset.pin);
    event.dataTransfer.effectAllowed = 'move';
  });
  dock.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes(PIN_TYPE)) return;
    if (!event.target.closest('.dock-item[data-pin]')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  dock.addEventListener('drop', async (event) => {
    const target = event.target.closest('.dock-item[data-pin]');
    const raw = event.dataTransfer.getData(PIN_TYPE);
    const from = Number(raw);
    if (!target || raw === '' || !Number.isInteger(from)) return;
    event.preventDefault();
    const to = Number(target.dataset.pin);
    if (from === to) return;
    const pins = [...settings.pins];
    const [moved] = pins.splice(from, 1);
    pins.splice(to, 0, moved);
    settings = await setSettings({ pins });
    updateDock();
  });

  pin.addEventListener('click', async () => {
    const page = active();
    if (!page) return;
    const current = matchPin(settings.pins, page.url);
    const pins = current
      ? settings.pins.filter((item) => item !== current)
      : [...settings.pins, { url: page.url, name: page.title || page.name || hostOf(page.url) }];
    settings = await setSettings({ pins });
    updateToolbar();
    updateDock();
    announce(t(current ? 'pin.removed' : 'pin.added'));
  });

  // クリックで入ったときも全体を選択したままにする（mouseup で選択が解除されるため）
  let keepSelection = false;
  address.addEventListener('focus', () => {
    const page = active();
    if (page) address.value = page.url;
    address.select();
    keepSelection = true;
  });
  address.addEventListener('mouseup', (event) => {
    if (keepSelection) event.preventDefault();
    keepSelection = false;
  });
  address.addEventListener('blur', () => {
    keepSelection = false;
    updateAddress();
  });
  address.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      address.blur();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const text = address.value.trim();
    if (!text) return;
    const url = toUrl(text);
    address.blur();
    if (url) {
      openUrl(url, '', { force: true });
      return;
    }
    // URL でなければブックマークとタブを検索する
    q.value = text;
    q.dispatchEvent(new Event('input'));
    showList(true);
  });
  document
    .getElementById('settings')
    .addEventListener('click', () => chrome.runtime.openOptionsPage().catch(() => {}));
  back.addEventListener('click', () => command('back'));
  fwd.addEventListener('click', () => command('forward'));
  reload.addEventListener('click', reloadActive);
  popout.addEventListener('click', () => {
    const page = active();
    if (page) chrome.tabs.create({ url: page.url }).catch(() => {});
  });

  noticeOpen.addEventListener('click', () => {
    const page = active();
    if (page) chrome.tabs.create({ url: page.url }).catch(() => {});
  });
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
    settings = normalizeSettings(changes.settings.newValue);
    if (settings.lang && settings.lang !== getLang()) {
      setLang(settings.lang);
      onLanguageChange?.();
    }
    trimPages(settings.maxPages);
    updateToolbar();
    updateNotice();
    updateDock();
  });

  langButton.addEventListener('click', async () => {
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
    if (event.key !== 'Escape' || !isListOpen()) return;
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
