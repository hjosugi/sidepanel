// rules.js / net.js はモジュールの読み込み時に chrome.tabs を参照する。
globalThis.chrome ??= { tabs: { TAB_ID_NONE: -1 } };
