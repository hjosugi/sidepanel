<!-- i18n: language-switcher -->
[English](RELEASE.md) | [日本語](RELEASE.ja.md)

# Release

How the extension goes from `main` to GitHub Releases and the Chrome Web Store.

## Listing

- Store page: not published yet. After the first submission, record the item ID here and in the README badge
- Privacy policy: `docs/PRIVACY.md`. The listing links to its GitHub URL, so do not move or rename it
- Support: GitHub issues

The store updates only after review, so the published version can lag behind `main`.

## Normal Release

A version-bump commit landing on `main` is the release. That is the only manual step.

```sh
npm run version:set -- X.Y.Z    # package.json, package-lock.json, manifest.json
npm run release:zip             # all checks, then .release/ artifacts
git switch -c release-X.Y.Z
git commit -am "Release X.Y.Z"
git push -u origin HEAD         # open a PR, wait for checks, merge
```

On the push to `main`, `.github/workflows/chrome-webstore-release.yml`:

1. `Resolve release target` sets `publish=true` because no `vX.Y.Z` tag exists yet (an already-tagged version only builds the zip)
2. Runs the checks, builds the zip and keeps it as a run artifact
3. Uploads the zip to the store and submits it for review, **if the store item is configured** (see [Credentials](#credentials)). Until then this step is skipped
4. Only after that, the `github-release` job tags the commit `vX.Y.Z` and creates a GitHub Release with the zip, checksum and tester guide

Watch it with `gh run watch` and check the dashboard shows the item as pending review.

Rules:

- Do not push the tag for a version `main` is releasing. The automatic tag does not start a second run. A manually pushed `vX.Y.Z` tag also releases that tag, but it must match the version written by `npm run version:set`.
- The store accepts one submission at a time. To replace a version waiting for review, run the workflow manually with `cancel_submission: true` (or `npm run release:store:cancel`), then bump and merge as usual.
- Do not press Publish in the dashboard for normal releases.

## Versions

`package.json`, `package-lock.json` and `manifest.json` always carry the same version; the workflow and `npm run lint` fail otherwise. `npm run version:set -- X.Y.Z` updates all three.

- Patch: fixes, site compatibility tweaks, docs
- Minor: user-visible features or settings
- Major: changes that break stored settings or require new permissions

## Checks

```sh
npm ci
npm run release:check
```

`release:check` runs Biome, the manifest / packaged-file / i18n lint, the unit tests and the headless side-panel smoke test. The smoke test needs a Chromium-based browser that still honors `--load-extension` (Brave, Chromium or Chrome for Testing; set `BROWSER_BIN`). Branded Google Chrome ignores the flag since version 137.

Not in `release:check`, because they depend on real sites:

- `npm run compat`: request status and embedding headers of popular sites with `Sec-Fetch-Dest: iframe` (also runs weekly in the Site compatibility workflow)
- `PROFILE_DIR=… node scripts/site-probe.mjs`: open real sites in the side panel with a copy of a signed-in profile

Before a release that changes framing, cookies or navigation, check by hand: load the unpacked extension, sign in to a few sites (mail, calendar, an AI chat), open them in the panel, switch pages with the tab strip, and use back / reload / open in tab.

## Zip

`npm run release:zip` writes to `.release/` (ignored by Git):

- `sidepanel-bookmarks-vX.Y.Z.zip`, `.sha256`, `.release.json`
- `sidepanel-bookmarks-vX.Y.Z-notes.md`, `-tester-install.md`

The zip contains only the files listed in `scripts/package-files.mjs`; there is no build step. Timestamps are fixed, so the same sources give the same SHA-256. CI unpacks the zip and runs the smoke test against it.

Testers install it by unzipping, turning on Developer mode in `chrome://extensions` and choosing **Load unpacked**. For bug reports, ask for the browser version, OS, site URL and side panel console errors.

## Workflow and Local Commands

Manual runs of `Chrome Web Store Release` (`workflow_dispatch`):

| Input | Effect |
| --- | --- |
| `status_only: true` | Fetch the store status only (checks credentials) |
| `cancel_submission: true` | Cancel the submission waiting for review |
| `publish_only: true` | Publish the existing draft without uploading |
| `publish: false` | Upload only; publish later |
| `version` | Set the version before packaging. Not written back to the repo, emergencies only |
| `skip_review`, `deploy_percentage` | Ask to skip review when eligible; staged rollout |
| `dry_run: true` | Validate and print the API calls without network access |

The same from a shell, with the credentials in the environment:

```sh
npm run release:store:status
npm run release:store:upload
npm run release:store:publish
npm run release:store:cancel
npm run release:store            # release:zip, then upload and submit
node scripts/chrome-webstore.mjs submit --dry-run
```

Environment switches: `CHROME_WEBSTORE_SKIP_REVIEW=1`, `CHROME_WEBSTORE_DEPLOY_PERCENTAGE=25`, `CHROME_WEBSTORE_BLOCK_ON_WARNINGS=0` (by default API warnings stop the publish, so a policy warning never goes live silently), `CHROME_WEBSTORE_UPLOAD_POLL_ATTEMPTS=24`, `CHROME_WEBSTORE_UPLOAD_POLL_DELAY_MS=5000`.

### Credentials

Repository secrets. The store steps run only when both IDs are set. The recommended auth is a service account with GitHub OIDC (Workload Identity Federation):

```text
CHROME_WEBSTORE_PUBLISHER_ID
CHROME_WEBSTORE_EXTENSION_ID
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

Alternative: an OAuth refresh token for the publisher account with the `https://www.googleapis.com/auth/chromewebstore` scope in `CHROME_WEBSTORE_CLIENT_ID`, `CHROME_WEBSTORE_CLIENT_SECRET` and `CHROME_WEBSTORE_REFRESH_TOKEN`. Locally, `CHROME_WEBSTORE_ACCESS_TOKEN` also works.

`scripts/chrome-webstore.mjs` prints the publisher ID, service account and OAuth secrets as `***`, so its output can be pasted into an issue. Do not write those values back by hand. The publisher ID is a UUID, and GitHub secret scanning flags bare UUIDs in public repositories, so keep it a secret rather than a variable.

## When It Fails

A failed upload leaves the listing unchanged; the last approved version stays live and no tag has been created yet.

- **`does not match`**: the package, manifest or a manually pushed tag disagree on the version. Run `npm run version:set -- X.Y.Z` and commit. Delete a wrong tag with `git push origin ":refs/tags/<tag>"`.
- **Upload or publish failed transiently**: re-run the failed job; it retries the same version. If only `github-release` failed, re-run just that job; the store submission is not repeated.
- **`Missing required configuration`**: a secret is missing (`gh secret list | grep -E 'CHROME_WEBSTORE_|GCP_'`).
- **`403 PERMISSION_DENIED` on `publishers/<id>/items/<id>`**: the token works but cannot manage that item. Check `CHROME_WEBSTORE_EXTENSION_ID`, that `CHROME_WEBSTORE_PUBLISHER_ID` owns the item, that the `GCP_SERVICE_ACCOUNT` was added to the publisher in the dashboard and the invitation accepted, that `GCP_WORKLOAD_IDENTITY_PROVIDER` points at this repository, and that the Chrome Web Store API is enabled in the Google Cloud project. Re-check with `npm run release:store:status`. Do not bump the version to work around it.
- **Upload succeeded, publish failed on warnings**: read the log, fix the warnings in the dashboard, bump the patch version and release again.
- **Rejected in review**: record the reason in an issue, fix the code, permissions, listing or privacy answers, bump the patch version and release again.

## Rollback

There is no instant rollback. If possible, unpublish in the dashboard, fix the source, bump the patch version and release again. Testers using the unpacked zip remove the old folder and load the new one.

---

## Appendix: Initial Store Item Setup

One-time work, kept here for audits, re-creation and as the source for listing edits. The first upload must be done in the dashboard because the API cannot create items.

1. Register as a Chrome Web Store developer at <https://chrome.google.com/webstore/devconsole> (one-time fee; the account needs 2-step verification) and set the privacy policy URL on the account page.
2. **Add new item** and upload `.release/sidepanel-bookmarks-vX.Y.Z.zip` (or the zip attached to the latest GitHub Release).
3. Fill in the tabs below, then **Submit for review**.
4. Record the item ID at the top of this file and set up [Google Cloud and GitHub](#google-cloud-and-github) so later releases are automatic.

### Store Listing

- Name: `Sidepanel Bookmarks`
- Summary: locale string `appDesc` (`_locales/*/messages.json`, up to 132 characters)
- Category: Productivity → Tools. Languages: English and Japanese
- Description (English):

  ```text
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

- Description (Japanese): see [RELEASE.ja.md](RELEASE.ja.md#掲載文)
- Homepage URL: `https://github.com/hjosugi/sidepanel`. Support URL: `https://github.com/hjosugi/sidepanel/issues`
- Images: `icons/128.png`. `npm run release:store:assets` renders three 1280×800 screenshots and the 440×280 small promo tile into `.release/store-assets/` from fictional demo sites

### Privacy and Data Use

- Single purpose: `Show the user's bookmarks in the Chrome side panel and open the selected bookmark inside the side panel.`
- Permission justifications:
  - `sidePanel: The whole user interface (bookmark list and page viewer) lives in the side panel.`
  - `bookmarks: Reads the user's bookmarks to show them as a tree and to search them. Bookmarks are never modified or sent anywhere.`
  - `favicon: Shows each bookmark's site icon from the browser's favicon cache.`
  - `declarativeNetRequestWithHostAccess: While the side panel is open, session rules remove X-Frame-Options / CSP frame-ancestors and adjust Sec-Fetch and User-Agent headers only for requests that belong to no tab (frames inside the side panel), so bookmarked sites can be displayed there. Normal tabs are never affected.`
  - `scripting: Registers content scripts while the panel is open. They run only in frames directly inside the side panel and report the page URL/title, follow single-page-app navigation, align navigator.userAgent with the mobile layout and make document.cookie behave like a normal tab.`
  - `storage: Saves the user's settings (language, mobile layout, number of pages kept open, sites shown in desktop layout).`
  - `webRequest: Read-only observation of side-panel frames: detects HTTP errors to show an "Open in tab" message, and checks embedding headers of nested frames so frames a site does not allow to be embedded are removed.`
  - `cookies: Gives the page open in the side panel the same non-HttpOnly cookies it would see in a normal tab via document.cookie. HttpOnly cookies are never exposed, and a page can only write cookies for its own site.`
  - `Host permission <all_urls>: The user can bookmark and open any site in the side panel, so the header rules, content scripts and cookie access must work for any site.`
- Remote code: `No, I am not using remote code.`
- Data usage: check none of the data types (everything is processed locally and never transmitted). Check all three certifications
- Privacy policy URL: `https://github.com/hjosugi/sidepanel/blob/main/docs/PRIVACY.md`
- Test instructions (optional): `Click the toolbar icon to open the side panel, then click any bookmark. The site opens inside the panel. The sliders button next to the search box opens the settings.`

### Google Cloud and GitHub

Run in `bash`, replacing the values with your own.

```sh
set -eu
export GCP_PROJECT_ID="YOUR_GCP_PROJECT_ID"
export SA_NAME="spb-cws-publisher"
export WIF_POOL_ID="github"
export WIF_PROVIDER_ID="sidepanel"
export GITHUB_OWNER="$(gh repo view --json owner -q .owner.login)"
export GITHUB_REPO="$(gh repo view --json name -q .name)"
export SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project "$GCP_PROJECT_ID"

gcloud iam service-accounts describe "$SA_EMAIL" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$GCP_PROJECT_ID" \
    --display-name "Sidepanel Bookmarks Chrome Web Store Publisher"

gcloud iam workload-identity-pools describe "$WIF_POOL_ID" --project "$GCP_PROJECT_ID" \
  --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$WIF_POOL_ID" --project "$GCP_PROJECT_ID" \
    --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_ID" --project "$GCP_PROJECT_ID" \
  --location global --workload-identity-pool "$WIF_POOL_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_ID" \
    --project "$GCP_PROJECT_ID" --location global --workload-identity-pool "$WIF_POOL_ID" \
    --display-name "sidepanel GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}'"

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format 'value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$GCP_PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"

GCP_WORKLOAD_IDENTITY_PROVIDER="$(gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_ID" \
  --project "$GCP_PROJECT_ID" --location global --workload-identity-pool "$WIF_POOL_ID" --format 'value(name)')"
```

Then:

1. In the dashboard (Account → Publisher settings), add `$SA_EMAIL` as a service account.
2. Set the secrets:

   ```sh
   gh secret set CHROME_WEBSTORE_PUBLISHER_ID -b "<publisher id>"
   gh secret set CHROME_WEBSTORE_EXTENSION_ID -b "<item id>"
   gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER -b "$GCP_WORKLOAD_IDENTITY_PROVIDER"
   gh secret set GCP_SERVICE_ACCOUNT -b "$SA_EMAIL"
   ```

3. Run the workflow with `status_only: true`. Setup is done when `Fetch Chrome Web Store status` succeeds without building or uploading.
