// The write API behind the local manager UI.
//
// This exists ONLY while `npm run manage` is running. The published site is
// static files on someone else's host -- there is no server there to talk to,
// and the manager page says so plainly when these endpoints are absent.
//
// A local server that writes files deserves care, so:
//   * it binds to 127.0.0.1, never a routable interface
//   * writes require a custom header, which a foreign page cannot send without
//     a CORS preflight this server refuses -- that is the CSRF defence
//   * an Origin header, when present, must be this very server
//   * only three known filenames can be written, never a path from the request
//   * every payload is shape-checked before it replaces a real file
//   * writes go to a temp file and are renamed, so an interrupted save cannot
//     leave a half-written collection behind

import { writeFile, rename, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import {
  ROOT, COLLECTION_PATH, CONFIG_PATH, LISTS_PATH, FEED_PATH, SCHEMA_VERSION,
} from './collection.mjs';
import { loadEnv, getToken, createClient, searchGames, coverUrl, tidySummary, releaseYear, companies } from './igdb.mjs';
import { searchFree, coverFor } from './freelookup.mjs';
import { findBoxart } from './libretro.mjs';
import {
  PHOTO_DIR, COVER_DIR, BOXART_DIR, MAX_IMAGE_BYTES, writeImage, fetchImageAsDataUrl,
} from './images.mjs';
import { vendorArt, artSummary, usableId } from './vendor.mjs';
import { writeFeedXml } from './rss.mjs';
import { loadCollection as loadCollectionForVendor, saveCollection as saveCollectionFromVendor }
  from './collection.mjs';

/** The only files the manager may ever write. */
const WRITABLE = {
  collection: { path: COLLECTION_PATH, validate: validateCollection },
  lists: { path: LISTS_PATH, validate: validateLists },
  config: { path: CONFIG_PATH, validate: validateConfig },
  feed: { path: FEED_PATH, validate: validateFeed },
};

const MAX_BODY_BYTES = 12 * 1024 * 1024;

function validateCollection(data) {
  if (!data || typeof data !== 'object') throw new Error('Expected an object.');
  if (!Array.isArray(data.games)) throw new Error('Expected a "games" list.');
  if (data.hardware != null && !Array.isArray(data.hardware)) {
    throw new Error('"hardware" should be a list.');
  }
  for (const game of data.games) {
    if (!game || typeof game.title !== 'string' || !game.title.trim()) {
      throw new Error('Every game needs a title.');
    }
    if (typeof game.platform !== 'string' || !game.platform.trim()) {
      throw new Error(`"${game.title}" needs a platform.`);
    }
  }
  return { gamelog: SCHEMA_VERSION, games: data.games, hardware: data.hardware || [] };
}

function validateLists(data) {
  if (!data || !Array.isArray(data.lists)) throw new Error('Expected a "lists" list.');
  let wants = 0;
  for (const list of data.lists) {
    if (!list || typeof list.id !== 'string' || !list.id.trim()) {
      throw new Error('Every list needs an id.');
    }
    if (list.wants != null && typeof list.wants !== 'boolean') {
      throw new Error(`List "${list.id}" wants must be true or false.`);
    }
    if (list.wants === true) wants += 1;
    if (!Array.isArray(list.items)) throw new Error(`List "${list.id}" needs an items list.`);
    for (const item of list.items) {
      if (!item || (!item.ref && !item.title)) {
        throw new Error(`An entry on "${list.id}" has neither a ref nor a title.`);
      }
    }
  }
  // One canonical wishlist, so anything reading it later never has to guess.
  if (wants > 1) throw new Error('Only one list can be the wishlist.');
  return { lists: data.lists };
}

function validateFeed(data) {
  if (!data || !Array.isArray(data.posts)) throw new Error('Expected a "posts" list.');
  // Rebuild each post in a fixed key order, dropping empty optionals, so the
  // file stays tidy whichever client wrote it -- no stray "body": "" or
  // "ref": null left behind in the diff.
  const posts = data.posts.map((post) => {
    if (!post || typeof post.title !== 'string' || !post.title.trim()) {
      throw new Error('Every post needs a title.');
    }
    if (typeof post.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(post.date)) {
      throw new Error(`"${post.title}" needs a date like 2026-08-19.`);
    }
    if (post.ref != null && typeof post.ref !== 'string') {
      throw new Error(`"${post.title}" has a ref that is not a game id.`);
    }
    const clean = {};
    if (typeof post.id === 'string' && post.id.trim()) clean.id = post.id.trim();
    clean.date = post.date.slice(0, 10);
    clean.title = post.title;
    if (typeof post.body === 'string' && post.body.trim()) clean.body = post.body;
    if (typeof post.ref === 'string' && post.ref.trim()) clean.ref = post.ref.trim();
    return clean;
  });
  return { gamelog: SCHEMA_VERSION, posts };
}

function validateConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Expected an object.');
  }
  if (data.friends != null && !Array.isArray(data.friends)) {
    throw new Error('"friends" should be a list.');
  }
  if (data.directories != null && !Array.isArray(data.directories)) {
    throw new Error('"directories" should be a list of addresses.');
  }
  return data;
}

/* --- Publishing ----------------------------------------------------------- */

/**
 * The paths the manager writes, and therefore the only ones it offers to
 * publish. Anything else you have changed stays yours to handle in git, and is
 * reported rather than silently swept into a commit.
 */
const PUBLISHABLE = ['data', 'assets/profile', 'index.html', 'feed.xml'];

/** Run git without a shell, so nothing here can be interpolated into one. */
function git(args, { cwd = ROOT } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
      });
    });
  });
}

/** What would be published, and whether publishing is even possible. */
async function gitStatus() {
  const inside = await git(['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return { isRepo: false };

  const [branch, remote, porcelain] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['remote', 'get-url', 'origin']),
    git(['status', '--porcelain']),
  ]);

  const changes = porcelain.stdout.split('\n').filter(Boolean).map((line) => ({
    state: line.slice(0, 2).trim(),
    path: line.slice(3).replace(/^"|"$/g, ''),
  }));

  const isOurs = (p) => PUBLISHABLE.some((base) => p === base || p.startsWith(`${base}/`));

  // How far ahead of the remote we are, so "nothing to publish" can tell the
  // difference between "no changes" and "committed but never pushed".
  let unpushed = 0;
  if (remote.ok) {
    const counted = await git(['rev-list', '--count', `origin/${branch.stdout}..HEAD`]);
    unpushed = counted.ok ? Number(counted.stdout) || 0 : 0;
  }

  return {
    isRepo: true,
    branch: branch.stdout || null,
    remote: remote.ok ? remote.stdout : null,
    unpushed,
    mine: changes.filter((c) => isOurs(c.path)),
    others: changes.filter((c) => !isOurs(c.path)),
  };
}

/** Stage the manager's files, commit, and push. */
async function gitPublish(message) {
  // Rebuild the feed from whatever is on disk first, so a hand-edited feed.json
  // or collection.json is reflected in feed.xml before it is staged.
  await writeFeedXml();

  const status = await gitStatus();
  if (!status.isRepo) throw new Error('This folder is not a git repository.');
  if (!status.remote) {
    throw new Error('No "origin" remote is set, so there is nowhere to publish to. '
      + 'Create the repo on GitHub and add it with `git remote add origin <url>`.');
  }

  const summary = [];

  if (status.mine.length) {
    const add = await git(['add', '--', ...PUBLISHABLE]);
    if (!add.ok) throw new Error(`git add failed: ${add.stderr}`);

    const subject = String(message || '').trim() || 'Update collection';
    const commit = await git(['commit', '-m', subject]);
    // "nothing to commit" is a normal outcome, not a failure.
    if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    if (commit.ok) summary.push(`Committed ${status.mine.length} file(s).`);
  }

  const push = await git(['push']);
  if (!push.ok) {
    throw new Error(
      `Committed locally, but the push failed:\n${push.stderr || push.stdout}\n\n`
      + 'This is usually credentials. Run `git push` in a terminal once to sort it out.'
    );
  }

  summary.push('Pushed to ' + status.remote.replace(/^https:\/\/[^@]*@/, 'https://'));
  return { summary: summary.join(' '), after: await gitStatus() };
}

const INDEX_PATH = join(ROOT, 'index.html');
const META_START = '<!-- gamelog:meta';
const META_END = '<!-- /gamelog:meta -->';

const escapeAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip the small markdown the bio allows, for a plain-text description. */
function plainText(value, limit = 200) {
  const text = String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * Rewrite the meta block in index.html from the config.
 *
 * Link previews are built by crawlers that don't run JavaScript, so a card for
 * a shared GameLog cannot be assembled at runtime the way the rest of the page
 * is -- these tags have to exist in the html on disk. Only the region between
 * the two markers is touched; without them the file is left alone entirely.
 */
async function syncMeta(config) {
  let html;
  try {
    html = await readFile(INDEX_PATH, 'utf8');
  } catch {
    return; // No index.html to update; not this function's problem.
  }

  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END);
  if (start === -1 || end === -1 || end < start) return;

  const profile = config.profile || {};
  const siteTitle = config.title || 'GameLog';
  // "Annabelle's GameLog" rather than a separator character, unless the title
  // already names them, in which case repeating it would read oddly.
  const title = profile.name && !siteTitle.toLowerCase().includes(profile.name.toLowerCase())
    ? `${profile.name}'s ${siteTitle}`
    : siteTitle;
  const description = plainText(profile.about)
    || plainText(config.tagline)
    || 'A video game collection.';

  const lines = [
    `${META_START}: rewritten from data/config.json when you save in the manager.`,
    "     Crawlers don't run JavaScript, so a shared link's preview card has to live",
    '     in the html itself. Edit config.json rather than these lines. -->',
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
  ];

  // A relative path can't be resolved by a crawler, so an absolute siteUrl is
  // what makes the image usable. Without one, the card falls back to text.
  const photo = profile.photo;
  const base = typeof config.siteUrl === 'string' ? config.siteUrl.trim().replace(/\/+$/, '') : '';
  if (photo && /^https?:\/\//i.test(photo)) {
    lines.push(`<meta property="og:image" content="${escapeAttr(photo)}">`);
    lines.push('<meta name="twitter:card" content="summary">');
  } else if (photo && base) {
    lines.push(`<meta property="og:image" content="${escapeAttr(`${base}/${photo.replace(/^\/+/, '')}`)}">`);
    lines.push('<meta name="twitter:card" content="summary">');
  } else {
    lines.push('<meta name="twitter:card" content="summary">');
  }
  if (base) lines.push(`<meta property="og:url" content="${escapeAttr(base)}/">`);

  lines.push(META_END);

  const updated = html.slice(0, start) + lines.join('\n') + html.slice(end + META_END.length);
  await writeAtomic(INDEX_PATH, updated);
}

/** Write via a temp file so an interrupted save can't truncate the real one. */
async function writeAtomic(path, contents) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('That payload is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * A foreign page can send a simple cross-origin POST, but it cannot set a
 * custom header without a preflight -- and this server answers no preflight.
 * Requiring the header is therefore what stops a random site in another tab
 * from rewriting your collection.
 */
function guard(req, port) {
  if (req.headers['x-gamelog-manage'] !== '1') {
    return 'This endpoint needs the manager UI.';
  }
  const origin = req.headers.origin;
  if (origin) {
    const allowed = [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ];
    if (!allowed.includes(origin)) return `Requests from ${origin} are not accepted.`;
  }
  return null;
}

let igdbQuery;
let igdbTried = false;

async function getIgdb() {
  if (igdbTried) return igdbQuery;
  igdbTried = true;
  try {
    const creds = await loadEnv();
    igdbQuery = createClient({ id: creds.id, token: await getToken(creds) });
  } catch {
    igdbQuery = null; // No keys configured; search simply isn't offered.
  }
  return igdbQuery;
}

/**
 * Handle a manager request. Returns true when it took the request, false to
 * let the static handler have it.
 */
export async function handleApi(req, res, { port }) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  const route = url.pathname.slice(5);

  // Never let a browser cache an API answer, and never allow a cross-origin
  // read of one.
  if (req.method === 'OPTIONS') {
    send(res, 405, { error: 'Preflight is not supported.' });
    return true;
  }

  const denied = guard(req, port);
  if (denied) { send(res, 403, { error: denied }); return true; }

  try {
    if (route === 'state' && req.method === 'GET') {
      const [collection, lists, config, feed] = await Promise.all([
        readJsonFile(COLLECTION_PATH, { games: [], hardware: [] }),
        readJsonFile(LISTS_PATH, { lists: [] }),
        readJsonFile(CONFIG_PATH, {}),
        readJsonFile(FEED_PATH, { posts: [] }),
      ]);
      send(res, 200, {
        collection, lists, config, feed,
        igdb: Boolean(await getIgdb()),
        root: ROOT,
      });
      return true;
    }

    if (route === 'search' && req.method === 'GET') {
      const term = (url.searchParams.get('q') || '').trim();
      if (!term) { send(res, 200, { results: [] }); return true; }
      const platform = url.searchParams.get('platform') || null;

      // No IGDB configured is not a dead end -- the keyless sources answer the
      // same question, just without genres and companies.
      const query = await getIgdb();
      if (!query) {
        const free = await searchFree(term, { platform, limit: 8 });
        send(res, 200, { results: free, source: 'free' });
        return true;
      }

      const found = await searchGames(query, term, { platform, limit: 10 });
      send(res, 200, {
        source: 'igdb',
        results: found.map((g) => {
          const { developer, publisher } = companies(g);
          return {
            igdbId: g.id,
            title: g.name,
            year: releaseYear(g.first_release_date),
            cover: g.cover?.image_id ? coverUrl(g.cover.image_id) : null,
            description: tidySummary(g.summary, g.storyline),
            genres: g.genres?.map((x) => x.name) || [],
            developer,
            publisher,
            platforms: (g.platforms || []).map((p) => p?.name).filter(Boolean),
            // Ids as well as names: the client maps them straight onto its own
            // platform registry, which is exact where name-matching is not.
            platformIds: (g.platforms || [])
              .map((p) => (typeof p === 'object' ? p.id : p)).filter(Boolean),
            derivative: Boolean(g.parent_game || g.version_parent),
          };
        }),
      });
      return true;
    }

    if (route === 'git' && req.method === 'GET') {
      send(res, 200, await gitStatus());
      return true;
    }

    if (route === 'publish' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      send(res, 200, await gitPublish(body?.message));
      return true;
    }

    if (route === 'cover' && req.method === 'GET') {
      // Keyless art is per-platform, and the platform is often chosen after
      // the search. This lets the UI fill the gap once it knows both.
      const title = (url.searchParams.get('title') || '').trim();
      const platform = (url.searchParams.get('platform') || '').trim();
      if (!title || !platform) { send(res, 200, { cover: null, boxart: null }); return true; }
      const region = url.searchParams.get('region') || 'USA';
      // Both pictures at once: the cover for the mixed grid, the box scan and
      // its shape for the single-platform shelf.
      const [cover, box] = await Promise.all([
        coverFor(title, platform, { region }),
        findBoxart(title, platform, { region }),
      ]);
      send(res, 200, { cover, boxart: box?.url ?? null, boxartRatio: box?.ratio ?? null });
      return true;
    }

    if (route === 'photo' && req.method === 'PUT') {
      const { dataUrl } = await readJsonBody(req);
      const { ext, bytes } = await writeImage(dataUrl, PHOTO_DIR, 'avatar', MAX_IMAGE_BYTES);
      send(res, 200, { ok: true, path: `assets/profile/avatar.${ext}`, bytes });
      return true;
    }

    if (route === 'cover' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      // The id becomes a filename, so it may only ever be an id.
      if (!usableId(id)) {
        throw new Error('That game has no usable id yet. Save it first.');
      }
      // Covers and box scans are two pictures of the same game, so they are
      // told apart by which directory they land in rather than by name.
      const box = body.field === 'boxart';
      const dir = box ? BOXART_DIR : COVER_DIR;
      const prefix = box ? 'assets/boxart' : 'assets/covers';
      const dataUrl = body.url ? await fetchImageAsDataUrl(body.url) : body.dataUrl;
      const { ext, bytes } = await writeImage(dataUrl, dir, id, MAX_IMAGE_BYTES);
      send(res, 200, { ok: true, path: `${prefix}/${id}.${ext}`, bytes });
      return true;
    }

    if (route === 'vendor' && req.method === 'GET') {
      send(res, 200, artSummary(await loadCollectionForVendor()));
      return true;
    }

    if (route === 'vendor' && req.method === 'POST') {
      // Downloading a whole collection's art is slow, so this answers once with
      // the outcome rather than streaming progress. The UI says what it is
      // doing and the counts come back at the end.
      const collection = await loadCollectionForVendor();
      const result = await vendorArt(collection);
      if (result.done.length) await saveCollectionFromVendor(collection);
      send(res, 200, {
        ok: true,
        stored: result.done.length,
        bytes: result.bytes,
        failed: result.failed.map((f) => ({ name: f.name, label: f.spec.label, error: f.error })),
        remaining: artSummary(collection).remote,
      });
      return true;
    }

    if (req.method === 'PUT' && WRITABLE[route]) {
      const { path, validate } = WRITABLE[route];
      const payload = await readJsonBody(req);
      const clean = validate(payload);
      await writeAtomic(path, JSON.stringify(clean, null, 2) + '\n');
      // The link-preview tags live in index.html and are derived from config,
      // so they are refreshed here rather than drifting until someone notices.
      if (route === 'config') await syncMeta(clean);
      // feed.xml is derived from the feed, the collection (for milestones) and
      // the config (title, siteUrl), so any of the three going out means it is
      // regenerated rather than left stale.
      if (['feed', 'collection', 'config'].includes(route)) await writeFeedXml();
      send(res, 200, { ok: true, file: path.replace(ROOT + '/', '') });
      return true;
    }

    send(res, 404, { error: `No such endpoint: ${req.method} ${url.pathname}` });
  } catch (err) {
    send(res, 400, { error: err.message || String(err) });
  }
  return true;
}
