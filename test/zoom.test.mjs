import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepZoom, ZOOM_LEVELS, zoomFor, zoomPercent } from '../zoom.js';

test('stepZoom moves one level and stops at the ends', () => {
  assert.equal(stepZoom(1, 1), 1.1);
  assert.equal(stepZoom(1, -1), 0.9);
  assert.equal(stepZoom(ZOOM_LEVELS.at(-1), 1), ZOOM_LEVELS.at(-1));
  assert.equal(stepZoom(ZOOM_LEVELS[0], -1), ZOOM_LEVELS[0]);
  assert.equal(stepZoom(1.3, 1), 1);
});

test('zoomFor prefers the site zoom of the exact host', () => {
  const settings = { zoom: 0.9, siteZoom: { 'mail.example.com': 1.25 } };
  assert.equal(zoomFor('mail.example.com', settings), 1.25);
  assert.equal(zoomFor('example.com', settings), 0.9);
  assert.equal(zoomFor('', settings), 0.9);
});

test('zoomPercent rounds to whole percent', () => {
  assert.equal(zoomPercent(0.67), '67%');
  assert.equal(zoomPercent(1.25), '125%');
});
