// The lists view.
//
// A list is just a named, ordered set of games -- a backlog, a wishlist, a
// shelf of favourites. The one thing that makes it more than a bookmark folder
// is that a list entry is *resolved against the collection every time the page
// loads*: put "Chrono Trigger" on your hunting list, buy it a year later, and
// the entry turns itself from wanted into owned without you editing the list.
//
// So an item is not "an owned game" or "a wanted game". It is a reference that
// happens to resolve, or not, right now.

import { platformInfo } from './platforms.mjs';
import { h, coverImage, titleKey, plural, isLocal } from './lib.js';

/**
 * Work out what a list item currently points at.
 *
 * `ref` wins when it resolves -- it is an explicit pointer at one entry. Failing
 * that we match on title (and platform, when the item names one), which is what
 * lets a wishlist entry notice that you now own the thing.
 */
export function resolveItem(item, byId, byTitle) {
  if (item.ref) {
    const hit = byId.get(item.ref);
    if (hit) return { game: hit, owned: true, note: item.note || null, item };
    // A ref that no longer resolves is a broken pointer, not a wishlist entry.
    return {
      game: { title: item.title || item.ref, platform: item.platform || null },
      owned: false, missing: true, note: item.note || null, item,
    };
  }

  const key = titleKey(item.title || '');
  const candidates = byTitle.get(key) || [];
  const match = item.platform
    ? candidates.find((g) => g.platform === item.platform) || null
    : candidates[0] || null;

  if (match) return { game: match, owned: true, note: item.note || null, item };

  // Not owned: build a game-shaped object from whatever the list carries.
  return {
    game: {
      id: null,
      title: item.title || 'Untitled',
      platform: item.platform || null,
      year: item.year ?? null,
      cover: item.cover ?? null,
      description: item.description ?? null,
      genres: item.genres || [],
      developer: item.developer ?? null,
      publisher: item.publisher ?? null,
    },
    owned: false,
    note: item.note || null,
    item,
  };
}

export function resolveList(list, games) {
  const byId = new Map(games.map((g) => [g.id, g]));
  const byTitle = new Map();
  for (const game of games) {
    const key = titleKey(game.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(game);
  }

  const entries = (list.items || []).map((item) => resolveItem(item, byId, byTitle));
  return {
    ...list,
    entries,
    ownedCount: entries.filter((e) => e.owned).length,
    total: entries.length,
  };
}

function listTile(entry, { onOpen }) {
  const { game, owned, note } = entry;
  const info = platformInfo(game.platform);

  const img = coverImage(game);
  img.className = 'tile__cover';

  const plate = h('span', { class: 'tile__plate' },
    h('span', { class: 'tile__name', text: game.title }),
    game.year ? h('span', { class: 'tile__sub', text: String(game.year) }) : null);

  const children = [
    img,
    // A wanted game you haven't decided a platform for shows no badge at all --
    // an invented "U" for Unknown reads as data rather than as an absence.
    game.platform
      ? h('span', { class: 'tile__badge', style: `--badge-color:${info.color}`, text: info.short })
      : null,
    plate,
    owned
      ? null
      : h('span', { class: 'tile__want', title: entry.missing ? 'This ref does not match anything in your collection' : 'Not in your collection yet',
          text: entry.missing ? '!' : 'want' }),
    note ? h('span', { class: 'tile__note', title: note }) : null,
  ];

  const classes = ['tile'];
  if (!game.cover) classes.push('tile--noart');
  if (!owned) classes.push('tile--wanted');

  // Only owned games have a detail entry to open.
  if (owned) {
    return h('button', {
      type: 'button',
      class: classes.join(' '),
      'aria-label': `${game.title}, ${game.platform}, in your collection`,
      onclick: () => onOpen(game),
    }, children);
  }
  return h('div', {
    class: classes.join(' '),
    role: 'listitem',
    'aria-label': `${game.title}, ${game.platform}, not owned`,
    title: note || `${game.title}: not in your collection`,
  }, children);
}

function progress(resolved) {
  const { ownedCount, total, wants } = resolved;
  if (!total) return null;
  const pct = Math.round((ownedCount / total) * 100);

  // A wishlist reads by what's left to find; any other list by what you own.
  const text = wants
    ? (ownedCount === total
        ? `all ${plural(total, 'game')} found`
        : `${plural(total - ownedCount, 'game')} still to find`)
    : (ownedCount === total
        ? `all ${plural(total, 'game')} owned`
        : `${ownedCount} of ${total} owned`);

  return h('div', { class: 'listprog' },
    h('div', { class: 'listprog__track' },
      h('div', { class: 'listprog__fill', style: `width:${pct}%` })),
    h('span', { class: 'listprog__text', text }));
}

export function renderLists(lists, games, { selected, onSelect, onOpen }) {
  if (!lists.length) {
    return h('div', { class: 'lists' },
      h('div', { class: 'lists__empty' },
        h('h2', { class: 'cmp__title', text: 'No lists yet' }),
        h('p', { class: 'cmp__lede' },
          'A list is any set of games you want to keep together. A backlog, ' +
          'a wishlist, the ones you\'d save from a fire. Entries can be games ' +
          'you own or games you\'re still hunting, and a hunted game flips to ' +
          'owned by itself once it turns up in your collection.'),
        isLocal() ? h('p', { class: 'lists__how' }, 'Make one:') : null,
        isLocal() ? h('pre', { class: 'lists__code' }, h('code', { text: 'npm run list' })) : null,
        isLocal()
          ? h('p', { class: 'cmp__blurb',
              text: 'Or write data/lists.json by hand. The README has the shape.' })
          : null));
  }

  // The wishlist, when there is one, leads -- it's the list you check most.
  const resolved = lists.map((list) => resolveList(list, games))
    .sort((a, b) => (b.wants ? 1 : 0) - (a.wants ? 1 : 0));
  const current = resolved.find((l) => l.id === selected) || resolved[0];

  const picker = h('div', { class: 'listpicker', role: 'tablist' },
    resolved.map((list) => h('button', {
      type: 'button',
      class: list.wants ? 'chip chip--wish' : 'chip',
      role: 'tab',
      'aria-selected': String(list.id === current.id),
      onclick: () => onSelect(list.id),
    },
      list.wants ? h('span', { class: 'chip__wish', 'aria-hidden': 'true', text: '★' }) : null,
      h('span', { text: list.name || list.id }),
      h('span', { class: 'chip__count', text: String(list.total) }))));

  const header = h('div', { class: 'listhead' },
    h('h2', { class: 'listhead__name' },
      h('span', { text: current.name || current.id }),
      current.wants ? h('span', { class: 'listhead__tag', text: 'Wishlist' }) : null),
    current.description ? h('p', { class: 'listhead__desc', text: current.description }) : null,
    progress(current));

  const body = current.total
    ? h('div', { class: 'shelf', role: 'list' },
        current.entries.map((entry) => listTile(entry, { onOpen })))
    : h('p', { class: 'cmp__none', text: 'This list is empty.' });

  return h('div', { class: 'lists' }, picker, header, body);
}
