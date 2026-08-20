// Add a game to the collection, interactively.
//
//   npm run add "Chrono Trigger"
//   npm run add "Chrono Trigger" -- --platform "SNES/Super Famicom"
//   npm run add "Katamari Damacy" -- --platform "Nintendo Switch" --condition CIB
//
// It searches, shows you the matches, and writes the one you pick into
// data/collection.json with its cover art, description and year.
//
// Uses IGDB when it is configured and the keyless sources otherwise -- no
// signup is needed to add a game. `--source free` forces the keyless path,
// `--no-lookup` skips lookup entirely and adds a bare entry.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadCollection, saveCollection, makeId, uniqueId, loadPlatformOverrides } from './lib/collection.mjs';
import { PLATFORMS, platformInfo } from '../assets/js/platforms.mjs';
import {
  loadEnv, getToken, createClient, searchGames, coverUrl, tidySummary, releaseYear, companies,
} from './lib/igdb.mjs';
import { searchFree, coverFor, hasFreeArt } from './lib/freelookup.mjs';
import { findBoxart } from './lib/libretro.mjs';
import { vendorEntry } from './lib/vendor.mjs';

function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--no-lookup') opts.noLookup = true;
    else if (a.startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; }
    else opts.positional.push(a);
  }
  return opts;
}

const rl = createInterface({ input: stdin, output: stdout });

/** Ask, unless nobody is there to answer -- scripted runs take the fallback. */
const ask = async (q, fallback = '') => {
  if (!stdin.isTTY) return fallback;
  const answer = (await rl.question(q)).trim();
  return answer || fallback;
};

function describeCandidate(c) {
  const bits = [c.year, (c.platforms || []).slice(0, 4).join(', ')]
    .filter(Boolean).join(' · ');
  const art = c.cover ? '' : '  (no cover art)';
  return `${c.title}${bits ? `\n        ${bits}` : ''}${art}`;
}

/** IGDB's shape, flattened to the one the keyless search already returns. */
function fromIgdb(g) {
  const { developer, publisher } = companies(g);
  return {
    title: g.name,
    year: releaseYear(g.first_release_date),
    cover: g.cover?.image_id ? coverUrl(g.cover.image_id) : null,
    description: tidySummary(g.summary, g.storyline),
    genres: g.genres?.map((x) => x.name) || [],
    developer,
    publisher,
    igdbId: g.id ?? null,
    platforms: (g.platforms || []).map((p) => (typeof p === 'object' ? p.name : null)).filter(Boolean),
  };
}

async function choosePlatform(collection, suggested) {
  const inUse = [...new Set(collection.games.map((g) => g.platform))].sort();
  const options = [...new Set([...(suggested || []), ...inUse])];

  console.log('\nWhich platform is your copy for?');
  options.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p}`));
  console.log('   or just type the platform name');

  const answer = await ask('\n  Platform: ');
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  if (!answer) throw new Error('A platform is required.');

  // Accept a short label like "N64" as well as the full name.
  const bySort = PLATFORMS.find(
    (p) => p.short.toLowerCase() === answer.toLowerCase() || p.key.toLowerCase() === answer.toLowerCase()
  );
  return bySort ? bySort.key : answer;
}

async function main() {
  await loadPlatformOverrides();
  const opts = parseArgs(process.argv.slice(2));
  const collection = await loadCollection();

  let title = opts.positional.join(' ').trim();
  if (!title) title = await ask('Game title: ');
  if (!title) throw new Error('A title is required.');

  let chosen = null;
  if (!opts.noLookup) {
    // IGDB when it is configured, otherwise the keyless sources. Both produce
    // the same candidate shape, so the rest of this doesn't care which ran.
    let query = null;
    if (opts.source !== 'free') {
      try {
        const creds = await loadEnv();
        query = createClient({ id: creds.id, token: await getToken(creds) });
      } catch {
        query = null;
      }
    }

    console.log(`\nSearching ${query ? 'IGDB' : 'Wikipedia and libretro'} for "${title}"…`);
    if (!query && opts.source !== 'free') {
      console.log('  (no IGDB keys configured: using the keyless sources)');
    }

    let results;
    if (query) {
      const raw = await searchGames(query, title, { platform: opts.platform || null });
      results = raw.map(fromIgdb);
    } else {
      results = await searchFree(title, { platform: opts.platform || null });
    }

    if (!results.length) {
      console.log('  No results. Adding a bare entry you can fill in by hand.');
    } else {
      console.log('');
      results.forEach((g, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describeCandidate(g)}`));
      console.log('   0. none of these: add a bare entry\n');
      const pick = Number(await ask('  Which one? [1] ', '1'));
      if (Number.isInteger(pick) && pick >= 1 && pick <= results.length) {
        chosen = results[pick - 1];
      }
    }
  }

  const suggestedPlatforms = chosen?.platforms || [];
  const platform = opts.platform || (await choosePlatform(collection, suggestedPlatforms));

  const condition =
    opts.condition ||
    (await ask('  Condition [CIB / Loose / Boxed / New / blank]: ', ''));
  const notes = opts.notes || (await ask('  Notes (optional): ', ''));

  const finalTitle = chosen?.title || title;
  const taken = new Set([...collection.games, ...collection.hardware].map((x) => x.id));
  const id = uniqueId(makeId(platform, finalTitle), taken);

  // Keyless search can only resolve art once a platform is known, and the
  // platform is chosen after the search. Fill it in now that we have both.
  if (chosen && !chosen.cover && hasFreeArt(platform)) {
    chosen.cover = await coverFor(finalTitle, platform, { region: opts.region || 'USA' });
  }

  // The box scan is a second, differently shaped picture used on single-platform
  // shelves. Fetching it here means a new game arrives complete, rather than
  // looking wrong until someone remembers to run `npm run boxart`.
  const box = await findBoxart(finalTitle, platform, { region: opts.region || 'USA' });

  const entry = {
    id,
    title: finalTitle,
    platform,
    year: chosen?.year ?? null,
    cover: chosen?.cover ?? null,
    description: chosen?.description ?? null,
    genres: chosen?.genres || [],
    developer: chosen?.developer ?? null,
    publisher: chosen?.publisher ?? null,
    region: opts.region || null,
    release: null,
    condition: condition || null,
    copies: 1,
    metacritic: null,
    notes: notes || null,
    added: new Date().toISOString().slice(0, 10),
    boxart: box?.url ?? null,
    boxartRatio: box?.ratio ?? null,
    igdbId: chosen?.igdbId ?? null,
    wikidataId: chosen?.wikidataId ?? null,
  };

  const duplicate = collection.games.find(
    (g) => g.platform === platform && g.title.toLowerCase() === finalTitle.toLowerCase()
  );
  if (duplicate) {
    const bump = await ask(
      `\n  You already have "${finalTitle}" on ${platform}. Add as another copy? [y/N] `,
      'n'
    );
    if (bump.toLowerCase().startsWith('y')) {
      duplicate.copies = (duplicate.copies || 1) + 1;
      if (condition && duplicate.condition && !duplicate.condition.includes(condition)) {
        duplicate.condition = `${duplicate.condition}, ${condition}`;
      }
      await saveCollection(collection);
      console.log(`\n  Now showing ×${duplicate.copies}.`);
      return;
    }
  }

  // Store the art now, while we know the id. A game added today should not be
  // waiting on a backup somebody has to remember to run.
  const art = await vendorEntry(entry);

  collection.games.push(entry);
  collection.games.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  await saveCollection(collection);

  const p = platformInfo(platform);
  console.log(`\n  Added "${entry.title}" [${p.short}]${entry.year ? ` (${entry.year})` : ''}`);
  if (!entry.cover) console.log('  No cover art yet: run `npm run enrich` later, or paste a url into "cover".');
  if (entry.boxart) console.log(`  Box scan too, at ${entry.boxartRatio} for the ${p.short} shelf.`);
  if (art.stored) console.log(`  ${art.stored} image(s) stored in your repo.`);
  if (art.failed) {
    console.log(`  ${art.failed} image(s) could not be downloaded and stayed linked. `
      + 'Run `npm run vendor` to try again.');
  }
  console.log('\n  Commit and push to publish:');
  console.log(`    git add data assets && git commit -m "Add ${entry.title}" && git push`);
}

main()
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
