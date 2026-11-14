// package.json / package-lock.json / manifest.json のバージョンをまとめて書き換える。
// usage: npm run version:set -- 1.2.1
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run version:set -- <major.minor.patch>');
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

const lockPath = resolve(root, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

console.log(`Version set to ${version} in manifest.json, package.json and package-lock.json`);
