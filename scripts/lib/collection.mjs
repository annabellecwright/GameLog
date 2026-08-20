// Reading and writing data/collection.json.
//
// The file is meant to stay human-editable, so we write it back with stable key
// ordering and two-space indentation. Editing it by hand and editing it with the
// scripts should produce the same shape.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerPlatforms } from '../../assets/js/platforms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const COLLECTION_PATH = join(ROOT, 'data', 'collection.json');
export const CONFIG_PATH = join(ROOT, 'data', 'config.json');
export const LISTS_PATH = join(ROOT, 'data', 'lists.json');
export const FEED_PATH = join(ROOT, 'data', 'feed.json');
export const PLATFORMS_PATH = join(ROOT, 'data', 'platforms.json');
export { ROOT };

/**
 * Merge any data/platforms.json overrides into the registry. Optional -- most
 * collections use the built-ins untouched -- so a missing or broken file is
 * silently no override. Scripts that do platform-dependent work (art lookup,
 * validation) call this once at the start; the site does the same at boot.
 */
export async function loadPlatformOverrides() {
  if (!existsSync(PLATFORMS_PATH)) return;
  try {
    const data = JSON.parse(await readFile(PLATFORMS_PATH, 'utf8'));
    registerPlatforms(Array.isArray(data) ? data : data.platforms);
  } catch { /* leave the built-ins as they are */ }
}

/** Field order used when writing entries back out, so diffs stay readable. */
const GAME_KEYS = [
  'id', 'title', 'platform', 'year', 'cover', 'description', 'genres',
  'developer', 'publisher', 'region', 'release', 'condition', 'copies',
  'metacritic', 'notes', 'added', 'igdbId', 'wikidataId',
  // True-shape box scan, used only on single-platform views.
  'boxart', 'boxartRatio',
  // Play-through tracking, kept last so a catalogue entry reads as one first.
  'status', 'beatenOn', 'video', 'verdict',
];

const HARDWARE_KEYS = [
  'id', 'name', 'kind', 'platform', 'quantity', 'year', 'image', 'description',
  'manufacturer', 'region', 'release', 'condition', 'notes', 'added',
];

function orderKeys(obj, order) {
  const out = {};
  for (const k of order) if (obj[k] !== undefined) out[k] = obj[k];
  // Anything the user added by hand that we don't know about is preserved.
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

export async function loadCollection() {
  if (!existsSync(COLLECTION_PATH)) {
    return { games: [], hardware: [] };
  }
  const raw = await readFile(COLLECTION_PATH, 'utf8');
  const data = JSON.parse(raw);
  return {
    games: Array.isArray(data.games) ? data.games : [],
    hardware: Array.isArray(data.hardware) ? data.hardware : [],
  };
}

/**
 * Bumped only when the shape of this file changes incompatibly.
 *
 * It exists so anything reading somebody else's collection over the network --
 * the Compare view today, an index over many sites later -- can tell which
 * format it is looking at instead of inferring it from which keys happen to
 * be present.
 */
export const SCHEMA_VERSION = 1;

export async function saveCollection(collection) {
  const out = {
    gamelog: SCHEMA_VERSION,
    games: collection.games.map((g) => orderKeys(g, GAME_KEYS)),
    hardware: collection.hardware.map((h) => orderKeys(h, HARDWARE_KEYS)),
  };
  await writeFile(COLLECTION_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/* --- Lists ---------------------------------------------------------------- */

const LIST_KEYS = ['id', 'name', 'wants', 'description', 'items'];
const ITEM_KEYS = ['ref', 'title', 'platform', 'note', 'year', 'cover', 'description',
  'genres', 'developer', 'publisher', 'igdbId'];

export async function loadLists() {
  if (!existsSync(LISTS_PATH)) return { lists: [] };
  const data = JSON.parse(await readFile(LISTS_PATH, 'utf8'));
  return { lists: Array.isArray(data.lists) ? data.lists : [] };
}

export async function saveLists(data) {
  const out = {
    lists: data.lists.map((list) => {
      const ordered = orderKeys(list, LIST_KEYS);
      ordered.items = (list.items || []).map((item) => orderKeys(item, ITEM_KEYS));
      return ordered;
    }),
  };
  await writeFile(LISTS_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/** Lowercase, url-safe slug: "Chrono Trigger" -> "chrono-trigger". */
export function slug(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A stable, readable, URL-safe id like "nintendo-64-goldeneye-007". */
export function makeId(platform, title) {
  return `${slug(platform)}-${slug(title)}`.replace(/-{2,}/g, '-');
}

/* --- Feed ----------------------------------------------------------------- */

const POST_KEYS = ['id', 'date', 'title', 'body', 'ref'];

export async function loadFeed() {
  if (!existsSync(FEED_PATH)) return { posts: [] };
  const data = JSON.parse(await readFile(FEED_PATH, 'utf8'));
  return { posts: Array.isArray(data.posts) ? data.posts : [] };
}

export async function saveFeed(data) {
  const out = {
    gamelog: SCHEMA_VERSION,
    posts: (data.posts || []).map((post) => orderKeys(post, POST_KEYS)),
  };
  await writeFile(FEED_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/**
 * A post's id doubles as its deep-link anchor, so it has to be url-safe and
 * stable. Date-prefixed keeps the file sorting the way it reads -- newest
 * first -- and keeps two posts written the same day from colliding on title
 * alone only when their titles differ.
 */
export function makePostId(date, title, taken = new Set()) {
  const base = `${String(date || '').slice(0, 10)}-${slug(title)}`.replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || String(date || 'post');
  return uniqueId(base, taken);
}

/** Ensure an id is unique within the collection by suffixing -2, -3, ... */
export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Strip edition/variant noise from a title before searching IGDB.
 * "Luigi's Mansion [Player's Choice]" -> "Luigi's Mansion"
 */
export function searchableTitle(title) {
  return String(title)
    .replace(/\s*[\[(][^\])]*[\])]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
