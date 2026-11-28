<!-- i18n: language-switcher -->
[English](PRIVACY.md) | [日本語](PRIVACY.ja.md)

# Privacy Policy

Sidepanel Bookmarks is a Chrome extension that shows the user's bookmarks in the
side panel and opens them inside the side panel.

Last updated: 2026-11-28

## Data Processed

The extension processes the following data locally in the browser:

- Bookmarks, to show them as a tree and to search them
- The URL and title of the HTTP and HTTPS tabs in the panel's window, to show and
  filter the list and to open the current tab when requested
- The URL and title of pages opened in the side panel, to show them in the panel
  header and tab strip; the last URL is remembered so the panel can reopen it
- Cookies of the site open in the side panel (see below)
- Response headers of side-panel frames, to detect errors and to remove nested
  frames that a site does not allow to be embedded
- Extension settings: language, web search engine, mobile layout, number of pages kept open, zoom
  (the default and per site), the page shown when the panel opens, pinned sites
  (URL and name), sites shown in desktop layout, and sites shown as in a normal
  tab

## Local Processing

The extension filters bookmarks and open tabs on the user's device. It has no
analytics or advertising. Submitting a web search from the address bar or the
bookmark list sends the search terms directly to Google by default. If you
select Bing in Settings, Microsoft Bing receives those searches instead.
Typing in either field makes no search requests.

Pages opened in the side panel are loaded directly from those sites, exactly as
in a normal tab, and are subject to those sites' own privacy policies.

## Cookies

So that sign-ins work as in a normal tab, the page open in the side panel receives
its own non-HttpOnly cookies through `document.cookie`. HttpOnly cookies are never
exposed, cookies of other sites are never exposed, and a page can only write
cookies for its own site.

## Network Changes

While a side panel is open, the extension changes requests only for frames inside
the side panel: it removes `X-Frame-Options` and CSP headers that block
embedding, rewrites `Sec-Fetch-Dest` / `Sec-Fetch-Site`, and (unless disabled in
Settings) sends a mobile user agent. Normal tabs are never affected, and these
rules are removed when the last side panel closes.

## Storage

Settings are saved in `chrome.storage.local`. The open/closed state of bookmark
folders and the last opened page are saved in the extension's `localStorage`.
For the sites shown as in a normal tab (Claude by default), the positions of the
frame checks in that site's script files are remembered in that site's
`localStorage` under `spb:unframe`, so the scripts do not have to be read again.
Nothing is synced or uploaded.

## Remote Code

The extension does not load remote JavaScript or WebAssembly. All executable
extension code is packaged with the extension.

## Data Sharing

The developer does not collect, sell, or transfer user data, and does not use it
for purposes unrelated to the extension's single purpose. The extension does not
use user data for creditworthiness or lending decisions.

## Contact

For privacy questions or support, use the GitHub issue tracker:

https://github.com/hjosugi/sidepanel/issues
