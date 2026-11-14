import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, MAX_PAGES, normalizeSettings } from '../store.js';

test('defaults', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('broken'), DEFAULT_SETTINGS);
});

test('maxPages is clamped', () => {
  assert.equal(normalizeSettings({ maxPages: 0 }).maxPages, 1);
  assert.equal(normalizeSettings({ maxPages: 99 }).maxPages, MAX_PAGES);
  assert.equal(normalizeSettings({ maxPages: '2' }).maxPages, 2);
  assert.equal(normalizeSettings({ maxPages: 'x' }).maxPages, DEFAULT_SETTINGS.maxPages);
});

test('desktop hosts are cleaned', () => {
  assert.deepEqual(
    normalizeSettings({ desktopHosts: ['Reddit.com', 'reddit.com', '*://bad/*', ' x.com ', 42] })
      .desktopHosts,
    ['reddit.com', 'x.com'],
  );
});

test('other values are kept', () => {
  const settings = normalizeSettings({ lang: 'ja', mobileUA: false });
  assert.equal(settings.lang, 'ja');
  assert.equal(settings.mobileUA, false);
});
