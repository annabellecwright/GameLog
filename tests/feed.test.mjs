// The log is a merge: posts the owner wrote, plus milestones derived from the
// collection's own play-through data. The merge is the thing worth pinning down
// -- ordering, what becomes a milestone, and that ids stay url-safe and unique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePostId } from '../scripts/lib/collection.mjs';
import { buildStream, buildRiver } from '../assets/js/feed.js';

test('makePostId is date-prefixed, url-safe, and made unique', () => {
  assert.equal(makePostId('2026-08-19', 'Found a boxed Halo 2'), '2026-08-19-found-a-boxed-halo-2');
  // Accents and punctuation fold away, like every other id in the project.
  assert.equal(makePostId('2026-01-02', 'Pokémon: caught them all!'), '2026-01-02-pokemon-caught-them-all');
  // A collision gets a numeric suffix rather than silently overwriting.
  const taken = new Set(['2026-08-19-shelf-reorg']);
  assert.equal(makePostId('2026-08-19', 'Shelf reorg', taken), '2026-08-19-shelf-reorg-2');
});

const games = [
  { id: 'x-halo', title: 'Halo 2', platform: 'Microsoft Xbox',
    status: 'beaten', beatenOn: '2026-08-15', verdict: 'Still holds up.' },
  { id: 'wii-play', title: 'Wii Play', platform: 'Nintendo Wii',
    status: 'dropped', beatenOn: '2026-08-12' },
  { id: 'sw-odyssey', title: 'Super Mario Odyssey', platform: 'Nintendo Switch',
    status: 'playing' },                                   // in progress: no milestone
  { id: 'n64-goldeneye', title: 'GoldenEye 007', platform: 'Nintendo 64' },
];

test('milestones are derived from beaten and dropped games with a date', () => {
  const stream = buildStream([], games);
  const titles = stream.map((s) => s.title);
  // Halo (beaten) and Wii Play (dropped) become entries; the playing and
  // untouched games do not.
  assert.deepEqual(titles, ['Beaten: Halo 2', 'Dropped: Wii Play']);
  assert.equal(stream[0].kind, 'milestone');
  assert.equal(stream[0].body, 'Still holds up.', 'the verdict becomes the body');
});

test('a beaten game with no date produces no milestone', () => {
  const stream = buildStream([], [{ id: 'a', title: 'A', platform: 'PC', status: 'beaten' }]);
  assert.equal(stream.length, 0);
});

test('the stream is newest first, and a post wins a same-day tie', () => {
  const posts = [
    { id: 'p1', date: '2026-08-15', title: 'A day at the flea market', body: '' },
    { id: 'p0', date: '2026-08-01', title: 'Older note', body: '' },
  ];
  const stream = buildStream(posts, games);
  assert.deepEqual(stream.map((s) => s.date),
    ['2026-08-15', '2026-08-15', '2026-08-12', '2026-08-01']);
  // Both land on the 15th; the written post sorts ahead of the beaten milestone.
  assert.equal(stream[0].kind, 'post');
  assert.equal(stream[1].kind, 'milestone');
});

test('a post ref resolves to the game it points at, and a bad ref just has no thumb', () => {
  const posts = [
    { id: 'p', date: '2026-08-20', title: 'Got it', ref: 'x-halo' },
    { id: 'q', date: '2026-08-19', title: 'Mystery', ref: 'does-not-exist' },
  ];
  const stream = buildStream(posts, games);
  assert.equal(stream.find((s) => s.id === 'p').game.title, 'Halo 2');
  assert.equal(stream.find((s) => s.id === 'q').game, null);
});

test('a beaten milestone carries its episode number', () => {
  const stream = buildStream([], games);
  const halo = stream.find((s) => s.title === 'Beaten: Halo 2');
  // Only one beaten game here, so it is episode 1. Dropped games are not episodes.
  assert.equal(halo.episode, 1);
});

test('buildRiver merges several shelves newest-first, tagging who each is from', () => {
  const sam = {
    friend: { name: 'Sam', url: 'https://sam.example/GameLog' },
    posts: [{ id: 's1', date: '2026-08-20', title: 'Sam found a game' }],
    games: [{ id: 'g', title: 'Halo', platform: 'PC', status: 'beaten', beatenOn: '2026-08-14' }],
  };
  const mel = {
    friend: { name: 'Mel', url: 'https://mel.example/GameLog' },
    posts: [{ id: 'm1', date: '2026-08-18', title: 'Mel wrote something' }],
    games: [],
  };

  const river = buildRiver([sam, mel]);
  assert.deepEqual(river.map((i) => i.title),
    ['Sam found a game', 'Mel wrote something', 'Beaten: Halo']);
  assert.equal(river[0].friend.name, 'Sam');
  assert.equal(river[1].friend.name, 'Mel');
  assert.equal(river[2].friend.name, 'Sam', 'a milestone keeps its shelf');
});

test('buildRiver caps the merged stream', () => {
  const shelf = {
    friend: { name: 'X', url: 'https://x.example' },
    posts: Array.from({ length: 90 }, (_, i) => ({
      id: `p${i}`, date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`, title: `P${i}` })),
    games: [],
  };
  assert.equal(buildRiver([shelf], { limit: 60 }).length, 60);
});
