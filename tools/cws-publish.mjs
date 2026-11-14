// Chrome Web Store API v2 で既存アイテムに zip をアップロードし、審査に提出する。
// 新規アイテムの作成は API ではできないので、初回はダッシュボードでアップロードする（store/README.md）。
//
// usage: node tools/cws-publish.mjs dist/sidepanel-bookmarks-1.2.0.zip [--upload-only]
// env:   CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID CWS_EXTENSION_ID
import { readFileSync } from 'node:fs';

const API = 'https://chromewebstore.googleapis.com';
const [file, ...flags] = process.argv.slice(2);
const uploadOnly = flags.includes('--upload-only');
const env = Object.fromEntries(
  [
    'CWS_CLIENT_ID',
    'CWS_CLIENT_SECRET',
    'CWS_REFRESH_TOKEN',
    'CWS_PUBLISHER_ID',
    'CWS_EXTENSION_ID',
  ].map((name) => [name, process.env[name]?.trim()]),
);

const missing = Object.entries(env)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (!file || missing.length) {
  console.error(
    !file
      ? 'usage: node tools/cws-publish.mjs <zip> [--upload-only]'
      : `missing: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, url, { token, body, type } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(type ? { 'content-type': type } : {}),
    },
    body,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} -> ${response.status}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

const { access_token: token } = await call('POST', 'https://oauth2.googleapis.com/token', {
  type: 'application/x-www-form-urlencoded',
  body: new URLSearchParams({
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    refresh_token: env.CWS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});

const upload = await call('POST', `${API}/upload/v2/${item}:upload`, {
  token,
  type: 'application/zip',
  body: readFileSync(file),
});
console.log('upload:', JSON.stringify(upload));

let state = upload.uploadState;
for (let attempt = 0; state === 'IN_PROGRESS' && attempt < 24; attempt++) {
  await sleep(5000);
  const status = await call('GET', `${API}/v2/${item}:fetchStatus`, { token });
  state = status.lastAsyncUploadState ?? status.uploadState ?? state;
  console.log('status:', JSON.stringify(status));
}
if (state && state !== 'SUCCEEDED') {
  console.error(`upload did not succeed: ${state}`);
  process.exit(1);
}

if (uploadOnly) {
  console.log('uploaded; not submitted (--upload-only)');
  process.exit(0);
}

const published = await call('POST', `${API}/v2/${item}:publish`, {
  token,
  type: 'application/json',
  body: '{}',
});
console.log('publish:', JSON.stringify(published));
