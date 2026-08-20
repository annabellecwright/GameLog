// Copy every linked image into the repo.
//
//   npm run vendor
//   npm run vendor -- --dry-run
//
// Cover art and box scans arrive as links to whoever's database found them.
// This downloads all of it into assets/ and repoints the collection at the
// copies, so your published site owns its own pictures.

import { loadCollection, saveCollection } from './lib/collection.mjs';
import { vendorArt, artSummary, artOnDisk } from './lib/vendor.mjs';

const dryRun = process.argv.includes('--dry-run');
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const collection = await loadCollection();
const before = artSummary(collection);

if (!before.remote) {
  const disk = await artOnDisk(collection);
  console.log(`All ${before.total} images are already in the repo (${mb(disk.bytes)}).`);
  if (disk.missing.length) {
    console.log(`\nBut ${disk.missing.length} of them are missing from disk:`);
    for (const path of disk.missing.slice(0, 10)) console.log(`  ${path}`);
    console.log('\nThe collection points at files that are not there. Restore them from');
    console.log('git, or clear those fields and run `npm run enrich` to find art again.');
  }
  process.exit(0);
}

console.log(`${before.remote} of ${before.total} images are linked, not stored.`);
console.log(dryRun ? 'Dry run: nothing will be written.\n' : 'Downloading…\n');

let n = 0;
const result = await vendorArt(collection, {
  dryRun,
  onItem: (item) => {
    n += 1;
    const mark = item.ok ? ' ' : '!';
    const count = `${String(n).padStart(String(before.remote).length)}/${before.remote}`;
    console.log(`  ${mark} ${count}  ${item.name} ${item.spec.label}`
      + (item.ok ? '' : `  (${item.error})`));
  },
});

if (!dryRun && result.done.length) await saveCollection(collection);

console.log('');
if (dryRun) {
  console.log(`Would download ${plural(result.done.length, 'image')}.`);
} else {
  const disk = await artOnDisk(collection);
  console.log(`Stored ${plural(result.done.length, 'image')}, ${mb(result.bytes)} added.`);
  console.log(`Your collection's art is now ${disk.files} files, ${mb(disk.bytes)} in the repo.`);
  // Worth knowing before it is a surprise: GitHub Pages caps a published site
  // at 1 GB, and every visitor's browser has to download what it shows.
  if (disk.bytes > 250 * 1024 * 1024) {
    console.log('\nThat is getting large for a repo people clone. GitHub Pages caps a');
    console.log('published site at 1 GB.');
  }
}

if (result.failed.length) {
  console.log(`\n${plural(result.failed.length, 'image')} could not be downloaded, and kept the link:`);
  for (const f of result.failed.slice(0, 15)) console.log(`  ${f.name} ${f.spec.label}: ${f.error}`);
  if (result.failed.length > 15) console.log(`  ...and ${result.failed.length - 15} more`);
  console.log('\nRe-run to try those again.');
}

if (!dryRun && result.done.length) {
  console.log('\nCommit and push to publish:');
  console.log('  git add data assets && git commit -m "Store the collection\'s art" && git push');
}
