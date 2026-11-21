// 配布用 zip と付属ファイルを .release/ に作る。ビルド工程はない。
//   sidepanel-bookmarks-vX.Y.Z.zip / .sha256 / .release.json / -notes.md / -tester-install.md
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { PACKAGE_FILES } from './package-files.mjs';

const root = new URL('..', import.meta.url).pathname;
const releaseDir = join(root, '.release');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  throw new Error(`version mismatch: manifest=${manifest.version}, package=${pkg.version}`);
}

const baseName = `${pkg.name}-v${manifest.version}`;
const artifactName = `${baseName}.zip`;
const out = (suffix) => join(releaseDir, `${baseName}${suffix}`);

function walk(file) {
  const full = join(root, file);
  if (statSync(full).isDirectory()) {
    return readdirSync(full)
      .sort()
      .flatMap((name) => walk(join(file, name)));
  }
  return [file];
}

const files = [...new Set(PACKAGE_FILES.flatMap(walk))].sort();
for (const file of files) {
  if (statSync(join(root, file)).size === 0) throw new Error(`empty release file: ${file}`);
}

// --- zip（deflate、タイムスタンプ固定で同じ内容なら同じハッシュになる） ---
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[i] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const data = readFileSync(join(root, file));
  const name = Buffer.from(file.replaceAll('\\', '/'));
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);

  offset += local.length + name.length + compressed.length;
}

const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...localParts, ...centralParts, end]);

// --- 検証: 中央ディレクトリを読み直し、全ファイルを展開して元と比べる ---
function verify(buffer) {
  const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const seen = [];
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('zip: bad central entry');
    const crc = buffer.readUInt32LE(cursor + 16);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const start = localOffset + 30 + localNameLength;
    const data = inflateRawSync(buffer.subarray(start, start + size));
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${name}`);
    if (!data.equals(readFileSync(join(root, name)))) throw new Error(`zip: ${name} differs`);
    seen.push(name);
    cursor += 46 + nameLength;
  }
  for (const file of files) if (!seen.includes(file)) throw new Error(`zip: missing ${file}`);
}
verify(zip);

mkdirSync(releaseDir, { recursive: true });
for (const suffix of ['.zip', '.sha256', '.release.json', '-notes.md', '-tester-install.md']) {
  rmSync(out(suffix), { force: true });
}
writeFileSync(out('.zip'), zip);

// unzip があれば外部ツールでも整合性を確かめる（CI には入っている）
const unzip = spawnSync('unzip', ['-tq', out('.zip')], { encoding: 'utf8' });
if (!unzip.error && unzip.status !== 0) throw new Error(`unzip -t failed\n${unzip.stdout}`);

const sha256 = createHash('sha256').update(zip).digest('hex');
const createdAt = new Date().toISOString();
writeFileSync(out('.sha256'), `${sha256}  ${artifactName}\n`);
writeFileSync(
  out('.release.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: manifest.version,
      createdAt,
      artifact: artifactName,
      sha256,
      bytes: zip.length,
      files,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  out('-notes.md'),
  `# ${manifest.name} v${manifest.version}

## Artifact

- File: \`${artifactName}\`
- SHA-256: \`${sha256}\`
- Size: ${zip.length} bytes
- Created: ${createdAt}

## Validation

- Biome, manifest, packaged-file and i18n lint: \`pnpm run release:check\`
- Unit tests: \`pnpm run release:check\`
- Headless side panel smoke test: \`pnpm run release:check\` (CI also runs it on the unpacked zip)
- Zip integrity and content comparison: \`scripts/package-extension.mjs\`

## Manual Smoke Test

- [ ] Load the unpacked zip in Chrome and click the toolbar icon
- [ ] Open a few bookmarks; they load inside the side panel
- [ ] Switch between pages with the tab strip; back/forward/reload work
- [ ] Toggle the phone/desktop button on one site
- [ ] Open Settings from the list and change the page limit
- [ ] Check the side panel DevTools console for errors
- [ ] Record Chrome version, OS and any site that fails

## Known Limitations

- Sites that require a top-level sign-in or a Cloudflare check open in a tab instead
- The Chrome Web Store build can lag behind this zip until review finishes
`,
);

writeFileSync(
  out('-tester-install.md'),
  `# Tester Install: ${manifest.name} v${manifest.version}

## Install

1. Unzip \`${artifactName}\`.
2. Open \`chrome://extensions\`.
3. Enable Developer mode.
4. Click \`Load unpacked\`.
5. Select the unzipped folder.
6. Pin the toolbar icon and click it to open the side panel.

## What To Check

- Bookmarks appear as a tree and search works.
- A clicked bookmark opens inside the side panel.
- Signed-in sites stay signed in.
- Normal tabs behave exactly as before.

## If It Fails

Please report:

- Chrome version
- OS
- the site URL
- screenshot if possible
- side panel console errors (right-click the panel → Inspect)

## Artifact Verification

SHA-256:

\`\`\`text
${sha256}  ${artifactName}
\`\`\`
`,
);

for (const suffix of ['.zip', '.sha256', '.release.json', '-notes.md', '-tester-install.md']) {
  console.log(`.release/${baseName}${suffix}`);
}
