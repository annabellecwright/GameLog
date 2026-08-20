// Clear out the previous owner's collection so a fork becomes yours.
//
//   npm run start-fresh
//   npm run start-fresh -- --yes    (skip the confirmation)
//
// A fork arrives with whoever's collection you forked from -- their games,
// their name, their bio, their footer. This empties all of that in one go,
// which beats hand-editing three JSON files and a meta block.
//
// It does not touch .env, git history, or anything you have added yourself.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, COLLECTION_PATH, CONFIG_PATH, LISTS_PATH, FEED_PATH, SCHEMA_VERSION } from './lib/collection.mjs';

const FRESH_CONFIG = {
  title: 'GameLog',
  tagline: 'A shelf of everything I\'ve collected.',
  siteUrl: '',
  accent: '#f0a04b',
  defaultSort: 'title',
  showHardware: true,
  profile: { name: null, photo: null, about: null, links: [] },
  friends: [],
  footer: 'Built with [GameLog](https://github.com/AnnabelleChimpton/GameLog). '
    + 'Cover art and descriptions from [IGDB](https://www.igdb.com), '
    + '[libretro](https://thumbnails.libretro.com) and [Wikipedia](https://en.wikipedia.org).',
};

const META_START = '<!-- gamelog:meta';
const META_END = '<!-- /gamelog:meta -->';

const FRESH_META = [
  `${META_START}: rewritten from data/config.json when you save in the manager.`,
  "     Crawlers don't run JavaScript, so a shared link's preview card has to live",
  '     in the html itself. Edit config.json rather than these lines. -->',
  '<title>GameLog</title>',
  '<meta name="description" content="A video game collection.">',
  '<meta property="og:type" content="profile">',
  '<meta property="og:title" content="GameLog">',
  '<meta property="og:description" content="A video game collection.">',
  '<meta name="twitter:card" content="summary">',
  META_END,
].join('\n');

async function resetMeta() {
  const indexPath = join(ROOT, 'index.html');
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    return false;
  }
  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END);
  if (start === -1 || end === -1 || end < start) return false;

  await writeFile(indexPath,
    html.slice(0, start) + FRESH_META + html.slice(end + META_END.length), 'utf8');
  return true;
}

async function main() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');

  // Say exactly what is about to be destroyed, using the real counts.
  let games = 0;
  let hardware = 0;
  let lists = 0;
  let posts = 0;
  let owner = null;
  try {
    const c = JSON.parse(await readFile(COLLECTION_PATH, 'utf8'));
    games = c.games?.length || 0;
    hardware = c.hardware?.length || 0;
  } catch { /* nothing to count */ }
  try {
    lists = JSON.parse(await readFile(LISTS_PATH, 'utf8')).lists?.length || 0;
  } catch { /* nothing to count */ }
  try {
    posts = JSON.parse(await readFile(FEED_PATH, 'utf8')).posts?.length || 0;
  } catch { /* nothing to count */ }
  try {
    owner = JSON.parse(await readFile(CONFIG_PATH, 'utf8')).profile?.name || null;
  } catch { /* nothing to count */ }

  console.log('\nThis will empty:');
  console.log(`  data/collection.json   ${games} games, ${hardware} hardware items`);
  console.log(`  data/lists.json        ${lists} list(s)`);
  console.log(`  data/feed.json         ${posts} log post(s)`);
  console.log(`  data/config.json       title, tagline, links${owner ? `, and ${owner}'s profile` : ''}`);
  console.log('  assets/profile/        any profile photo');
  console.log('  index.html             the link-preview tags');
  console.log('\nIt leaves .env, your git history, and everything else alone.');

  if (!yes) {
    if (!stdin.isTTY) {
      console.log('\nNot a terminal, so nothing was changed. Re-run with --yes to confirm.');
      return;
    }
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question('\nType "fresh" to go ahead: ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'fresh') {
      console.log('Nothing changed.');
      return;
    }
  }

  await writeFile(COLLECTION_PATH,
    JSON.stringify({ gamelog: SCHEMA_VERSION, games: [], hardware: [] }, null, 2) + '\n', 'utf8');
  await writeFile(LISTS_PATH, JSON.stringify({ lists: [] }, null, 2) + '\n', 'utf8');
  await writeFile(FEED_PATH, JSON.stringify({ gamelog: SCHEMA_VERSION, posts: [] }, null, 2) + '\n', 'utf8');
  // The generated RSS feed belonged to the previous owner; an empty log has no
  // feed, so it is removed rather than emptied.
  await rm(join(ROOT, 'feed.xml'), { force: true });
  await writeFile(CONFIG_PATH, JSON.stringify(FRESH_CONFIG, null, 2) + '\n', 'utf8');
  if (existsSync(join(ROOT, 'assets', 'profile'))) {
    await rm(join(ROOT, 'assets', 'profile'), { recursive: true, force: true });
  }
  await resetMeta();

  console.log('\n  Done. The collection is yours now.\n');
  console.log('  Next:');
  console.log('    npm run manage      add games, write your profile, set the title');
  console.log('    npm run enrich      fill in cover art and descriptions');
  console.log('    git add -A && git commit -m "Start my collection" && git push\n');
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});
