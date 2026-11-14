// サイドパネル直下のフレームだけが URL・タイトル・履歴状態をパネルへ通知する。
// 入れ子の iframe では ancestorOrigins が 2 つ以上になるので何もしない。
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors.length !== 1 || !ancestors[0].startsWith('chrome-extension://')) return;

  const panelOrigin = ancestors[0];
  const navigation = window.navigation;

  let lastTitle = null;
  let observer;

  function send(type, extra) {
    try {
      parent.postMessage({ __sidepanel: 1, type, ...extra }, panelOrigin);
    } catch {
      // パネルが閉じている
    }
  }

  function isChallenge() {
    return (
      /just a moment|attention required|checking your browser/i.test(document.title) ||
      Boolean(document.querySelector('#challenge-form, #challenge-stage, #cf-challenge-running'))
    );
  }

  function report(extra) {
    lastTitle = document.title;
    send('page', {
      url: location.href,
      title: document.title,
      canGoBack: navigation ? navigation.canGoBack : undefined,
      canGoForward: navigation ? navigation.canGoForward : undefined,
      challenge: isChallenge(),
      ...extra,
    });
  }

  function reportTitle() {
    if (document.title === lastTitle) return;
    lastTitle = document.title;
    report();
  }

  function watchTitle() {
    const head = document.head;
    if (!head) return;
    observer?.disconnect();
    observer = new MutationObserver(reportTitle);
    observer.observe(head, { subtree: true, childList: true, characterData: true });
  }

  // history.back() はパネル全体の履歴（joint session history）を 1 つ戻すだけなので、
  // 複数ページを保持していると、表示中ではなく最後に遷移した別のページが戻る（#11）。
  // navigation.back() はこのフレームの 1 つ前のエントリを指定して戻るので、表示中のページが必ず戻る。
  // ただし移動先は文書全体の履歴の 1 時点なので、それより後に遷移した非表示のページも
  // その時点の状態に戻る（1 つの文書の中で iframe ごとに履歴を分ける方法はない）。
  function traverse(delta) {
    if (navigation) {
      const can = delta < 0 ? navigation.canGoBack : navigation.canGoForward;
      if (!can) return;
      const result = delta < 0 ? navigation.back() : navigation.forward();
      result.committed.catch(() => {});
      result.finished.catch(() => {});
    } else {
      history.go(delta);
    }
  }

  function blockNested(url) {
    let target;
    try {
      target = new URL(url);
    } catch {
      return;
    }
    const exact = [];
    const sameOrigin = [];
    for (const frame of document.querySelectorAll('iframe')) {
      let src;
      try {
        src = new URL(frame.src, location.href);
      } catch {
        continue;
      }
      if (
        src.href === target.href ||
        (src.origin === target.origin && src.pathname === target.pathname)
      ) {
        exact.push(frame);
      } else if (src.origin === target.origin && src.origin !== location.origin) {
        sameOrigin.push(frame);
      }
    }
    for (const frame of exact.length ? exact : sameOrigin) {
      const placeholder = document.createElement('div');
      placeholder.textContent = 'Embedding blocked / 埋め込みをブロックしました';
      placeholder.style.cssText =
        'all:initial;display:block;box-sizing:border-box;padding:8px;border:1px dashed #999;' +
        'border-radius:6px;color:#666;background:#fff;font:12px/1.4 system-ui,sans-serif;';
      frame.replaceWith(placeholder);
    }
  }

  addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== panelOrigin) return;
    const data = event.data;
    if (data?.__sidepanel !== 1) return;
    if (data.type === 'command') {
      if (data.command === 'back') traverse(-1);
      else if (data.command === 'forward') traverse(1);
      else if (data.command === 'reload') location.reload();
    } else if (data.type === 'nested-blocked') {
      blockNested(data.url);
    }
  });

  addEventListener('__sidepanel-location', () => report());
  addEventListener('popstate', () => report());
  addEventListener('hashchange', () => report());
  if (navigation) {
    navigation.addEventListener('navigatesuccess', () => report());
    navigation.addEventListener('currententrychange', reportTitle);
  }

  addEventListener('DOMContentLoaded', () => {
    watchTitle();
    report();
  });
  addEventListener('load', () => send('loaded'));
  addEventListener('pageshow', () => send('loaded'));
  addEventListener('beforeunload', () => send('loading'));
  addEventListener('pagehide', () => send('loading'));

  if (document.head) watchTitle();

  // サードパーティ Cookie の制限下でも、ユーザー操作時に Storage Access API を試す。
  // 失敗しても表示には影響しない。
  addEventListener(
    'pointerdown',
    function grantStorage() {
      removeEventListener('pointerdown', grantStorage, true);
      if (typeof document.requestStorageAccess !== 'function') return;
      document.requestStorageAccess().then(
        () => send('storage', { granted: true }),
        () => {},
      );
    },
    true,
  );

  send('page', {
    url: location.href,
    title: document.title,
    challenge: isChallenge(),
    initial: true,
  });
})();
