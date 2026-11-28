// biome-ignore-all lint/suspicious/noDocumentCookie: this file intentionally wraps document.cookie
// MAIN world。パネル直下のフレームに限り、document.cookie を通常タブと同じ見え方にする。
// 実体はパネル側（chrome.cookies）が取得した非 HttpOnly Cookie。
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors.length !== 1 || !ancestors[0].startsWith('chrome-extension://')) return;

  const panelOrigin = ancestors[0];
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!descriptor?.get || !descriptor?.set) return;

  const CACHE_KEY = 'spb:cookie-jar';
  let jar = null;

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) jar = new Map(JSON.parse(cached));
  } catch {
    jar = null;
  }

  function persist() {
    if (!jar) return;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify([...jar]));
    } catch {
      // ストレージが使えない環境ではキャッシュしない
    }
  }

  function applyToJar(cookieString) {
    if (!jar) return;
    const parts = String(cookieString).split(';');
    const pair = parts.shift() ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) return;

    let expired = false;
    for (const part of parts) {
      const index = part.indexOf('=');
      const key = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase();
      const attrValue = index === -1 ? '' : part.slice(index + 1).trim();
      if (key === 'max-age' && Number(attrValue) <= 0) expired = true;
      if (key === 'expires' && Date.parse(attrValue) <= Date.now()) expired = true;
    }

    if (expired) jar.delete(name);
    else jar.set(name, value);
    persist();
  }

  Object.defineProperty(Document.prototype, 'cookie', {
    configurable: true,
    enumerable: true,
    get() {
      if (jar && this === document) {
        return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
      }
      return descriptor.get.call(this);
    },
    set(value) {
      descriptor.set.call(this, value);
      applyToJar(value);
      try {
        parent.postMessage(
          { __sidepanel: 1, type: 'cookies:set', cookie: String(value), path: location.pathname },
          panelOrigin,
        );
      } catch {
        // パネルが閉じている
      }
    },
  });

  addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== panelOrigin) return;
    const data = event.data;
    if (data?.__sidepanel !== 1 || data.type !== 'cookies:jar' || !Array.isArray(data.cookies)) {
      return;
    }
    jar = new Map(data.cookies);
    persist();
  });

  try {
    parent.postMessage(
      { __sidepanel: 1, type: 'cookies:get', path: location.pathname },
      panelOrigin,
    );
  } catch {
    // パネルが閉じている
  }

  // Cookie Store API も同じ jar を見せる（使用しているサイトは少ない）。
  const store = window.cookieStore;
  if (!store) return;
  try {
    const proto = Object.getPrototypeOf(store);
    const native = {
      get: proto.get,
      getAll: proto.getAll,
      set: proto.set,
      delete: proto.delete,
    };
    if (!native.get || !native.getAll || !native.set || !native.delete) return;

    function nameOf(input) {
      if (typeof input === 'string') return input;
      return input && typeof input.name === 'string' ? input.name : '';
    }

    function cookieString(name, value, options = {}) {
      let result = `${name}=${value}`;
      result += `; Path=${options.path || '/'}`;
      if (options.domain) result += `; Domain=${options.domain}`;
      if (options.expires != null) {
        const date = options.expires instanceof Date ? options.expires : new Date(options.expires);
        if (!Number.isNaN(date.getTime())) result += `; Expires=${date.toUTCString()}`;
      }
      if (options.sameSite) {
        const sameSite = String(options.sameSite).toLowerCase();
        const label = sameSite === 'none' ? 'None' : sameSite[0].toUpperCase() + sameSite.slice(1);
        result += `; SameSite=${label}`;
      }
      if (options.secure) result += '; Secure';
      return result;
    }

    proto.get = function get(input) {
      if (!jar) return native.get.call(this, input);
      const name = nameOf(input);
      if (name && jar.has(name)) return Promise.resolve({ name, value: jar.get(name) });
      return native.get.call(this, input);
    };

    proto.getAll = function getAll(input) {
      if (!jar) return native.getAll.call(this, input);
      const name = nameOf(input);
      return Promise.resolve(
        [...jar]
          .filter(([key]) => !name || key === name)
          .map(([key, value]) => ({ name: key, value })),
      );
    };

    proto.set = function set(input, value, options) {
      const details =
        typeof input === 'string' ? { name: input, value, ...(options ?? {}) } : input;
      if (!details?.name) return Promise.reject(new TypeError('Cookie name is required'));
      document.cookie = cookieString(details.name, details.value ?? '', details);
      return Promise.resolve();
    };

    proto.delete = function remove(input) {
      const name = nameOf(input);
      if (!name) return Promise.reject(new TypeError('Cookie name is required'));
      const details = typeof input === 'string' ? {} : input;
      document.cookie = `${name}=; Path=${details?.path || '/'}; Max-Age=0`;
      return Promise.resolve();
    };
  } catch {
    // Cookie Store API の形が変わっていたら素通しにする
  }
})();
