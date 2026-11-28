<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Sidepanel Bookmarks

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/idjfdgpakkmopepemimbpaaippmichdf?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/idjfdgpakkmopepemimbpaaippmichdf)

Chrome のサイドパネルにブックマークを並べ、クリックしたページを**そのままパネル内で**開く、ビルド不要の Chrome MV3 拡張機能です（Edge のサイドバーのような使い方）。UI は英語が既定で、実行中に日本語へ切り替えられます。

## 機能

- ツールバーのボタンでサイドパネルを開閉。<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> で一覧を開閉
- ブックマークをフォルダのツリーで表示（開閉状態を記憶）
- 一覧または ⋯ の「現在のブラウザータブをパネルで開く」で、見ているページを横に開ける。一覧には同じウィンドウのほかのタブも表示され、Ctrl / Cmd / Shift / 中クリックでそのタブに切り替えられる
- ブックマークと開いているタブを検索（Enter で最初の候補を開く。候補がなく入力がアドレスならそのページを開く。「さらに表示」で続きを表示）
- ブックマークをパネル内で開く。Ctrl / Cmd / Shift / 中クリックは通常のタブで開く
- ツールバーの ↗ で、表示中のページを新しいブラウザータブに移動。ブラウザーで URL が開いたらパネル側のタブが閉じる。両方に残すには ⋯ の「コピーを新しいブラウザータブで開く」を選ぶ
- パネル内のページをブラウザのズームと同じように拡大・縮小（50〜200%）: ⋯ メニューの − / +、またはパネルにフォーカスがあるときの <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd>。倍率はサイトごとに覚え、既定の倍率は設定で選べる
- アドレス欄（<kbd>Ctrl</kbd>+<kbd>L</kbd> / <kbd>Alt</kbd>+<kbd>D</kbd>）に URL または検索語を入力して Enter。既定では Google の検索結果がパネル内に開く。ブックマーク一覧の検索ボタンも同じ検索先を使う。「設定 → ウェブ検索エンジン」で Bing に切り替えられる
- ブラウザのようなタブ列: 開いているページはファビコン・タイトル・✕ の付いたタブになり（中クリックでも閉じる）、＋ で一覧を開いて別のページを選べる
- パネルのタブを右クリックしてピン留め・解除・閉じる。キーボードではタブにフォーカスして <kbd>Shift</kbd>+<kbd>F10</kbd>。ピン留めしたページを閉じても左端にピンが残る。クリックで開き直し、ドラッグで並べ替え
- パネルを開いたときの表示を選べる: 前回のページ、ブックマークとタブ、特定のページ（ホームページのように）
- 既定はモバイル表示: モバイルの UA、Client Hints、`navigator.userAgent` で狭いパネルに合わせる
  - サイトごとに 🖥/📱 を切替。選択は記憶
- 複数のページを保持（既定 3、設定で 1〜5）。タブを切り替えてもページはそのまま残るので、Gmail ⇄ Claude ⇄ Keep を再読み込みなしで切り替え
- Claude のチャット一覧がパネルでも使える: Claude はフレームの中ではチャット一覧を隠すため、設定したサイト（既定は Claude）ではフレームの中であることをページから隠す
- ページのタイトルと SPA（`pushState`）の URL に追従
- HTTP エラー、ログイン画面、Cloudflare の確認では「タブで開く」付きの案内バーを表示
  - モバイル表示で Cloudflare の確認が出たら、ワンクリックでデスクトップ表示に切り替えられる（デスクトップ表示ならパネル内で確認が終わる）
- パネル内の `document.cookie` を、通常のタブと同じ非 HttpOnly Cookie の見え方に（[#16](https://github.com/hjosugi/sidepanel/issues/16)）
- 埋め込み禁止のネストした iframe は表示せず除去
- キーボード操作（↑↓←→、Home/End）、ARIA ラベル、状態の読み上げ
- 設定ページ（検索欄の右のボタン、または拡張機能のオプション）: 言語、モバイル表示、保持するページ数、既定のズーム、開いたときの表示、ピン留めしたサイト、個別にズームしたサイト、デスクトップ表示にするサイト、通常のタブと同じ表示にするサイト

## インストール

[Chrome ウェブストア](https://chromewebstore.google.com/detail/idjfdgpakkmopepemimbpaaippmichdf)からインストールできます。

ストアは審査を通ってから更新されるので、公開中のバージョンはこのリポジトリより古いことがあります。最新版を使うには:

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
| `scripting` | パネルを開いている間、URL/タイトルの追跡、SPA のフック、UA の調整、Cookie の橋渡し、フレーム判定の調整を注入する |
| `storage` | バックグラウンドと共有する設定を保存する |
| `webRequest` | フレームの URL、HTTP の失敗、元の埋め込みヘッダーを読み取る（読み取り専用） |
| `cookies` | パネル内のフレームに、通常のタブと同じ非 HttpOnly の `document.cookie` を見せる |

ブックマークとタブの絞り込みは端末内で行います。ウェブ検索を実行すると、選択中の検索エンジンに検索語を送ります。[プライバシーポリシー](docs/PRIVACY.ja.md)

## 制限

- iframe 内で完結しないサイト（Google のログイン）は、↗ や案内バーからタブで開いてください
- Cloudflare の確認（ChatGPT など）はデスクトップ表示でしか終わりません。モバイル表示ではページとそのスクリプトが別々の UA を送るためです。案内バーの「デスクトップ表示」か 📱/🖥 で切り替えてください（[#17](https://github.com/hjosugi/sidepanel/issues/17)）
- `X-Frame-Options` を外すのは安全ですが、`frame-ancestors` を含む CSP は DNR で一部だけ書き換えられないため**ヘッダー全体**を外します（パネル直下のフレームのみ）
- パネルは 1 つの文書なので、履歴はすべてのページで共通です。‹ は表示中のページを必ず戻しますが、それより後に遷移した非表示のページもその時点の状態に戻ります
- HttpOnly Cookie は `document.cookie` に出しません。初回の読み込みでは Cookie の反映が数 ms 遅れることがあり、次回のために `sessionStorage` にキャッシュします
- シークレットウィンドウとブックマークレット（`javascript:`）は非対応です。`chrome://` のページはタブで開きます
- 次回は最後に表示していた URL（SPA 内の遷移を含む）を復元します。ブックマークの元の URL とは限りません
- モバイル UA は経験則です。デスクトップ表示が前提のサイトは 📱/🖥 で切り替えてください
- 開いているタブの一覧は、今のウィンドウの `http(s)` のタブだけです
- フレーム判定の調整が答えるのは、サイトのスクリプトファイルに書かれた `self` と `top` の比較だけです（Claude はこの方法で判定しています）。ほかの方法やインラインスクリプトで判定するサイトには、フレームの中であることが見えたままです。新しい版のスクリプトを初めて読み込んだときは、そのスクリプトを HTTP キャッシュから読み直し、結果をそのサイトの `localStorage`（`spb:unframe`）に覚えます
- フレームはサイトごとに 1 つなので、ピンはサイト全体を表します。ピン留めしたサイトの別のページに移っても、そのピンが表示中になります

## 開発

拡張を読み込むときは、`manifest.json` があるリポジトリのルートを選びます。実装は用途別に `src/` に置いています。

| ディレクトリ | 内容 |
| --- | --- |
| [src/sidepanel/](src/sidepanel/) | パネル画面、ブックマーク一覧・検索、タブ操作 |
| [src/options/](src/options/) | 設定画面 |
| [src/background/](src/background/) | サービスワーカーとリクエストルール |
| [src/content/](src/content/) | ページ内で動くコンテンツスクリプト |
| [src/shared/](src/shared/) | 設定の保存、翻訳、URL、ズームの共通処理 |

開発ツールは [pnpm](https://pnpm.io/) を使います。バージョンは `package.json` の `packageManager` で固定しています。

```sh
pnpm install
pnpm run release:check  # lint、ユニットテスト、ヘッドレスのサイドパネルのスモークテスト
pnpm run release:zip    # release:check の後に .release/ を作る
```

| コマンド | 内容 |
| --- | --- |
| `pnpm run lint` | Biome と、マニフェスト・同梱ファイル・i18n のチェック |
| `pnpm run test:unit` | 純粋関数（ルール、埋め込み判定、Cookie の解析、設定、アドレスの解釈、ピンの照合）のテスト |
| `pnpm test` | ヘッドレスの Brave（または `BROWSER_BIN`）に拡張を読み込み、実際のサイドパネルを開いて、ローカルサーバー相手に DNR のヘッダー、SPA の追従、モバイル UA、案内バー、ネストしたフレームの除去、Cookie の橋渡し、フレーム判定の調整、アドレス欄、開いているタブ、ピン留め、開いたときの表示、設定、ルールの後始末を確認 |
| `pnpm run release:package` | `.release/sidepanel-bookmarks-vX.Y.Z.zip` とチェックサム・メタデータ・ノート・テスター向けガイドだけを作る |
| `pnpm run release:store:assets` | ストア用のスクリーンショットとプロモーションタイルを `.release/store-assets/` に出力 |
| `pnpm run version:set X.Y.Z` | `package.json` と `manifest.json` のバージョンを設定 |
| `pnpm run compat` | 主要サイトを `Sec-Fetch-Dest: iframe` で確認 |

ブランド版の Google Chrome は 137 以降 `--load-extension` を無視するので、`pnpm test` には Brave、Chromium、Chrome for Testing を使ってください。CI は Chrome for Testing で、展開したリリース用 zip に対してスモークテストを実行します。

リリースは自動です。バージョンを上げたコミットが `main` に入ると、zip を作り、設定済みなら Chrome ウェブストアに提出し、その後でタグと GitHub Release を作ります。詳しくは [docs/RELEASE.ja.md](docs/RELEASE.ja.md)。

## ライセンス

MIT
