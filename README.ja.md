<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Sidepanel Bookmarks

Chrome のサイドパネルにブックマークを並べ、クリックしたページを**そのままパネル内で**開く、ビルド不要の Chrome MV3 拡張機能です（Edge のサイドバーのような使い方）。UI は英語が既定で、実行中に日本語へ切り替えられます。

## 機能

- ツールバーのボタンでサイドパネルを開閉。<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> でブックマーク一覧を開閉
- ブックマークをフォルダのツリーで表示（開閉状態を記憶）
- 検索（Enter で最初の候補を開く、「さらに表示」で続きを表示）
- ブックマークをパネル内で開く。Ctrl / Cmd / Shift / 中クリックは通常のタブで開く
- ツールバー: ☰ 一覧、‹ › 戻る/進む、⟳ 再読み込み、↗ 表示中のページをタブで開く
- 既定はモバイル表示: モバイルの UA、Client Hints、`navigator.userAgent` で狭いパネルに合わせる
  - サイトごとに 🖥/📱 を切替。選択は記憶
- 複数のページを保持（既定 3、設定で 1〜5）。開いているページのタブ列から Gmail ⇄ Claude ⇄ Keep を再読み込みなしで切り替え
- ページのタイトルと SPA（`pushState`）の URL に追従
- HTTP エラー、ログイン画面、Cloudflare の確認では「タブで開く」付きの案内バーを表示
  - モバイル表示で Cloudflare の確認が出たら、ワンクリックでデスクトップ表示に切り替えられる（デスクトップ表示ならパネル内で確認が終わる）
- パネル内の `document.cookie` を、通常のタブと同じ非 HttpOnly Cookie の見え方に（[#16](https://github.com/hjosugi/sidepanel/issues/16)）
- 埋め込み禁止のネストした iframe は表示せず除去
- キーボード操作（↑↓←→、Home/End）、ARIA ラベル、状態の読み上げ
- 設定ページ（検索欄の右のボタン、または拡張機能のオプション）: 言語、モバイル表示、保持するページ数、デスクトップ表示にするサイト

## インストール

Chrome ウェブストアへの掲載を準備中です（[docs/RELEASE.ja.md](docs/RELEASE.ja.md)）。それまでは:

1. [Releases](https://github.com/hjosugi/sidepanel/releases) から zip をダウンロードして展開（または `git clone`）
2. `chrome://extensions` を開き、**デベロッパーモード**をオン
3. **パッケージ化されていない拡張機能を読み込む**で展開したフォルダを選ぶ
4. ツールバーのアイコンを固定してクリック

Chrome 128 以降が必要です。Brave や Edge など Chromium 系のブラウザでも動きます。

## 仕組みと権限

多くのサイトは `X-Frame-Options` や CSP の `frame-ancestors` で埋め込みを拒否します。この拡張は declarativeNetRequest のセッションルールで、**タブに属さないリクエスト**（サイドパネル内の iframe）に限ってそれらのヘッダーを外します。通常のタブには影響しません。ルールとコンテンツスクリプトはサイドパネルを開いている間だけ有効で、最後のパネルを閉じると削除されます。

Google の一部サービスは `Sec-Fetch-Dest: iframe` をサーバー側で拒否するので、パネル内のフレームではリクエストヘッダーを最上位のナビゲーションと同じ形に書き換えます。これで Google Keep、カレンダー、ドライブ、コンタクト、ToDo リストが開けます（[#1](https://github.com/hjosugi/sidepanel/issues/1)）。

Cloudflare のチャレンジ用フレーム（`challenges.cloudflare.com`）にはモバイル UA を送りません。Turnstile は自分のフレームの `User-Agent` ヘッダーと `navigator.userAgent` を照合するため、ここでヘッダーを書き換えると確認が終わらなくなります（[#17](https://github.com/hjosugi/sidepanel/issues/17)）。

| 権限 | 理由 |
| --- | --- |
| `sidePanel` | サイドパネルを表示する |
| `bookmarks` | ブックマークを読む |
| `favicon` | サイトのアイコンを表示する |
| `declarativeNetRequestWithHostAccess` + `<all_urls>` | パネル内のフレームに限り、埋め込み禁止ヘッダーを外し、モバイル UA を送る |
| `scripting` | パネルを開いている間、URL/タイトルの追跡、SPA のフック、UA の調整、Cookie の橋渡しを注入する |
| `storage` | バックグラウンドと共有する設定を保存する |
| `webRequest` | フレームの URL、HTTP の失敗、元の埋め込みヘッダーを読み取る（読み取り専用） |
| `cookies` | パネル内のフレームに、通常のタブと同じ非 HttpOnly の `document.cookie` を見せる |

拡張そのものには実行時の依存、ビルド工程、解析、リモートコードがありません。データはブラウザの外に出ません（[プライバシーポリシー](docs/PRIVACY.ja.md)）。

## 制限

- iframe 内で完結しないサイト（Google のログイン）は、↗ や案内バーからタブで開いてください
- Cloudflare の確認（ChatGPT など）はデスクトップ表示でしか終わりません。モバイル表示ではページとそのスクリプトが別々の UA を送るためです。案内バーの「デスクトップ表示」か 📱/🖥 で切り替えてください（[#17](https://github.com/hjosugi/sidepanel/issues/17)）
- `X-Frame-Options` を外すのは安全ですが、`frame-ancestors` を含む CSP は DNR で一部だけ書き換えられないため**ヘッダー全体**を外します（パネル直下のフレームのみ）
- パネルは 1 つの文書なので、履歴はすべてのページで共通です。‹ は表示中のページを必ず戻しますが、それより後に遷移した非表示のページもその時点の状態に戻ります
- HttpOnly Cookie は `document.cookie` に出しません。初回の読み込みでは Cookie の反映が数 ms 遅れることがあり、次回のために `sessionStorage` にキャッシュします
- シークレットウィンドウとブックマークレット（`javascript:`）は非対応です。`chrome://` のページはタブで開きます
- 次回は最後に表示していた URL（SPA 内の遷移を含む）を復元します。ブックマークの元の URL とは限りません
- モバイル UA は経験則です。デスクトップ表示が前提のサイトは 📱/🖥 で切り替えてください

## 開発

```sh
npm ci
npm run release:check   # lint、ユニットテスト、ヘッドレスのサイドパネルのスモークテスト
npm run release:zip     # release:check の後に .release/ を作る
```

| コマンド | 内容 |
| --- | --- |
| `npm run lint` | Biome と、マニフェスト・同梱ファイル・i18n のチェック |
| `npm run test:unit` | 純粋関数（ルール、埋め込み判定、Cookie の解析、設定）のテスト |
| `npm test` | ヘッドレスの Brave（または `BROWSER_BIN`）に拡張を読み込み、実際のサイドパネルを開いて、ローカルサーバー相手に DNR のヘッダー、SPA の追従、モバイル UA、案内バー、ネストしたフレームの除去、Cookie の橋渡し、設定、ルールの後始末を確認 |
| `npm run release:package` | `.release/sidepanel-bookmarks-vX.Y.Z.zip` とチェックサム・メタデータ・ノート・テスター向けガイドだけを作る |
| `npm run release:store:assets` | ストア用のスクリーンショットとプロモーションタイルを `.release/store-assets/` に出力 |
| `npm run version:set -- X.Y.Z` | `package.json`、`package-lock.json`、`manifest.json` のバージョンを設定 |
| `npm run compat` | 主要サイトを `Sec-Fetch-Dest: iframe` で確認 |

ブランド版の Google Chrome は 137 以降 `--load-extension` を無視するので、`npm test` には Brave、Chromium、Chrome for Testing を使ってください。CI は Chrome for Testing で、展開したリリース用 zip に対してスモークテストを実行します。

リリースは自動です。バージョンを上げたコミットが `main` に入ると、zip を作り、設定済みなら Chrome ウェブストアに提出し、その後でタグと GitHub Release を作ります。詳しくは [docs/RELEASE.ja.md](docs/RELEASE.ja.md)。

## ライセンス

MIT
