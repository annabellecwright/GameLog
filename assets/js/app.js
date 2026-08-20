// GameLog. The front end.
//
// No build step and no dependencies: this reads data/collection.json and
// data/config.json at load, then renders and filters entirely in the browser.
// A few hundred games is small enough that re-rendering on every keystroke is
// imperceptible, so there is no virtualisation to reason about.
//
// Five views share one filter state: shelf, timeline, lists, stats, compare.

import { platformInfo, platformSortIndex, registerPlatforms } from './platforms.mjs';
import {
  fold, sortKey, conditionGroup, CONDITION_ORDER, coverImage, placeholderCover,
  safeImageUrl, h, plural, playStatus, STATUS_LABEL, episodeNumbers, progressOf, isLocal,
  hardwareKind, hardwareQuantity, HARDWARE_KINDS, KIND_LABEL,
  shelfShape, boxTile, boxHeight,
} from './lib.js';
import { renderStats } from './stats.js';
import { renderTimeline } from './timeline.js';
import * as compare from './compare.js';
import { renderLists } from './lists.js';
import { renderLog, buildRiver, renderRiver, renderDiscovery, renderFollowingEmpty } from './feed.js';
import { renderHero } from './profile.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  search: $('#search'),
  sort: $('#sort'),
  condition: $('#condition'),
  filtersToggle: $('#filters-toggle'),
  toolSelects: $('#tool-selects'),
  filtersDot: $('#filters-dot'),
  sheet: $('#filter-sheet'),
  sheetBody: $('#sheet-body'),
  sheetClose: $('#sheet-close'),
  sheetClear: $('#sheet-clear'),
  sheetApply: $('#sheet-apply'),
  status: $('#status'),
  progress: $('#progress'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
  chips: $('#platform-chips'),
  filters: $('#filters'),
  views: $('#views'),
  statline: $('#statline'),
  grid: $('#grid'),
  count: $('#count'),
  clear: $('#clear'),
  empty: $('#empty'),
  notesToggle: $('#notes-toggle'),
  dice: $('#dice'),
  hardwareSection: $('#hardware-section'),
  hardwareGrid: $('#hardware-grid'),
  colophon: $('#colophon-text'),
  themeToggle: $('#theme-toggle'),
  viewShelf: $('#view-shelf'),
  viewTimeline: $('#view-timeline'),
  viewLists: $('#view-lists'),
  viewLog: $('#view-log'),
  viewStats: $('#view-stats'),
  hero: $('#hero'),
  viewCompare: $('#view-compare'),
  cmpForm: $('#cmp-form'),
  cmpUrl: $('#cmp-url'),
  cmpStatus: $('#cmp-status'),
  cmpOutput: $('#cmp-output'),
  cmpFriends: $('#cmp-friends'),
  viewFollowing: $('#view-following'),
  folStatus: $('#fol-status'),
  folOutput: $('#fol-output'),
  dialog: $('#detail'),
  dCover: $('#detail-cover'),
  dPlatform: $('#detail-platform'),
  dYear: $('#detail-year'),
  dTitle: $('#detail-title'),
  dGenres: $('#detail-genres'),
  dDescription: $('#detail-description'),
  dMeta: $('#detail-meta'),
  dNotes: $('#detail-notes'),
  dEpisode: $('#detail-episode'),
  dVerdict: $('#detail-verdict'),
  dVideo: $('#detail-video'),
  dPrev: $('#detail-prev'),
  dNext: $('#detail-next'),
  dClose: $('.detail__close'),
};

const VIEWS = ['shelf', 'timeline', 'lists', 'log', 'stats', 'compare', 'following'];

const state = {
  games: [],
  hardware: [],
  lists: [],
  feed: [],
  river: null,
  discover: [],
  config: {},
  view: 'shelf',
  list: null,
  query: '',
  platform: 'all',
  condition: 'all',
  status: 'all',
  notesOnly: false,
  sort: 'title',
  visible: [],
  openIndex: -1,
  episodes: new Map(),
};

/* --- Filtering and sorting ------------------------------------------------ */

function buildSearchIndex(game) {
  return fold([
    game.title,
    game.platform,
    platformInfo(game.platform).short,
    game.developer,
    game.publisher,
    (game.genres || []).join(' '),
    game.year,
    game.notes,
  ].filter(Boolean).join(' '));
}

function compute() {
  const terms = fold(state.query).split(' ').filter(Boolean);

  const list = state.games.filter((game) => {
    if (state.platform !== 'all' && game.platform !== state.platform) return false;
    if (state.condition !== 'all' && game._condition !== state.condition) return false;
    if (state.status !== 'all' && playStatus(game) !== state.status) return false;
    if (state.notesOnly && !game.notes) return false;
    // Every term must appear somewhere, so "zelda n64" narrows as you'd expect.
    return terms.every((t) => game._index.includes(t));
  });

  const dir = state.sort.startsWith('-') ? -1 : 1;
  const field = state.sort.replace(/^-/, '');

  list.sort((a, b) => {
    if (field === 'title') return dir * a._sortKey.localeCompare(b._sortKey, 'en');
    // Missing numbers and dates always sink to the bottom, whichever way we sort.
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return a._sortKey.localeCompare(b._sortKey, 'en');
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a._sortKey.localeCompare(b._sortKey, 'en');
    return dir * (av > bv ? 1 : -1);
  });

  state.visible = list;
}

const isFiltered = () =>
  Boolean(state.query) || state.platform !== 'all' || state.condition !== 'all'
  || state.status !== 'all' || state.notesOnly;

/* --- Shelf ---------------------------------------------------------------- */

function renderGrid() {
  const fragment = document.createDocumentFragment();

  // On a single-platform view the boxes are drawn at their real proportions,
  // which only works because every box on that shelf is the same shape.
  const shape = shelfShape(state.visible);
  el.grid.classList.toggle('shelf--boxes', Boolean(shape));
  el.grid.style.removeProperty('--box-h');
  if (shape) el.grid.style.setProperty('--box-h', `${boxHeight(shape)}px`);

  state.visible.forEach((game, i) => {
    const info = platformInfo(game.platform);

    const tile = document.createElement('button');
    tile.type = 'button';
    // Without real art the placeholder says nothing but the platform, so the
    // title plate has to stay put rather than waiting for a hover.
    tile.className = game.cover ? 'tile' : 'tile tile--noart';
    tile.dataset.index = String(i);
    tile.setAttribute('aria-label',
      `${game.title}${game.year ? `, ${game.year}` : ''}, ${game.platform}`);

    // The box scan is only used in shape mode; everywhere else keeps the
    // normalised key art, which is what makes the mixed grid read cleanly.
    const box = shape ? boxTile(game, shape) : null;
    const img = coverImage(box?.src ? { ...game, cover: box.src } : game, { eager: i < 12 });
    img.className = 'tile__cover';
    if (box) {
      tile.style.setProperty('--ratio', box.ratio.toFixed(3));
      if (!box.scanned) tile.classList.add('tile--noscan');
    }

    const badge = document.createElement('span');
    badge.className = 'tile__badge';
    badge.style.setProperty('--badge-color', info.color);
    badge.textContent = info.short;

    const plate = document.createElement('span');
    plate.className = 'tile__plate';
    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = game.title;
    plate.append(name);
    if (game.year) {
      const sub = document.createElement('span');
      sub.className = 'tile__sub';
      sub.textContent = game.year;
      plate.append(sub);
    }

    tile.append(img, badge, plate);

    const status = playStatus(game);
    if (status !== 'unplayed') {
      const mark = document.createElement('span');
      mark.className = `tile__status tile__status--${status}`;
      const ep = state.episodes.get(game);
      mark.textContent = status === 'beaten' ? (ep ? `#${ep}` : '\u2713')
        : status === 'playing' ? '\u25b6' : '\u2715';
      mark.title = STATUS_LABEL[status] + (game.beatenOn ? ` ${game.beatenOn}` : '');
      tile.append(mark);
      tile.classList.add(`tile--${status}`);
    }

    if (game.notes) {
      const dot = document.createElement('span');
      dot.className = 'tile__note';
      dot.title = 'Has a note';
      tile.append(dot);
    }

    if (game.copies > 1) {
      const copies = document.createElement('span');
      copies.className = 'tile__copies';
      copies.textContent = `×${game.copies}`;
      copies.title = `${game.copies} copies`;
      tile.append(copies);
    }

    fragment.append(tile);
  });

  el.grid.replaceChildren(fragment);
}

function renderCount() {
  const total = state.games.length;
  const shown = state.visible.length;

  if (isFiltered()) {
    el.count.textContent = `${shown} of ${total} game${total === 1 ? '' : 's'}`;
  } else {
    const platforms = new Set(state.games.map((g) => g.platform)).size;
    const copies = state.games.reduce((sum, g) => sum + (g.copies || 1), 0);
    const extra = copies > total ? ` · ${copies} copies` : '';
    el.count.textContent =
      `${total} game${total === 1 ? '' : 's'} · ${plural(platforms, 'platform')}${extra}`;
  }

  // Progress over the *filtered* set, so "every 3DO game" and "the whole
  // collection" are the same feature with a different chip selected.
  const tracked = state.games.some((g) => playStatus(g) !== 'unplayed');
  if (tracked) {
    const p = progressOf(state.visible);
    el.progress.hidden = false;
    el.progressFill.style.width = `${p.pct}%`;
    el.progressText.textContent =
      `${p.beaten} of ${p.total} beaten` + (p.dropped ? `, ${p.dropped} dropped` : '')
      + (p.playing ? `, ${p.playing} in progress` : '');
  } else {
    el.progress.hidden = true;
  }

  // A folded-away filter still needs to announce that it is doing something.
  const secondaryActive = state.sort !== (state.config.defaultSort || 'title')
    || state.status !== 'all' || state.condition !== 'all';
  el.filtersDot.hidden = !(secondaryActive || state.platform !== 'all' || state.notesOnly);
  el.sheetApply.textContent = isFiltered()
    ? `Show ${shown} of ${total}`
    : `Show all ${total}`;

  el.clear.hidden = !isFiltered();
  el.empty.hidden = shown > 0;
  el.grid.hidden = shown === 0;
  el.dice.disabled = shown === 0;

  // An empty collection and a search that found nothing are different
  // situations. A fresh fork told to "try a different search" is being blamed
  // for a filter it never set -- and it's the first screen anyone sees.
  if (shown === 0) {
    el.empty.replaceChildren(...(total === 0
      ? [
          h('strong', { text: 'No games yet' }),
          h('span', { text: 'This collection is empty. Which means it\'s yours to fill.' }),
          h('code', { class: 'empty__cmd', text: 'npm run manage' }),
          h('span', { class: 'empty__aside',
            text: 'Or add one from the terminal with  npm run add "Some Game"' }),
        ]
      : [
          h('strong', { text: 'Nothing matches that.' }),
          h('span', { text: 'Try a different search, or clear the filters.' }),
        ]));
  }
}

function renderHardware() {
  if (!state.hardware.length || state.config.showHardware === false || state.query
      || state.notesOnly || state.condition !== 'all') {
    el.hardwareSection.hidden = true;
    return;
  }
  const list = state.platform === 'all'
    ? state.hardware
    : state.hardware.filter((item) => item.platform === state.platform);

  if (!list.length) { el.hardwareSection.hidden = true; return; }
  el.hardwareSection.hidden = false;

  const card = (item) => {
    const info = platformInfo(item.platform);
    const node = h('div', { class: 'hw-card' });
    const art = h('div', { class: 'hw-card__art' });

    const src = safeImageUrl(item.image);
    if (src) {
      const img = h('img', { src, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => {
        art.style.background = info.color;
        art.replaceChildren(h('span', { class: 'hw-card__initials', text: info.short }));
      }, { once: true });
      art.append(img);
    } else {
      art.style.background = info.color;
      art.append(h('span', { class: 'hw-card__initials', text: info.short }));
    }

    const quantity = hardwareQuantity(item);
    node.append(art, h('div', { class: 'hw-card__body' },
      h('p', { class: 'hw-card__name', text: item.name }),
      h('p', { class: 'hw-card__meta',
        text: [item.platform, item.condition].filter(Boolean).join(' · ') })));
    if (quantity > 1) {
      node.append(h('span', { class: 'hw-card__qty', title: `${quantity} of these`,
        text: `×${quantity}` }));
    }
    return node;
  };

  // Grouped by kind, in a fixed order. A flat grid is fine for five consoles
  // and unreadable once controllers and memory cards are in there too.
  const groups = HARDWARE_KINDS
    .map((kind) => [kind, list.filter((item) => hardwareKind(item) === kind)])
    .filter(([, items]) => items.length);

  el.hardwareGrid.replaceChildren(...groups.flatMap(([kind, items]) => {
    const total = items.reduce((n, item) => n + hardwareQuantity(item), 0);
    // A single group needs no heading: the section is already called Hardware.
    const heading = groups.length > 1
      ? h('h3', { class: 'hw-group', text: `${KIND_LABEL[kind]}${total > items.length ? ` (${total})` : ''}` })
      : null;
    return [heading, h('div', { class: 'hardware__row' }, items.map(card))].filter(Boolean);
  }));
}

/* --- View switching ------------------------------------------------------- */

function render() {
  compute();

  for (const tab of el.views.children) {
    const active = tab.dataset.view === state.view;
    tab.setAttribute('aria-current', String(active));
  }

  el.viewShelf.hidden = state.view !== 'shelf';
  el.viewTimeline.hidden = state.view !== 'timeline';
  el.viewLists.hidden = state.view !== 'lists';
  el.viewLog.hidden = state.view !== 'log';
  el.viewStats.hidden = state.view !== 'stats';
  el.viewCompare.hidden = state.view !== 'compare';
  el.viewFollowing.hidden = state.view !== 'following';

  // Stats now describes whatever is filtered, so the chips have to stay
  // visible there: otherwise the filter is doing work you can neither see nor
  // undo. The count line and the dice remain shelf-and-timeline only.
  const listy = state.view === 'shelf' || state.view === 'timeline';
  const filterable = listy || state.view === 'stats';
  el.filters.hidden = !filterable;
  el.statline.hidden = !listy;
  el.dice.hidden = !listy;
  el.notesToggle.hidden = !listy;
  el.search.closest('.search').hidden = state.view !== 'shelf' && state.view !== 'timeline';
  el.sort.closest('.select').hidden = state.view !== 'shelf';
  el.condition.closest('.select').hidden = !filterable;
  el.status.closest('.select').hidden = !filterable;

  if (state.view === 'shelf') {
    renderGrid();
    renderCount();
    renderHardware();
  } else if (state.view === 'timeline') {
    renderCount();
    el.viewTimeline.replaceChildren(
      renderTimeline(state.visible, { onOpen: openByGame }));
  } else if (state.view === 'lists') {
    el.viewLists.replaceChildren(renderLists(state.lists, state.games, {
      selected: state.list,
      onSelect: (id) => { state.list = id; writeUrl(); render(); },
      onOpen: openFromAnywhere,
    }));
  } else if (state.view === 'log') {
    el.viewLog.replaceChildren(renderLog(state.feed, state.games, { onOpen: openFromAnywhere }));
  } else if (state.view === 'following') {
    renderFollowing();
  } else if (state.view === 'stats') {
    // Stats describes whatever is filtered, not always the whole collection.
    // With a platform selected this is that shelf's portrait, which is what
    // "?view=stats&platform=3DO" plainly asks for and used to ignore.
    const hardware = state.platform === 'all'
      ? state.hardware
      : state.hardware.filter((item) => item.platform === state.platform);
    el.viewStats.replaceChildren(
      renderStats(state.visible, hardware, { filtered: isFiltered(), total: state.games.length }));
  }

  for (const chip of el.chips.children) {
    chip.setAttribute('aria-selected', String(chip.dataset.platform === state.platform));
  }
}

function setView(view) {
  if (!VIEWS.includes(view)) view = 'shelf';
  state.view = view;
  writeUrl();
  render();
}

/* --- Chips and selects ---------------------------------------------------- */

function renderChips() {
  const counts = new Map();
  for (const game of state.games) {
    counts.set(game.platform, (counts.get(game.platform) || 0) + 1);
  }

  const platforms = [...counts.keys()].sort(
    (a, b) => platformSortIndex(a) - platformSortIndex(b) || a.localeCompare(b)
  );

  const chip = (key, label, count, color) => h('button', {
    type: 'button', class: 'chip', role: 'tab',
    dataset: { platform: key },
    'aria-selected': String(state.platform === key),
  },
    color ? h('span', { class: 'chip__dot', style: `--chip-color:${color}` }) : null,
    h('span', { text: label }),
    h('span', { class: 'chip__count', text: String(count) }));

  el.chips.replaceChildren(
    chip('all', 'All', state.games.length, null),
    ...platforms.map((p) => chip(p, p.length > 20 ? platformInfo(p).short : p,
      counts.get(p), platformInfo(p).color))
  );
}

function renderConditionOptions() {
  const present = new Set(state.games.map((g) => g._condition).filter(Boolean));
  const ordered = CONDITION_ORDER.filter((c) => present.has(c));

  // One condition (or none) is not a filter, it's a label.
  if (ordered.length < 2) {
    el.condition.closest('.select').dataset.unavailable = 'true';
    return;
  }
  delete el.condition.closest('.select').dataset.unavailable;

  el.condition.replaceChildren(
    h('option', { value: 'all', text: 'Any condition' }),
    ...ordered.map((c) => h('option', { value: c, text: c })));
}

/**
 * "Recently added" is only a sort if the dates actually differ. A CSV import
 * stamps every row with the same day -- here that was 143 of 184 games -- and
 * the option then just reproduces the alphabetical order while claiming not to.
 */
function pruneDeadSorts() {
  const dates = state.games.map((g) => g.added).filter(Boolean);
  const distinct = new Set(dates);
  let dominant = 0;
  for (const d of distinct) {
    dominant = Math.max(dominant, dates.filter((x) => x === d).length);
  }
  const useful = dates.length >= 4 && distinct.size >= 3 && dominant / dates.length < 0.6;

  if (!useful) {
    el.sort.querySelector('option[value="-added"]')?.remove();
    if (state.sort === '-added') state.sort = 'title';
  }

  // Same idea for ratings: no scores, no "highest rated".
  if (!state.games.some((g) => typeof g.metacritic === 'number')) {
    el.sort.querySelector('option[value="-metacritic"]')?.remove();
    if (state.sort === '-metacritic') state.sort = 'title';
  }
  if (!state.games.some((g) => g.year)) {
    for (const v of ['year', '-year']) el.sort.querySelector(`option[value="${v}"]`)?.remove();
    if (state.sort.replace('-', '') === 'year') state.sort = 'title';
  }
}

/* --- Detail dialog -------------------------------------------------------- */

function metaRow(term, value) {
  if (!value) return [];
  return [h('dt', { text: term }), h('dd', { text: value })];
}

function openDetail(index) {
  const game = state.visible[index];
  if (!game) return;
  state.openIndex = index;

  const src = safeImageUrl(game.cover);
  el.dCover.src = src || placeholderCover(game.platform);
  el.dCover.alt = `${game.title} cover art`;
  el.dCover.onerror = () => {
    el.dCover.onerror = null;
    el.dCover.src = placeholderCover(game.platform);
  };

  el.dPlatform.textContent = game.platform;
  el.dYear.textContent = game.year || '';
  el.dTitle.textContent = game.title;

  el.dGenres.replaceChildren(
    ...(game.genres || []).map((g) => h('li', { text: g })));

  el.dDescription.textContent = game.description || '';

  el.dMeta.replaceChildren(
    ...metaRow('Developer', game.developer),
    ...metaRow('Publisher', game.publisher),
    ...metaRow('Condition', game.condition),
    ...metaRow('Copies', game.copies > 1 ? String(game.copies) : null),
    ...metaRow('Edition', game.release),
    ...metaRow('Region', game.region),
    ...metaRow('Metascore', game.metacritic ? `${game.metacritic}/100` : null),
    ...metaRow('Added', game.added),
    ...metaRow('Status', playStatus(game) === 'unplayed' ? null : STATUS_LABEL[playStatus(game)]),
    ...metaRow('Beaten', game.beatenOn),
  );

  // The episode number and the write-up are the reason someone clicks through
  // from a video description, so they sit above the catalogue metadata.
  const episode = state.episodes.get(game);
  el.dEpisode.hidden = !episode;
  if (episode) el.dEpisode.textContent = `Episode ${episode}`;

  el.dVerdict.hidden = !game.verdict;
  el.dVerdict.textContent = game.verdict || '';

  const video = typeof game.video === 'string' && /^https?:\/\//i.test(game.video)
    ? game.video : null;
  el.dVideo.hidden = !video;
  if (video) el.dVideo.href = video;

  el.dNotes.hidden = !game.notes;
  el.dNotes.textContent = game.notes || '';

  el.dPrev.disabled = index === 0;
  el.dNext.disabled = index === state.visible.length - 1;

  if (!el.dialog.open) el.dialog.showModal();

  // Deep links: the url always points at whatever is open.
  history.replaceState(null, '', `#${game.id}`);
  el.dialog.querySelector('.detail__inner').scrollTop = 0;
}

/** Open a game by identity rather than by position in the current list. */
function openByGame(game) {
  const index = state.visible.indexOf(game);
  if (index !== -1) return openDetail(index);
  const byId = state.visible.findIndex((g) => g.id === game.id);
  if (byId !== -1) openDetail(byId);
}

function closeDetail() {
  if (el.dialog.open) el.dialog.close();
}

/**
 * Open a game picked from a view that isn't the shelf. The dialog steps through
 * `visible`, so the game has to be in it -- if the current filters exclude it,
 * drop them rather than opening nothing.
 */
function openFromAnywhere(game) {
  const inView = state.visible.some((g) => g.id === game.id);
  if (!inView) clearFilters();
  setView('shelf');
  openByGame(game);
}

function step(delta) {
  const next = state.openIndex + delta;
  if (next >= 0 && next < state.visible.length) openDetail(next);
}

/**
 * Pick something at random from whatever is currently showing.
 *
 * Randomised order is what the N64 project used, and it removes the nightly
 * argument about what to play next. Filter to "Not started" first and this
 * becomes the roll that picks the episode.
 */
function surpriseMe() {
  if (!state.visible.length) return;
  // Never hand back the game already open -- that reads as a broken button.
  let index = Math.floor(Math.random() * state.visible.length);
  if (state.visible.length > 1 && index === state.openIndex) {
    index = (index + 1) % state.visible.length;
  }
  openDetail(index);
}

/* --- Compare -------------------------------------------------------------- */

let comparing = false;

function cmpStatus(message, kind = 'info') {
  el.cmpStatus.hidden = !message;
  el.cmpStatus.textContent = message || '';
  el.cmpStatus.dataset.kind = kind;
}

async function runComparison(input) {
  if (comparing) return;
  comparing = true;
  el.cmpOutput.replaceChildren();
  cmpStatus('Fetching that collection…');

  try {
    const theirs = await compare.loadCollection(input);
    const result = compare.diff(state.games, theirs.games);
    const label = new URL(theirs.url).host;

    cmpStatus('');
    el.cmpOutput.replaceChildren(
      compare.renderComparison(result, label, { onOpen: openFromAnywhere }));

    el.cmpUrl.value = input;
    writeUrl();
  } catch (err) {
    cmpStatus(err.message || String(err), 'error');
  } finally {
    comparing = false;
  }
}

/**
 * A `?with=` link fetches another host straight from the visitor's browser, so
 * a crafted link would make an arbitrary stranger's site load on page open --
 * enough to hand that host the visitor's IP before anything is shown. A link
 * someone followed is not the same as a comparison they asked for, so an
 * incoming target is prefilled and confirmed rather than fetched on sight.
 *
 * Friend chips and a pasted address are already deliberate clicks, and go
 * straight to runComparison unchanged.
 */
function promptComparison(input) {
  el.cmpUrl.value = input;
  let host = input;
  try { host = new URL(compare.resolveCollectionUrl(input)).host; } catch { /* show raw */ }

  cmpStatus('');
  el.cmpOutput.replaceChildren(
    h('div', { class: 'cmp__confirm' },
      h('p', { class: 'cmp__confirmtext' },
        h('span', { text: 'Compare your shelf against ' }),
        h('strong', { text: host }),
        h('span', { text: '? This loads that site directly in your browser.' })),
      h('button', {
        type: 'button', class: 'pillbutton pillbutton--accent',
        onclick: () => runComparison(input),
      }, h('span', { text: 'Compare' }))));
}

function renderFriends() {
  const friends = Array.isArray(state.config.friends) ? state.config.friends : [];
  if (!friends.length) { el.cmpFriends.hidden = true; return; }
  el.cmpFriends.hidden = false;
  el.cmpFriends.replaceChildren(
    h('span', { class: 'cmp__friendlabel', text: 'Shelves you follow' }),
    ...friends
      .filter((f) => f && typeof f.url === 'string')
      .map((f) => h('button', {
        type: 'button', class: 'chip',
        onclick: () => { el.cmpUrl.value = f.url; runComparison(f.url); },
      }, h('span', { text: f.name || f.url }))));
}

/* --- Following ------------------------------------------------------------ */

let followingLoading = false;
let followingLoaded = false;

function folStatus(message, kind = 'info') {
  el.folStatus.hidden = !message;
  el.folStatus.textContent = message || '';
  el.folStatus.dataset.kind = kind;
}

const followedShelves = () =>
  (Array.isArray(state.config.friends) ? state.config.friends : [])
    .filter((f) => f && typeof f.url === 'string' && f.url.trim());

const subscribedDirectories = () =>
  (Array.isArray(state.config.directories) ? state.config.directories : [])
    .filter((d) => typeof d === 'string' && d.trim());

/**
 * Show the view. With nothing to read -- no follows and no directories -- the
 * prompt; once fetched, the cached result; otherwise kick off the fetch, which
 * paints itself when it lands.
 */
function renderFollowing() {
  const friends = followedShelves();
  const directories = subscribedDirectories();
  if (!friends.length && !directories.length) {
    folStatus('');
    el.folOutput.replaceChildren(renderFollowingEmpty());
    return;
  }
  if (followingLoaded) {
    paintFollowing();
    return;
  }
  if (!followingLoading) runFollowing(friends, directories);
}

/** Draw the discovery strip (when there's anything to suggest) above the river. */
function paintFollowing() {
  const parts = [];
  const discovery = renderDiscovery(state.discover);
  if (discovery) parts.push(discovery);
  parts.push(renderRiver(state.river || []));
  el.folOutput.replaceChildren(...parts);
}

/**
 * Read one followed shelf: its collection (for the milestones), its feed (for
 * written posts), and its config (for who it follows, which seeds discovery).
 * Only the collection is required; a missing feed or config just contributes
 * less. A shelf that can't be reached at all drops out.
 */
async function fetchShelf(f) {
  let games;
  let collUrl;
  try {
    const c = await compare.loadCollection(f.url);
    games = c.games;
    collUrl = c.url;
  } catch {
    return null;
  }
  let posts = [];
  try { posts = (await compare.loadFeed(f.url)).posts; } catch { posts = []; }
  let theirFriends = [];
  try { theirFriends = (await compare.loadConfig(f.url)).friends; } catch { theirFriends = []; }
  const base = collUrl.replace(/\/data\/collection\.json.*$/, '');
  return {
    friend: { name: (f.name && f.name.trim()) || base, url: base },
    posts, games, friends: theirFriends,
  };
}

/**
 * Read everything the view draws from -- the shelves you follow (for the river
 * and for friends-of-friends) and the directories you subscribe to (for
 * seeded discovery) -- in parallel. Each is someone else's file, so a source
 * that can't be read is isolated: it drops out and the rest still show.
 */
async function runFollowing(friends, directories) {
  followingLoading = true;
  el.folOutput.replaceChildren();
  const reading = [];
  if (friends.length) reading.push(plural(friends.length, 'shelf', 'shelves'));
  if (directories.length) reading.push(plural(directories.length, 'directory', 'directories'));
  folStatus(`Reading ${reading.join(' and ')}…`);

  const [shelfResults, dirResults] = await Promise.all([
    Promise.all(friends.map(fetchShelf)),
    Promise.all(directories.map((u) => compare.loadDirectory(u).catch(() => null))),
  ]);

  const ok = shelfResults.filter(Boolean);
  const dirs = dirResults.filter(Boolean);
  const total = friends.length + directories.length;
  const missed = total - ok.length - dirs.length;

  followingLoading = false;
  followingLoaded = true;
  state.river = buildRiver(ok);

  // Shelves to suggest, minus the ones you already follow and you.
  const exclude = friends.map((f) => f.url);
  if (typeof state.config.siteUrl === 'string' && state.config.siteUrl.trim()) {
    exclude.push(state.config.siteUrl);
  }
  state.discover = compare.discover({ shelves: ok, directories: dirs, exclude });

  folStatus(missed ? `${missed} of ${total} couldn't be read.` : '', missed ? 'warn' : 'info');
  paintFollowing();
}

/** Put every filter back to its default. */
function clearFilters() {
  state.query = '';
  state.platform = 'all';
  state.condition = 'all';
  state.status = 'all';
  state.notesOnly = false;
  syncControls();
}

/* --- Phone layout --------------------------------------------------------- */

/**
 * On a phone the filters live in a sheet; on a desktop they live in the header.
 *
 * The controls are *moved* between the two rather than duplicated, so there is
 * still one platform chip strip, one sort select and one notes toggle in the
 * document. Duplicating them would mean two sets of listeners and two things to
 * keep in step with the state, which is how filter bars end up disagreeing with
 * themselves.
 */
const phone = window.matchMedia('(max-width: 700px)');
const homes = new Map();

function rememberHome(node) {
  if (!homes.has(node)) homes.set(node, { parent: node.parentNode, next: node.nextSibling });
}

function placeFilters() {
  const movable = [el.filters, el.toolSelects, el.notesToggle].filter(Boolean);
  movable.forEach(rememberHome);
  if (el.dice) rememberHome(el.dice);

  if (phone.matches) {
    for (const node of movable) el.sheetBody.append(node);
    // Surprise me is an action rather than a filter, so it stays in the header
    // beside the search box instead of being buried in the sheet.
    if (el.dice) el.themeToggle.before(el.dice);
  } else {
    if (el.sheet.open) el.sheet.close();
    for (const node of [...movable, el.dice].filter(Boolean)) {
      const home = homes.get(node);
      if (home?.parent) home.parent.insertBefore(node, home.next);
    }
  }
}

/* --- URL and theme -------------------------------------------------------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.view = VIEWS.includes(params.get('view')) ? params.get('view') : 'shelf';
  state.query = params.get('q') || '';
  state.platform = params.get('platform') || 'all';
  state.condition = params.get('condition') || 'all';
  state.status = params.get('status') || 'all';
  state.notesOnly = params.get('notes') === '1';
  state.list = params.get('list') || null;
  state.sort = params.get('sort') || state.config.defaultSort || 'title';
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.view !== 'shelf') params.set('view', state.view);
  if (state.query) params.set('q', state.query);
  if (state.platform !== 'all') params.set('platform', state.platform);
  if (state.condition !== 'all') params.set('condition', state.condition);
  if (state.status !== 'all') params.set('status', state.status);
  if (state.notesOnly) params.set('notes', '1');
  if (state.view === 'lists' && state.list) params.set('list', state.list);
  if (state.sort !== (state.config.defaultSort || 'title')) params.set('sort', state.sort);
  if (state.view === 'compare' && el.cmpUrl.value.trim()) {
    params.set('with', el.cmpUrl.value.trim());
  }
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function syncControls() {
  el.search.value = state.query;
  el.sort.value = state.sort;
  el.condition.value = state.condition;
  el.status.value = state.status;
  el.notesToggle.setAttribute('aria-pressed', String(state.notesOnly));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (theme === 'auto') localStorage.removeItem('gamelog-theme');
  else localStorage.setItem('gamelog-theme', theme);
}

function currentlyDark() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* --- Wiring --------------------------------------------------------------- */

function attachEvents() {
  let debounce;
  el.search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = el.search.value;
      writeUrl();
      render();
    }, 110);
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    writeUrl();
    render();
  });

  el.condition.addEventListener('change', () => {
    state.condition = el.condition.value;
    writeUrl();
    render();
  });

  el.filtersToggle.addEventListener('click', () => el.sheet.showModal());
  el.sheetClose.addEventListener('click', () => el.sheet.close());
  el.sheetApply.addEventListener('click', () => el.sheet.close());
  el.sheet.addEventListener('click', (event) => {
    // The backdrop is the dialog element itself.
    if (event.target === el.sheet) el.sheet.close();
  });
  el.sheetClear.addEventListener('click', () => {
    clearFilters();
    writeUrl();
    render();
  });

  el.status.addEventListener('change', () => {
    state.status = el.status.value;
    writeUrl();
    render();
  });

  el.notesToggle.addEventListener('click', () => {
    state.notesOnly = !state.notesOnly;
    syncControls();
    writeUrl();
    render();
  });

  el.dice.addEventListener('click', surpriseMe);

  el.views.addEventListener('click', (event) => {
    const tab = event.target.closest('.viewtab');
    if (tab) setView(tab.dataset.view);
  });

  el.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.platform = chip.dataset.platform;
    writeUrl();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.grid.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile');
    if (tile) openDetail(Number(tile.dataset.index));
  });

  el.clear.addEventListener('click', () => {
    clearFilters();
    writeUrl();
    render();
    el.search.focus();
  });

  el.cmpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runComparison(el.cmpUrl.value);
  });

  el.dClose.addEventListener('click', closeDetail);
  el.dPrev.addEventListener('click', () => step(-1));
  el.dNext.addEventListener('click', () => step(1));

  // Clicking the backdrop (i.e. the dialog element itself) closes it.
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) closeDetail();
  });

  el.dialog.addEventListener('close', () => {
    const tile = el.grid.querySelector(`.tile[data-index="${state.openIndex}"]`);
    state.openIndex = -1;
    history.replaceState(null, '', location.pathname + location.search);
    tile?.focus();
  });

  el.themeToggle.addEventListener('click', () => {
    applyTheme(currentlyDark() ? 'light' : 'dark');
  });

  document.addEventListener('keydown', (event) => {
    if (el.dialog.open) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      return;
    }
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      el.search.focus();
      el.search.select();
    }
    if (event.key.toLowerCase() === 'r' && !typing && !event.metaKey && !event.ctrlKey) {
      surpriseMe();
    }
    if (event.key === 'Escape' && typing && event.target === el.search) {
      el.search.value = '';
      state.query = '';
      writeUrl();
      render();
    }
  });
}

/* --- Boot ----------------------------------------------------------------- */

async function boot() {
  const stored = localStorage.getItem('gamelog-theme');
  document.documentElement.dataset.theme = stored || 'auto';

  let collection;
  let config = {};
  let lists = [];
  let feed = [];
  try {
    const [collectionRes, configRes, listsRes, feedRes, platformsRes] = await Promise.all([
      fetch('data/collection.json', { cache: 'no-cache' }),
      fetch('data/config.json', { cache: 'no-cache' }).catch(() => null),
      fetch('data/lists.json', { cache: 'no-cache' }).catch(() => null),
      fetch('data/feed.json', { cache: 'no-cache' }).catch(() => null),
      fetch('data/platforms.json', { cache: 'no-cache' }).catch(() => null),
    ]);
    if (!collectionRes.ok) throw new Error(`HTTP ${collectionRes.status}`);
    collection = await collectionRes.json();
    if (configRes?.ok) config = await configRes.json();
    // Optional platform overrides, merged into the registry before anything is
    // drawn -- so a custom console gets its badge, colour and box shape too.
    if (platformsRes?.ok) {
      const parsed = await platformsRes.json().catch(() => null);
      registerPlatforms(Array.isArray(parsed) ? parsed : parsed?.platforms);
    }
    // Lists are optional -- a collection with no lists.json still works.
    if (listsRes?.ok) {
      const parsed = await listsRes.json().catch(() => null);
      if (Array.isArray(parsed?.lists)) lists = parsed.lists;
    }
    // The feed is optional too: play-through milestones fill it even with no
    // feed.json at all, so an absent file just means "no written posts".
    if (feedRes?.ok) {
      const parsed = await feedRes.json().catch(() => null);
      if (Array.isArray(parsed?.posts)) feed = parsed.posts;
    }
  } catch (err) {
    el.grid.hidden = true;
    el.empty.hidden = false;
    el.empty.replaceChildren(
      h('strong', { text: 'Could not load the collection.' }),
      h('span', { text: isLocal()
        ? 'data/collection.json is missing or unreadable. If you opened this file directly, serve it instead: npm run serve'
        : 'The collection data could not be loaded. Try refreshing in a moment.' }));
    console.error('GameLog:', err);
    return;
  }

  state.config = config;
  state.games = (collection.games || []).map((g) => ({
    ...g,
    copies: g.copies || 1,
    _index: buildSearchIndex(g),
    _sortKey: sortKey(g.title),
    _condition: conditionGroup(g.condition),
  }));
  state.hardware = collection.hardware || [];
  state.lists = lists;
  state.feed = feed;
  state.episodes = episodeNumbers(state.games);

  // Config-driven chrome.
  if (config.accent) document.documentElement.style.setProperty('--accent', config.accent);

  // The tab title names the person when there is one -- a shared link that says
  // "Annabelle's GameLog" is more use in a row of tabs than "GameLog".
  const owner = config.profile?.name;
  const siteTitle = config.title || 'GameLog';
  document.title = owner && !siteTitle.toLowerCase().includes(owner.toLowerCase())
    ? `${owner}'s ${siteTitle}`
    : siteTitle;

  el.hero.replaceChildren(renderHero(config, {
    games: state.games, hardware: state.hardware,
  }));
  if (config.footer) el.colophon.replaceChildren(...miniMarkdown(config.footer));

  readUrl();
  pruneDeadSorts();
  renderConditionOptions();
  if (!state.games.some((g) => g.notes)) el.notesToggle.remove();
  syncControls();
  // Hide the Lists tab from visitors when there are no lists to show. Locally
  // it stays, because that is where you would go to make the first one.
  if (!state.lists.length && !isLocal()) {
    el.views.querySelector('[data-view="lists"]')?.remove();
    if (state.view === 'lists') state.view = 'shelf';
  }

  // Same for the Log: a visitor sees the tab only once there is something in it,
  // which is any written post or any game marked beaten or dropped with a date.
  const hasLog = state.feed.length
    || state.games.some((g) => ['beaten', 'dropped'].includes(playStatus(g)) && g.beatenOn);
  if (!hasLog && !isLocal()) {
    el.views.querySelector('[data-view="log"]')?.remove();
    if (state.view === 'log') state.view = 'shelf';
  }

  // The Following tab needs somewhere to read from -- a shelf you follow or a
  // directory you subscribe to. Locally it stays, so the owner can see it
  // exists and go set one up on the Site tab.
  if (!followedShelves().length && !subscribedDirectories().length && !isLocal()) {
    el.views.querySelector('[data-view="following"]')?.remove();
    if (state.view === 'following') state.view = 'shelf';
  }

  placeFilters();
  phone.addEventListener('change', () => { placeFilters(); render(); });

  renderChips();
  renderFriends();
  render();
  attachEvents();

  // A #game-id in the url opens that game straight away.
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (wanted) {
    const index = state.visible.findIndex((g) => g.id === wanted);
    if (index !== -1) openDetail(index);
  }

  const withParam = new URLSearchParams(location.search).get('with');
  if (withParam && state.view === 'compare') {
    promptComparison(withParam);
  }
}

/** Links and bold only, built as nodes so nothing is ever parsed as html. */
function miniMarkdown(text) {
  const out = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(document.createTextNode(text.slice(last, match.index)));
    if (match[2]) {
      out.push(h('a', { href: match[2], target: '_blank', rel: 'noopener noreferrer',
        text: match[1] }));
    } else {
      out.push(h('strong', { text: match[3] }));
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

boot();
