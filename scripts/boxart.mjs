// Fetch true-shape box scans for platforms libretro covers.
//
//   npm run boxart              only games that are missing one
//   npm run boxart -- --force   refetch everything
//   npm run boxart -- --platform "Nintendo 64"
//
// These are stored separately from `cover` rather than replacing it. The two
// serve different jobs: `cover` is IGDB key art, normalised to 3:4, which is
// what the mixed All view wants because a grid of one shape reads cleanly.
// `boxart` is a scan of the actual box at its real proportions, which is what a
// single-platform shelf wants because then every box shares a shape and the
// shelf looks like a shelf.
//
// The ratio is stored too. Without it every tile would resize as its image
// arrives, and a shelf of a few hundred would reflow the whole way down.

import { loadCollection, saveCollection, loadPlatformOverrides } from './lib/collection.mjs';
import { vendorEntry } from './lib/vendor.mjs';
import { findBoxart, coverage } from './lib/libretro.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIndex = args.indexOf('--platform');
const onlyPlatform = onlyIndex !== -1 ? args[onlyIndex + 1] : null;

async function main() {
  await loadPlatformOverrides();
  const collection = await loadCollection();
  const platforms = [...new Set(collection.games.map((g) => g.platform))];
  const { covered, missing } = await coverage(platforms);

  console.log(`Box scans available for: ${covered.join(', ') || 'nothing'}`);
  if (missing.length) console.log(`No source for: ${missing.join(', ')}\n`);

  const targets = collection.games.filter((g) => {
    if (onlyPlatform && g.platform !== onlyPlatform) return false;
    if (!covered.includes(g.platform)) return false;
    return force || !g.boxart;
  });

  if (!targets.length) {
    console.log('Nothing to fetch. Use --force to refetch.');
    return;
  }

  console.log(`Looking up ${targets.length} box scan(s)…\n`);
  let found = 0;
  let done = 0;

  for (const game of targets) {
    done += 1;
    const box = await findBoxart(game.title, game.platform, { region: game.region || 'USA' });

    if (box) {
      game.boxart = box.url;
      game.boxartRatio = box.ratio;
      // Straight into the repo, so this never leaves a shelf full of hotlinks.
      await vendorEntry(game);
      found += 1;
      console.log(`  ✓ [${String(done).padStart(3)}/${targets.length}] ${game.title} (${box.ratio})`);
    } else {
      console.log(`  ·  ${game.title}: no scan`);
    }

    if (done % 20 === 0) await saveCollection(collection);
    await new Promise((r) => setTimeout(r, 120));
  }

  await saveCollection(collection);

  // Report the shape of each shelf, because a platform whose scans disagree is
  // one where this will look worse than the plain grid.
  console.log(`\nStored ${found} of ${targets.length}\n`);
  for (const platform of covered) {
    const on = collection.games.filter((g) => g.platform === platform);
    const withArt = on.filter((g) => g.boxartRatio);
    if (!withArt.length) continue;
    const rs = withArt.map((g) => g.boxartRatio).sort((a, b) => a - b);
    const median = rs[Math.floor(rs.length / 2)];
    const odd = withArt.filter((g) => Math.abs(g.boxartRatio - median) > 0.12).length;
    console.log(`  ${platform.padEnd(22)} ${withArt.length}/${on.length} scanned, `
      + `median ${median.toFixed(2)}${odd ? `, ${odd} off-shape` : ''}`);
  }
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});
