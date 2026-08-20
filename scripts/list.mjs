// Make and edit lists.
//
//   npm run list                            interactive menu
//   npm run list -- new "The hunt"          create a list
//   npm run list -- add hunt "Chrono Trigger"
//   npm run list -- add hunt "Banjo-Kazooie" --owned
//   npm run list -- rm hunt "Chrono Trigger"
//   npm run list -- wants hunt              mark a list as your wishlist
//   npm run list -- show                    print every list
//
// Adding a game you already own stores a `ref` to its collection entry.
// Adding one you don't own stores the title, and looks up its cover art so the
// list still reads properly. Either way, the site re-checks on every load --
// a wanted game turns into an owned one by itself once it lands in your
// collection, with no edit to the list.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  loadCollection, loadLists, saveLists, makeId, uniqueId, searchableTitle, loadPlatformOverrides,
} from './lib/collection.mjs';
import { platformInfo } from '../assets/js/platforms.mjs';
import {
  loadEnv, getToken, createClient, searchGames, coverUrl, tidySummary, releaseYear, companies,
} from './lib/igdb.mjs';

const rl = createInterface({ input: stdin, output: stdout });

/**
 * Ask a question, unless nobody is there to answer. Piped or scripted runs
 * (`npm run list -- add hunt "X" < /dev/null`, CI, a shell loop) take the
 * fallback instead of dying on a closed readline.
 */
const ask = async (q, fallback = '') => {
  if (!stdin.isTTY) return fallback;
  return (await rl.question(q)).trim() || fallback;
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function findList(lists, key) {
  const n = norm(key);
  return lists.find((l) => norm(l.id) === n)
      || lists.find((l) => norm(l.name) === n)
      || lists.find((l) => norm(l.id).startsWith(n) || norm(l.name).startsWith(n));
}

/** The games in the collection whose title matches, for the owned/wanted call. */
function matchOwned(games, title, platform) {
  const n = norm(title);
  const hits = games.filter((g) => norm(g.title) === n);
  if (!hits.length) return null;
  if (platform) return hits.find((g) => norm(g.platform) === norm(platform)) || hits[0];
  return hits[0];
}

async function igdbClient() {
  try {
    const creds = await loadEnv();
    return createClient({ id: creds.id, token: await getToken(creds) });
  } catch {
    return null; // No keys is fine; the entry just has no art yet.
  }
}

/** Look a not-yet-owned game up so the list tile isn't a blank placeholder. */
async function lookupWanted(title, platform) {
  const query = await igdbClient();
  if (!query) return null;

  const results = await searchGames(query, searchableTitle(title), { platform, limit: 6 });
  if (!results.length) return null;

  console.log('');
  results.forEach((g, i) => {
    const year = releaseYear(g.first_release_date);
    console.log(`  ${String(i + 1).padStart(2)}. ${g.name}${year ? `  (${year})` : ''}` +
      `${g.cover?.image_id ? '' : '  (no cover art)'}`);
  });
  console.log('   0. none of these\n');

  const pick = Number(await ask('  Which one? [1] ', '1'));
  if (!Number.isInteger(pick) || pick < 1 || pick > results.length) return null;

  const chosen = results[pick - 1];
  const { developer, publisher } = companies(chosen);
  return {
    title: chosen.name,
    year: releaseYear(chosen.first_release_date),
    cover: chosen.cover?.image_id ? coverUrl(chosen.cover.image_id) : null,
    description: tidySummary(chosen.summary, chosen.storyline),
    genres: chosen.genres?.map((g) => g.name) || [],
    developer,
    publisher,
    igdbId: chosen.id ?? null,
  };
}

async function cmdNew(data, name) {
  const listName = name || (await ask('List name: '));
  if (!listName) throw new Error('A name is required.');

  const description = await ask('One-line description (optional): ');
  const taken = new Set(data.lists.map((l) => l.id));
  const id = uniqueId(makeId('', listName).replace(/^-/, ''), taken);

  data.lists.push({ id, name: listName, description: description || null, items: [] });
  await saveLists(data);
  console.log(`\n  Created "${listName}"  [${id}]`);
  console.log(`  Add to it:  npm run list -- add ${id} "Some Game"`);
  return id;
}

async function cmdAdd(data, collection, listKey, title, opts) {
  const list = findList(data.lists, listKey);
  if (!list) throw new Error(`No list matching "${listKey}". Try: npm run list -- show`);

  const gameTitle = title || (await ask('Game title: '));
  if (!gameTitle) throw new Error('A title is required.');

  const owned = matchOwned(collection.games, gameTitle, opts.platform);

  let entry;
  if (owned && !opts.wanted) {
    entry = { ref: owned.id };
    console.log(`  You own this: linked to ${owned.title} (${platformInfo(owned.platform).short}).`);
  } else {
    const platform = opts.platform
      || (await ask('  Platform you want it on (optional): '));
    console.log(`\nSearching IGDB for "${gameTitle}"…`);
    const found = await lookupWanted(gameTitle, platform || null);
    entry = { title: found?.title || gameTitle, platform: platform || null, ...(found || {}) };
    if (!found) console.log('  No match: added without cover art.');
  }

  const note = opts.note ?? (await ask('  Note (optional): '));
  if (note) entry.note = note;

  const already = list.items.find((i) =>
    (entry.ref && i.ref === entry.ref) ||
    (!entry.ref && norm(i.title) === norm(entry.title)));
  if (already) {
    console.log(`\n  "${entry.title || entry.ref}" is already on ${list.name}.`);
    return;
  }

  list.items.push(entry);
  await saveLists(data);
  console.log(`\n  Added to "${list.name}" (${list.items.length} now).`);
}

async function cmdRemove(data, listKey, title) {
  const list = findList(data.lists, listKey);
  if (!list) throw new Error(`No list matching "${listKey}".`);

  const n = norm(title);
  const before = list.items.length;
  list.items = list.items.filter((i) => norm(i.title) !== n && norm(i.ref) !== n
    && !norm(i.ref).endsWith(n));

  if (list.items.length === before) {
    console.log(`  Nothing matching "${title}" on "${list.name}".`);
    return;
  }
  await saveLists(data);
  console.log(`  Removed from "${list.name}" (${list.items.length} left).`);
}

/** Mark one list as the wishlist (the games you're hunting), or clear it. */
async function cmdWants(data, key) {
  if (!key) {
    const current = data.lists.find((l) => l.wants);
    console.log(current
      ? `Your wishlist is "${current.name}" [${current.id}].`
      : 'No list is marked as your wishlist yet.');
    console.log('Set one:  npm run list -- wants <list-id>   (or "none" to clear)');
    return;
  }

  // One canonical wishlist, so clear any existing mark first.
  for (const l of data.lists) delete l.wants;
  if (/^(none|off|clear)$/i.test(key)) {
    await saveLists(data);
    console.log('Cleared the wishlist mark.');
    return;
  }

  const list = findList(data.lists, key);
  if (!list) { console.log(`No list matches "${key}".`); process.exitCode = 1; return; }
  list.wants = true;
  await saveLists(data);
  console.log(`"${list.name}" is now your wishlist.`);
}

function cmdShow(data, collection) {
  if (!data.lists.length) {
    console.log('No lists yet.  npm run list -- new "The hunt"');
    return;
  }
  for (const list of data.lists) {
    const owned = list.items.filter((i) =>
      i.ref ? collection.games.some((g) => g.id === i.ref)
            : matchOwned(collection.games, i.title, i.platform)).length;
    const tag = list.wants ? ' ★ wishlist' : '';
    console.log(`\n${list.name}${tag}  [${list.id}] : ${list.items.length} items, ${owned} owned`);
    if (list.description) console.log(`  ${list.description}`);
    for (const item of list.items) {
      const isOwned = item.ref
        ? collection.games.some((g) => g.id === item.ref)
        : Boolean(matchOwned(collection.games, item.title, item.platform));
      const label = item.ref
        ? (collection.games.find((g) => g.id === item.ref)?.title || item.ref)
        : item.title;
      console.log(`  ${isOwned ? '✓' : '·'} ${label}${item.note ? ` : ${item.note}` : ''}`);
    }
  }
  console.log('');
}

async function interactive(data, collection) {
  cmdShow(data, collection);
  console.log('What would you like to do?');
  console.log('  1. Make a new list');
  console.log('  2. Add a game to a list');
  console.log('  3. Remove a game from a list');
  const choice = await ask('\n  Choice [1]: ', '1');

  if (choice === '2') {
    const key = await ask('  Which list? ');
    await cmdAdd(data, collection, key, null, {});
  } else if (choice === '3') {
    const key = await ask('  Which list? ');
    const title = await ask('  Which game? ');
    await cmdRemove(data, key, title);
  } else {
    const id = await cmdNew(data);
    const first = await ask('\n  Add a game now? (blank to skip): ');
    if (first) await cmdAdd(data, collection, id, first, {});
  }
}

async function main() {
  await loadPlatformOverrides();
  const argv = process.argv.slice(2);
  const opts = { wanted: argv.includes('--wanted') };
  if (argv.includes('--owned')) opts.wanted = false;
  const platformIdx = argv.indexOf('--platform');
  if (platformIdx !== -1) opts.platform = argv[platformIdx + 1];
  const noteIdx = argv.indexOf('--note');
  if (noteIdx !== -1) opts.note = argv[noteIdx + 1];

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      if (['--platform', '--note'].includes(argv[i])) i += 1;
      continue;
    }
    positional.push(argv[i]);
  }

  const [command, ...rest] = positional;
  const data = await loadLists();
  const collection = await loadCollection();

  switch (command) {
    case 'new': await cmdNew(data, rest.join(' ')); break;
    case 'add': await cmdAdd(data, collection, rest[0], rest.slice(1).join(' '), opts); break;
    case 'rm':
    case 'remove': await cmdRemove(data, rest[0], rest.slice(1).join(' ')); break;
    case 'wants':
    case 'wishlist': await cmdWants(data, rest[0]); break;
    case 'show':
    case 'ls': cmdShow(data, collection); break;
    case undefined: await interactive(data, collection); break;
    default:
      console.log(`Unknown command "${command}".`);
      console.log('Use: new | add | rm | wants | show, or run `npm run list` with no arguments.');
  }
}

main()
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
