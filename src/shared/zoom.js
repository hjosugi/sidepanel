// パネル内のページの表示倍率。段階は Chrome のズームと同じ。

export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_ZOOM = 1;

export function isZoomLevel(value) {
  return ZOOM_LEVELS.includes(value);
}

/** 1 段階大きく（direction > 0）または小さく（< 0）した倍率。端ではそのまま */
export function stepZoom(level, direction) {
  const index = ZOOM_LEVELS.indexOf(level);
  if (index === -1) return DEFAULT_ZOOM;
  const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + Math.sign(direction)));
  return ZOOM_LEVELS[next];
}

export function zoomPercent(level) {
  return `${Math.round(level * 100)}%`;
}

/** そのホストの倍率。サイトごとに変えていなければ既定の倍率（Chrome と同じくホスト単位） */
export function zoomFor(host, { zoom = DEFAULT_ZOOM, siteZoom = {} } = {}) {
  const saved = host ? siteZoom[host] : undefined;
  return isZoomLevel(saved) ? saved : zoom;
}
