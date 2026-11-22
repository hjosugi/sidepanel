import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, MAX_PAGES, MAX_PINS, normalizeSettings } from '../store.js';

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

test('pins keep only unique http(s) URLs', () => {
  const pins = normalizeSettings({
    pins: [
      { url: 'https://a.com/', name: ' A ' },
      { url: 'https://a.com/', name: 'dup' },
      { url: 'javascript:alert(1)', name: 'bad' },
      { url: 'chrome://settings', name: 'chrome' },
      { url: 'http://b.com/x' },
      'broken',
      null,
    ],
  }).pins;
  assert.deepEqual(pins, [
    { url: 'https://a.com/', name: 'A' },
    { url: 'http://b.com/x', name: '' },
  ]);
  const many = Array.from({ length: MAX_PINS + 5 }, (_, i) => ({ url: `https://s${i}.com/` }));
  assert.equal(normalizeSettings({ pins: many }).pins.length, MAX_PINS);
});

test('startup falls back to the last page', () => {
  assert.equal(normalizeSettings({ startup: 'url' }).startup, 'url');
  assert.equal(normalizeSettings({ startup: 'nope' }).startup, 'last');
  assert.equal(normalizeSettings({ startUrl: 'https://a.com/x' }).startUrl, 'https://a.com/x');
  assert.equal(normalizeSettings({ startUrl: 'javascript:alert(1)' }).startUrl, '');
});

test('unframed hosts default to Claude but can be emptied', () => {
  assert.deepEqual(normalizeSettings().unframedHosts, ['claude.ai']);
  assert.deepEqual(normalizeSettings({ unframedHosts: [] }).unframedHosts, []);
  assert.deepEqual(
    normalizeSettings({ unframedHosts: ['Example.com', 'bad host'] }).unframedHosts,
    ['example.com'],
  );
});

test('zoom keeps only known levels and valid hosts', () => {
  assert.equal(normalizeSettings({ zoom: 1.25 }).zoom, 1.25);
  assert.equal(normalizeSettings({ zoom: 1.3 }).zoom, 1);
  assert.equal(normalizeSettings({ zoom: '1.25' }).zoom, 1);
  assert.deepEqual(
    normalizeSettings({ siteZoom: { 'a.com': 1.5, 'b.com': 3, 'bad host': 1.5, 'c.com': 'x' } })
      .siteZoom,
    { 'a.com': 1.5 },
  );
  assert.deepEqual(normalizeSettings({ siteZoom: ['a.com'] }).siteZoom, {});
});
