// 実行時に切り替えられる簡易 i18n。既定は英語。
// chrome.i18n はブラウザの言語に従うため、パネル内の切替には使わない。

const MESSAGES = {
  en: {
    'app.name': 'Sidepanel Bookmarks',
    'menu.label': 'Bookmarks',
    'back.label': 'Back',
    'forward.label': 'Forward',
    'reload.label': 'Reload',
    'popout.label': 'Open in tab',
    'mobile.label': 'Use mobile layout',
    'desktop.label': 'Use desktop layout',
    'lang.label': '言語 / Language',
    'search.placeholder': 'Search bookmarks',
    'empty.none': 'No bookmarks',
    'empty.search': 'No matches',
    'search.more': 'Show more ({count} remaining)',
    'search.count': '{count} results',
    'notice.login': 'This site needs a sign-in. Open it in a tab, sign in, then reload.',
    'notice.challenge': 'This site needs a Cloudflare check. Open it in a tab and try again.',
    'notice.http': 'This page cannot be opened in the side panel (HTTP {status}).',
    'notice.error': 'This page could not be loaded in the side panel.',
    'notice.blocked': 'This page blocks being embedded.',
    'notice.unsupported': 'Bookmarklets are not supported.',
    'notice.open': 'Open in tab',
    'notice.close': 'Dismiss',
    'status.loading': 'Loading',
    'status.loaded': 'Loaded',
    'status.rows': '{count} bookmarks shown',
    'bookmark.unsupported': 'Bookmarklets are not supported',
    'bookmark.folder': 'Folder',
    'page.untitled': 'Untitled',
    'list.open': 'Bookmark list',
    'list.close': 'Close bookmark list',
    'settings.label': 'Settings',
    'options.title': 'Sidepanel Bookmarks settings',
    'options.lang': 'Language',
    'options.mobile': 'Use mobile layout in the side panel',
    'options.mobile.hint':
      'Sends a mobile user agent so sites fit the narrow panel. Switch single sites with the phone/desktop button in the panel.',
    'options.pages': 'Pages kept open',
    'options.pages.hint':
      'Older pages are closed first when you open more. 1 uses the least memory.',
    'options.desktop': 'Sites shown in desktop layout',
    'options.desktop.empty': 'None',
    'options.remove': 'Remove {host}',
    'options.saved': 'Saved',
  },
  ja: {
    'app.name': 'Sidepanel Bookmarks',
    'menu.label': 'ブックマーク',
    'back.label': '戻る',
    'forward.label': '進む',
    'reload.label': '再読み込み',
    'popout.label': 'タブで開く',
    'mobile.label': 'モバイル表示にする',
    'desktop.label': 'デスクトップ表示にする',
    'lang.label': '言語 / Language',
    'search.placeholder': 'ブックマークを検索',
    'empty.none': 'ブックマークがありません',
    'empty.search': '見つかりません',
    'search.more': 'さらに表示（残り {count} 件）',
    'search.count': '{count} 件',
    'notice.login': 'ログインが必要です。タブでログインしてから再読み込みしてください。',
    'notice.challenge': 'Cloudflare の確認が必要です。タブで開いてから再読み込みしてください。',
    'notice.http': 'このページはサイドパネルで開けません（HTTP {status}）。',
    'notice.error': 'このページをサイドパネルで読み込めませんでした。',
    'notice.blocked': 'このページは埋め込みを禁止しています。',
    'notice.unsupported': 'ブックマークレットは非対応です。',
    'notice.open': 'タブで開く',
    'notice.close': '閉じる',
    'status.loading': '読み込み中',
    'status.loaded': '読み込み完了',
    'status.rows': '{count} 件表示',
    'bookmark.unsupported': 'ブックマークレットは非対応',
    'bookmark.folder': 'フォルダ',
    'page.untitled': '無題',
    'list.open': 'ブックマーク一覧を開く',
    'list.close': 'ブックマーク一覧を閉じる',
    'settings.label': '設定',
    'options.title': 'Sidepanel Bookmarks の設定',
    'options.lang': '言語',
    'options.mobile': 'サイドパネルでモバイル表示を使う',
    'options.mobile.hint':
      'モバイルの User-Agent を送り、狭いパネルに合った表示にします。サイトごとの切替はパネルのスマホ/PC ボタンで行えます。',
    'options.pages': '保持するページ数',
    'options.pages.hint': '上限を超えると古いページから閉じます。1 にすると最も軽くなります。',
    'options.desktop': 'デスクトップ表示にするサイト',
    'options.desktop.empty': 'なし',
    'options.remove': '{host} を削除',
    'options.saved': '保存しました',
  },
};

export const LANGS = ['en', 'ja'];
export const DEFAULT_LANG = 'en';

let lang = DEFAULT_LANG;

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = LANGS.includes(next) ? next : DEFAULT_LANG;
  document.documentElement.lang = lang;
  apply();
  return lang;
}

export function t(key, params = {}) {
  const table = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANG];
  let text = table[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function apply(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }
}

export { MESSAGES };
