import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGES } from '../i18n.js';

const root = new URL('..', import.meta.url).pathname;
const skip = new Set(['node_modules', 'dist', '.git']);
let failed = false;

function fail(message) {
  console.error(`lint: ${message}`);
  failed = true;
}

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    if (skip.has(name)) continue;
    const full = join(directory, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(root);

for (const file of files) {
  if (!/\.(m?js)$/.test(file)) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`syntax error in ${file}\n${result.stderr}`);
}

let manifest;
let pkg;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
} catch (error) {
  fail(`cannot parse manifest/package: ${error}`);
}

if (manifest && pkg) {
  if (manifest.version !== pkg.version) {
    fail(`version mismatch: manifest ${manifest.version} != package ${pkg.version}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('version is not semver');
  const referenced = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ].filter(Boolean);
  for (const file of referenced) {
    if (!existsSync(join(root, file))) fail(`manifest references a missing file: ${file}`);
  }
  for (const permission of ['sidePanel', 'bookmarks', 'cookies', 'scripting', 'storage']) {
    if (!manifest.permissions?.includes(permission)) fail(`permission missing: ${permission}`);
  }
}

const en = new Set(Object.keys(MESSAGES.en));
const ja = new Set(Object.keys(MESSAGES.ja));
for (const key of en) if (!ja.has(key)) fail(`missing ja translation: ${key}`);
for (const key of ja) if (!en.has(key)) fail(`missing en translation: ${key}`);

const html = readFileSync(join(root, 'sidepanel.html'), 'utf8');
for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
  if (!en.has(match[1])) fail(`html references unknown i18n key: ${match[1]}`);
}

for (const file of files) {
  if (!/\.(m?js)$/.test(file) || file.includes('/tools/')) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\('([^']+)'/g)) {
    if (!en.has(match[1])) fail(`${file}: unknown i18n key: ${match[1]}`);
  }
}

if (failed) process.exit(1);
console.log(`lint ok (${files.length} files)`);
