// Backing the collection's artwork into the repo.
//
// The rule these all circle is the same one: a run of this may leave a picture
// linked, but it must never leave a game with no picture at all. Everything
// downloads onto a temp directory so the real assets/ is untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isRemote, usableId, artInventory, artSummary, vendorArt, vendorEntry, ART_FIELDS,
} from '../scripts/lib/vendor.mjs';

/* --- What counts as somebody else's server -------------------------------- */

test('a link is remote and a repo path is not', () => {
  assert.equal(isRemote('https://thumbnails.libretro.com/x.png'), true);
  assert.equal(isRemote('http://example.test/x.png'), true);
  assert.equal(isRemote('assets/covers/nintendo-64-blast-corps.png'), false);
  // Nothing to back up in any of these, so none of them may read as remote.
  for (const value of [null, undefined, '', '   ', 'data:image/png;base64,AAA']) {
    assert.equal(isRemote(value), false, `${JSON.stringify(value)} is not a link`);
  }
});

test('an id has to be an id, because it becomes a filename', () => {
  assert.equal(usableId('nintendo-64-blast-corps'), true);
  for (const bad of ['../secret', 'a/b', '', '-leading', '.hidden', 'has space', null]) {
    assert.equal(usableId(bad), false, `${JSON.stringify(bad)} should be refused`);
  }
});

/* --- What gets found ------------------------------------------------------ */

const sample = () => ({
  games: [
    { id: 'n64-a', title: 'A', cover: 'https://cdn.test/a.jpg', boxart: 'https://cdn.test/a.png' },
    { id: 'n64-b', title: 'B', cover: 'assets/covers/n64-b.jpg', boxart: null },
    { id: 'n64-c', title: 'C', cover: null, boxart: null },
  ],
  hardware: [{ id: 'hw-1', name: 'Console', image: 'https://cdn.test/hw.jpg' }],
});

test('both of a game\'s pictures are counted, and hardware too', () => {
  // A game has two images that come from different places and can go stale
  // independently, so backing up only the cover would leave the shelf exposed.
  const items = artInventory(sample());
  assert.deepEqual(items.map((i) => `${i.id}:${i.spec.field}`),
    ['n64-a:cover', 'n64-b:cover', 'n64-a:boxart', 'hw-1:image']);
});

test('an entry with no art is not a gap to fill', () => {
  const summary = artSummary(sample());
  assert.deepEqual(summary, { total: 4, remote: 3, stored: 1 });
});

/* --- Downloading ---------------------------------------------------------- */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

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

const ok = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });

async function tempFields() {
  const dir = await mkdtemp(join(tmpdir(), 'gamelog-vendor-'));
  return {
    dir,
    fields: [
      { list: 'games', field: 'cover', dir, prefix: 'tmp/covers', label: 'cover' },
      { list: 'games', field: 'boxart', dir: join(dir, 'box'), prefix: 'tmp/box', label: 'box scan' },
    ],
  };
}

test('a downloaded image is stored and the collection points at the copy', async () => {
  const { dir, fields } = await tempFields();
  const collection = sample();

  const result = await withFetch(ok, () => vendorArt(collection, { fields }));

  assert.equal(result.done.length, 2);
  assert.equal(result.failed.length, 0);
  assert.equal(collection.games[0].cover, 'tmp/covers/n64-a.png');
  assert.equal(collection.games[0].boxart, 'tmp/box/n64-a.png');
  // The extension follows the served type, not whatever the url called it.
  assert.deepEqual(await readdir(dir), ['box', 'n64-a.png']);
  assert.deepEqual(await readFile(join(dir, 'n64-a.png')), PNG);
});

test('an already-stored image is left alone', async () => {
  const { fields } = await tempFields();
  const collection = sample();
  await withFetch(ok, () => vendorArt(collection, { fields }));
  assert.equal(collection.games[1].cover, 'assets/covers/n64-b.jpg',
    'a path in the repo is not re-downloaded or rewritten');
});

test('a download that fails keeps the link it had', async () => {
  // The whole point. A game that ends a run still linked is fine; a game that
  // ends a run with an empty cover field has lost art nobody can get back.
  const { fields } = await tempFields();
  const collection = sample();
  const before = collection.games[0].cover;

  const result = await withFetch(
    (url) => (url.endsWith('.jpg') ? new Response('nope', { status: 404 }) : ok()),
    () => vendorArt(collection, { fields }));

  assert.equal(result.failed.length, 1);
  assert.equal(collection.games[0].cover, before, 'the original link survives');
  assert.equal(collection.games[0].boxart, 'tmp/box/n64-a.png', 'the one that worked still moved');
});

test('a response that is not an image is refused rather than written', async () => {
  const { dir, fields } = await tempFields();
  const collection = sample();

  const result = await withFetch(
    () => new Response('<html>gone</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    () => vendorArt(collection, { fields }));

  assert.equal(result.done.length, 0);
  assert.equal(result.failed.length, 2);
  assert.deepEqual(await readdir(dir), [], 'nothing was written');
  assert.equal(collection.games[0].cover, 'https://cdn.test/a.jpg');
});

test('an entry with no id yet is reported, not written to a stray filename', async () => {
  const { dir, fields } = await tempFields();
  const collection = { games: [{ id: '', title: 'Unsaved', cover: 'https://cdn.test/a.jpg' }], hardware: [] };

  const result = await withFetch(ok, () => vendorArt(collection, { fields }));

  assert.equal(result.done.length, 0);
  assert.match(result.failed[0].error, /id/);
  assert.deepEqual(await readdir(dir), []);
});

test('a dry run reports what it would do and writes nothing', async () => {
  const { dir, fields } = await tempFields();
  const collection = sample();

  const result = await withFetch(
    () => { throw new Error('a dry run must not reach the network'); },
    () => vendorArt(collection, { fields, dryRun: true }));

  assert.equal(result.done.length, 2);
  assert.deepEqual(await readdir(dir), []);
  assert.equal(collection.games[0].cover, 'https://cdn.test/a.jpg', 'nothing was repointed');
});

test('a private address is refused, so this cannot be pointed at your network', async () => {
  const { fields } = await tempFields();
  const collection = {
    games: [{ id: 'x', title: 'X', cover: 'http://127.0.0.1:4321/secret.png' }],
    hardware: [],
  };

  const result = await withFetch(ok, () => vendorArt(collection, { fields }));

  assert.equal(result.done.length, 0);
  assert.match(result.failed[0].error, /private network|this machine/);
});

/* --- One entry at a time -------------------------------------------------- */

test('vendorEntry looks at one entry and leaves the rest alone', async () => {
  // Every add route calls this the moment a game gets art, so it has to work on
  // an entry that is not in any collection yet.
  const game = { id: 'n64-new', title: 'New', cover: 'https://cdn.test/a.jpg', boxart: null };
  const summary = artSummary({ games: [game], hardware: [] });
  assert.deepEqual(summary, { total: 1, remote: 1, stored: 0 });
});

test('the field list covers every place art can be, and only those', () => {
  // A new art field added to the schema without a line here would silently
  // never be backed up, which is the failure mode this guards.
  assert.deepEqual(ART_FIELDS.map((f) => `${f.list}.${f.field}`),
    ['games.cover', 'games.boxart', 'hardware.image']);
});

test('vendorEntry reports what it stored so a caller can say so', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ok();
  try {
    // Writes to the real assets directory, so this uses an entry that already
    // has a local path: nothing to download, nothing to write.
    const result = await vendorEntry({ id: 'x', title: 'X', cover: 'assets/covers/x.png' });
    assert.deepEqual(result, { stored: 0, failed: 0 });
  } finally {
    globalThis.fetch = real;
  }
});
