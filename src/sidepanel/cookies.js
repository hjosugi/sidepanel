// パネル直下の iframe と chrome.cookies をつなぐ。
// ページの document.cookie は「通常タブで見える非 HttpOnly Cookie」と同じ内容を返す。
// セキュリティ上、HttpOnly は渡さず、書き込み先はフレーム自身のオリジンに限定する。

function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '/';
  return path.split(/[?#]/)[0] || '/';
}

function httpOrigin(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * document.cookie に書かれた文字列を chrome.cookies の操作に変換する。
 * フレーム自身のホスト（とその親ドメイン）以外への書き込みは null を返す。
 *
 * @param {string} base 書き込んだ文書の URL（origin はブラウザが保証した値を使う）
 * @param {string} cookieString
 * @param {number} [now] ミリ秒
 * @returns {{ remove: { url: string, name: string } } | { set: chrome.cookies.SetDetails } | null}
 */
export function parseCookieWrite(base, cookieString, now = Date.now()) {
  let target;
  try {
    target = new URL(base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(target.protocol)) return null;

  const parts = String(cookieString).split(';');
  const pair = parts.shift()?.trim() ?? '';
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

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
    if (host !== candidate && !host.endsWith(`.${candidate}`)) return null;
    domain = candidate;
  }

  const defaultPath = target.pathname.replace(/\/[^/]*$/, '/') || '/';
  const path = attributes.has('path') ? safePath(attributes.get('path')) : defaultPath;
  const url = `${target.origin}${path}`;

  let expired = false;
  let expirationDate;
  if (attributes.has('max-age')) {
    const maxAge = Number.parseInt(attributes.get('max-age'), 10);
    if (Number.isFinite(maxAge)) {
      if (maxAge <= 0) expired = true;
      else expirationDate = now / 1000 + maxAge;
    }
  }
  if (attributes.has('expires') && !expirationDate) {
    const expires = Date.parse(attributes.get('expires'));
    if (Number.isFinite(expires)) {
      if (expires <= now) expired = true;
      else expirationDate = expires / 1000;
    }
  }
  if (expired) return { remove: { url, name } };

  const sameSiteRaw = (attributes.get('samesite') ?? '').toLowerCase();
  let sameSite = 'lax';
  if (sameSiteRaw === 'none') sameSite = 'no_restriction';
  else if (sameSiteRaw === 'strict') sameSite = 'strict';
  // ブラウザと同じく、Secure なしの SameSite=None は捨てる
  if (sameSite === 'no_restriction' && !attributes.has('secure')) return null;

  return {
    set: {
      url,
      name,
      value,
      path,
      secure: attributes.has('secure'),
      sameSite,
      ...(domain ? { domain } : {}),
      ...(expirationDate ? { expirationDate } : {}),
    },
  };
}

export function createCookieBridge({ getPages }) {
  function sendJar(page, url = page.url) {
    const origin = httpOrigin(url);
    if (!origin || !page?.iframe?.contentWindow) return;
    chrome.cookies
      .getAll({ url })
      .then((all) => {
        const cookies = all
          .filter((cookie) => !cookie.httpOnly)
          .map((cookie) => [cookie.name, cookie.value]);
        page.iframe.contentWindow.postMessage(
          { __sidepanel: 1, type: 'cookies:jar', cookies },
          origin,
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

  async function write(base, cookieString) {
    const change = parseCookieWrite(base, cookieString);
    if (!change) return;
    if (change.remove) await chrome.cookies.remove(change.remove).catch(() => {});
    else await chrome.cookies.set(change.set).catch(() => {});
    pushAll();
  }

  /** パネル直下のフレームからの Cookie メッセージなら処理して true を返す。 */
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
      write(`${event.origin}${safePath(data.path)}`, String(data.cookie));
      return true;
    }
    return false;
  }

  return { handle, sendJar };
}
