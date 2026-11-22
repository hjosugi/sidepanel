// 設定はバックグラウンドと共有するため chrome.storage.local、
// パネル内の一時状態は localStorage に保存する。
// 壊れた JSON で起動が止まらないよう、読み込みはすべて失敗時に既定値へ落とす。

const LOCAL = typeof localStorage !== 'undefined' ? localStorage : null;

export const DEFAULT_SETTINGS = {
  mobileUA: true,
  desktopHosts: [],
  // フレームの中かどうかで表示を変えるサイト。unframe.js を入れる
  unframedHosts: ['claude.ai'],
  maxPages: 3,
  pins: [],
  startup: 'last',
  startUrl: '',
};
export const MAX_PAGES = 5;
export const MAX_PINS = 40;
/** パネルを開いたときに表示するもの: 前回のページ / 一覧 / startUrl */
export const STARTUPS = ['last', 'list', 'url'];

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

function cleanHosts(value) {
  const hosts = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      hosts
        .filter((host) => typeof host === 'string')
        .map((host) => host.trim().toLowerCase())
        .filter((host) => HOST.test(host)),
    ),
  ];
}

function httpUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cleanPins(value) {
  const pins = [];
  const seen = new Set();
  for (const pin of Array.isArray(value) ? value : []) {
    const url = httpUrl(pin?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pins.push({ url, name: typeof pin.name === 'string' ? pin.name.trim().slice(0, 200) : '' });
    if (pins.length === MAX_PINS) break;
  }
  return pins;
}

/** 保存値が壊れていても、使える形に揃えて返す。 */
export function normalizeSettings(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const maxPages = Number.parseInt(saved.maxPages, 10);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    mobileUA: saved.mobileUA !== false,
    desktopHosts: cleanHosts(saved.desktopHosts),
    // 一度も保存していなければ既定のサイトを使う。空にした場合は空のまま
    unframedHosts: cleanHosts(
      Array.isArray(saved.unframedHosts) ? saved.unframedHosts : DEFAULT_SETTINGS.unframedHosts,
    ),
    maxPages: Number.isFinite(maxPages)
      ? Math.min(MAX_PAGES, Math.max(1, maxPages))
      : DEFAULT_SETTINGS.maxPages,
    pins: cleanPins(saved.pins),
    startup: STARTUPS.includes(saved.startup) ? saved.startup : DEFAULT_SETTINGS.startup,
    startUrl: httpUrl(saved.startUrl),
  };
}

export async function getSettings() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return normalizeSettings(settings);
  } catch {
    return normalizeSettings();
  }
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  try {
    await chrome.storage.local.set({ settings: next });
  } catch {
    // 保存できなくても表示だけは続ける
  }
  return next;
}

export function readLocal(key, fallback) {
  if (!LOCAL) return fallback;
  try {
    const raw = LOCAL.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  if (!LOCAL) return;
  try {
    LOCAL.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージが満杯・無効でも動作は続ける
  }
}
