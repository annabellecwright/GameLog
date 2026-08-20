// What the shelf draws, and when it changes shape.
//
// The tiles themselves need a DOM, but every decision behind them is pure: is
// this shelf one console's worth, how tall should it be, which picture does a
// tile get and at what proportions. renderGrid does nothing but apply what
// these return, so testing them tests the rendering difference rather than a
// re-implementation of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shelfShape, boxHeight, boxTile } from '../assets/js/lib.js';

/** A scanned game, at N64 cartridge-box proportions unless told otherwise. */
const scanned = (id, ratio = 1.37) => ({
  id, platform: 'Nintendo 64', boxart: `https://example.test/${id}.png`, boxartRatio: ratio,
});

/** A game with a cover but no box scan. */
const unscanned = (id, platform = 'Nintendo 64') => ({
  id, platform, cover: 'https://example.test/cover.png', boxart: null, boxartRatio: null,
});

/* --- When true shapes turn on --------------------------------------------- */

test('a mixed shelf keeps the uniform grid', () => {
  // The whole premise is that every box on the shelf is the same shape. Two
  // consoles on screen at once, and drawing real proportions is just noise.
  const games = [scanned('a'), { ...scanned('b'), platform: '3DO' }];
  assert.equal(shelfShape(games), null);
});

test('an empty shelf has no shape', () => {
  assert.equal(shelfShape([]), null);
});

test('a shelf that is mostly unscanned stays uniform', () => {
  // Below the threshold the median is guesswork, and a shelf of guesses looks
  // worse than a shelf that never claimed to be true to life.
  const games = [scanned('a'), unscanned('b'), unscanned('c'), unscanned('d'), unscanned('e')];
  assert.equal(shelfShape(games), null);
});

test('the coverage threshold is met, not merely approached', () => {
  const games = [scanned('a'), scanned('b'), scanned('c'), unscanned('d'), unscanned('e')];
  const shape = shelfShape(games);
  assert.ok(shape, 'three scans in five is enough to know the shape');
  assert.equal(shape.scanned, 3);
  assert.equal(shape.total, 5);
});

test('one odd scan does not drag the shelf off shape', () => {
  // This is why it is a median and not a mean. Two of the 3DO titles really are
  // landscape, and averaging them in would have tilted every longbox on the
  // shelf toward a shape none of them are.
  const games = [scanned('a', 0.5), scanned('b', 0.52), scanned('c', 0.49), scanned('d', 1.6)];
  const shape = shelfShape(games);
  assert.ok(shape.median < 0.6, `median ${shape.median} should still be a longbox`);
});

test('a current-gen shelf with no scans uses the console\'s known case shape', () => {
  // Switch cases are all one size and libretro can't scan them, so the known
  // ratio is exact -- and reads better than dropping to a plain grid.
  const games = [unscanned('a', 'Nintendo Switch'), unscanned('b', 'Nintendo Switch')];
  const shape = shelfShape(games);
  assert.ok(shape, 'a known-shape console still gets a shelf');
  assert.equal(shape.median, 0.63);
  assert.equal(shape.known, true);
  assert.equal(shape.scanned, 0);
});

test('an unknown platform with no scans and no known shape stays a grid', () => {
  const games = [unscanned('a', 'Fairchild Channel F'), unscanned('b', 'Fairchild Channel F')];
  assert.equal(shelfShape(games), null);
});

test('a landscape-box console with no scans stays a grid rather than cropping art', () => {
  // N64's box is landscape (1.37); the fallback would squeeze portrait key art
  // into a wide strip. It is scannable, so it waits for a real scan instead.
  const games = [unscanned('a', 'Nintendo 64'), unscanned('b', 'Nintendo 64')];
  assert.equal(shelfShape(games), null);
});

test('some scans but not enough stays a grid even when the shape is known', () => {
  // A mix of a few measured shapes and mostly guessed ones reads worse than a
  // clean grid, so the known fallback is only for a shelf with no scans at all.
  const s = (id) => ({ id, platform: 'Nintendo Switch',
    boxart: `https://x/${id}.png`, boxartRatio: 0.63 });
  const games = [s('a'), s('b'), unscanned('c', 'Nintendo Switch'),
    unscanned('d', 'Nintendo Switch'), unscanned('e', 'Nintendo Switch')];
  assert.equal(shelfShape(games), null, '2 of 5 scanned is below the threshold and not zero');
});

/* --- How tall the shelf is drawn ------------------------------------------ */

test('landscape shelves are drawn shorter than tall ones', () => {
  // Equal height would make a row of N64 boxes tower over a row of disc cases,
  // because the landscape ones are also much wider.
  assert.equal(boxHeight({ median: 1.37 }), 150);
  assert.equal(boxHeight({ median: 0.52 }), 250);
  // A square box counts as tall: it is no wider than it is high.
  assert.equal(boxHeight({ median: 1 }), 250);
});

/* --- What one tile gets --------------------------------------------------- */

test('a scanned game is drawn from its own scan at its own proportions', () => {
  const shape = { median: 1.37 };
  const box = boxTile(scanned('a', 1.42), shape);
  assert.equal(box.src, 'https://example.test/a.png');
  assert.equal(box.ratio, 1.42);
  assert.equal(box.scanned, true);
});

test('a game with no scan borrows the shelf shape', () => {
  // Otherwise a single missing box leaves a differently-sized hole in the row,
  // which reads as a layout bug rather than as missing art.
  const box = boxTile(unscanned('b'), { median: 1.37 });
  assert.equal(box.src, null);
  assert.equal(box.ratio, 1.37);
  assert.equal(box.scanned, false, 'the tile falls back to object-fit: cover');
});

test('art this page would refuse to load cannot size a tile either', () => {
  // The url check and the ratio used to be two separate decisions, so a
  // rejected scan still got to set the tile width. One answer now covers both.
  for (const boxart of ['javascript:alert(1)', '../../etc/passwd', '  ']) {
    const box = boxTile({ boxart, boxartRatio: 3.2 }, { median: 0.52 });
    assert.equal(box.src, null, `${boxart} should be refused`);
    assert.equal(box.ratio, 0.52, `${boxart} should not set the width`);
    assert.equal(box.scanned, false);
  }
});

test('a scan with no usable ratio falls back rather than collapsing', () => {
  // A zero here would compute a zero-width tile, so anything not a positive
  // number takes the shelf's shape instead.
  for (const boxartRatio of [0, -1, null, undefined, 'wide']) {
    const box = boxTile({ boxart: 'https://example.test/a.png', boxartRatio }, { median: 0.52 });
    assert.equal(box.ratio, 0.52, `ratio ${boxartRatio} should fall back`);
    // The scan is still shown: only its proportions were unknown.
    assert.equal(box.scanned, true);
  }
});

test('a local scan path is allowed, an escaping one is not', () => {
  const shape = { median: 0.52 };
  assert.equal(boxTile({ boxart: 'assets/covers/3do-gex.png', boxartRatio: 0.71 }, shape).src,
    'assets/covers/3do-gex.png');
  assert.equal(boxTile({ boxart: 'assets/../../secret.png', boxartRatio: 0.71 }, shape).src, null);
});
