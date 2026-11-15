<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Sidepanel Bookmarks

A zero-build Chrome MV3 extension that puts your bookmarks in the side panel and opens pages **inside the panel**, like the Edge sidebar. The UI is English by default and can be switched to Japanese at runtime.

## Features

- Open/close the side panel from the toolbar button, or toggle the bookmark list with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>
- Browse bookmarks as a folder tree (open/closed state is remembered)
- Search bookmarks (Enter opens the first match, "Show more" reveals the rest)
- Open a bookmark in the panel; Ctrl / Cmd / Shift / middle click still opens a normal tab
- Toolbar: ☰ list, ‹ › back/forward, ⟳ reload, ↗ open current page in a tab
- Mobile layout by default: a mobile UA, Client Hints, and `navigator.userAgent` are used to fit the narrow panel
  - Toggle 🖥/📱 per site; the choice is remembered
- Keep several pages alive (3 by default, 1–5 in Settings). A tab strip appears for open pages, so Gmail ⇄ Claude ⇄ Keep switches without reloading
- Page titles and SPA (`pushState`) URLs are tracked from a content script
- Fallback bar for HTTP errors, sign-in pages and Cloudflare checks, with "Open in tab"
  - A Cloudflare check in mobile layout offers a one-click switch to desktop layout, where the check can finish inside the panel
- `document.cookie` in the panel behaves like a normal tab for non-HttpOnly cookies
  (see [#16](https://github.com/hjosugi/sidepanel/issues/16))
- Nested iframes that would otherwise be blocked are removed instead of being exposed
- Keyboard navigation (↑↓←→, Home/End), ARIA labels, live status messages
- Settings page (the sliders button next to the search box, or the extension's Options): language, mobile layout, pages kept open, sites shown in desktop layout

## Install

The Chrome Web Store listing is in preparation ([docs/RELEASE.md](docs/RELEASE.md)). Until then:

1. Download the zip from [Releases](https://github.com/hjosugi/sidepanel/releases) and extract it (or `git clone`)
2. Open `chrome://extensions`, turn on **Developer mode**
3. **Load unpacked** and select the extracted folder
4. Pin the toolbar icon and click it

Chrome 128+ is required. Chromium-based browsers such as Brave and Edge also work.

## How It Works and Permissions

Many sites refuse to be embedded with `X-Frame-Options` or CSP `frame-ancestors`. This extension uses declarativeNetRequest session rules to remove those headers **only for requests that do not belong to a tab** (i.e. the iframes inside the side panel). Normal tabs are never affected. The rules and content scripts are installed while a side panel is open and removed when the last one closes.

Some Google services reject `Sec-Fetch-Dest: iframe` at the server. For panel frames the request headers are rewritten to look like a top-level navigation. Google Keep, Calendar, Drive, Contacts and Tasks then load (see [#1](https://github.com/hjosugi/sidepanel/issues/1)).

The mobile UA is never sent to Cloudflare's challenge frame (`challenges.cloudflare.com`). Turnstile compares the `User-Agent` header with `navigator.userAgent` in its own frame, so a rewritten header there keeps the check from ever finishing (see [#17](https://github.com/hjosugi/sidepanel/issues/17)).

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

The extension itself has no runtime dependencies, no build step, no analytics and no remote code. Nothing leaves your browser; see the [privacy policy](docs/PRIVACY.md).

## Limitations

- Some sites cannot work in a frame at all (Google sign-in). Use ↗ / the fallback bar to open them in a tab.
- Cloudflare checks (ChatGPT, for example) only finish in desktop layout: in mobile layout the page and its scripts would send different user agents. Use the fallback bar's "Desktop layout" button or 📱/🖥 ([#17](https://github.com/hjosugi/sidepanel/issues/17)).
- Removing `X-Frame-Options` is safe, but a CSP containing `frame-ancestors` has to have the **whole** CSP header removed, because DNR cannot edit a single directive. This only applies to direct panel frames.
- The panel is one document, so the browser keeps a single history for all pages kept open. ‹ always moves the visible page back, but a hidden page that navigated after that point is returned to its state at that time.
- HttpOnly cookies are intentionally never exposed to `document.cookie`. On the very first load the cookie jar may arrive a few milliseconds late; the last jar is cached in `sessionStorage` for the next load.
- Incognito windows and bookmarklets (`javascript:`) are not supported. `chrome://` pages open in a tab.
- The last visited URL is restored, including SPA navigations; it is not necessarily the bookmark's original URL.
- Mobile UA is a heuristic. Use the 📱/🖥 button for sites that expect a desktop layout.

## Development

```sh
npm ci
npm run release:check   # lint + unit tests + headless side panel smoke test
npm run release:zip     # release:check, then .release/ artifacts
```

| Command | What it does |
| --- | --- |
| `npm run lint` | Biome, plus manifest / packaged-file / i18n checks |
| `npm run test:unit` | Pure functions: rules, embedding check, cookie parsing, settings |
| `npm test` | Loads the extension into headless Brave (or `BROWSER_BIN`), opens the real side panel and checks DNR headers, SPA tracking, mobile UA, fallbacks, nested-frame blocking, the cookie shim, settings and rule cleanup against a local server |
| `npm run release:package` | Only build `.release/sidepanel-bookmarks-vX.Y.Z.zip` and its checksum, metadata, notes and tester guide |
| `npm run release:store:assets` | Render store screenshots and the promo tile into `.release/store-assets/` |
| `npm run version:set -- X.Y.Z` | Set the version in `package.json`, `package-lock.json` and `manifest.json` |
| `npm run compat` | Check popular sites with `Sec-Fetch-Dest: iframe` |

Branded Google Chrome ignores `--load-extension` since 137, so use Brave, Chromium or Chrome for Testing for `npm test`; CI uses Chrome for Testing and runs the smoke test on the unpacked release zip.

Releases are automatic: a version bump merged into `main` builds the zip, submits it to the Chrome Web Store when configured, then tags the commit and creates the GitHub Release. See [docs/RELEASE.md](docs/RELEASE.md).

## License

MIT
