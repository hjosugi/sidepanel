# Privacy Policy — Sidepanel Bookmarks

Last updated: 2026-11-14

Sidepanel Bookmarks does not collect, transmit, sell or share any personal data. It has no server, no analytics, no advertising and no remote code. Everything below happens locally in your browser.

## What the extension reads and why

| Data | Use | Leaves the browser? |
| --- | --- | --- |
| Bookmarks | Shown as a tree and searched in the side panel | No |
| Pages you open in the panel (URL, title) | Shown in the panel header and tab strip; the last URL is remembered so the panel can reopen it | No |
| Cookies of the page open in the panel | Non-HttpOnly cookies are handed to that same page so `document.cookie` works as in a normal tab. HttpOnly cookies are never exposed, and a page can only write cookies for its own site | No |
| Response headers of panel frames | Read to detect errors and to remove nested frames that a site does not allow to be embedded | No |
| Settings (language, mobile layout, pages kept open, sites shown in desktop layout) | Stored with `chrome.storage.local` | No |

Pages you open in the side panel are loaded directly from those sites, exactly as in a normal tab, and are subject to those sites' own privacy policies.

## Network changes

While a side panel is open, the extension modifies requests **only for frames inside the side panel**: it removes `X-Frame-Options` and CSP headers that block embedding, rewrites `Sec-Fetch-Dest`/`Sec-Fetch-Site`, and (unless disabled) sends a mobile user agent. Normal tabs are never affected, and these rules are removed when the last side panel closes.

## Contact

Questions or concerns: open an issue at https://github.com/hjosugi/sidepanel/issues

---

## プライバシーポリシー（日本語）

Sidepanel Bookmarks は個人データを収集・送信・販売・共有しません。サーバー、解析、広告、リモートコードはありません。以下の処理はすべてブラウザ内で完結します。

- **ブックマーク**: サイドパネルでの表示と検索のためだけに読み取ります
- **パネルで開いたページの URL・タイトル**: ヘッダーとタブ列に表示し、最後の URL を次回の復元用にローカル保存します
- **パネルで開いたページの Cookie**: 非 HttpOnly の Cookie を同じページに渡し、通常タブと同じように `document.cookie` を使えるようにします。HttpOnly Cookie は渡さず、ページが書き込めるのは自分のサイトの Cookie だけです
- **パネル内フレームの応答ヘッダー**: エラーの検知と、埋め込みを禁止しているネストしたフレームの除去に使います
- **設定**: `chrome.storage.local` に保存します

パネルを開いている間だけ、パネル内のフレームに限って埋め込み禁止ヘッダーの除去、`Sec-Fetch-*` の書き換え、モバイル UA の送信を行います。通常のタブには影響せず、最後のパネルを閉じるとこれらのルールは削除されます。

お問い合わせ: https://github.com/hjosugi/sidepanel/issues
