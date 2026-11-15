import './chrome-stub.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { buildRules, RULE_IDS } = await import('../rules.js');

test('every rule only targets panel frames', () => {
  for (const rule of buildRules()) {
    assert.deepEqual(rule.condition.resourceTypes, ['sub_frame']);
    assert.deepEqual(rule.condition.tabIds, [-1]);
    assert.ok(RULE_IDS.includes(rule.id), `rule ${rule.id} is listed in RULE_IDS`);
  }
});

test('mobile UA can be turned off', () => {
  assert.ok(buildRules({ mobileUA: true }).some((rule) => rule.id === 10));
  assert.ok(!buildRules({ mobileUA: false }).some((rule) => rule.id === 10));
});

test('desktop hosts are excluded from the mobile UA rule', () => {
  const rule = buildRules({ desktopHosts: ['reddit.com'] }).find((item) => item.id === 10);
  assert.ok(rule.condition.excludedRequestDomains.includes('reddit.com'));
});

test('Cloudflare challenge frames never get the mobile UA (#17)', () => {
  for (const desktopHosts of [[], ['chatgpt.com']]) {
    const rule = buildRules({ desktopHosts }).find((item) => item.id === 10);
    assert.ok(rule.condition.excludedRequestDomains.includes('challenges.cloudflare.com'));
  }
});

test('CSP is only removed when it contains frame-ancestors', () => {
  const rule = buildRules().find((item) => item.id === 2);
  assert.deepEqual(rule.condition.responseHeaders, [
    { header: 'content-security-policy', values: ['*frame-ancestors*'] },
  ]);
});
