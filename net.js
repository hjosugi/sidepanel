import { blocksEmbedding } from './embedding.js';

// サイドパネル内のフレームはタブに属さない（tabId = -1）。読み取り専用で監視する。
const PANEL_FRAMES = {
  urls: ['<all_urls>'],
  types: ['sub_frame'],
  tabId: chrome.tabs.TAB_ID_NONE,
};

function isChallenge(headers = []) {
  return headers.some(
    (header) => header.name.toLowerCase() === 'cf-mitigated' && header.value === 'challenge',
  );
}

/**
 * parentFrameId === 0 はパネル直下のフレーム（表示中のページ本体）、
 * それ以外はページの中に入れ子になったフレーム。
 */
export function watchPanelFrames({ onNestedBlocked, onHttpError, onNetworkError }) {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.parentFrameId !== 0 && blocksEmbedding(details)) onNestedBlocked(details.url);
    },
    PANEL_FRAMES,
    ['responseHeaders'],
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (details.parentFrameId !== 0 || details.statusCode < 400) return;
      // Cloudflare のチャレンジは 403 で返るが、tracker がチャレンジとして知らせる。
      // HTTP エラーにすると、通過後に同じ URL が読み込まれても案内が消えない（#17）。
      if (isChallenge(details.responseHeaders)) return;
      onHttpError(details.url, details.statusCode);
    },
    PANEL_FRAMES,
    ['responseHeaders'],
  );

  chrome.webRequest.onErrorOccurred.addListener((details) => {
    if (details.parentFrameId === 0) onNetworkError(details.url);
  }, PANEL_FRAMES);
}
