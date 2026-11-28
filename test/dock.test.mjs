import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignPages } from '../src/sidepanel/dock.js';

const pins = [
  { url: 'https://a.com/', name: 'A' },
  { url: 'https://b.com/docs', name: 'B' },
];

test('pages go to the pin of their site', () => {
  const a = { id: 1, url: 'https://a.com/inbox' };
  const b = { id: 2, url: 'https://b.com/docs/x' };
  const c = { id: 3, url: 'https://c.com/' };
  const { pinned, loose } = assignPages(pins, [a, b, c]);
  assert.equal(pinned.get('https://a.com/'), a);
  assert.equal(pinned.get('https://b.com/docs'), b);
  assert.deepEqual(loose, [c]);
});

test('a pin holds one page; the rest and pages without a URL are loose', () => {
  const first = { id: 1, url: 'https://a.com/1' };
  const second = { id: 2, url: 'https://a.com/2' };
  const blank = { id: 3, url: '' };
  const { pinned, loose } = assignPages(pins, [first, second, blank]);
  assert.equal(pinned.get('https://a.com/'), first);
  assert.deepEqual(loose, [second, blank]);
});
