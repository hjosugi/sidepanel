# Contributing

Use small, reviewable changes that keep the extension zero-build and local-only.

## Setup

```sh
npm ci
```

## Checks

```sh
npm run release:check
```

The smoke test needs a Chromium-based browser that honors `--load-extension` (Brave by default, or set `BROWSER_BIN` to Chromium / Chrome for Testing).

## Boundaries

- Keep header rules, content scripts and cookie access limited to frames directly inside the side panel; normal tabs must never change.
- Do not add remote code, analytics, or remote script/style loading.
- New files that ship in the extension go into `scripts/package-files.mjs`; `npm run lint` fails if a packaged file references one that is missing.
- UI strings go into both `en` and `ja` in `i18n.js`.
- Update versions with `npm run version:set -- X.Y.Z`. Releases are described in [docs/RELEASE.md](docs/RELEASE.md).
