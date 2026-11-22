import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { MESSAGES } from '../i18n.js';
import { PACKAGE_FILES } from './package-files.mjs';

const root = new URL('..', import.meta.url).pathname;
const skip = new Set(['node_modules', '.release', '.git']);
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

const read = (file) => readFileSync(join(root, file), 'utf8');
const files = walk(root);

// 構文
for (const file of files) {
  if (!/\.(m?js)$/.test(file)) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`syntax error in ${file}\n${result.stderr}`);
}

// 配布するファイル
const shipped = new Set(
  PACKAGE_FILES.flatMap((entry) => {
    const full = join(root, entry);
    if (!existsSync(full)) {
      fail(`package file is missing: ${entry}`);
      return [];
    }
    return statSync(full).isDirectory() ? walk(full).map((file) => relative(root, file)) : [entry];
  }),
);

function requireShipped(from, reference) {
  const target = normalize(join(dirname(from), reference));
  if (!shipped.has(target)) fail(`${from} references ${reference}, which is not packaged`);
}

for (const file of shipped) {
  if (file.endsWith('.html')) {
    for (const [, ref] of read(file).matchAll(/\b(?:src|href)="([^"#:]+)"/g)) {
      requireShipped(file, ref);
    }
  }
  if (file.endsWith('.js')) {
    const source = read(file);
    for (const [, ref] of source.matchAll(/\bfrom\s+'(\.[^']+)'/g)) requireShipped(file, ref);
    // registerContentScripts に渡すファイル名など
    for (const [, ref] of source.matchAll(/'([\w-]+\.js)'/g)) requireShipped(file, ref);
  }
}

// マニフェスト
let manifest;
let pkg;
try {
  manifest = JSON.parse(read('manifest.json'));
  pkg = JSON.parse(read('package.json'));
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
    manifest.options_ui?.page,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ].filter(Boolean);
  for (const file of referenced) {
    if (!shipped.has(file)) fail(`manifest references a file that is not packaged: ${file}`);
  }
  for (const permission of ['sidePanel', 'bookmarks', 'cookies', 'scripting', 'storage']) {
    if (!manifest.permissions?.includes(permission)) fail(`permission missing: ${permission}`);
  }

  const locales = readdirSync(join(root, '_locales'));
  if (!locales.includes(manifest.default_locale)) {
    fail(`default_locale ${manifest.default_locale} has no _locales directory`);
  }
  const keys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]);
  for (const locale of locales) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of keys) {
      if (!messages[key]?.message) fail(`_locales/${locale} is missing ${key}`);
    }
    if ((messages.appDesc?.message ?? '').length > 132) {
      fail(`_locales/${locale} appDesc is longer than 132 characters`);
    }
  }
}

// UI の翻訳キー
const en = new Set(Object.keys(MESSAGES.en));
const ja = new Set(Object.keys(MESSAGES.ja));
for (const key of en) if (!ja.has(key)) fail(`missing ja translation: ${key}`);
for (const key of ja) if (!en.has(key)) fail(`missing en translation: ${key}`);

for (const file of shipped) {
  if (file.endsWith('.html')) {
    for (const [, key] of read(file).matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
      if (!en.has(key)) fail(`${file} references unknown i18n key: ${key}`);
    }
  }
  if (file.endsWith('.js')) {
    for (const [, key] of read(file).matchAll(/\bt\('([^']+)'/g)) {
      if (!en.has(key)) fail(`${file}: unknown i18n key: ${key}`);
    }
  }
}

// 同じ id が 2 つあると getElementById が別の要素を返す（静的な HTML と、JS で付ける id）
const scriptIds = [...shipped]
  .filter((file) => file.endsWith('.js'))
  .flatMap((file) => [...read(file).matchAll(/\.id = '([\w-]+)'/g)].map(([, id]) => id));
for (const file of shipped) {
  if (!file.endsWith('.html')) continue;
  const ids = [...read(file).matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  const all = [...ids, ...scriptIds];
  for (const id of new Set(ids)) {
    if (all.filter((other) => other === id).length > 1) fail(`${file}: duplicate id "${id}"`);
  }
}

if (failed) process.exit(1);
console.log(`lint ok (${files.length} files, ${shipped.size} packaged)`);
