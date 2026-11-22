// MAIN world。設定した一部のサイト（既定は claude.ai）だけに入れる。
// claude.ai は window.self !== window.top で iframe の中かを判定し、iframe の中では
// 過去のチャット一覧（サイドバー）を出さない。パネルのフレームでも通常のタブと同じ表示にするため、
// この比較に限って self の代わりに top を返す。self のほかの使い方はそのまま。
//
// self を読んだコードの位置はスタックから分かるが、その位置が top との比較かどうかは
// スクリプトの本文を見ないと分からない。初めて self を読んだスクリプトだけ本文を取得し
// （直前に読み込んだばかりなので HTTP キャッシュから返る）、比較の位置を覚えておく。
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors.length !== 1 || !ancestors[0].startsWith('chrome-extension://')) return;

  const win = window;
  const top = win.top;
  const NativeError = Error;
  const descriptor = Object.getOwnPropertyDescriptor(win, 'self');
  if (!descriptor?.configurable || typeof NativeError.captureStackTrace !== 'function') return;

  const CACHE_KEY = 'spb:unframe';
  const CACHE_FILES = 100;
  const page = location.href.replace(/#.*$/, '');
  // Cloudflare の確認のスクリプトはもう一度リクエストしない（確認ごとに URL が変わり、比較もない）
  const SKIP = /^https:\/\/challenges\.cloudflare\.com\/|^https?:\/\/[^/]+\/cdn-cgi\//;
  // self === top / self !== top と、その逆順。self の位置を返す
  const SELF_FIRST = /(?<![\w$])self\s*[!=]==?\s*(?:window\.|globalThis\.)?top(?![\w$])/g;
  const TOP_FIRST =
    /(?<![\w$.])(?:window\.|globalThis\.)?top\s*[!=]==?\s*(?:window\.|globalThis\.)?self(?![\w$])/g;

  /** @type {Map<string, Set<string>>} スクリプトの URL → 比較の位置（"行:列"） */
  const checks = new Map();
  try {
    for (const [file, positions] of JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')) {
      checks.set(file, new Set(positions));
    }
  } catch {
    // キャッシュがなくても動く
  }

  function persist() {
    try {
      const recent = [...checks]
        .filter(([file]) => !new URL(file).search)
        .slice(-CACHE_FILES)
        .map(([file, set]) => [file, [...set]]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(recent));
    } catch {
      // 保存できなければ毎回取得する
    }
  }

  function scan(source) {
    const positions = new Set();
    for (const [index, line] of source.split('\n').entries()) {
      if (!line.includes('top')) continue;
      for (const match of line.matchAll(SELF_FIRST)) {
        positions.add(`${index + 1}:${match.index + 1}`);
      }
      for (const match of line.matchAll(TOP_FIRST)) {
        positions.add(`${index + 1}:${match.index + match[0].length - 3}`);
      }
    }
    return positions;
  }

  function positionsIn(file) {
    let positions = checks.get(file);
    if (positions) return positions;
    positions = new Set();
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', file, false);
      xhr.send();
      if (xhr.status === 200) positions = scan(xhr.responseText);
    } catch {
      // 取得できないスクリプトでは何もしない
    }
    checks.set(file, positions);
    // クエリ付きの URL は読み込みごとに変わりやすいので、キャッシュに残さない
    if (!new URL(file).search) persist();
    return positions;
  }

  function callSite(getter) {
    const prepare = Object.getOwnPropertyDescriptor(NativeError, 'prepareStackTrace');
    const limit = NativeError.stackTraceLimit;
    const holder = {};
    try {
      NativeError.prepareStackTrace = (_error, frames) => frames;
      NativeError.stackTraceLimit = 1;
      NativeError.captureStackTrace(holder, getter);
      return holder.stack?.[0] ?? null;
    } catch {
      return null;
    } finally {
      // 元に戻せなくても self の読み取りは失敗させない
      try {
        NativeError.stackTraceLimit = limit;
        if (prepare) Object.defineProperty(NativeError, 'prepareStackTrace', prepare);
        else delete NativeError.prepareStackTrace;
      } catch {
        // 何もしない
      }
    }
  }

  function isFrameCheck(getter) {
    const site = callSite(getter);
    const file = site?.getFileName?.();
    if (!file || !/^https?:/.test(file) || SKIP.test(file)) return false;
    if (file.replace(/#.*$/, '') === page) return false;
    return positionsIn(file).has(`${site.getLineNumber()}:${site.getColumnNumber()}`);
  }

  Object.defineProperty(win, 'self', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: function self() {
      return isFrameCheck(self) ? top : win;
    },
    set(value) {
      Object.defineProperty(win, 'self', {
        configurable: true,
        enumerable: descriptor.enumerable,
        writable: true,
        value,
      });
    },
  });
})();
