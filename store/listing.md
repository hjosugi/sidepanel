# Chrome Web Store listing

Copy these into the Developer Dashboard. Images are in this folder (`npm run screenshots` regenerates them).

## Store listing tab

**Name**: Sidepanel Bookmarks (from the manifest)

**Summary** (from `_locales/*/messages.json`, ≤132 characters)

- en: Open your bookmarks in the side panel and browse sites right there, with mobile layouts and several pages kept open.
- ja: ブックマークをサイドパネルに表示し、そのままパネル内でサイトを開きます。モバイル表示と複数ページの保持に対応。

**Category**: Productivity → Tools

**Language**: English (add Japanese as a second language with the text below)

**Description (English)**

```
Keep your bookmarks in Chrome's side panel and open them right there, next to the page you are working on — like the Edge sidebar.

• Bookmark folder tree with fast search (Enter opens the first match)
• Click a bookmark to open the site inside the side panel; Ctrl/Cmd/Shift-click still opens a normal tab
• Back, forward, reload and "open in a tab" in the panel header
• Mobile layout by default so sites fit the narrow panel; switch any site to desktop layout with one click
• Keep several pages open (3 by default, 1–5 in Settings) and switch between them without reloading
• Sign-ins and site cookies work like a normal tab
• Clear message with "Open in tab" when a site cannot be shown in a frame (sign-in pages, Cloudflare checks, HTTP errors)
• Keyboard navigation (arrow keys, Home/End, Alt+Shift+B to toggle the list) and screen reader support
• English and Japanese interface

Privacy: no analytics, no tracking, no remote code. Nothing leaves your browser.

How it works: many sites refuse to be shown inside a frame. While the side panel is open, the extension removes those embedding restrictions only for frames inside the side panel. Normal tabs are never changed, and the rules are removed when the last side panel closes.

Open source: https://github.com/hjosugi/sidepanel
```

**Description (日本語)**

```
Chrome のサイドパネルにブックマークを並べ、作業中のページの横でそのまま開けます（Edge のサイドバーのような使い方）。

• フォルダのツリー表示と高速な検索（Enter で最初の候補を開く）
• クリックしたサイトをサイドパネル内で表示。Ctrl/Cmd/Shift+クリックは通常のタブで開く
• ヘッダーに戻る・進む・再読み込み・タブで開く
• 既定はモバイル表示で狭いパネルに合わせる。サイトごとにワンクリックでデスクトップ表示へ切替
• 複数のページ（既定 3、設定で 1〜5）を保持し、再読み込みなしで切り替え
• ログイン状態やサイトの Cookie は通常のタブと同じように動作
• フレーム内で表示できないサイト（ログイン画面、Cloudflare の確認、HTTP エラー）では「タブで開く」を案内
• キーボード操作（矢印キー、Home/End、Alt+Shift+B で一覧の開閉）とスクリーンリーダー対応
• 英語・日本語の UI

プライバシー: 解析・追跡・リモートコードはありません。データは一切ブラウザの外に送信しません。

仕組み: 多くのサイトはフレーム内での表示を禁止しています。サイドパネルを開いている間だけ、パネル内のフレームに限ってその制限を外します。通常のタブは変更せず、最後のパネルを閉じるとルールを削除します。

ソースコード: https://github.com/hjosugi/sidepanel
```

**Graphics**

| Asset | File |
| --- | --- |
| Store icon 128×128 | `icons/128.png` |
| Screenshots 1280×800 | `store/screenshot-1.png`, `store/screenshot-2.png`, `store/screenshot-3.png` |
| Small promo tile 440×280 | `store/promo-small.png` |

**Homepage URL**: https://github.com/hjosugi/sidepanel
**Support URL**: https://github.com/hjosugi/sidepanel/issues

## Privacy tab

**Single purpose**

```
Show the user's bookmarks in the Chrome side panel and open the selected bookmark inside the side panel.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The whole user interface (bookmark list and the page viewer) lives in the side panel. |
| `bookmarks` | Reads the user's bookmarks to show them as a tree and to search them. Bookmarks are never modified or sent anywhere. |
| `favicon` | Shows each bookmark's site icon from the browser's favicon cache. |
| `declarativeNetRequestWithHostAccess` | While the side panel is open, session rules remove X-Frame-Options / CSP frame-ancestors and adjust Sec-Fetch and User-Agent headers only for requests that belong to no tab (frames inside the side panel), so bookmarked sites can be displayed there. Normal tabs are never affected. |
| `scripting` | Registers content scripts while the panel is open. They run only in frames directly inside the side panel and report the page URL/title, follow single-page-app navigation, align navigator.userAgent with the mobile layout and make document.cookie behave like a normal tab. |
| `storage` | Saves the user's settings (language, mobile layout, number of pages kept open, sites shown in desktop layout). |
| `webRequest` | Read-only observation of side-panel frames: detects HTTP errors to show an "Open in tab" message, and checks embedding headers of nested frames so frames a site does not allow to be embedded are removed. |
| `cookies` | Gives the page open in the side panel the same non-HttpOnly cookies it would see in a normal tab via document.cookie. HttpOnly cookies are never exposed, and a page can only write cookies for its own site. |
| Host permission `<all_urls>` | The user can bookmark and open any site in the side panel, so the header rules, content scripts and cookie access must work for any site. |

**Remote code**: No, I am not using remote code.

**Data usage**: none of the data types are collected (everything is processed locally and never transmitted). Check all three certifications (no sale to third parties, no use unrelated to the single purpose, no use for creditworthiness/lending).

**Privacy policy URL**: https://github.com/hjosugi/sidepanel/blob/main/PRIVACY.md

## Distribution tab

Free, all regions, Public.

## Test instructions

Not needed (no account required). Optional note for reviewers:

```
Click the toolbar icon to open the side panel, then click any bookmark. The site opens inside the panel. The sliders button next to the search box opens the settings.
```
