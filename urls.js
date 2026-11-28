// URL まわりの小さな関数。DOM に触らないので単体テストできる。

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function displayUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '');
}

export function favicon(url, size) {
  return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

/** img に設定するファビコン。高解像度の画面には 2 倍の画像を使う */
export function iconSources(url) {
  const small = favicon(url, 16);
  return { src: small, srcset: `${small} 1x, ${favicon(url, 32)} 2x` };
}

function parseHttp(text) {
  try {
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const HOST_PORT = /^[^/?#]+:\d+([/?#]|$)/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;
const DOMAIN = /^([\p{L}\p{N}-]+\.)+\p{L}[\p{L}\p{N}-]*$/u;

/**
 * アドレス欄の入力を URL にする。URL に見えないもの（検索語など）は null。
 * スキームがなければ https:// を、localhost と IP アドレスには http:// を補う。
 */
export function toUrl(input) {
  const text = String(input ?? '').trim();
  // スキームを書いたときは、空白を含んでもブラウザと同じく URL として扱う
  if (/^https?:\/\//i.test(text)) return parseHttp(text);
  if (!text || /\s/.test(text)) return null;
  // example.com:8080 はスキームではなくポート。それ以外のスキーム（chrome: など）は扱わない
  if (SCHEME.test(text) && !HOST_PORT.test(text)) return null;
  const host = text.split(/[/?#]/)[0].replace(/:\d+$/, '');
  const local = LOCAL_HOST.test(host);
  if (!local && !DOMAIN.test(host)) return null;
  return parseHttp(`${local ? 'http' : 'https'}://${text}`);
}

export function webSearchUrl(query) {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query.trim());
  return url.href;
}

/** ブラウザ内部の URL や bookmarklet を誤って外部の検索に送らない。 */
export function addressTarget(text) {
  const url = toUrl(text);
  if (url) return url;
  const query = text.trim();
  if (
    !query ||
    /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:about|blob|brave|chrome(?:-extension)?|data|edge|file|ftp|https?|javascript|mailto|view-source):)/i.test(
      query,
    )
  ) {
    return null;
  }
  return webSearchUrl(query);
}

/** 同じページかどうかを比べるキー。末尾の / と # 以降の違いは無視する。 */
export function pageKey(url) {
  try {
    const { origin, pathname, search } = new URL(url);
    return origin + pathname.replace(/\/+$/, '') + search;
  } catch {
    return String(url);
  }
}

/**
 * url のページを表すピン。パネルは同じオリジンのページを 1 つのフレームで使い回すので、
 * 同じページ → パスが前方一致する最長のピン → 同じオリジンの最初のピン、の順で選ぶ。
 */
export function matchPin(pins, url) {
  let page;
  try {
    page = new URL(url);
  } catch {
    return null;
  }
  const pagePath = page.pathname.replace(/\/+$/, '');
  const key = pageKey(url);
  let best = null;
  let bestScore = -1;
  for (const pin of pins) {
    let target;
    try {
      target = new URL(pin.url);
    } catch {
      continue;
    }
    if (target.origin !== page.origin) continue;
    const path = target.pathname.replace(/\/+$/, '');
    let score = 0;
    if (pageKey(pin.url) === key) score = Number.POSITIVE_INFINITY;
    else if (pagePath === path || pagePath.startsWith(`${path}/`)) score = path.length + 1;
    if (score > bestScore) {
      best = pin;
      bestScore = score;
    }
  }
  return best;
}
