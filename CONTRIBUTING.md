# Contributing

Use small, reviewable changes that keep the extension zero-build and local-only.

## Setup

Use [pnpm](https://pnpm.io/) (the version in `packageManager` in `package.json`).

```sh
pnpm install
```

## Checks

```sh
pnpm run release:check
```

The smoke test needs a Chromium-based browser that honors `--load-extension` (Brave by default, or set `BROWSER_BIN` to Chromium / Chrome for Testing).

## Boundaries

- Keep header rules, content scripts and cookie access limited to frames directly inside the side panel; normal tabs must never change.
- Do not add remote code, analytics, or remote script/style loading.
- New files that ship in the extension go into `scripts/package-files.mjs`; `pnpm run lint` fails if a packaged file references one that is missing.
- UI strings go into both `en` and `ja` in [src/shared/i18n.js](src/shared/i18n.js).
- Update versions with `pnpm run version:set X.Y.Z`. Releases are described in [docs/RELEASE.md](docs/RELEASE.md).
