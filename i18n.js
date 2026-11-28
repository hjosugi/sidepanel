// 実行時に切り替えられる簡易 i18n。既定は英語。
// chrome.i18n はブラウザの言語に従うため、パネル内の切替には使わない。

const MESSAGES = {
  en: {
    'app.name': 'Sidepanel Bookmarks',
    'menu.label': 'Bookmarks and tabs',
    'back.label': 'Back',
    'forward.label': 'Forward',
    'reload.label': 'Reload',
    'popout.label': 'Open a copy in a new browser tab',
    'tab.import': 'Open current browser tab in panel',
    'tab.move': 'Move panel page to a new browser tab',
    'tab.close': 'Close panel tab',
    'tab.actions': 'Panel tab actions',
    'tab.unavailable': 'Select a browser tab with an HTTP or HTTPS page, then try again.',
    'tab.openFailed': 'Could not open a browser tab. The page is still in the panel.',
    'mobile.label': 'Use mobile layout',
    'desktop.label': 'Use desktop layout',
    'lang.label': '言語 / Language',
    'address.label': 'Web address or Bing search',
    'address.placeholder': 'Enter URL or search Bing',
    'address.unsupported': 'Enter an HTTP or HTTPS address, or words to search for.',
    'pin.add': 'Pin to the bar',
    'pin.remove': 'Unpin from the bar',
    'pin.added': 'Pinned',
    'pin.removed': 'Unpinned',
    'dock.label': 'Pinned sites and open pages',
    'dock.close': 'Close {name}',
    'dock.new': 'Open a page from bookmarks and tabs',
    'more.label': 'More',
    'zoom.label': 'Zoom',
    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'zoom.reset': 'Reset to {percent}',
    'search.placeholder': 'Search bookmarks and tabs',
    'search.web': 'Search Bing for “{query}”',
    'empty.none': 'No bookmarks or tabs',
    'empty.search': 'No matches',
    'search.more': 'Show more ({count} remaining)',
    'search.count': '{count} results',
    'notice.login': 'This site needs a sign-in. Open it in a tab, sign in, then reload.',
    'notice.challenge':
      'Waiting for the Cloudflare check. If it does not finish, open the site in a tab.',
    'notice.challengeMobile':
      'Cloudflare checks do not finish in mobile layout. Switch this site to desktop layout.',
    'notice.http': 'This page cannot be opened in the side panel (HTTP {status}).',
    'notice.error': 'This page could not be loaded in the side panel.',
    'notice.blocked': 'This page blocks being embedded.',
    'notice.unsupported': 'Bookmarklets are not supported.',
    'notice.desktop': 'Desktop layout',
    'notice.open': 'Open in tab',
    'notice.close': 'Dismiss',
    'status.loading': 'Loading',
    'status.loaded': 'Loaded',
    'status.rows': '{count} bookmarks shown',
    'bookmark.unsupported': 'Bookmarklets are not supported',
    'bookmark.folder': 'Folder',
    'tabs.folder': 'Open tabs',
    'page.untitled': 'Untitled',
    'list.open': 'Bookmarks and tabs',
    'list.close': 'Close the list',
    'settings.label': 'Settings',
    'options.title': 'Sidepanel Bookmarks settings',
    'options.lang': 'Language',
    'options.mobile': 'Use mobile layout in the side panel',
    'options.mobile.hint':
      'Sends a mobile user agent so sites fit the narrow panel. Switch single sites with the phone/desktop button in the panel.',
    'options.pages': 'Pages kept open',
    'options.pages.hint':
      'Older pages are closed first when you open more. 1 uses the least memory.',
    'options.startup': 'When the panel opens',
    'options.startup.last': 'Show the last page',
    'options.startup.list': 'Show bookmarks and tabs',
    'options.startup.url': 'Open a specific page',
    'options.startUrl': 'Page to open',
    'options.startUrl.current': 'Use current page',
    'options.startUrl.invalid': 'Enter a web address (http or https).',
    'options.pins': 'Pinned sites',
    'options.pins.hint':
      'Shown as icon-only tabs at the left of the tab strip. Pin a page with the pin button in the panel, and drag the tabs there to reorder.',
    'options.pins.empty': 'None',
    'options.up': 'Move {name} up',
    'options.down': 'Move {name} down',
    'options.unpin': 'Unpin {name}',
    'options.zoom': 'Default zoom',
    'options.zoom.hint':
      'Pages in the panel open at this zoom. Change one site from the ⋯ menu, or with Ctrl + / Ctrl − / Ctrl 0 in the panel; the panel remembers it.',
    'options.siteZoom': 'Sites with their own zoom',
    'options.siteZoom.empty': 'None',
    'options.desktop': 'Sites shown in desktop layout',
    'options.desktop.empty': 'None',
    'options.unframed': 'Sites shown as in a normal tab',
    'options.unframed.hint':
      'Some sites hide part of their page when they are inside a frame, like the chat list on Claude. On these sites the panel hides that the page is in a frame.',
    'options.unframed.empty': 'None',
    'options.unframed.add': 'Add',
    'options.unframed.label': 'Site to add',
    'options.unframed.invalid': 'Enter a host name such as example.com.',
    'options.remove': 'Remove {host}',
    'options.saved': 'Saved',
  },
  ja: {
    'app.name': 'Sidepanel Bookmarks',
    'menu.label': 'ブックマークとタブ',
    'back.label': '戻る',
    'forward.label': '進む',
    'reload.label': '再読み込み',
    'popout.label': 'コピーを新しいブラウザータブで開く',
    'tab.import': '現在のブラウザータブをパネルで開く',
    'tab.move': 'パネルのページを新しいブラウザータブに移動',
    'tab.close': 'パネルのタブを閉じる',
    'tab.actions': 'パネルのタブ操作',
    'tab.unavailable':
      'HTTP または HTTPS のページをブラウザーで選んでから、もう一度お試しください。',
    'tab.openFailed': 'ブラウザータブを開けませんでした。ページはパネルに残っています。',
    'mobile.label': 'モバイル表示にする',
    'desktop.label': 'デスクトップ表示にする',
    'lang.label': '言語 / Language',
    'address.label': 'ウェブアドレスまたは Bing 検索',
    'address.placeholder': 'URL を入力、または Bing で検索',
    'address.unsupported': 'HTTP または HTTPS のアドレスか、検索する言葉を入力してください。',
    'pin.add': 'バーにピン留め',
    'pin.remove': 'バーのピン留めを外す',
    'pin.added': 'ピン留めしました',
    'pin.removed': 'ピン留めを外しました',
    'dock.label': 'ピン留めしたサイトと開いているページ',
    'dock.close': '{name} を閉じる',
    'dock.new': 'ブックマークやタブからページを開く',
    'more.label': 'その他',
    'zoom.label': 'ズーム',
    'zoom.in': '拡大',
    'zoom.out': '縮小',
    'zoom.reset': '{percent} に戻す',
    'search.placeholder': 'ブックマークとタブを検索',
    'search.web': '「{query}」を Bing で検索',
    'empty.none': 'ブックマークもタブもありません',
    'empty.search': '見つかりません',
    'search.more': 'さらに表示（残り {count} 件）',
    'search.count': '{count} 件',
    'notice.login': 'ログインが必要です。タブでログインしてから再読み込みしてください。',
    'notice.challenge': 'Cloudflare の確認中です。終わらない場合はタブで開いてください。',
    'notice.challengeMobile':
      'Cloudflare の確認はモバイル表示では終わりません。このサイトをデスクトップ表示にしてください。',
    'notice.http': 'このページはサイドパネルで開けません（HTTP {status}）。',
    'notice.error': 'このページをサイドパネルで読み込めませんでした。',
    'notice.blocked': 'このページは埋め込みを禁止しています。',
    'notice.unsupported': 'ブックマークレットは非対応です。',
    'notice.desktop': 'デスクトップ表示',
    'notice.open': 'タブで開く',
    'notice.close': '閉じる',
    'status.loading': '読み込み中',
    'status.loaded': '読み込み完了',
    'status.rows': '{count} 件表示',
    'bookmark.unsupported': 'ブックマークレットは非対応',
    'bookmark.folder': 'フォルダ',
    'tabs.folder': '開いているタブ',
    'page.untitled': '無題',
    'list.open': 'ブックマークとタブを表示',
    'list.close': '一覧を閉じる',
    'settings.label': '設定',
    'options.title': 'Sidepanel Bookmarks の設定',
    'options.lang': '言語',
    'options.mobile': 'サイドパネルでモバイル表示を使う',
    'options.mobile.hint':
      'モバイルの User-Agent を送り、狭いパネルに合った表示にします。サイトごとの切替はパネルのスマホ/PC ボタンで行えます。',
    'options.pages': '保持するページ数',
    'options.pages.hint': '上限を超えると古いページから閉じます。1 にすると最も軽くなります。',
    'options.startup': 'パネルを開いたとき',
    'options.startup.last': '前回のページを表示',
    'options.startup.list': 'ブックマークとタブを表示',
    'options.startup.url': '特定のページを開く',
    'options.startUrl': '開くページ',
    'options.startUrl.current': '現在のページを使う',
    'options.startUrl.invalid': 'Web のアドレス（http または https）を入力してください。',
    'options.pins': 'ピン留めしたサイト',
    'options.pins.hint':
      'タブ列の左端にアイコンだけのタブで並びます。パネルのピンのボタンでピン留めし、タブをドラッグすると並べ替えられます。',
    'options.pins.empty': 'なし',
    'options.up': '{name} を上へ',
    'options.down': '{name} を下へ',
    'options.unpin': '{name} のピン留めを外す',
    'options.zoom': '既定のズーム',
    'options.zoom.hint':
      'パネル内のページをこの倍率で開きます。サイトごとの倍率は ⋯ メニュー、またはパネルで Ctrl + / Ctrl − / Ctrl 0 で変えられ、パネルが覚えます。',
    'options.siteZoom': '個別にズームしたサイト',
    'options.siteZoom.empty': 'なし',
    'options.desktop': 'デスクトップ表示にするサイト',
    'options.desktop.empty': 'なし',
    'options.unframed': '通常のタブと同じ表示にするサイト',
    'options.unframed.hint':
      'フレームの中では一部を隠すサイトがあります（Claude のチャット一覧など）。これらのサイトでは、フレームの中であることをページから隠します。',
    'options.unframed.empty': 'なし',
    'options.unframed.add': '追加',
    'options.unframed.label': '追加するサイト',
    'options.unframed.invalid': 'example.com のようなホスト名を入力してください。',
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
  // Service Worker には document がない
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    apply();
  }
  return lang;
}

export function t(key, params = {}) {
  const table = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANG];
  let text = table[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, () => String(value));
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
