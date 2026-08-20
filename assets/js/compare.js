// The compare view.
//
// Every GameLog publishes the same collection.json at the same path, and GitHub
// Pages serves it with `access-control-allow-origin: *`. That means one shelf
// can read another directly from the browser -- no server, no accounts, no API
// between them. This view is the payoff for that.
//
// Everything fetched here is somebody else's file, so it is treated as hostile
// input: strings only ever reach the page through textContent, cover urls go
// through safeImageUrl, and the entry count is capped.

import { platformInfo } from './platforms.mjs';
import { h, coverImage, titleKey, plural } from './lib.js';

const MAX_ENTRIES = 20000;

// A compared collection is someone else's file, so its size is theirs to
// choose. Reading it whole before the entry cap can apply means a hostile or
// broken host could hang the tab with a multi-gigabyte body; this ceiling is
// where we stop reading instead. Comfortably above any real collection: even
// 20,000 richly-filled entries land well under this.
const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Read a response body as text, refusing to buffer more than MAX_BYTES.
 *
 * A `Content-Length` is trusted as an early out when present, but not relied
 * on -- it can lie or be absent, so the running total is what actually stops
 * the read. Streams the body and abandons it the moment the cap is crossed.
 */
async function readCapped(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error('TOO_BIG');
  }

  // No readable stream (very old browsers): fall back to text(), which at least
  // still gets checked below before it is parsed.
  if (!response.body?.getReader) {
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error('TOO_BIG');
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error('TOO_BIG');
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Work out where a collection.json lives from whatever the user pasted.
 * Accepts a site root, a direct json url, a github repo url, or "user/repo".
 */
export function resolveCollectionUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Paste a GameLog address first.');

  // "user/repo" shorthand -> that user's project page.
  //
  // The username may not contain a dot, or a bare host and path like
  // "someone.github.io/GameLog" matches this and gets rebuilt as
  // "someone.github.io.github.io/GameLog". Repository names can contain dots,
  // so only the first segment is restricted.
  if (/^[\w-]+\/[\w.-]+$/.test(raw)) {
    const [user, repo] = raw.split('/');
    return `https://${user}.github.io/${repo}/data/collection.json`;
  }

  // Reject a foreign scheme before assuming https, or "ftp://host" would be
  // silently rewritten into "https://ftp//host" and fetched anyway.
  // (?!\d) keeps "localhost:4321" a host-and-port rather than a "localhost:" scheme.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):(?!\d)/i);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new Error(`Only http and https addresses can be loaded, not "${scheme[1]}:".`);
  }

  let url;
  try {
    // Bare "localhost:4321" means a local preview, which is never https.
    const assumed = /^localhost([:/]|$)/i.test(raw) ? 'http' : 'https';
    url = new URL(scheme ? raw : `${assumed}://${raw}`);
  } catch {
    throw new Error(`"${raw}" doesn't look like a web address.`);
  }

  // A hostname needs a dot to be real. localhost is the one exception, so that
  // `npm run serve` can be compared against while you are setting things up.
  const host = url.hostname;
  if (host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    throw new Error(`"${raw}" doesn't look like a web address.`);
  }

  // A github.com repo url points at the source, not the published site.
  if (url.hostname === 'github.com') {
    const [user, repo] = url.pathname.split('/').filter(Boolean);
    if (user && repo) return `https://${user}.github.io/${repo}/data/collection.json`;
  }

  if (url.pathname.endsWith('.json')) return url.href;

  url.pathname = url.pathname.replace(/\/+$/, '') + '/data/collection.json';
  url.hash = '';
  return url.href;
}

/** Fetch and sanity-check somebody else's collection. */
export async function loadCollection(input) {
  const url = resolveCollectionUrl(input);

  let response;
  try {
    response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  } catch {
    // A CORS rejection and an offline network are indistinguishable here.
    throw new Error(
      `Couldn't reach ${url}. Either the address is wrong, or that host ` +
      `doesn't allow other sites to read it. GitHub Pages does.`
    );
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `No collection found at ${url}. Check the address points at a GameLog site.`
        : `That address answered with HTTP ${response.status}.`
    );
  }

  let text;
  try {
    text = await readCapped(response);
  } catch (err) {
    if (err.message === 'TOO_BIG') {
      throw new Error(
        `${url} is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB, `
        + `which is far past any real collection. Refusing to load it.`
      );
    }
    throw new Error(`Couldn't finish reading ${url}.`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url} isn't valid JSON, so it probably isn't a GameLog.`);
  }

  if (!data || !Array.isArray(data.games)) {
    throw new Error(`${url} loaded, but has no "games" list: probably not a GameLog.`);
  }

  const games = data.games.slice(0, MAX_ENTRIES).filter((g) => g && typeof g.title === 'string');
  if (!games.length) throw new Error('That collection is empty.');

  return { url, games };
}

/** Where a shelf's feed.json lives, derived from the same address a collection is. */
export function resolveFeedUrl(input) {
  return resolveCollectionUrl(input).replace(/\/collection\.json(\?.*)?$/, '/feed.json$1');
}

/**
 * Fetch a shelf's log posts, treating them as the same hostile input a compared
 * collection is: capped size, `posts` shape checked, entry count limited.
 *
 * A missing feed.json is normal, not an error -- a shelf can have milestones
 * (beaten games) and no written posts at all -- so a 404 returns an empty list
 * rather than throwing, and the caller still gets that shelf's milestones from
 * its collection.
 */
export async function loadFeed(input) {
  const url = resolveFeedUrl(input);

  let response;
  try {
    response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  } catch {
    throw new Error(`Couldn't reach ${url}.`);
  }
  if (response.status === 404) return { url, posts: [] };
  if (!response.ok) throw new Error(`${url} answered with HTTP ${response.status}.`);

  let text;
  try {
    text = await readCapped(response);
  } catch (err) {
    throw new Error(err.message === 'TOO_BIG' ? `${url} is too large to load.` : `Couldn't read ${url}.`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url} isn't valid JSON.`);
  }

  const posts = Array.isArray(data?.posts)
    ? data.posts.slice(0, MAX_ENTRIES).filter((p) => p && typeof p.title === 'string')
    : [];
  return { url, posts };
}

/**
 * Fetch a shelf's config, for the one thing that makes the follow graph
 * walkable: who *they* follow. Everything here is someone else's file, so the
 * friends list is treated as hostile -- capped, and each entry sanity-checked
 * where it is used.
 */
export async function loadConfig(input) {
  const url = resolveCollectionUrl(input).replace(/\/collection\.json(\?.*)?$/, '/config.json$1');

  let response;
  try {
    response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  } catch {
    throw new Error(`Couldn't reach ${url}.`);
  }
  if (response.status === 404) return { url, friends: [] };
  if (!response.ok) throw new Error(`${url} answered with HTTP ${response.status}.`);

  let text;
  try {
    text = await readCapped(response);
  } catch {
    throw new Error(`Couldn't read ${url}.`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url} isn't valid JSON.`);
  }

  const friends = Array.isArray(data?.friends)
    ? data.friends.filter((f) => f && typeof f.url === 'string').slice(0, 500)
    : [];
  return { url, friends };
}

/**
 * The canonical site root of any shelf address, or null when it isn't a
 * loadable http(s) one. Runs the address through the same validation a
 * comparison does, so a `javascript:` "url" in a foreign friends list resolves
 * to null and is dropped rather than trusted.
 */
export function shelfBase(input) {
  try {
    return resolveCollectionUrl(input).replace(/\/data\/collection\.json.*$/, '');
  } catch {
    return null;
  }
}

// A directory is someone else's file too, so its list of shelves is capped.
const MAX_DIR_SHELVES = 2000;

/**
 * Load a seed-list directory: a published, forkable index of GameLog shelves
 * that anyone can host. Nothing about it is fixed to a path -- you subscribe to
 * a directory by its full url -- so this validates the address itself rather
 * than deriving one, and treats the file as hostile: capped, shape-checked, and
 * with each listed url left for shelfBase to vet at use.
 */
export async function loadDirectory(input) {
  const raw = String(input ?? '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`"${raw}" isn't a web address.`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Only http and https directories can be loaded.');
  }

  let response;
  try {
    response = await fetch(url.href, { mode: 'cors', cache: 'no-cache' });
  } catch {
    throw new Error(`Couldn't reach ${url.href}.`);
  }
  if (!response.ok) throw new Error(`${url.href} answered with HTTP ${response.status}.`);

  let text;
  try {
    text = await readCapped(response);
  } catch {
    throw new Error(`Couldn't read ${url.href}.`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${url.href} isn't valid JSON.`);
  }

  if (!data || !Array.isArray(data.shelves)) {
    throw new Error(`${url.href} has no "shelves" list: probably not a GameLog directory.`);
  }
  const shelves = data.shelves
    .filter((s) => s && typeof s.url === 'string')
    .slice(0, MAX_DIR_SHELVES);
  return {
    url: url.href,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : url.hostname,
    shelves,
  };
}

/**
 * The shelves worth suggesting, from two sources with their provenance kept:
 * the friends of the shelves you follow, and the shelves listed in directories
 * you subscribe to. Together they let the follow graph be walked a step at a
 * time *and* seeded from a shared index, so someone following nobody yet still
 * has somewhere to start.
 *
 * `shelves` carries each followed shelf's own friends; `directories` carries
 * each subscribed directory's shelves; `exclude` is what to leave out -- your
 * own follows, and you. Ranked warmest first: friends-of-friends ahead of a
 * bare directory listing.
 */
export function discover({ shelves = [], directories = [], exclude = [] } = {}) {
  const skip = new Set(exclude.map(shelfBase).filter(Boolean));
  const found = new Map();

  const at = (name, rawUrl) => {
    const base = shelfBase(rawUrl);
    if (!base || skip.has(base)) return null;
    if (!found.has(base)) {
      found.set(base, {
        name: name?.trim() || base, url: base, followedBy: new Set(), listedIn: new Set(),
      });
    }
    return found.get(base);
  };

  for (const shelf of shelves) {
    for (const candidate of shelf.friends || []) {
      at(candidate.name, candidate.url)?.followedBy.add(shelf.friend.name);
    }
  }
  for (const directory of directories) {
    for (const listing of directory.shelves || []) {
      at(listing.name, listing.url)?.listedIn.add(directory.name);
    }
  }

  return [...found.values()]
    .map((c) => ({
      name: c.name, url: c.url, followedBy: [...c.followedBy], listedIn: [...c.listedIn],
    }))
    .sort((a, b) =>
      b.followedBy.length - a.followedBy.length
      || b.listedIn.length - a.listedIn.length
      || a.name.localeCompare(b.name, 'en'));
}

/** Group two collections into shared / theirs-only / yours-only. */
export function diff(mine, theirs) {
  const index = (games) => {
    const map = new Map();
    for (const game of games) {
      const key = titleKey(game.title);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(game);
    }
    return map;
  };

  const mineByTitle = index(mine);
  const theirsByTitle = index(theirs);

  const shared = [];
  const onlyMine = [];
  const onlyTheirs = [];

  for (const [key, games] of mineByTitle) {
    if (theirsByTitle.has(key)) shared.push({ mine: games, theirs: theirsByTitle.get(key) });
    else onlyMine.push(...games);
  }
  for (const [key, games] of theirsByTitle) {
    if (!mineByTitle.has(key)) onlyTheirs.push(...games);
  }

  const bySortTitle = (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  return {
    shared: shared.sort((a, b) => bySortTitle(a.mine[0], b.mine[0])),
    onlyMine: onlyMine.sort(bySortTitle),
    onlyTheirs: onlyTheirs.sort(bySortTitle),
  };
}

function miniTile(game, { onOpen = null, subtitle = null } = {}) {
  const info = platformInfo(game.platform);
  const img = coverImage(game);
  img.className = 'minitile__cover';

  const props = {
    class: game.cover ? 'minitile' : 'minitile minitile--noart',
    title: `${game.title}: ${game.platform || 'unknown platform'}`,
  };

  const children = [
    img,
    h('span', { class: 'minitile__badge', style: `--badge-color:${info.color}`, text: info.short }),
    h('span', { class: 'minitile__name', text: game.title }),
    subtitle ? h('span', { class: 'minitile__sub', text: subtitle }) : null,
  ];

  // Only our own games open the detail dialog; theirs are not in our index.
  if (onOpen) {
    return h('button', { ...props, type: 'button',
      'aria-label': `${game.title}, ${game.platform}`, onclick: () => onOpen(game) }, children);
  }
  return h('div', { ...props, role: 'listitem' }, children);
}

function section(title, blurb, tiles) {
  return h('section', { class: 'cmp__section' },
    h('h3', { class: 'cmp__heading' },
      h('span', { text: title }),
      h('span', { class: 'cmp__badge', text: String(tiles.length) })),
    h('p', { class: 'cmp__blurb', text: blurb }),
    tiles.length
      ? h('div', { class: 'shelf shelf--mini', role: 'list' }, tiles)
      : h('p', { class: 'cmp__none', text: 'Nothing here.' }));
}

export function renderComparison(result, theirLabel, { onOpen }) {
  const { shared, onlyMine, onlyTheirs } = result;
  const theirTotal = shared.length + onlyTheirs.length;
  const myTotal = shared.length + onlyMine.length;

  // Deliberately not a single "overlap %". Two shelves of wildly different
  // sizes make that number meaningless -- 6 shared out of 187 combined reads
  // as 3% and sounds like nothing, when it is actually two thirds of theirs.
  const summary = h('div', { class: 'cmp__summary' },
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(shared.length) }),
      h('span', { class: 'stat__label', text: 'in common' }),
      h('span', { class: 'stat__sub',
        text: `${shared.length} of their ${theirTotal} · ${shared.length} of your ${myTotal}` })),
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(onlyTheirs.length) }),
      h('span', { class: 'stat__label', text: 'only theirs' }),
      h('span', { class: 'stat__sub', text: 'you could be hunting these' })),
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(onlyMine.length) }),
      h('span', { class: 'stat__label', text: 'only yours' }),
      h('span', { class: 'stat__sub', text: 'nothing they have' })));

  return h('div', { class: 'cmp__results' },
    summary,
    section('They have, you don\'t', `Games on ${theirLabel} that are missing from your shelf.`,
      onlyTheirs.map((g) => miniTile(g))),
    section('You both have', 'Titles on both shelves, however you each own them.',
      shared.map(({ mine, theirs }) => miniTile(mine[0], {
        onOpen,
        subtitle: theirs[0].platform !== mine[0].platform
          ? `theirs: ${platformInfo(theirs[0].platform).short}` : null,
      }))),
    section('You have, they don\'t', 'Yours alone, out of this pairing.',
      onlyMine.map((g) => miniTile(g, { onOpen }))));
}
