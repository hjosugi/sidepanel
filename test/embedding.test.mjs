import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocksEmbedding } from '../embedding.js';

const frame = 'https://bank.example/login';
const check = (initiator, ...headers) =>
  blocksEmbedding({
    url: frame,
    initiator,
    responseHeaders: headers.map(([name, value]) => ({ name, value })),
  });

test('no embedding headers', () => {
  assert.equal(check('https://evil.example'), false);
});

test('X-Frame-Options', () => {
  assert.equal(check('https://evil.example', ['X-Frame-Options', 'DENY']), true);
  assert.equal(check('https://evil.example', ['x-frame-options', 'SAMEORIGIN']), true);
  assert.equal(check('https://bank.example', ['x-frame-options', 'sameorigin']), false);
  assert.equal(check(undefined, ['x-frame-options', 'SAMEORIGIN']), true);
});

test('CSP frame-ancestors', () => {
  const csp = (value) => ['Content-Security-Policy', value];
  assert.equal(check('https://evil.example', csp("frame-ancestors 'none'")), true);
  assert.equal(
    check('https://evil.example', csp("default-src 'self'; frame-ancestors 'self'")),
    true,
  );
  assert.equal(check('https://bank.example', csp("frame-ancestors 'self'")), false);
  assert.equal(check('https://evil.example', csp('frame-ancestors *')), false);
  assert.equal(
    check('https://a.partner.example', csp('frame-ancestors https://*.partner.example')),
    false,
  );
  assert.equal(
    check('https://partner.example.evil', csp('frame-ancestors *.partner.example')),
    true,
  );
  assert.equal(check('https://evil.example', csp('frame-ancestors https:')), false);
  assert.equal(check('http://evil.example', csp('frame-ancestors https:')), true);
  assert.equal(check('https://evil.example', csp("script-src 'self'")), false);
});

test('report-only CSP does not block', () => {
  assert.equal(
    check('https://evil.example', [
      'Content-Security-Policy-Report-Only',
      "frame-ancestors 'none'",
    ]),
    false,
  );
});

test('unparsable URLs never block', () => {
  assert.equal(blocksEmbedding({ url: 'not a url', responseHeaders: [] }), false);
});
