# Publishing to the Chrome Web Store

The Chrome Web Store API cannot create a new item, so the first version is uploaded by hand. After that, every `v*` tag is uploaded and submitted for review by the Release workflow.

## First submission (once)

1. Register as a Chrome Web Store developer at https://chrome.google.com/webstore/devconsole (one-time fee; the Google account needs 2-step verification).
2. Set the privacy policy URL on the account page: https://github.com/hjosugi/sidepanel/blob/main/PRIVACY.md
3. **Add new item** and upload the zip from the latest [release](https://github.com/hjosugi/sidepanel/releases).
4. Fill in the Store listing, Privacy and Distribution tabs from [listing.md](listing.md), with the images in this folder.
5. **Submit for review**.

## Automatic updates (after the item exists)

1. In Google Cloud: enable the **Chrome Web Store API**, configure the OAuth consent screen (External, add your account as a test user) and create an OAuth client of type *Web application* with the redirect URI `https://developers.google.com/oauthplayground`.
2. In the [OAuth Playground](https://developers.google.com/oauthplayground), use your own client ID/secret, authorize the scope `https://www.googleapis.com/auth/chromewebstore` and exchange the code for a refresh token.
3. In the GitHub repository settings, add:
   - Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
   - Variables: `CWS_PUBLISHER_ID` (Dashboard → Publisher → Settings) and `CWS_EXTENSION_ID` (the 32-character item ID)
4. Release as usual: bump the version, push a `vX.Y.Z` tag. The `store` job in the Release workflow runs only when `CWS_EXTENSION_ID` is set.

To publish an existing tag again, or to upload without submitting, run the **Chrome Web Store** workflow manually (Actions → Chrome Web Store → Run workflow).

Locally:

```sh
npm run zip
CWS_CLIENT_ID=… CWS_CLIENT_SECRET=… CWS_REFRESH_TOKEN=… CWS_PUBLISHER_ID=… CWS_EXTENSION_ID=… \
  node tools/cws-publish.mjs dist/sidepanel-bookmarks-<version>.zip --upload-only
```
