// 設定はバックグラウンドと共有するため chrome.storage.local、
// パネル内の一時状態は localStorage に保存する。
// 壊れた JSON で起動が止まらないよう、読み込みはすべて失敗時に既定値へ落とす。

const LOCAL = typeof localStorage !== 'undefined' ? localStorage : null;

export const DEFAULT_SETTINGS = {
  mobileUA: true,
  desktopHosts: [],
  maxPages: 3,
};
export const MAX_PAGES = 5;

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/** 保存値が壊れていても、使える形に揃えて返す。 */
export function normalizeSettings(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const maxPages = Number.parseInt(saved.maxPages, 10);
  const hosts = Array.isArray(saved.desktopHosts) ? saved.desktopHosts : [];
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    mobileUA: saved.mobileUA !== false,
    desktopHosts: [
      ...new Set(
        hosts
          .filter((host) => typeof host === 'string')
          .map((host) => host.trim().toLowerCase())
          .filter((host) => HOST.test(host)),
      ),
    ],
    maxPages: Number.isFinite(maxPages)
      ? Math.min(MAX_PAGES, Math.max(1, maxPages))
      : DEFAULT_SETTINGS.maxPages,
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
