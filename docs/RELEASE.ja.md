<!-- i18n: language-switcher -->
[English](RELEASE.md) | [日本語](RELEASE.ja.md)

# リリース

拡張を `main` から GitHub Releases と Chrome ウェブストアへ出す手順です。

## 掲載情報

- ストアのページ: <https://chromewebstore.google.com/detail/idjfdgpakkmopepemimbpaaippmichdf>（アイテム ID `idjfdgpakkmopepemimbpaaippmichdf`）。初回の審査中で、承認後にページが開けるようになる
- プライバシーポリシー: `docs/PRIVACY.md`。掲載ページが GitHub の URL でリンクするので、移動や改名をしないこと
- サポート: GitHub の issue

ストアは審査を通ってから更新されるので、公開中のバージョンは `main` より古いことがあります。

## 通常のリリース

バージョンを上げたコミットが `main` に入ることがリリースです。手作業はこれだけです。

```sh
pnpm run version:set X.Y.Z      # package.json、manifest.json
pnpm run release:zip            # 全チェックの後に .release/ を作る
git switch -c release-X.Y.Z
git commit -am "Release X.Y.Z"
git push -u origin HEAD         # PR を作り、チェックを待ってマージ
```

`main` への push で `.github/workflows/chrome-webstore-release.yml` が次を行います。

1. `Resolve release target` が、`vX.Y.Z` のタグがまだないので `publish=true` にする（タグ済みのバージョンなら zip を作るだけ）
2. チェックを実行して zip を作り、実行の成果物として残す
3. **ストアのアイテムが設定済みなら**（[認証情報](#認証情報)）、zip をストアにアップロードして審査に出す。未設定の間はこの手順を飛ばす
4. その後でだけ、`github-release` ジョブがコミットに `vX.Y.Z` のタグを付け、zip・チェックサム・テスター向けガイド付きの GitHub Release を作る

`gh run watch` で見守り、ダッシュボードで「審査待ち」になったことを確認します。

守ること:

- `main` がリリースするバージョンのタグを手で push しない。自動で付いたタグで 2 回目の実行は起きません。手で push した `vX.Y.Z` タグもそのタグをリリースしますが、`pnpm run version:set` が書いたバージョンと一致している必要があります。
- ストアに出せる提出は一度に 1 つです。審査待ちのバージョンを置き換えるときは、ワークフローを `cancel_submission: true` で手動実行（または `pnpm run release:store:cancel`）してから、いつも通りバージョンを上げてマージします。
- 通常のリリースでダッシュボードの「公開」ボタンを押さない。

## バージョン

`package.json` と `manifest.json` は常に同じバージョンにします。食い違うとワークフローと `pnpm run lint` が失敗します。`pnpm run version:set X.Y.Z` が 2 つをまとめて書き換えます。

- パッチ: 修正、サイト互換の調整、ドキュメント
- マイナー: 利用者に見える機能や設定
- メジャー: 保存済みの設定を壊す変更、新しい権限が必要な変更

## チェック

```sh
pnpm install
pnpm run release:check
```

`release:check` は Biome、マニフェスト・同梱ファイル・i18n の lint、ユニットテスト、ヘッドレスのサイドパネルのスモークテストを実行します。スモークテストには `--load-extension` が効く Chromium 系ブラウザ（Brave、Chromium、Chrome for Testing。`BROWSER_BIN` で指定）が必要です。ブランド版の Google Chrome は 137 以降このフラグを無視します。

実際のサイトに依存するので `release:check` には入れていないもの:

- `pnpm run compat`: 主要サイトに `Sec-Fetch-Dest: iframe` で問い合わせ、ステータスと埋め込みヘッダーを記録（Site compatibility ワークフローでも週 1 回実行）
- `PROFILE_DIR=… node scripts/site-probe.mjs`: ログイン済みプロファイルのコピーで実際のサイトをサイドパネルに開く。`HEADED=1` でウィンドウを表示（Cloudflare はヘッドレスをボットと判定しやすい）、`SITES=ChatGPT,Claude` で対象を絞る（URL も書ける）。Cloudflare の確認でデスクトップ表示が案内されたら、切り替えてもう一度結果を出す

フレーム、Cookie、ナビゲーションを変えたリリースの前には手で確認します。展開した拡張を読み込み、いくつかのサイト（メール、カレンダー、AI チャット）にログインしてパネルで開き、タブ列で切り替え、戻る・再読み込み・タブで開くを使います。

## zip

`pnpm run release:zip` は `.release/`（Git では無視）に出力します。

- `sidepanel-bookmarks-vX.Y.Z.zip`、`.sha256`、`.release.json`
- `sidepanel-bookmarks-vX.Y.Z-notes.md`、`-tester-install.md`

zip に入るのは `scripts/package-files.mjs` に並べたファイルだけで、ビルド工程はありません。タイムスタンプを固定しているので、同じソースからは同じ SHA-256 になります。CI は zip を展開したものでスモークテストを実行します。

展開して読み込むテスターの手順: 解凍し、`chrome://extensions` でデベロッパーモードをオンにして「パッケージ化されていない拡張機能を読み込む」からフォルダを選ぶ。不具合のときはブラウザのバージョン、OS、サイトの URL、サイドパネルのコンソールのエラーをもらいます。

## ワークフローとローカルのコマンド

`Chrome Web Store Release` ワークフローの手動実行（`workflow_dispatch`）:

| 入力 | 動作 |
| --- | --- |
| `status_only: true` | ストアの状態を取るだけ（認証情報の確認） |
| `cancel_submission: true` | 審査待ちの提出を取り消す |
| `publish_only: true` | 既存の下書きを公開する。アップロードはしない |
| `publish: false` | アップロードだけして、公開は後で |
| `version` | パッケージ前にバージョンを設定する。リポジトリに書き戻さないので緊急時のみ |
| `skip_review`, `deploy_percentage` | 可能なら審査の省略を依頼、段階的な公開 |
| `dry_run: true` | 検証して API 呼び出しを表示するだけ。通信しない |

認証情報を環境変数に入れれば、シェルからも同じことができます。

```sh
pnpm run release:store:status
pnpm run release:store:upload
pnpm run release:store:publish
pnpm run release:store:cancel
pnpm run release:store           # release:zip の後にアップロードと提出
node scripts/chrome-webstore.mjs submit --dry-run
```

環境変数での制御: `CHROME_WEBSTORE_SKIP_REVIEW=1`、`CHROME_WEBSTORE_DEPLOY_PERCENTAGE=25`、`CHROME_WEBSTORE_BLOCK_ON_WARNINGS=0`（既定では API の警告があると公開を止めるので、ポリシー上の警告がそのまま公開につながることはありません）、`CHROME_WEBSTORE_UPLOAD_POLL_ATTEMPTS=24`、`CHROME_WEBSTORE_UPLOAD_POLL_DELAY_MS=5000`。

### 認証情報

GitHub リポジトリの secrets に入れます。ストアの手順は 2 つの ID が両方あるときだけ動きます。推奨はサービスアカウントと GitHub OIDC（Workload Identity Federation）です。

```text
CHROME_WEBSTORE_PUBLISHER_ID
CHROME_WEBSTORE_EXTENSION_ID
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

代替: パブリッシャーのアカウントで `https://www.googleapis.com/auth/chromewebstore` スコープの OAuth リフレッシュトークンを発行し、`CHROME_WEBSTORE_CLIENT_ID`、`CHROME_WEBSTORE_CLIENT_SECRET`、`CHROME_WEBSTORE_REFRESH_TOKEN` に入れます。ローカルでは `CHROME_WEBSTORE_ACCESS_TOKEN` も使えます。

`scripts/chrome-webstore.mjs` はパブリッシャー ID、サービスアカウント、OAuth の秘密情報を `***` で表示するので、出力はそのまま issue に貼れます。これらの値を手で書き戻さないこと。パブリッシャー ID は UUID で、公開リポジトリでは GitHub のシークレットスキャンが裸の UUID を検出するため、variables ではなく secrets に入れます。

## 失敗したとき

アップロードに失敗しても掲載は変わらず、最後に承認されたバージョンが公開されたままです。タグもまだ付いていません。

- **`does not match`**: パッケージ、マニフェスト、手で push したタグのバージョンが食い違っています。`pnpm run version:set X.Y.Z` を実行してコミットします。間違ったタグは `git push origin ":refs/tags/<tag>"` で消します。
- **アップロードや公開が一時的に失敗した**: 失敗したジョブを再実行すると、同じバージョンで再試行します。`github-release` だけが失敗したならそのジョブだけ再実行します。ストアへの提出は繰り返されません。
- **`Missing required configuration`**: secret が足りません（`gh secret list | grep -E 'CHROME_WEBSTORE_|GCP_'`）。
- **`publishers/<id>/items/<id>` への `403 PERMISSION_DENIED`**: トークンは有効ですが、その ID のアイテムを扱う権限がありません。`CHROME_WEBSTORE_EXTENSION_ID`、`CHROME_WEBSTORE_PUBLISHER_ID` がそのアイテムを持つパブリッシャーであること、`GCP_SERVICE_ACCOUNT` がダッシュボードでパブリッシャーに追加され招待が承認済みであること、`GCP_WORKLOAD_IDENTITY_PROVIDER` がこのリポジトリを指していること、Google Cloud プロジェクトで Chrome Web Store API が有効なことを確認します。確認し直すには `pnpm run release:store:status`。バージョンを上げて回避しようとしないこと。
- **アップロードは成功し、警告で公開に失敗した**: ログを読み、ダッシュボードで警告を直し、パッチバージョンを上げてリリースし直します。
- **審査で却下された**: 理由を issue に書き、コード・権限・掲載文・プライバシーの回答を直し、パッチバージョンを上げてリリースし直します。

## ロールバック

すぐに戻す手段はありません。できるならダッシュボードで公開を止め、ソースを直し、パッチバージョンを上げてリリースし直します。展開して使っているテスターには、古いフォルダを削除して新しいものを読み込んでもらいます。

---

## 付録: ストアのアイテムの初期設定

一度だけ行う作業です。アイテムの監査や作り直し、掲載文を変えるときの貼り付け元として残しています。API ではアイテムを作れないので、初回のアップロードはダッシュボードで行います。

1. <https://chrome.google.com/webstore/devconsole> で Chrome ウェブストアのデベロッパー登録をし（登録料は初回のみ。アカウントには 2 段階認証が必要）、アカウントのページにプライバシーポリシーの URL を設定する。
2. 「新しいアイテム」から `.release/sidepanel-bookmarks-vX.Y.Z.zip`（または最新の GitHub Release に添付された zip）をアップロードする。
3. 以下の内容を各タブに入力し、「審査のため送信」。
4. このファイルの先頭にアイテム ID を書き、以後のリリースを自動にするため [Google Cloud と GitHub](#google-cloud-と-github) を設定する。

### 掲載文

- 名前: `Sidepanel Bookmarks`
- 概要: ロケール文字列 `appDesc`（`_locales/*/messages.json`、132 文字まで）
- カテゴリ: 仕事効率化 → ツール。掲載言語: 英語と日本語
- 詳細な説明（英語）: [RELEASE.md](RELEASE.md#store-listing) を参照
- 詳細な説明（日本語）:

  ```text
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

- ホームページ URL: `https://github.com/hjosugi/sidepanel`。サポート URL: `https://github.com/hjosugi/sidepanel/issues`
- 画像: `icons/128.png`。`pnpm run release:store:assets` で、架空のデモサイトを使った 1280×800 のスクリーンショット 3 枚と 440×280 の小さなプロモーションタイルを `.release/store-assets/` に出力できます

### プライバシーとデータの使用

単一用途、権限ごとの理由、テスト手順は英語で入力します（[RELEASE.md](RELEASE.md#privacy-and-data-use) の文面をそのまま貼る）。

- リモートコード: 「いいえ、リモートコードを使用していません」
- データの使用: どの種類にもチェックしない（すべて端末内で処理し、送信しないため）。3 つの開示にはすべてチェック
- プライバシーポリシーの URL: `https://github.com/hjosugi/sidepanel/blob/main/docs/PRIVACY.md`

### Google Cloud と GitHub

[RELEASE.md](RELEASE.md#google-cloud-and-github) のスクリプトを `bash` で、値を自分のものに置き換えて実行します。続けて:

1. ダッシュボード（アカウント → パブリッシャーの設定）で `$SA_EMAIL` をサービスアカウントとして追加する。
2. secrets を入れる。

   ```sh
   gh secret set CHROME_WEBSTORE_PUBLISHER_ID -b "<publisher id>"
   gh secret set CHROME_WEBSTORE_EXTENSION_ID -b "<item id>"
   gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER -b "$GCP_WORKLOAD_IDENTITY_PROVIDER"
   gh secret set GCP_SERVICE_ACCOUNT -b "$SA_EMAIL"
   ```

3. ワークフローを `status_only: true` で実行する。`Fetch Chrome Web Store status` が成功し、ビルドやアップロードが走らなければ完了。
