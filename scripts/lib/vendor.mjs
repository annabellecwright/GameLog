// Copying every linked image into the repo.
//
// A GameLog is meant to be a complete thing you own: the JSON, the pages, and
// the pictures. Art arrives as a link because that is what the databases hand
// over, but leaving it that way means the shelf is only as durable as somebody
// else's hosting. This walks the collection and pulls all of it local.
//
// Nothing here is destructive. A download that fails leaves the original link
// in place, so the worst case is a game that stays linked rather than one that
// loses its art.

import { COVER_DIR, BOXART_DIR, fetchImage, storeImage, sizeOf } from './images.mjs';

/**
 * Where each kind of picture lives.
 *
 * Covers and box scans are separate directories because a game has both, under
 * the same id. Hardware photos share the covers directory, which is where the
 * manager has always put them, and ids are unique across both lists.
 */
export const ART_FIELDS = [
  { list: 'games', field: 'cover', dir: COVER_DIR, prefix: 'assets/covers', label: 'cover' },
  { list: 'games', field: 'boxart', dir: BOXART_DIR, prefix: 'assets/boxart', label: 'box scan' },
  { list: 'hardware', field: 'image', dir: COVER_DIR, prefix: 'assets/covers', label: 'photo' },
];

/** A link to somebody else's server, as opposed to a path inside this repo. */
export const isRemote = (url) => /^https?:\/\//i.test(String(url ?? '').trim());

/** An id becomes a filename, so it may only ever be an id. */
export const usableId = (id) => /^[a-z0-9][a-z0-9-]*$/i.test(String(id ?? ''));

/**
 * Every image in this collection, with where it is and where it belongs.
 *
 * Pure, so what gets downloaded is decided separately from the downloading.
 */
export function artInventory(collection, fields = ART_FIELDS) {
  const items = [];
  for (const spec of fields) {
    for (const entry of collection[spec.list] || []) {
      const url = entry[spec.field];
      if (!url) continue;
      items.push({
        entry,
        spec,
        id: entry.id,
        name: entry.title || entry.name || entry.id,
        url,
        remote: isRemote(url),
      });
    }
  }
  return items;
}

/** A one-line summary of how much of a collection is actually in the repo. */
export function artSummary(collection, fields = ART_FIELDS) {
  const items = artInventory(collection, fields);
  const remote = items.filter((i) => i.remote);
  return { total: items.length, remote: remote.length, stored: items.length - remote.length };
}

/** Run jobs a few at a time, so a whole collection does not hammer one host. */
async function pooled(items, limit, run) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  });
  await Promise.all(workers);
}

/**
 * Download everything still linked, and repoint the collection at the copies.
 *
 * The caller saves the collection afterwards: this mutates entries in memory so
 * that a run which is interrupted has still written whatever images it managed,
 * and a second run picks up the rest.
 */
export async function vendorArt(
  collection,
  { dryRun = false, onItem = () => {}, fields = ART_FIELDS } = {}
) {
  const pending = artInventory(collection, fields).filter((i) => i.remote);
  const done = [];
  const failed = [];
  let bytes = 0;

  await pooled(pending, 6, async (item) => {
    if (!usableId(item.id)) {
      failed.push({ ...item, error: 'no usable id: save the entry first' });
      onItem({ ...item, ok: false });
      return;
    }
    try {
      if (dryRun) {
        done.push({ ...item, path: `${item.spec.prefix}/${item.id}.…` });
        onItem({ ...item, ok: true });
        return;
      }
      const image = await fetchImage(item.url);
      const { ext, bytes: n } = await storeImage(image, item.spec.dir, item.id);
      const path = `${item.spec.prefix}/${item.id}.${ext}`;
      // Only now does the entry stop pointing at the original. If anything
      // above threw, the link it already had is still the working one.
      item.entry[item.spec.field] = path;
      bytes += n;
      done.push({ ...item, path, bytes: n });
      onItem({ ...item, ok: true, path });
    } catch (err) {
      failed.push({ ...item, error: err.message || String(err) });
      onItem({ ...item, ok: false, error: err.message });
    }
  });

  return { done, failed, bytes, attempted: pending.length };
}

/**
 * Store one entry's art, right when the entry gets it.
 *
 * Every route that puts art on a game -- the CLI, the manager, enrich, boxart --
 * calls this, so a picture is in the repo from the moment it is found. Waiting
 * until someone remembers to run the backup is how a collection ends up half
 * hotlinked, and the person most likely to forget is the one this is for.
 *
 * A failure here is not worth stopping an add over: the entry keeps the link,
 * which still displays, and the next backup picks it up.
 */
export async function vendorEntry(entry, list = 'games') {
  const one = { games: [], hardware: [], [list]: [entry] };
  const { done, failed } = await vendorArt(one);
  return { stored: done.length, failed: failed.length };
}

/** What the stored art weighs, for the report at the end of a run. */
export async function artOnDisk(collection) {
  const local = artInventory(collection).filter((i) => !i.remote);
  const sizes = await Promise.all(local.map((i) => sizeOf(i.url)));
  return {
    files: local.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
    missing: local.filter((_, i) => sizes[i] === 0).map((i) => i.url),
  };
}
