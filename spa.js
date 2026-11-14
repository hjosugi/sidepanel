// MAIN world で history.pushState / replaceState を監視し、SPA の URL 変更を
// ISOLATED world の tracker.js に知らせる。サイトの動作は変えない。
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors.length !== 1 || !ancestors[0].startsWith('chrome-extension://')) return;

  const notify = () => window.dispatchEvent(new Event('__sidepanel-location'));

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }

  addEventListener('popstate', notify);
  addEventListener('hashchange', notify);
})();
