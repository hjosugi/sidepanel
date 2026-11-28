// MAIN world でモバイル向けの JS 環境を偽装する。
// ヘッダーだけモバイルだとリダイレクトループになるサイトがあるため、
// navigator.userAgent / userAgentData もヘッダーと揃える。
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors.length !== 1 || !ancestors[0].startsWith('chrome-extension://')) return;

  const version = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '128';
  const userAgent = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`;
  const brands = [
    { brand: 'Chromium', version },
    { brand: 'Google Chrome', version },
    { brand: 'Not?A_Brand', version: '24' },
  ];
  const userAgentData = {
    brands,
    mobile: true,
    platform: 'Android',
    getHighEntropyValues: async () => ({
      brands,
      mobile: true,
      platform: 'Android',
      platformVersion: '10.0.0',
      architecture: '',
      model: 'K',
      uaFullVersion: `${version}.0.0.0`,
      bitness: '',
      fullVersionList: brands,
      wow64: false,
      formFactors: ['Mobile'],
    }),
  };

  function override(target, name, value) {
    try {
      Object.defineProperty(target, name, { configurable: true, get: () => value });
    } catch {
      // 定義できなくても他は続ける
    }
  }

  override(Navigator.prototype, 'userAgent', userAgent);
  override(Navigator.prototype, 'appVersion', userAgent.replace(/^Mozilla\//, ''));
  override(Navigator.prototype, 'platform', 'Linux armv8l');
  override(Navigator.prototype, 'userAgentData', userAgentData);
  override(Navigator.prototype, 'maxTouchPoints', 5);
})();
