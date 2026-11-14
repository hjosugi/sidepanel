// パネル直下の iframe と chrome.cookies をつなぐ。
// ページの document.cookie は「通常タブで見える非 HttpOnly Cookie」と同じ内容を返す。
// セキュリティ上、HttpOnly は渡さず、書き込み先はフレーム自身のオリジンに限定する。

function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '/';
  return path.split(/[?#]/)[0] || '/';
}

function originUrl(base, path) {
  try {
    const url = new URL(base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.pathname = safePath(path);
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export function createCookieBridge({ getPages }) {
  function sendJar(page, url = page.url) {
    const target = originUrl(url, '/');
    if (!target || !page?.iframe?.contentWindow) return;
    chrome.cookies
      .getAll({ url })
      .then((all) => {
        const cookies = all
          .filter((cookie) => !cookie.httpOnly)
          .map((cookie) => [cookie.name, cookie.value]);
        page.iframe.contentWindow.postMessage(
          { __sidepanel: 1, type: 'cookies:jar', cookies },
          target.origin,
        );
      })
      .catch(() => {});
  }

  function pushAll() {
    for (const page of getPages()) sendJar(page);
  }

  let timer;
  chrome.cookies.onChanged.addListener(() => {
    clearTimeout(timer);
    timer = setTimeout(pushAll, 50);
  });

  async function setFromString(base, cookieString) {
    let target;
    try {
      target = new URL(base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(target.protocol)) return;

    const parts = String(cookieString).split(';');
    const pair = parts.shift()?.trim() ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) return;

    const attributes = new Map();
    for (const part of parts) {
      const index = part.indexOf('=');
      if (index === -1) attributes.set(part.trim().toLowerCase(), '');
      else attributes.set(part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim());
    }

    const host = target.hostname;
    let domain;
    if (attributes.has('domain')) {
      const candidate = attributes.get('domain').replace(/^\./, '').toLowerCase();
      if (host !== candidate && !host.endsWith(`.${candidate}`)) return;
      domain = candidate;
    }

    const defaultPath = target.pathname.replace(/\/[^/]*$/, '/') || '/';
    const path = attributes.has('path') ? safePath(attributes.get('path')) : defaultPath;
    const url = `${target.origin}${path}`;

    let remove = false;
    let expirationDate;
    if (attributes.has('max-age')) {
      const maxAge = Number.parseInt(attributes.get('max-age'), 10);
      if (Number.isFinite(maxAge)) {
        if (maxAge <= 0) remove = true;
        else expirationDate = Date.now() / 1000 + maxAge;
      }
    }
    if (attributes.has('expires')) {
      const expires = Date.parse(attributes.get('expires'));
      if (Number.isFinite(expires)) {
        if (expires <= Date.now()) remove = true;
        else if (!expirationDate) expirationDate = expires / 1000;
      }
    }

    if (remove) {
      await chrome.cookies.remove({ url, name }).catch(() => {});
      pushAll();
      return;
    }

    const sameSiteRaw = (attributes.get('samesite') ?? '').toLowerCase();
    let sameSite = 'lax';
    if (sameSiteRaw === 'none') sameSite = 'no_restriction';
    else if (sameSiteRaw === 'strict') sameSite = 'strict';
    const secure = attributes.has('secure') || sameSite === 'no_restriction';
    if (sameSite === 'no_restriction' && !attributes.has('secure')) return;

    const details = {
      url,
      name,
      value,
      path,
      secure,
      sameSite,
      ...(domain ? { domain } : {}),
      ...(expirationDate ? { expirationDate } : {}),
    };
    await chrome.cookies.set(details).catch(() => {});
    pushAll();
  }

  function handle(event, page) {
    const data = event.data;
    if (event.source !== page.iframe.contentWindow) return false;
    if (!/^https?:/.test(event.origin)) return false;
    if (data?.__sidepanel !== 1) return false;

    if (data.type === 'cookies:get') {
      sendJar(page, `${event.origin}${safePath(data.path)}`);
      return true;
    }
    if (data.type === 'cookies:set') {
      setFromString(`${event.origin}${safePath(data.path)}`, String(data.cookie));
      return true;
    }
    return false;
  }

  return { handle, sendJar };
}
