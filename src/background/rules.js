// サイドパネル内の iframe（タブに属さない sub_frame）だけを対象にした DNR ルール。
// 通常のタブで開いたページには一切影響しない。

export const RULE_IDS = [1, 2, 3, 10];

const NONE = chrome.tabs.TAB_ID_NONE;

// Cloudflare のチャレンジ（Turnstile）は、自分のフレームの User-Agent ヘッダーと
// navigator.userAgent を照合する。ua.js は入れ子のフレームでは動かないので、
// ここにモバイル UA を送ると両者が食い違い、確認が終わらなくなる（#17）。
const NEVER_MOBILE_HOSTS = ['challenges.cloudflare.com'];

function androidUserAgent() {
  const version = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '128';
  return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`;
}

export function buildRules({ mobileUA = true, desktopHosts = [] } = {}) {
  const panelFrame = { resourceTypes: ['sub_frame'], tabIds: [NONE] };
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }],
      },
      condition: { ...panelFrame },
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{ header: 'content-security-policy', operation: 'remove' }],
      },
      condition: {
        ...panelFrame,
        responseHeaders: [{ header: 'content-security-policy', values: ['*frame-ancestors*'] }],
      },
    },
    // Google の一部サービスは Sec-Fetch-Dest: iframe をサーバー側で拒否する。
    {
      id: 3,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'sec-fetch-dest', operation: 'set', value: 'document' },
          { header: 'sec-fetch-site', operation: 'set', value: 'none' },
        ],
      },
      condition: { ...panelFrame },
    },
  ];

  if (mobileUA) {
    rules.push({
      id: 10,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'user-agent', operation: 'set', value: androidUserAgent() },
          { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
          { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' },
          { header: 'sec-ch-ua-platform-version', operation: 'remove' },
          { header: 'sec-ch-ua-arch', operation: 'remove' },
          { header: 'sec-ch-ua-bitness', operation: 'remove' },
          { header: 'sec-ch-ua-model', operation: 'remove' },
          { header: 'sec-ch-ua-form-factors', operation: 'remove' },
          { header: 'sec-ch-ua-full-version', operation: 'remove' },
          { header: 'sec-ch-ua-full-version-list', operation: 'remove' },
        ],
      },
      condition: {
        ...panelFrame,
        excludedRequestDomains: [...desktopHosts, ...NEVER_MOBILE_HOSTS],
      },
    });
  }

  return rules;
}

export async function applyRules(settings) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: RULE_IDS,
    addRules: buildRules(settings),
  });
}

export async function clearRules() {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS });
}
