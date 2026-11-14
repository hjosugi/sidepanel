# Sidepanel Bookmarks

A zero-build Chrome extension that puts your bookmarks in the side panel and opens pages **inside the panel**, like the Edge sidebar. The UI is English by default and can be switched to Japanese at runtime.

## Features

- Open/close the side panel from the toolbar button
- Browse bookmarks as a folder tree (open/closed state is remembered)
- Search bookmarks (Enter opens the first match, "Show more" reveals the rest)
- Open a bookmark in the panel; Ctrl / Cmd / Shift / middle click still opens a normal tab
- Toolbar: ☰ list, ‹ › back/forward, ⟳ reload, ↗ open current page in a tab
- Mobile layout by default: a mobile UA, Client Hints, and `navigator.userAgent` are used to fit the narrow panel
  - Toggle 🖥/📱 per site; the choice is remembered
- Keep up to 3 pages alive (LRU). A tab strip appears for open pages, so Gmail ⇄ Claude ⇄ Keep switches without reloading
- Page titles and SPA (`pushState`) URLs are tracked from a content script
- Fallback bar for HTTP errors and sign-in pages, with "Open in tab"
- `document.cookie` in the panel behaves like a normal tab for non-HttpOnly cookies
  (see [#16](https://github.com/hjosugi/sidepanel/issues/16))
- Nested iframes that would otherwise be blocked are removed instead of being exposed
- Keyboard navigation (↑↓←→, Home/End), ARIA labels, live status messages
- English / 日本語 switch in the header (English is the default)

## Install

1. Download the zip from [Releases](https://github.com/hjosugi/sidepanel/releases) and extract it (or `git clone`)
2. Open `chrome://extensions`, turn on **Developer mode**
3. **Load unpacked** and select the extracted folder
4. Pin the toolbar icon and click it

Chrome 128+ is required. Chromium-based browsers such as Brave and Edge also work.

## How it works and permissions

Many sites refuse to be embedded with `X-Frame-Options` or CSP `frame-ancestors`. This extension uses declarativeNetRequest session rules to remove those headers **only for requests that do not belong to a tab** (i.e. the iframes inside the side panel). Normal tabs are never affected.

Some Google services reject `Sec-Fetch-Dest: iframe` at the server. For panel frames the request headers are rewritten to look like a top-level navigation. Google Keep, Calendar, Drive, Contacts and Tasks then load (see [#1](https://github.com/hjosugi/sidepanel/issues/1)).

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the side panel |
| `bookmarks` | Read bookmarks |
| `favicon` | Show site icons |
| `declarativeNetRequestWithHostAccess` + `<all_urls>` | Remove embedding blockers and set the mobile UA only in panel frames |
| `scripting` | Inject the URL/title tracker, SPA hook, UA shim and cookie shim while the panel is open |
| `storage` | Store settings shared with the background worker |
| `webRequest` | Observe the current frame URLs, HTTP failures and the original embedding headers (read-only) |
| `cookies` | Give panel frames the same non-HttpOnly view of `document.cookie` as a normal tab |

The extension itself has no runtime dependencies and no build step. Development dependencies are only for linting, tests and packaging.

## Limitations

- Some sites cannot work in a frame at all (Google sign-in, Cloudflare challenges). Use ↗ / the fallback bar to open them in a tab.
- Removing `X-Frame-Options` is safe, but a CSP containing `frame-ancestors` has to have the **whole** CSP header removed, because DNR cannot edit a single directive. This only applies to direct panel frames.
- HttpOnly cookies are intentionally never exposed to `document.cookie`. The shim uses non-HttpOnly cookies from the browser cookie store; on the very first load the jar may arrive a few milliseconds late. The last jar is cached in `sessionStorage` for the next load.
- Storage access / cookies in incognito windows are not handled separately.
- Bookmarklets (`javascript:`) are not supported and are shown disabled. `chrome://` pages open in a tab.
- The last visited URL is restored, including SPA navigations; it is not necessarily the bookmark's original URL.
- Search text stays until you clear it. In the list, Esc clears the search first, then closes the list.
- Mobile UA is a heuristic. Use the 📱/🖥 button for sites that expect a desktop layout.

## Development

```sh
npm install
npm test        # headless browser smoke test (Brave by default, or BROWSER_BIN=google-chrome)
npm run lint    # manifest / syntax / i18n key checks
npm run zip     # build dist/sidepanel-bookmarks-<version>.zip
```

The smoke test launches a real headless Chromium browser, loads the unpacked extension, opens the actual side panel through `chrome.sidePanel.open`, and verifies DNR headers, SPA tracking, mobile UA, error fallback, nested-frame blocking and the cookie shim against a local server.

## 日本語

Chrome のサイドパネルにブックマークを並べ、クリックしたページをそのままパネル内で開く拡張機能です。UI は英語が既定で、ヘッダーの **EN/JA** ボタンから日本語に切り替えられます。

主な機能:

- ブックマークのツリー表示・検索・開閉状態の記憶
- パネル内表示、戻る/進む、再読み込み、タブで開く
- モバイル UA による幅最適化（サイト別にデスクトップ表示へ切替可能）
- 最大 3 ページを保持し、開いているページのタブ列から Gmail ⇄ Claude ⇄ Keep を再読み込みなしで切り替え
- SPA の URL・タイトル追従、HTTP エラー/ログイン画面のフォールバック
- パネル内の `document.cookie` を通常タブと同じ非 HttpOnly Cookie の見え方に
- 埋め込み禁止のネスト iframe を表示せず除去（クリックジャッキング対策）
- キーボード操作・スクリーンリーダー対応

制限:

- Google ログインや Cloudflare チャレンジなど、iframe 内で完結しないサイトはタブで開いてください
- `frame-ancestors` を含む CSP はヘッダー全体を外す必要があります（パネル直下のフレームのみ）
- HttpOnly Cookie は `document.cookie` には出しません。初回読み込み時は Cookie の反映が数 ms 遅れることがあります
- シークレットウィンドウ、ブックマークレットは非対応です

## License

MIT
