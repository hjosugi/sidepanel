import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPin, pageKey, toUrl } from '../urls.js';

test('toUrl adds https to host names', () => {
  assert.equal(toUrl('example.com'), 'https://example.com/');
  assert.equal(toUrl('  github.com/hjosugi/sidepanel '), 'https://github.com/hjosugi/sidepanel');
  assert.equal(toUrl('example.com:8080/a?b=1#c'), 'https://example.com:8080/a?b=1#c');
  assert.equal(toUrl('日本語.jp'), 'https://xn--wgv71a119e.jp/');
});

test('toUrl uses http for local hosts', () => {
  assert.equal(toUrl('localhost:3000'), 'http://localhost:3000/');
  assert.equal(toUrl('127.0.0.1/x'), 'http://127.0.0.1/x');
  assert.equal(toUrl('[::1]:8080'), 'http://[::1]:8080/');
});

test('toUrl keeps explicit http(s) URLs', () => {
  assert.equal(toUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(toUrl('HTTPS://Example.com'), 'https://example.com/');
});

test('toUrl rejects search words and other schemes', () => {
  for (const text of [
    '',
    'claude',
    'how to cook rice',
    'node.js tutorial',
    'chrome://settings',
    'javascript:alert(1)',
    'mailto:a@example.com',
    'file:///etc/passwd',
  ]) {
    assert.equal(toUrl(text), null, text);
  }
});

test('pageKey ignores the hash and a trailing slash', () => {
  assert.equal(pageKey('https://a.com/x/#top'), pageKey('https://a.com/x'));
  assert.notEqual(pageKey('https://a.com/x?y=1'), pageKey('https://a.com/x'));
});

test('matchPin picks the closest pin of the same origin', () => {
  const pins = [
    { url: 'https://a.com/', name: 'A' },
    { url: 'https://a.com/docs', name: 'Docs' },
    { url: 'https://a.com/docs/api', name: 'API' },
    { url: 'https://b.com/x', name: 'B' },
  ];
  assert.equal(matchPin(pins, 'https://a.com/docs/api/intro').name, 'API');
  assert.equal(matchPin(pins, 'https://a.com/docs/guide').name, 'Docs');
  assert.equal(matchPin(pins, 'https://a.com/docsearch').name, 'A');
  assert.equal(matchPin(pins, 'https://a.com/').name, 'A');
  // 同じオリジンならパスが違っても、そのサイトのピンとして扱う
  assert.equal(matchPin(pins, 'https://b.com/elsewhere').name, 'B');
  assert.equal(matchPin(pins, 'https://c.com/'), null);
  assert.equal(matchPin(pins, 'not a url'), null);
});
