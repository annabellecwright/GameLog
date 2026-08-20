// Write a post to the log.
//
//   npm run post "Found a boxed Halo"
//   npm run post -- "Beat it at last" --ref microsoft-xbox-halo-2
//   npm run post -- "Shelf reorg" --body "Everything back in order." --date 2026-08-19
//   npm run post -- show          print the log
//   npm run post -- rm <id>       remove a post
//
// The log is a feed of your collection: posts you write, woven together on the
// site with every game you mark beaten or dropped. A post can point at a game
// you own with --ref, which gives it that game's cover on the site.
//
// Games marked beaten or dropped already show up in the log on their own, so
// this is only for the notes you want to add in words.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadCollection, loadFeed, saveFeed, makePostId } from './lib/collection.mjs';
import { writeFeedXml } from './lib/rss.mjs';

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback = '') => {
  if (!stdin.isTTY) return fallback;
  return (await rl.question(q)).trim() || fallback;
};

/** Pull `--flag value` pairs out of argv, leaving the positionals behind. */
function parse(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { flags[a.slice(2)] = argv[++i] ?? true; }
    else rest.push(a);
  }
  return { flags, rest };
}

const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Today in the owner's own timezone, not UTC -- see manage.js for why. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function printLog(feed) {
  if (!feed.posts.length) { console.log('The log has no written posts yet.'); return; }
  for (const p of feed.posts) {
    console.log(`\n  ${p.date}  ${p.title}${p.ref ? `  → ${p.ref}` : ''}`);
    if (p.body) console.log(`  ${p.body.replace(/\n+/g, ' ').slice(0, 100)}`);
    console.log(`  id: ${p.id}`);
  }
  console.log('');
}

async function main() {
  const { flags, rest } = parse(process.argv.slice(2));
  const [command, ...words] = rest;
  const feed = await loadFeed();

  if (command === 'show') { printLog(feed); return; }

  if (command === 'rm') {
    const id = words[0];
    const before = feed.posts.length;
    feed.posts = feed.posts.filter((p) => p.id !== id);
    if (feed.posts.length === before) { console.error(`No post with id "${id}".`); process.exitCode = 1; return; }
    await saveFeed(feed);
    await writeFeedXml();
    console.log(`Removed "${id}".`);
    return;
  }

  // Otherwise: write a post. The title is the first positional, or asked for.
  const title = (command ? [command, ...words].join(' ') : await ask('Title: ')).trim();
  if (!title) {
    console.error('A post needs a title.\n  npm run post "Found a boxed Halo"');
    process.exitCode = 1;
    return;
  }

  const date = flags.date || await ask(`Date [${todayIso()}]: `, todayIso());
  if (!isoDate(date)) {
    console.error(`Date "${date}" is not YYYY-MM-DD.`);
    process.exitCode = 1;
    return;
  }

  const body = flags.body != null && flags.body !== true ? String(flags.body) : await ask('Body (optional): ');

  let ref = flags.ref != null && flags.ref !== true ? String(flags.ref) : null;
  if (ref) {
    const { games } = await loadCollection();
    if (!games.some((g) => g.id === ref)) {
      console.error(`No game with id "${ref}" in your collection. `
        + 'A post can only link to a game you own; leave --ref off otherwise.');
      process.exitCode = 1;
      return;
    }
  }

  const taken = new Set(feed.posts.map((p) => p.id).filter(Boolean));
  const post = { id: makePostId(date, title, taken), date, title };
  if (body) post.body = body;
  if (ref) post.ref = ref;

  // Newest first, matching how the log reads and how the file sorts.
  feed.posts.unshift(post);
  await saveFeed(feed);
  const xml = await writeFeedXml();
  console.log(`Added "${title}" to the log (id: ${post.id}).`);
  const files = xml ? 'data/feed.json feed.xml' : 'data/feed.json';
  console.log(`Publish it: git add ${files} && git commit -m "Log post" && git push`);
}

main().finally(() => rl.close());
