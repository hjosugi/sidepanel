import { createCookieBridge } from './cookies.js';
import { getLang, LANGS, setLang, t } from './i18n.js';
import { setSettings, writeLocal } from './store.js';

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

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function displayUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '');
}

export function createViewer({ settings: initialSettings, onListShown, onLanguageChange }) {
  const frames = document.getElementById('frames');
  const tabs = document.getElementById('tabs');
  const q = document.getElementById('q');
  const title = document.getElementById('title');
  const notice = document.getElementById('notice');
  const noticeText = document.getElementById('notice-text');
  const noticeOpen = document.getElementById('notice-open');
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

  function updateTitle(page) {
    if (!page || page !== active()) return;
    const text = page.title || page.name || displayUrl(page.url) || t('page.untitled');
    title.textContent = text;
    title.title = page.url;
    page.iframe.title = text || t('app.name');
  }

  function isDesktopHost(host) {
    return settings.desktopHosts.some((saved) => host === saved || host.endsWith(`.${saved}`));
  }

  function updateToolbar() {
    const page = active();
    back.disabled = !page?.canGoBack;
    fwd.disabled = !page?.canGoForward;
    reload.disabled = !page;
    popout.disabled = !page;
    ua.hidden = !page;
    ua.disabled = !page;
    if (page) {
      const desktop = isDesktopHost(hostOf(page.url));
      ua.dataset.mode = desktop ? 'desktop' : 'mobile';
      const label = t(desktop ? 'desktop.label' : 'mobile.label');
      ua.title = label;
      ua.setAttribute('aria-label', label);
    }
    menu.title = t(isListOpen() ? 'list.close' : 'list.open');
    menu.setAttribute('aria-label', menu.title);
    langButton.textContent = getLang().toUpperCase();
    langButton.title = t('lang.label');
    langButton.setAttribute('aria-label', t('lang.label'));
  }

  function updateTabs() {
    tabs.hidden = pages.size < 2;
    if (tabs.hidden) {
      tabs.replaceChildren();
      return;
    }
    const buttons = [...pages.values()].map((page) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.pageId = String(page.id);
      button.title = page.url;
      const span = document.createElement('span');
      span.textContent = page.title || page.name || displayUrl(page.url) || t('page.untitled');
      button.append(span);
      if (page === active()) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => {
        setActive(page);
        showList(false);
      });
      return button;
    });
    tabs.replaceChildren(...buttons);
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
    noticeText.textContent = t(`notice.${kind}`, params);
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
    updateTitle(page);
    updateToolbar();
    updateNotice();
    updateTabs();
    saveLast(page);
  }

  function evict(page) {
    page.iframe.remove();
    pages.delete(page.id);
    if (page.id === activeId) activeId = null;
    updateTabs();
  }

  function ensureCapacity() {
    while (pages.size >= Math.max(1, settings.maxPages)) {
      const candidates = [...pages.values()].filter((page) => page.id !== activeId);
      const pool = candidates.length ? candidates : [...pages.values()];
      const victim = pool.sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (!victim) break;
      evict(victim);
    }
  }

  function createPage() {
    ensureCapacity();
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

  function openUrl(url, name = '') {
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
      if (page.url !== url && shouldNavigate(page, url)) {
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
    try {
      page.iframe.contentWindow.postMessage(
        { __sidepanel: 1, type: 'command', command: name },
        '*',
      );
    } catch {
      // コンテンツスクリプトがまだ動いていない
    }
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
      updateTabs();
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

  function responseBlocksEmbedding(details) {
    const headers = details.responseHeaders ?? [];
    let frameOrigin;
    let parentOrigin;
    try {
      frameOrigin = new URL(details.url).origin;
      parentOrigin =
        details.initiator && details.initiator !== 'null'
          ? new URL(details.initiator).origin
          : null;
    } catch {
      return false;
    }

    for (const header of headers) {
      const name = header.name.toLowerCase();
      const value = (header.value ?? '').trim();
      if (name === 'x-frame-options') {
        const options = value.split(',').map((part) => part.trim().toLowerCase());
        if (options.includes('deny')) return true;
        if (options.includes('sameorigin') && (!parentOrigin || parentOrigin !== frameOrigin))
          return true;
      }
      if (name === 'content-security-policy' || name === 'content-security-policy-report-only') {
        const match = value.match(/(?:^|;\s*)frame-ancestors\s+([^;]+)/i);
        if (!match) continue;
        const sources = match[1].trim().toLowerCase().split(/\s+/);
        if (sources.includes("'none'")) return true;
        if (sources.includes('*')) continue;
        const allowed = sources.some((source) => {
          if (source === "'self'") return parentOrigin === frameOrigin;
          if (source === 'https:') return parentOrigin?.startsWith('https:');
          if (source === 'http:') return parentOrigin?.startsWith('http:');
          try {
            const url = new URL(source.includes('://') ? source : `https://${source}`);
            if (!parentOrigin) return false;
            const parent = new URL(parentOrigin);
            if (url.origin === parent.origin) return true;
            if (url.hostname.startsWith('*.')) {
              return (
                parent.protocol === url.protocol && parent.hostname.endsWith(url.hostname.slice(1))
              );
            }
            return false;
          } catch {
            return false;
          }
        });
        if (!allowed) return true;
      }
    }
    return false;
  }

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.parentFrameId === 0 || !responseBlocksEmbedding(details)) return;
      for (const page of pages.values()) {
        try {
          page.iframe.contentWindow.postMessage(
            { __sidepanel: 1, type: 'nested-blocked', url: details.url },
            '*',
          );
        } catch {
          // フレームがまだない
        }
      }
    },
    { urls: ['<all_urls>'], types: ['sub_frame'], tabId: chrome.tabs.TAB_ID_NONE },
    ['responseHeaders'],
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (details.parentFrameId !== 0 || details.statusCode < 400) return;
      const page = pageForUrl(details.url);
      if (!page) return;
      page.failedUrl = details.url;
      page.url = details.url;
      setNotice(page, 'http', { status: details.statusCode });
      if (page === active()) setBusy(false);
    },
    { urls: ['<all_urls>'], types: ['sub_frame'], tabId: chrome.tabs.TAB_ID_NONE },
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.parentFrameId !== 0) return;
      const page = pageForUrl(details.url);
      if (!page) return;
      page.failedUrl = details.url;
      setNotice(page, 'error');
      if (page === active()) setBusy(false);
    },
    { urls: ['<all_urls>'], types: ['sub_frame'], tabId: chrome.tabs.TAB_ID_NONE },
  );

  menu.addEventListener('click', toggleList);
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

  ua.addEventListener('click', async () => {
    const page = active();
    if (!page) return;
    const host = hostOf(page.url);
    if (!host) return;
    const desktopHosts = isDesktopHost(host)
      ? settings.desktopHosts.filter((saved) => host !== saved && !host.endsWith(`.${saved}`))
      : [...settings.desktopHosts, host];
    settings = await setSettings({ desktopHosts });
    await chrome.runtime.sendMessage({ type: 'settings-changed' }).catch(() => {});
    updateToolbar();
    reloadActive();
  });

  langButton.addEventListener('click', async () => {
    const lang = setLang(LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length]);
    settings = await setSettings({ lang });
    updateToolbar();
    updateNotice();
    onLanguageChange?.();
  });

  addEventListener('keydown', (event) => {
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
      updateToolbar();
      updateNotice();
      updateTabs();
    },
    get settings() {
      return settings;
    },
  };
}
