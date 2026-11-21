// package.json / manifest.json のバージョンをまとめて書き換える。
// pnpm-lock.yaml はルートのバージョンを持たないので書き換えない。
// usage: pnpm run version:set 1.2.1
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = process.argv.slice(2).find((arg) => arg !== '--');

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: pnpm run version:set <major.minor.patch>');
  process.exit(1);
}

const root = resolve(new URL('..', import.meta.url).pathname);

// manifest.json と package.json は整形を保つため、最上位の "version" だけを書き換える
for (const name of ['manifest.json', 'package.json']) {
  const target = resolve(root, name);
  const text = readFileSync(target, 'utf8');
  const next = text.replace(/^(\s{2}"version":\s*")[^"]*(")/m, `$1${version}$2`);
  if (JSON.parse(next).version !== version) throw new Error(`could not update ${name}`);
  writeFileSync(target, next);
}

console.log(`Version set to ${version} in manifest.json and package.json`);
