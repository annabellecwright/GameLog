// Fill in cover art, descriptions and release years.
//
//   npm run enrich                  # only what's missing
//   npm run enrich -- --force       # redo everything, overwriting
//   npm run enrich -- --only <id>
//   npm run enrich -- --dry-run     # show what would change, write nothing
//   npm run enrich -- --source free # keyless sources even if you have keys
//   npm run enrich -- --source igdb # require IGDB
//
// Two sources, and it picks for you:
//
//   free  libretro for box art, Wikipedia for descriptions and years. No
//         signup of any kind. Excellent on emulated consoles, nothing at all
//         on current-gen.
//   igdb  one database for everything, including current-gen, plus genres and
//         companies -- but it needs a free Twitch developer application.
//
// With no credentials configured it uses the keyless sources and says so,
// rather than refusing to run.

import { loadCollection, saveCollection, loadPlatformOverrides } from './lib/collection.mjs';
import { vendorEntry } from './lib/vendor.mjs';
import { platformInfo } from '../assets/js/platforms.mjs';
import {
  loadEnv, getToken, createClient, findGame, coverUrl, tidySummary, releaseYear,
  platformReleaseYear, companies,
} from './lib/igdb.mjs';
import { findCover, coverage } from './lib/libretro.mjs';
import { lookupAll, yearFromExtract } from './lib/wikipedia.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const wantSource = args.includes('--source') ? args[args.indexOf('--source') + 1] : 'auto';

const needsWork = (g) => force || !g.cover || !g.description || !g.year;

/* --- IGDB path ------------------------------------------------------------ */

async function enrichWithIgdb(collection, targets) {
  const creds = await loadEnv();
  const query = createClient({ id: creds.id, token: await getToken(creds) });

  console.log(`Looking up ${targets.length} of ${collection.games.length} games on IGDB…\n`);

  const unmatched = [];
  const lowConfidence = [];
  let updated = 0;
  let done = 0;

  for (const game of targets) {
    done += 1;
    const label = `${game.title} (${platformInfo(game.platform).short})`;
    let match = null;
    try {
      match = await findGame(query, { title: game.title, platform: game.platform });
    } catch (err) {
      console.log(`  !  ${label}: ${err.message}`);
      continue;
    }

    if (!match) {
      unmatched.push(game);
      console.log(`  ?  ${label}. No match`);
      continue;
    }

    const changes = [];
    if (match.cover?.image_id && (force || !game.cover)) {
      game.cover = coverUrl(match.cover.image_id);
      changes.push('cover');
    }
    const summary = tidySummary(match.summary, match.storyline);
    if (summary && (force || !game.description)) {
      game.description = summary;
      changes.push('description');
    }
    // Prefer the date for this platform over the franchise's first release.
    const year = platformReleaseYear(match, game.platform) ?? releaseYear(match.first_release_date);
    if (year && (force || !game.year)) { game.year = year; changes.push('year'); }
    if (match.genres?.length && !game.genres?.length) {
      game.genres = match.genres.map((x) => x.name);
      changes.push('genres');
    }
    const { developer, publisher } = companies(match);
    if (developer && !game.developer) { game.developer = developer; changes.push('developer'); }
    if (publisher && !game.publisher) { game.publisher = publisher; changes.push('publisher'); }
    if (match.id && (force || !game.igdbId)) game.igdbId = match.id;

    // Art that was just found is stored before the run moves on, so a finished
    // enrich leaves nothing hotlinked for someone to clean up afterwards.
    if (!dryRun && changes.includes('cover')) await vendorEntry(game);

    if (changes.length) updated += 1;

    const confident = match._matchScore >= 90;
    if (!confident) lowConfidence.push({ game, matchedName: match.name });
    console.log(`  ${confident ? '✓' : '~'}  [${String(done).padStart(3)}/${targets.length}] ` +
      `${label}${confident ? '' : `  → matched "${match.name}"`}`);

    if (!dryRun && done % 20 === 0) await saveCollection(collection);
  }

  return { updated, unmatched, lowConfidence };
}

/* --- Keyless path --------------------------------------------------------- */

async function enrichFree(collection, targets) {
  const platforms = [...new Set(targets.map((g) => g.platform))];
  const { covered, missing } = await coverage(platforms);

  console.log('Using the keyless sources: libretro for art, Wikipedia for text.\n');
  if (covered.length) console.log(`  box art available for: ${covered.join(', ')}`);
  if (missing.length) {
    console.log(`  no art source for:     ${missing.join(', ')}`);
    console.log('    (current-gen consoles aren\'t emulated, so nobody has scanned them here.');
    console.log('     Add those covers in `npm run manage`, or set up IGDB: see the README.)');
  }
  console.log('');

  // Text first: one batched pass for the whole run.
  process.stdout.write('  fetching descriptions…');
  const pages = await lookupAll(targets, {
    onProgress: (n, total) => process.stdout.write(`\r  fetching descriptions… ${n}/${total}`),
  });
  process.stdout.write(`\r  fetching descriptions… done (${pages.size} articles found)\n\n`);

  const unmatched = [];
  let updated = 0;
  let done = 0;

  for (const game of targets) {
    done += 1;
    const label = `${game.title} (${platformInfo(game.platform).short})`;
    const changes = [];

    if (force || !game.cover) {
      const art = await findCover(game.title, game.platform, { region: game.region || 'USA' });
      if (art) { game.cover = art; changes.push('cover'); }
    }

    const page = pages.get(game);
    if (page) {
      if ((force || !game.description) && page.extract) {
        game.description = page.extract.length > 600
          ? `${page.extract.slice(0, 599).trimEnd()}…`
          : page.extract;
        changes.push('description');
      }
      if (force || !game.year) {
        const year = yearFromExtract(page.extract);
        if (year) { game.year = year; changes.push('year'); }
      }
      if (page.wikidata && !game.wikidataId) game.wikidataId = page.wikidata;
    }

    if (!dryRun && changes.includes('cover')) await vendorEntry(game);

    if (changes.length) updated += 1;
    else if (!game.cover && !game.description) unmatched.push(game);

    const mark = changes.length ? '✓' : '·';
    console.log(`  ${mark}  [${String(done).padStart(3)}/${targets.length}] ${label}` +
      (changes.length ? `  ${changes.join(', ')}` : '  nothing found'));

    if (!dryRun && done % 25 === 0) await saveCollection(collection);
  }

  return { updated, unmatched, lowConfidence: [] };
}

/* --- Entry ---------------------------------------------------------------- */

async function pickSource() {
  if (wantSource === 'free') return 'free';
  if (wantSource === 'igdb') {
    await loadEnv(); // throws with setup instructions when absent
    return 'igdb';
  }
  try {
    await loadEnv();
    return 'igdb';
  } catch {
    return 'free';
  }
}

async function main() {
  await loadPlatformOverrides();
  const collection = await loadCollection();
  if (!collection.games.length) {
    console.error('data/collection.json has no games yet. Add one with `npm run add "Some Game"`,');
    console.error('or import an export with `npm run import:gameye`.');
    process.exit(1);
  }

  const targets = collection.games.filter((g) =>
    only ? g.id === only || g.title.toLowerCase() === only.toLowerCase() : needsWork(g)
  );

  if (!targets.length) {
    console.log('Everything is already filled in. Use --force to refetch.');
    return;
  }

  const source = await pickSource();
  const result = source === 'igdb'
    ? await enrichWithIgdb(collection, targets)
    : await enrichFree(collection, targets);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
  } else {
    await saveCollection(collection);
    console.log(`\nUpdated ${result.updated} game(s) in data/collection.json`);
  }

  if (result.lowConfidence.length) {
    console.log(`\n${result.lowConfidence.length} match(es) worth eyeballing:`);
    for (const { game, matchedName } of result.lowConfidence) {
      console.log(`  "${game.title}" → "${matchedName}"   [${game.id}]`);
    }
    console.log('  Wrong? Rerun one:  npm run enrich -- --force --only <id>');
  }

  const stillBare = collection.games.filter((g) => !g.cover);
  if (stillBare.length) {
    console.log(`\n${stillBare.length} game(s) still have no cover art.`);
    console.log('  Add one by hand in `npm run manage`: drop in an image or paste a url -');
    if (source === 'free') console.log('  or set up IGDB for the ones no emulator database covers.');
  }
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});
