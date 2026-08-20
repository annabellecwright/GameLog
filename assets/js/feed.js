// The log view.
//
// A running feed of a collection: posts the owner writes ("finally found a
// boxed Halo"), woven together with milestones the collection already knows
// about -- every game marked beaten or dropped, on the day it happened. So the
// log fills itself in from play-through data even before anyone writes a word.
//
// An authored post can point at a game by `ref`, which gives it that game's
// cover as a thumbnail and opens the detail on click. A milestone always shows
// the game it is about.
//
// Posts are resolved and merged here on every load, never frozen: mark another
// game beaten and it appears in the stream without touching feed.json.

import { h, coverImage, richText, isLocal, playStatus, episodeNumbers, STATUS_LABEL } from './lib.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-19" -> "19 Aug 2026", leaving anything unparseable as it came. */
function humanDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return String(value ?? '');
  const month = MONTHS[Number(m[2]) - 1] || m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/**
 * Build the merged, newest-first stream from authored posts and the play-through
 * milestones derived from the collection.
 *
 * A milestone needs a date to sit on the timeline, so a dropped game with no
 * `beatenOn` simply doesn't produce one -- it is still on the shelf, just not
 * an event. Authored posts win ties with milestones on the same day, because a
 * written note is the thing the owner chose to say.
 */
export function buildStream(posts, games) {
  const byId = new Map(games.map((g) => [g.id, g]));
  const episodes = episodeNumbers(games);

  const authored = (Array.isArray(posts) ? posts : [])
    .filter((p) => p && typeof p.title === 'string' && p.title.trim())
    .map((p) => ({
      kind: 'post',
      id: p.id || null,
      date: String(p.date || '').slice(0, 10),
      title: p.title,
      body: p.body || '',
      game: p.ref ? byId.get(p.ref) || null : null,
    }));

  const milestones = games
    .filter((g) => ['beaten', 'dropped'].includes(playStatus(g)) && g.beatenOn)
    .map((g) => ({
      kind: 'milestone',
      status: playStatus(g),
      id: `${playStatus(g)}-${g.id}`,
      date: String(g.beatenOn).slice(0, 10),
      title: `${STATUS_LABEL[playStatus(g)]}: ${g.title}`,
      body: g.verdict || '',
      game: g,
      episode: episodes.get(g) || null,
    }));

  return [...authored, ...milestones].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;      // newest first
    if (a.kind !== b.kind) return a.kind === 'post' ? -1 : 1;    // posts win ties
    return String(a.title).localeCompare(b.title, 'en');
  });
}

function thumb(game, onOpen) {
  const img = coverImage(game);
  img.className = 'logentry__cover';
  return h('button', {
    type: 'button',
    class: 'logentry__thumb',
    'aria-label': `${game.title}${game.platform ? `, ${game.platform}` : ''}`,
    onclick: () => onOpen(game),
  }, img);
}

function entry(item, { onOpen }) {
  const meta = [humanDate(item.date)];
  if (item.kind === 'milestone' && item.status === 'beaten' && item.episode) {
    meta.push(`#${item.episode}`);
  }

  const head = h('div', { class: 'logentry__head' },
    h('span', { class: `logentry__kind logentry__kind--${item.kind}`,
      text: item.kind === 'post' ? 'Post' : STATUS_LABEL[item.status] }),
    h('time', { class: 'logentry__date', text: meta.join(' · ') }));

  const bodyNodes = item.body ? richText(item.body, { paraClass: 'logentry__p' }) : [];

  const main = h('div', { class: 'logentry__main' },
    head,
    h('h3', { class: 'logentry__title', text: item.title }),
    ...bodyNodes);

  return h('article', { class: `logentry logentry--${item.kind}`, id: item.id ? `log-${item.id}` : null },
    item.game ? thumb(item.game, onOpen) : null,
    main);
}

function emptyState() {
  return h('div', { class: 'lists__empty' },
    h('h2', { class: 'cmp__title', text: 'No log yet' }),
    h('p', { class: 'cmp__lede' },
      'The log is a running feed of your collection: notes you write, plus every '
      + 'game you mark beaten or dropped, in the order it happened. Mark something '
      + 'beaten and it shows up here on its own.'),
    isLocal() ? h('p', { class: 'lists__how' }, 'Write a post:') : null,
    isLocal() ? h('pre', { class: 'lists__code' }, h('code', { text: 'npm run post "Found a boxed Halo"' })) : null,
    isLocal()
      ? h('p', { class: 'cmp__blurb',
          text: 'Or add one on the manager\'s Updates tab. Beaten games need no post at all.' })
      : null);
}

export function renderLog(posts, games, { onOpen }) {
  const stream = buildStream(posts, games);
  if (!stream.length) return h('div', { class: 'log' }, emptyState());

  return h('div', { class: 'log' },
    h('div', { class: 'logfeed' }, stream.map((item) => entry(item, { onOpen }))));
}

/* --- The following river -------------------------------------------------- */

// One page never needs to show more than the recent past of everyone at once.
const RIVER_LIMIT = 60;

/**
 * Merge the logs of several shelves into one newest-first stream, each item
 * tagged with whose shelf it came from.
 *
 * Each shelf's own stream is built exactly as its own page would build it --
 * posts woven with milestones -- so following someone shows the same "beat
 * this" and "found that" entries they see, without them lifting a finger.
 */
export function buildRiver(shelves, { limit = RIVER_LIMIT } = {}) {
  const all = [];
  for (const shelf of shelves) {
    for (const item of buildStream(shelf.posts, shelf.games)) {
      all.push({ ...item, friend: shelf.friend });
    }
  }
  all.sort((a, b) =>
    (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
    || String(a.title).localeCompare(b.title, 'en'));
  return all.slice(0, limit);
}

/**
 * A link back to the entry on the shelf it belongs to: the referenced game's
 * detail where there is one, else that shelf's own log. Built from the friend's
 * own (trusted) site address, so a hostile id can only ever land in the hash.
 */
function riverHref(friend, item) {
  try {
    const url = new URL(friend.url);
    if (item.game?.id) {
      url.hash = item.game.id;
    } else {
      url.searchParams.set('view', 'log');
      if (item.id) url.hash = `log-${item.id}`;
    }
    return url.href;
  } catch {
    return null;
  }
}

function riverEntry(item) {
  const href = riverHref(item.friend, item);
  const meta = [humanDate(item.date)];
  if (item.kind === 'milestone' && item.status === 'beaten' && item.episode) {
    meta.push(`#${item.episode}`);
  }

  const thumb = item.game
    ? (() => {
        const img = coverImage(item.game);
        img.className = 'logentry__cover';
        return h('a', { class: 'logentry__thumb', href, target: '_blank',
          rel: 'noopener noreferrer', 'aria-label': item.game.title }, img);
      })()
    : null;

  const head = h('div', { class: 'logentry__head' },
    h('a', { class: 'river__who', href: item.friend.url, target: '_blank',
      rel: 'noopener noreferrer', text: item.friend.name }),
    h('span', { class: `logentry__kind logentry__kind--${item.kind}`,
      text: item.kind === 'post' ? 'Post' : STATUS_LABEL[item.status] }),
    h('time', { class: 'logentry__date', text: meta.join(' · ') }));

  const title = href
    ? h('a', { class: 'logentry__title river__title', href, target: '_blank',
        rel: 'noopener noreferrer', text: item.title })
    : h('h3', { class: 'logentry__title', text: item.title });

  return h('article', { class: `logentry logentry--${item.kind}` },
    thumb,
    h('div', { class: 'logentry__main' },
      head, title,
      ...(item.body ? richText(item.body, { paraClass: 'logentry__p' }) : [])));
}

export function renderRiver(items) {
  if (!items.length) {
    return h('div', { class: 'log' },
      h('p', { class: 'cmp__none', text: 'Nothing from the shelves you follow yet.' }));
  }
  return h('div', { class: 'log' },
    h('div', { class: 'logfeed' }, items.map(riverEntry)));
}

/**
 * The "who else" strip: shelves to explore that you don't follow yet -- friends
 * of the shelves you follow, and shelves listed in the directories you
 * subscribe to. Each links out, and its tooltip says where the suggestion came
 * from, so the follow graph can be walked a step at a time without leaving the
 * page.
 */
export function renderDiscovery(candidates) {
  if (!candidates.length) return null;

  return h('section', { class: 'discover' },
    h('h3', { class: 'discover__label', text: 'Shelves to explore' }),
    h('div', { class: 'discover__chips' },
      candidates.map((c) => {
        const via = [];
        if (c.followedBy?.length) via.push(`Followed by ${c.followedBy.join(', ')}`);
        if (c.listedIn?.length) via.push(`Listed in ${c.listedIn.join(', ')}`);
        const sources = (c.followedBy?.length || 0) + (c.listedIn?.length || 0);
        return h('a', {
          class: 'discover__chip',
          href: c.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: via.join(' · '),
        },
          h('span', { class: 'discover__name', text: c.name }),
          sources > 1 ? h('span', { class: 'discover__count', text: `×${sources}` }) : null);
      })));
}

/** The prompt shown when there's nothing to follow or explore yet. */
export function renderFollowingEmpty() {
  return h('div', { class: 'lists__empty' },
    h('h2', { class: 'cmp__title', text: 'You\'re not following anyone yet' }),
    h('p', { class: 'cmp__lede' },
      'Follow another GameLog and its updates show up here — games they beat, '
      + 'notes they write — read straight from their site. Or subscribe to a '
      + 'directory, a shared list of shelves, to find people to follow. Both '
      + 'live on the manager\'s Site tab, or in data/config.json.'));
}
