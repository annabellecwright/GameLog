// Sanity-check data/collection.json before you push.
//
//   npm run check
//
// Catches the things that actually break the site or look wrong on it:
// invalid JSON, missing required fields, duplicate ids, unknown platforms,
// and how much is still waiting on `npm run enrich`.

import { loadCollection, loadLists, loadFeed, loadPlatformOverrides, COLLECTION_PATH } from './lib/collection.mjs';
import { artSummary, artInventory } from './lib/vendor.mjs';
import { sizeOf } from './lib/images.mjs';
import { PLATFORMS, platformInfo } from '../assets/js/platforms.mjs';

const problems = [];
const warnings = [];

await loadPlatformOverrides();
const known = new Set(PLATFORMS.map((p) => p.key.toLowerCase()));

let collection;
try {
  collection = await loadCollection();
} catch (err) {
  console.error(`data/collection.json is not valid JSON:\n  ${err.message}`);
  process.exit(1);
}

const { games, hardware } = collection;
const seenIds = new Map();

for (const [kind, items] of [['game', games], ['hardware', hardware]]) {
  items.forEach((item, i) => {
    const label = item.title || item.name || `<${kind} #${i + 1}>`;

    if (!item.id) problems.push(`${label}: missing "id"`);
    else if (seenIds.has(item.id)) {
      problems.push(`duplicate id "${item.id}" (${seenIds.get(item.id)} and ${label})`);
    } else seenIds.set(item.id, label);

    if (kind === 'game' && !item.title) problems.push(`${kind} #${i + 1}: missing "title"`);
    if (kind === 'hardware' && !item.name) problems.push(`${kind} #${i + 1}: missing "name"`);
    if (!item.platform) problems.push(`${label}: missing "platform"`);
    else if (!known.has(String(item.platform).toLowerCase())) {
      warnings.push(
        `${label}: platform "${item.platform}" is not in the registry: ` +
        `it will still show, with a generated "${platformInfo(item.platform).short}" badge. ` +
        `Add it to data/platforms.json for a proper label, colour and box shape.`
      );
    }

    if (item.genres && !Array.isArray(item.genres)) {
      problems.push(`${label}: "genres" should be a list, e.g. ["Action", "RPG"]`);
    }
    if (item.copies != null && (!Number.isInteger(item.copies) || item.copies < 1)) {
      problems.push(`${label}: "copies" should be a whole number of 1 or more`);
    }
    if (kind === 'hardware' && item.kind
        && !['console', 'controller', 'memory', 'accessory'].includes(item.kind)) {
      warnings.push(`${label}: "${item.kind}" is not a known kind, so it will show `
        + 'as an accessory (console, controller, memory, accessory)');
    }
    if (item.quantity != null
        && (!Number.isInteger(item.quantity) || item.quantity < 1)) {
      problems.push(`${label}: "quantity" should be a whole number of at least 1`);
    }
    if (kind === 'game' && item.status
        && !['playing', 'beaten', 'dropped'].includes(item.status)) {
      problems.push(`${label}: "${item.status}" is not a status `
        + '(use playing, beaten, dropped, or leave it out)');
    }
    if (item.beatenOn && !/^\d{4}-\d{2}-\d{2}$/.test(item.beatenOn)) {
      problems.push(`${label}: "beatenOn" should look like 2026-08-20`);
    }
    if (item.video && !/^https?:\/\//i.test(item.video)) {
      warnings.push(`${label}: "video" is not a link, so it won't be shown`);
    }
    if (item.cover && !/^(https?:)?\/\/|^data:|^assets\//.test(item.cover)) {
      warnings.push(`${label}: "cover" is not a url or an assets/ path. It may not load`);
    }
  });
}

/* --- Lists ---------------------------------------------------------------- */

let lists = { lists: [] };
try {
  lists = await loadLists();
} catch (err) {
  problems.push(`data/lists.json is not valid JSON: ${err.message}`);
}

const listIds = new Set();
const gameIds = new Set(games.map((g) => g.id));
let wantedCount = 0;
let wishlists = 0;

for (const list of lists.lists) {
  const label = list.name || list.id || '<unnamed list>';
  if (!list.id) problems.push(`${label}: a list needs an "id"`);
  else if (listIds.has(list.id)) problems.push(`two lists share the id "${list.id}"`);
  else listIds.add(list.id);

  if (list.wants === true) wishlists += 1;
  else if (list.wants != null && typeof list.wants !== 'boolean') {
    problems.push(`${label}: "wants" should be true or false`);
  }

  if (!Array.isArray(list.items)) {
    problems.push(`${label}: "items" should be a list`);
    continue;
  }

  for (const item of list.items) {
    if (!item || (!item.ref && !item.title)) {
      problems.push(`${label}: an entry has neither "ref" nor "title"`);
      continue;
    }
    // A dangling ref is the one list error that shows up on the page, as a
    // tile with an exclamation mark and no artwork.
    if (item.ref && !gameIds.has(item.ref)) {
      warnings.push(
        `${label}: "${item.ref}" doesn't match any game id. That entry will ` +
        `show as broken. Either fix the id or replace it with a "title".`
      );
    }
    if (!item.ref && !games.some((g) =>
      g.title.toLowerCase().replace(/[^a-z0-9]/g, '')
        === String(item.title).toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      wantedCount += 1;
    }
  }
}

// One canonical wishlist, so anything reading it never has to guess which.
if (wishlists > 1) {
  warnings.push(`${wishlists} lists are marked as the wishlist; the site uses the first. `
    + 'Mark just one with `npm run list -- wants <id>`.');
}

/* --- Feed ----------------------------------------------------------------- */

let feed = { posts: [] };
try {
  feed = await loadFeed();
} catch (err) {
  problems.push(`data/feed.json is not valid JSON: ${err.message}`);
}

const postIds = new Set();
for (const post of feed.posts) {
  const label = post.title || post.id || '<untitled post>';
  if (!post.title) problems.push(`a log post is missing a "title"`);
  if (!post.date || !/^\d{4}-\d{2}-\d{2}/.test(post.date)) {
    problems.push(`${label}: a log post needs a "date" like 2026-08-19`);
  }
  if (post.id) {
    if (postIds.has(post.id)) problems.push(`two log posts share the id "${post.id}"`);
    else postIds.add(post.id);
  }
  // A post ref that doesn't resolve just loses its cover thumbnail -- the post
  // still shows -- so it's a warning, like a list's dangling ref.
  if (post.ref && !gameIds.has(post.ref)) {
    warnings.push(`${label}: ref "${post.ref}" matches no game, so the post shows without a cover`);
  }
}

// Artwork. A path in the JSON with no file behind it is the one art problem
// the page cannot recover from, because the original link is gone.
const art = artSummary(collection);
const missingArt = [];
for (const item of artInventory(collection)) {
  if (!item.remote && !(await sizeOf(item.url))) missingArt.push(item);
}
for (const item of missingArt) {
  problems.push(`${item.name}: "${item.url}" is not in the repo. `
    + 'Restore it from git, or clear the field and run `npm run enrich`');
}

const beaten = games.filter((g) => g.status === 'beaten');
const noCover = games.filter((g) => !g.cover);
const noDescription = games.filter((g) => !g.description);
const noYear = games.filter((g) => !g.year);

console.log(`${COLLECTION_PATH.replace(process.cwd() + '/', '')}`);
console.log(`  ${games.length} games, ${hardware.length} hardware items`);
if (lists.lists.length) {
  const items = lists.lists.reduce((n, l) => n + (l.items?.length || 0), 0);
  console.log(`  ${lists.lists.length} list(s), ${items} entries` +
    (wantedCount ? `, ${wantedCount} not owned yet` : ''));
}
if (feed.posts.length) console.log(`  ${feed.posts.length} log post(s)`);
console.log('');

if (problems.length) {
  console.log(`${problems.length} problem(s) to fix:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log('');
}

if (warnings.length) {
  console.log(`${warnings.length} thing(s) worth a look:`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (noCover.length || noDescription.length || noYear.length) {
  console.log('Waiting on `npm run enrich`:');
  if (noCover.length) console.log(`  ${noCover.length} without cover art`);
  if (noDescription.length) console.log(`  ${noDescription.length} without a description`);
  if (noYear.length) console.log(`  ${noYear.length} without a release year`);
  console.log('');
}

if (art.total) {
  if (art.remote) {
    console.log(`Artwork: ${art.remote} of ${art.total} images are linked to other sites.`);
    console.log('  They will vanish if that site reorganises. `npm run vendor` stores them.\n');
  } else if (!missingArt.length) {
    console.log(`Artwork: all ${art.total} images are stored in this repo.\n`);
  }
}

if (beaten.length) {
  const withVideo = beaten.filter((g) => g.video).length;
  console.log(`Play-through: ${beaten.length} of ${games.length} beaten`
    + `, ${withVideo} with an episode link\n`);
}

if (!problems.length) {
  console.log(warnings.length ? 'No blocking problems: safe to push.' : 'All good.');
}

process.exit(problems.length ? 1 : 0);
