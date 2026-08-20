// The platform registry ships comprehensive, and a fork can extend or amend it
// through data/platforms.json without touching code. The merge is the part with
// rules worth pinning down: add a new console, override an existing one field by
// field, and never let a stray value break a lookup.
//
// registerPlatforms mutates the shared registry, so these only ever ADD test
// consoles or override those same test consoles -- never a real one other test
// files rely on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformInfo, platformFromIgdbId, registerPlatforms } from '../assets/js/platforms.mjs';

test('the built-in registry covers well beyond one shelf', () => {
  // A few consoles nobody in the sample collection owns, that a fork might.
  for (const key of ['Sega Master System', 'TurboGrafx-16', 'Neo Geo',
    'Atari Jaguar', 'WonderSwan', 'Nintendo Virtual Boy']) {
    const info = platformInfo(key);
    assert.equal(info.key, key, `${key} should be a known platform`);
    assert.ok(info.short && info.color, `${key} should have a badge and colour`);
  }
});

test('registerPlatforms adds a brand-new console', () => {
  registerPlatforms([{
    key: 'Test Console X', short: 'TCX', color: '#123456',
    igdb: 99991, box: 0.5, libretro: 'Test - X',
  }]);
  const info = platformInfo('test console x'); // case-insensitive
  assert.equal(info.short, 'TCX');
  assert.equal(info.box, 0.5);
  assert.equal(info.libretro, 'Test - X');
  assert.equal(platformFromIgdbId(99991), 'Test Console X');
});

test('a partial override changes only the fields it names', () => {
  registerPlatforms([{ key: 'Test Console X', color: '#abcdef', box: 0.9 }]);
  const info = platformInfo('Test Console X');
  assert.equal(info.color, '#abcdef', 'the named field changes');
  assert.equal(info.box, 0.9);
  assert.equal(info.short, 'TCX', 'an unnamed field keeps its value');
  assert.equal(info.libretro, 'Test - X', 'and so does another');
});

test('registerPlatforms fills sensible defaults and ignores junk', () => {
  registerPlatforms([
    { key: 'Test Console Y' },              // nothing but a key
    { short: 'NOKEY' },                     // no key at all: skipped
    'not even an object',
  ]);
  const info = platformInfo('Test Console Y');
  assert.equal(info.key, 'Test Console Y');
  assert.equal(info.short, 'TEST', 'short falls back to the key initials');
  assert.ok(info.color, 'a colour is always present');
  assert.equal(info.box, null);
  assert.equal(info.libretro, null);
});
