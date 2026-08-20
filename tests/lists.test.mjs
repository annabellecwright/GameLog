// A list entry is a reference that happens to resolve, or not, right now. That
// is the whole design, so it is the thing worth testing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItem, resolveList } from '../assets/js/lists.js';

const games = [
  { id: 'n64-banjo', title: 'Banjo-Kazooie', platform: 'Nintendo 64' },
  { id: 'snes-chrono', title: 'Chrono Trigger', platform: 'SNES/Super Famicom' },
];
const byId = new Map(games.map((g) => [g.id, g]));
const byTitle = new Map([
  ['banjokazooie', [games[0]]],
  ['chronotrigger', [games[1]]],
]);

test('a ref that resolves is owned', () => {
  const r = resolveItem({ ref: 'n64-banjo' }, byId, byTitle);
  assert.equal(r.owned, true);
  assert.equal(r.game.title, 'Banjo-Kazooie');
});

test('a ref that resolves to nothing is broken, not wanted', () => {
  const r = resolveItem({ ref: 'n64-missing' }, byId, byTitle);
  assert.equal(r.owned, false);
  assert.equal(r.missing, true, 'a dangling pointer must be visibly broken');
});

test('a wanted entry flips to owned once the game turns up', () => {
  // The point of the feature: buy it, and the hunting list notices.
  const wanted = { title: 'Chrono Trigger', platform: 'SNES/Super Famicom' };
  const r = resolveItem(wanted, byId, byTitle);
  assert.equal(r.owned, true);
  assert.equal(r.game.id, 'snes-chrono');
});

test('a wanted entry you do not own stays wanted, keeping its own metadata', () => {
  const r = resolveItem({ title: 'Panzer Dragoon Saga', platform: 'Sega Saturn', year: 1998 },
    byId, byTitle);
  assert.equal(r.owned, false);
  assert.equal(r.missing, undefined);
  assert.equal(r.game.year, 1998);
});

test('platform picks between two copies of the same title', () => {
  const two = [
    { id: 'xbox-kotor', title: 'KOTOR', platform: 'Microsoft Xbox' },
    { id: 'nsw-kotor', title: 'KOTOR', platform: 'Nintendo Switch' },
  ];
  const t = new Map([['kotor', two]]);
  assert.equal(resolveItem({ title: 'KOTOR', platform: 'Nintendo Switch' }, new Map(), t).game.id,
    'nsw-kotor');
  // With no platform named, the first owned copy answers.
  assert.equal(resolveItem({ title: 'KOTOR' }, new Map(), t).game.id, 'xbox-kotor');
});

test('resolveList counts what is owned', () => {
  const list = resolveList({
    id: 'hunt',
    items: [{ ref: 'n64-banjo' }, { title: 'Chrono Trigger' }, { title: 'Not Owned' }],
  }, games);
  assert.equal(list.total, 3);
  assert.equal(list.ownedCount, 2);
});

test('resolveList carries the wishlist flag through so the view can lead with it', () => {
  const list = resolveList({ id: 'hunt', wants: true, items: [{ title: 'Not Owned' }] }, games);
  assert.equal(list.wants, true);
  // A normal list has no flag rather than a false one.
  assert.equal(resolveList({ id: 'backlog', items: [] }, games).wants, undefined);
});
