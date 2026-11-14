import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCookieWrite } from '../cookies.js';

const base = 'https://app.example.com/chat/123';
const now = Date.parse('2026-01-01T00:00:00Z');
const parse = (value) => parseCookieWrite(base, value, now);

test('defaults: Lax, path of the document', () => {
  assert.deepEqual(parse('a=1'), {
    set: {
      url: 'https://app.example.com/chat/',
      name: 'a',
      value: '1',
      path: '/chat/',
      secure: false,
      sameSite: 'lax',
    },
  });
});

test('attributes', () => {
  const { set } = parse(
    'csrf=x=y; Path=/; Domain=.example.com; Secure; SameSite=Strict; Max-Age=60',
  );
  assert.equal(set.value, 'x=y');
  assert.equal(set.url, 'https://app.example.com/');
  assert.equal(set.domain, 'example.com');
  assert.equal(set.secure, true);
  assert.equal(set.sameSite, 'strict');
  assert.equal(set.expirationDate, now / 1000 + 60);
});

test('Max-Age wins over Expires', () => {
  const { set } = parse('a=1; Expires=Thu, 01 Jan 2004 00:00:00 GMT; Max-Age=10');
  assert.equal(set.expirationDate, now / 1000 + 10);
});

test('expired cookies are removed', () => {
  assert.deepEqual(parse('a=; Path=/; Max-Age=0'), {
    remove: { url: 'https://app.example.com/', name: 'a' },
  });
  assert.ok(parse('a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT').remove);
});

test('foreign domains and invalid input are ignored', () => {
  assert.equal(parse('a=1; Domain=other.com'), null);
  assert.equal(parse('a=1; Domain=evilexample.com'), null);
  assert.equal(parse('novalue'), null);
  assert.equal(parse('=1'), null);
  assert.equal(parseCookieWrite('chrome-extension://abc/', 'a=1', now), null);
});

test('SameSite=None needs Secure', () => {
  assert.equal(parse('a=1; SameSite=None'), null);
  assert.equal(parse('a=1; SameSite=None; Secure').set.sameSite, 'no_restriction');
});

test('a hostile Path cannot add a query', () => {
  assert.equal(parse('a=1; Path=/x?y=1#z').set.path, '/x');
  assert.equal(parse('a=1; Path=relative').set.path, '/');
});
