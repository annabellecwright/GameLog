// The compare view reads somebody else's collection over the network, so its
// url handling and diffing are the parts most worth pinning down.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCollectionUrl, resolveFeedUrl, diff, loadCollection, loadFeed, loadConfig,
  loadDirectory, discover,
} from '../assets/js/compare.js';

/** Stand in for the network for one call, then put the real fetch back. */
async function withFetch(handler, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => handler(String(url));
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('resolveCollectionUrl accepts the forms people actually paste', () => {
  const expected = 'https://someone.github.io/GameLog/data/collection.json';
  assert.equal(resolveCollectionUrl('someone/GameLog'), expected);
  assert.equal(resolveCollectionUrl('https://someone.github.io/GameLog'), expected);
  assert.equal(resolveCollectionUrl('https://someone.github.io/GameLog/'), expected);
  assert.equal(resolveCollectionUrl('someone.github.io/GameLog'), expected);
  // A github.com url points at the source, not the published site.
  assert.equal(resolveCollectionUrl('https://github.com/someone/GameLog'), expected);
  // An explicit json path is taken as given.
  assert.equal(resolveCollectionUrl('https://x.dev/c.json'), 'https://x.dev/c.json');
});

test('resolveCollectionUrl rejects anything that is not http', () => {
  for (const bad of ['ftp://host/file', 'file:///etc/passwd', 'javascript:alert(1)']) {
    assert.throws(() => resolveCollectionUrl(bad), /http/i, `should reject ${bad}`);
  }
});

test('resolveCollectionUrl rejects input that is not an address', () => {
  assert.throws(() => resolveCollectionUrl(''), /paste/i);
  assert.throws(() => resolveCollectionUrl('not a url'), /address/i);
});

test('resolveCollectionUrl allows localhost, for comparing against a preview', () => {
  assert.equal(resolveCollectionUrl('localhost:4321'),
    'http://localhost:4321/data/collection.json');
});

test('resolveFeedUrl points at feed.json alongside the collection', () => {
  assert.equal(resolveFeedUrl('someone/GameLog'),
    'https://someone.github.io/GameLog/data/feed.json');
  assert.equal(resolveFeedUrl('https://someone.github.io/GameLog/'),
    'https://someone.github.io/GameLog/data/feed.json');
});

test('loadFeed reads posts, and treats a missing feed as simply empty', async () => {
  const posts = JSON.stringify({ posts: [{ title: 'A note', date: '2026-08-19' }] });
  const got = await withFetch(
    () => new Response(posts, { status: 200 }),
    () => loadFeed('someone/GameLog'));
  assert.equal(got.posts.length, 1);

  // A 404 is normal -- a shelf can have milestones and no written posts.
  const none = await withFetch(
    () => new Response('nope', { status: 404 }),
    () => loadFeed('someone/GameLog'));
  assert.deepEqual(none.posts, []);
});

test('loadConfig reads the friends list, and a missing config is just no friends', async () => {
  const body = JSON.stringify({ friends: [{ name: 'Mel', url: 'mel.github.io/GameLog' }, { bad: 1 }] });
  const got = await withFetch(() => new Response(body, { status: 200 }),
    () => loadConfig('someone/GameLog'));
  assert.equal(got.friends.length, 1);
  assert.equal(got.friends[0].name, 'Mel');

  const none = await withFetch(() => new Response('', { status: 404 }),
    () => loadConfig('someone/GameLog'));
  assert.deepEqual(none.friends, []);
});

test('discover surfaces friends-of-friends you do not already follow, most-connected first', () => {
  const shelves = [
    { friend: { name: 'Sam' }, friends: [
      { name: 'Mel', url: 'mel.github.io/GameLog' },
      { name: 'Chris', url: 'chris.github.io/GameLog' },
    ] },
    { friend: { name: 'Jo' }, friends: [
      { name: 'Chris', url: 'https://chris.github.io/GameLog/' }, // same shelf, other spelling
      { name: 'Me', url: 'me.github.io/GameLog' },                // already mine: excluded
    ] },
  ];
  const found = discover({ shelves, exclude: ['me.github.io/GameLog'] });

  // Chris is followed by both Sam and Jo, so ranks ahead of Mel; Me is excluded.
  assert.deepEqual(found.map((c) => c.name), ['Chris', 'Mel']);
  assert.deepEqual(found[0].followedBy.sort(), ['Jo', 'Sam']);
  assert.equal(found.some((c) => c.name === 'Me'), false);
});

test('discover folds in directory listings, keeping provenance and ranking warmth first', () => {
  const shelves = [{ friend: { name: 'Sam' }, friends: [
    { name: 'Chris', url: 'chris.github.io/GameLog' },
  ] }];
  const directories = [{ name: 'The Ring', shelves: [
    { name: 'Chris', url: 'https://chris.github.io/GameLog/' }, // also a friend-of-friend
    { name: 'Rita', url: 'rita.github.io/GameLog' },            // directory-only
  ] }];
  const found = discover({ shelves, directories });

  // Chris (followed by a friend AND listed) leads; Rita (listed only) follows.
  assert.deepEqual(found.map((c) => c.name), ['Chris', 'Rita']);
  assert.deepEqual(found[0].followedBy, ['Sam']);
  assert.deepEqual(found[0].listedIn, ['The Ring']);
  assert.deepEqual(found[1].followedBy, []);
  assert.deepEqual(found[1].listedIn, ['The Ring']);
});

test('discover drops a hostile url from either source', () => {
  const found = discover({
    shelves: [{ friend: { name: 'Sam' }, friends: [{ name: 'evil', url: 'javascript:alert(1)' }] }],
    directories: [{ name: 'D', shelves: [
      { name: 'bad', url: 'file:///etc/passwd' },
      { name: 'ok', url: 'ok.github.io/GameLog' },
    ] }],
  });
  assert.deepEqual(found.map((c) => c.name), ['ok']);
});

test('loadDirectory reads the shelves list and refuses a non-directory', async () => {
  const body = JSON.stringify({
    gamelog_directory: 1, name: 'The Ring',
    shelves: [{ name: 'Sam', url: 'sam.github.io/GameLog' }, { nope: 1 }],
  });
  const got = await withFetch(() => new Response(body, { status: 200 }),
    () => loadDirectory('https://x.dev/ring.json'));
  assert.equal(got.name, 'The Ring');
  assert.equal(got.shelves.length, 1);

  await assert.rejects(
    withFetch(() => new Response('{"games":[]}', { status: 200 }),
      () => loadDirectory('https://x.dev/not-a-directory.json')),
    /directory/i);
});

test('loadDirectory rejects a non-http address', async () => {
  await assert.rejects(loadDirectory('ftp://x.dev/ring.json'), /http/i);
});

test('diff groups by title, not by platform', () => {
  const mine = [
    { title: 'GoldenEye 007', platform: 'Nintendo 64' },
    { title: 'Halo', platform: 'Microsoft Xbox' },
  ];
  const theirs = [
    // Same game, different shelf: still shared.
    { title: 'GoldenEye 007', platform: 'Nintendo Switch' },
    { title: 'Chrono Trigger', platform: 'SNES/Super Famicom' },
  ];
  const r = diff(mine, theirs);
  assert.equal(r.shared.length, 1);
  assert.equal(r.shared[0].mine[0].title, 'GoldenEye 007');
  assert.deepEqual(r.onlyMine.map((g) => g.title), ['Halo']);
  assert.deepEqual(r.onlyTheirs.map((g) => g.title), ['Chrono Trigger']);
});

test('loadCollection refuses a body larger than the cap, by its declared size', async () => {
  const huge = String(64 * 1024 * 1024);
  const result = withFetch(
    () => new Response('{"games":[]}', { status: 200, headers: { 'content-length': huge } }),
    () => loadCollection('https://x.dev/c.json'));
  await assert.rejects(result, /larger than|Refusing/i);
});

test('loadCollection still loads a normal collection', async () => {
  const body = JSON.stringify({ games: [{ title: 'Halo', platform: 'Microsoft Xbox' }] });
  const result = await withFetch(
    () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    () => loadCollection('https://x.dev/c.json'));
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].title, 'Halo');
});

test('diff ignores a leading article, which exporters disagree about', () => {
  const r = diff(
    [{ title: 'The Legend of Zelda', platform: 'NES/Famicom' }],
    [{ title: 'Legend of Zelda', platform: 'NES/Famicom' }],
  );
  assert.equal(r.shared.length, 1);
  assert.equal(r.onlyMine.length, 0);
});
