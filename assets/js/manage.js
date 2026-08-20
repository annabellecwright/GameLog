// The local manager UI.
//
// Talks to the small write API that `npm run manage` puts up. On a published
// GameLog those endpoints don't exist -- the fetch fails, and the page says so
// rather than pretending to save.
//
// Edits are held in memory and written on Save, so a mis-click is undone by
// reloading rather than by digging through git.

import { PLATFORMS, platformFromIgdbId, platformSortIndex, registerPlatforms } from './platforms.mjs';
import { h, coverImage, titleKey, plural, STATUSES, STATUS_LABEL, playStatus,
  HARDWARE_KINDS, KIND_LABEL, KIND_PLURAL, hardwareKind, hardwareQuantity } from './lib.js';
import { labelFor } from './profile.js';
import { resolveList } from './lists.js';

const $ = (s) => document.querySelector(s);

/**
 * Today as YYYY-MM-DD in the owner's own timezone.
 *
 * A shelf's "today" is the owner's calendar day, not UTC's -- toISOString on a
 * Western evening already reads as tomorrow, which would date a game you beat
 * tonight, or a post you just wrote, a day ahead.
 */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const API = {
  headers: { 'X-GameLog-Manage': '1', 'Content-Type': 'application/json' },
};

const state = {
  collection: { games: [], hardware: [] },
  lists: { lists: [] },
  feed: { posts: [] },
  config: {},
  igdb: false,
  tab: 'lists',
  selectedList: null,
  gameQuery: '',
  editing: null,
  dirty: new Set(),
  // Lists created this session and not yet written to disk. Their ids may still
  // follow their names; a saved list's id is frozen because links point at it.
  freshLists: new Set(),
};

/* --- Saving --------------------------------------------------------------- */

function markDirty(what) {
  state.dirty.add(what);
  $('#save').disabled = false;
  $('#dirty').hidden = false;
}

function status(message, kind = 'info') {
  const el = $('#mg-status');
  el.hidden = !message;
  el.textContent = message || '';
  el.dataset.kind = kind;
  if (message && kind !== 'error') {
    clearTimeout(status._t);
    status._t = setTimeout(() => { el.hidden = true; }, 3200);
  }
}

async function save() {
  const targets = [...state.dirty];
  if (!targets.length) return;

  $('#save').disabled = true;
  try {
    for (const what of targets) {
      const body = what === 'collection' ? state.collection
        : what === 'lists' ? state.lists
        : what === 'feed' ? state.feed
        : state.config;
      const res = await fetch(`/api/${what}`, {
        method: 'PUT', headers: API.headers, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Could not save ${what}.`);
    }
    state.dirty.clear();
    state.freshLists.clear();
    $('#dirty').hidden = true;
    status(`Saved ${targets.map((t) => `data/${t}.json`).join(' and ')}.`);
  } catch (err) {
    status(err.message, 'error');
    $('#save').disabled = false;
  }
}

/* --- Small building blocks ------------------------------------------------ */

function field(label, value, onInput, { type = 'text', placeholder = '', rows = 0 } = {}) {
  const input = rows
    ? h('textarea', { class: 'mg-input', rows: String(rows), placeholder })
    : h('input', { class: 'mg-input', type, placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value));
  return h('label', { class: 'mg-field' },
    h('span', { class: 'mg-field__label', text: label }), input);
}

function platformField(value, onChange) {
  const select = h('select', { class: 'mg-input' });
  const known = PLATFORMS.map((p) => p.key);
  // Keep an unrecognised platform selectable rather than silently rewriting it.
  const options = known.includes(value) || !value ? known : [value, ...known];
  select.append(h('option', { value: '', text: '- pick a platform -' }));
  for (const key of options) select.append(h('option', { value: key, text: key }));
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value));
  return h('label', { class: 'mg-field' },
    h('span', { class: 'mg-field__label', text: 'Platform' }), select);
}

/**
 * A compact, unlabelled platform picker whose empty choice is "Any platform".
 * For a wishlist entry, no platform is a real answer -- you'll take any version
 * -- so this is worded for that rather than as a prompt to fill something in.
 */
function platformSelect(value, onChange) {
  const select = h('select', { class: 'mg-input mg-input--slim' });
  select.append(h('option', { value: '', text: 'Any platform' }));
  const known = PLATFORMS.map((p) => p.key);
  const options = known.includes(value) || !value ? known : [value, ...known];
  for (const key of options) select.append(h('option', { value: key, text: key }));
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value || null));
  return select;
}

function iconButton(label, onClick, { danger = false, title = '' } = {}) {
  return h('button', {
    type: 'button',
    class: danger ? 'mg-mini mg-mini--danger' : 'mg-mini',
    title: title || label,
    onclick: onClick,
  }, h('span', { text: label }));
}

function thumb(game) {
  const img = coverImage(game);
  img.className = 'mg-thumb__img';
  return h('div', { class: 'mg-thumb' }, img);
}

/* --- The game picker ------------------------------------------------------ */

let pickerResolve = null;

/**
 * Which shelves a search result could plausibly go on.
 *
 * IGDB says which platforms a game was released for, so the answer is usually
 * already in the result -- asking someone to pick it out of a list of thirty
 * afterwards was throwing that away.
 */
function likelyPlatforms(candidate) {
  const fromIds = (candidate.platformIds || [])
    .map(platformFromIgdbId)
    .filter(Boolean);

  if (fromIds.length) {
    // IGDB returns platforms in no meaningful order, so the first button was
    // as likely to be a later port as the original -- Star Fox 64 offered Wii
    // ahead of Nintendo 64. Rank by how much of that platform this collection
    // already holds, since you are usually adding to a shelf you already keep,
    // and fall back to registry order (roughly chronological) to break ties.
    const owned = new Map();
    for (const game of state.collection.games) {
      owned.set(game.platform, (owned.get(game.platform) || 0) + 1);
    }
    return [...new Set(fromIds)].sort((a, b) =>
      (owned.get(b) || 0) - (owned.get(a) || 0)
      || platformSortIndex(a) - platformSortIndex(b));
  }

  // Keyless results carry no platform data, so fall back to the shelves this
  // collection already uses -- far shorter than the full registry. On a
  // brand-new shelf there are none yet, so offer a spread of common consoles
  // instead: without this the very first game you add has no shortcut buttons at
  // all, only the dropdown, which is a bare moment right when you're least sure.
  const owned = [...new Set(state.collection.games.map((g) => g.platform))].filter(Boolean);
  return owned.length ? owned.sort() : COMMON_PLATFORMS;
}

// A cross-section of the most-collected consoles, for suggesting a platform when
// the shelf is empty and there's no IGDB data to go on. The dropdown still lists
// them all; this is only the shortcut row.
const COMMON_PLATFORMS = [
  'Nintendo Switch', 'Sony PlayStation 5', 'Microsoft Xbox Series X|S', 'Sony PlayStation 4',
  'Nintendo 64', 'SNES/Super Famicom', 'Sony PlayStation', 'Sega Genesis',
];

/**
 * Step two of the picker: which platform.
 *
 * With `allowAny`, the platform is optional -- a wishlist entry can be for any
 * version of a game, so an "Any platform" choice resolves it with none.
 */
function renderPlatformStep(candidate, results, done, { allowAny = false } = {}) {
  const suggested = likelyPlatforms(candidate);

  const all = h('select', { class: 'mg-input' },
    h('option', { value: '', text: '- another platform -' }),
    ...PLATFORMS.map((p) => h('option', { value: p.key, text: p.key })));
  all.addEventListener('change', () => { if (all.value) done(all.value); });

  results.replaceChildren(
    h('p', { class: 'mg-picked' },
      h('span', { class: 'mg-picked__label', text: 'Adding' }),
      h('span', { class: 'mg-picked__name',
        text: `${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}` })),
    h('p', { class: 'mg-hint',
      text: allowAny ? 'Which platform do you want? (optional)' : 'Which platform is your copy for?' }),
    h('div', { class: 'mg-platgrid' },
      suggested.map((key) => h('button', {
        type: 'button', class: 'mg-mini mg-platpick', onclick: () => done(key),
      }, h('span', { text: key }))),
      allowAny
        ? h('button', {
            type: 'button', class: 'mg-mini mg-platpick mg-platpick--any', onclick: () => done(null),
          }, h('span', { text: 'Any platform' }))
        : null),
    all);
}

/**
 * Search your own collection and a game database at once. Picking something you
 * own produces a ref; picking anything else produces a standalone entry.
 *
 * With `needPlatform`, a second step in the same dialog asks which shelf it
 * belongs on and resolves box art for it before returning.
 */
function openPicker({ title, allowOwned = true, allowSearch = true, platform = null,
                      needPlatform = false, allowAnyPlatform = false }) {
  const dialog = $('#picker');
  const input = $('#picker-input');
  const results = $('#picker-results');
  // True once a real choice is committed. The dialog's close event resolves the
  // promise with null (for a dismissal), but the platform step closes the dialog
  // *before* awaiting box art -- so without this guard that null would settle
  // the promise first and the real pick would be lost.
  let resolving = false;
  input.value = '';
  input.placeholder = title || 'Search…';
  results.replaceChildren();
  $('#picker-hint').textContent = state.igdb || !allowSearch
    ? 'Type at least two letters.'
    : 'Type at least two letters. Without IGDB keys this searches Wikipedia and '
      + 'libretro, which cover everything except current-gen consoles.';

  let timer;
  const run = async () => {
    const term = input.value.trim();
    if (term.length < 2) { results.replaceChildren(); return; }

    const rows = [];

    if (allowOwned) {
      const key = titleKey(term);
      const owned = state.collection.games
        .filter((g) => titleKey(g.title).includes(key)
          || g.title.toLowerCase().includes(term.toLowerCase()))
        .slice(0, 6);
      for (const game of owned) {
        rows.push(h('button', {
          type: 'button', class: 'mg-result',
          onclick: () => { dialog.close(); pickerResolve?.({ kind: 'owned', game }); },
        },
          thumb(game),
          h('div', { class: 'mg-result__body' },
            h('span', { class: 'mg-result__name', text: game.title }),
            h('span', { class: 'mg-result__meta',
              text: `${game.platform}${game.year ? ` · ${game.year}` : ''}` })),
          h('span', { class: 'mg-result__tag', text: 'you own this' })));
      }
    }

    if (allowSearch) {
      const params = new URLSearchParams({ q: term });
      if (platform) params.set('platform', platform);
      const res = await fetch(`/api/search?${params}`, { headers: API.headers })
        .then((r) => r.json()).catch(() => ({ results: [] }));
      for (const found of res.results || []) {
        rows.push(h('button', {
          type: 'button', class: 'mg-result',
          onclick: () => {
            if (!needPlatform) {
              dialog.close();
              pickerResolve?.({ kind: 'new', game: found });
              return;
            }
            $('#picker-hint').textContent = '';
            renderPlatformStep(found, results, async (chosenPlatform) => {
              resolving = true;
              dialog.close();
              // Keyless art is per-platform, so it can only be resolved now.
              // The box scan is asked for even when the search already found a
              // cover: they are two different pictures for two different views,
              // and fetching both here is what stops a new game from looking
              // wrong on its console's shelf until someone runs `npm run boxart`.
              if (chosenPlatform) {
                const params = new URLSearchParams({ title: found.title, platform: chosenPlatform });
                const got = await fetch(`/api/cover?${params}`, { headers: API.headers })
                  .then((r) => r.json()).catch(() => ({}));
                if (!found.cover) found.cover = got.cover || null;
                found.boxart = got.boxart || null;
                found.boxartRatio = got.boxartRatio || null;
              }
              pickerResolve?.({ kind: 'new', game: found, platform: chosenPlatform });
            }, { allowAny: allowAnyPlatform });
          },
        },
          thumb({ cover: found.cover, platform: platform || found.platforms?.[0] }),
          h('div', { class: 'mg-result__body' },
            h('span', { class: 'mg-result__name', text: found.title }),
            h('span', { class: 'mg-result__meta',
              text: [found.year, (found.platforms || []).slice(0, 3).join(', ')]
                .filter(Boolean).join(' · ') })),
          found.derivative
            ? h('span', { class: 'mg-result__tag mg-result__tag--warn', text: 'hack / port' })
            : null));
      }
    }

    results.replaceChildren(...(rows.length
      ? rows
      : [h('p', { class: 'cmp__none', text: 'Nothing found.' })]));
  };

  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 220); };
  dialog.showModal();
  input.focus();

  return new Promise((resolve) => {
    pickerResolve = resolve;
    // Only a dismissal resolves null; a committed choice (resolving) closes the
    // dialog itself and resolves with the real value a moment later.
    dialog.addEventListener('close', () => { if (!resolving) resolve(null); }, { once: true });
  });
}

/* --- Lists tab ------------------------------------------------------------ */

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || `list-${state.lists.lists.length + 1}`;
}

function renderLists() {
  const wrap = $('#tab-lists');
  const lists = state.lists.lists;

  const picker = h('div', { class: 'mg-listbar' },
    ...lists.map((list) => h('button', {
      type: 'button', class: 'chip',
      'aria-selected': String(list.id === state.selectedList),
      onclick: () => { state.selectedList = list.id; renderLists(); },
    },
      list.wants ? h('span', { class: 'chip__wish', title: 'Wishlist', text: '★' }) : null,
      h('span', { text: list.name || list.id }),
      h('span', { class: 'chip__count', text: String(list.items?.length || 0) }))),
    h('button', {
      type: 'button', class: 'pillbutton pillbutton--accent',
      onclick: () => {
        const name = `New list ${lists.length + 1}`;
        const list = { id: slug(name), name, description: null, items: [] };
        lists.push(list);
        state.freshLists.add(list);
        state.selectedList = list.id;
        markDirty('lists');
        renderLists();
      },
    }, h('span', { text: '+ New list' })));

  if (!lists.length) {
    wrap.replaceChildren(picker, h('div', { class: 'mg-empty' },
      h('p', { text: 'No lists yet. Make one. A backlog, a wishlist, whatever you like.' })));
    return;
  }

  const list = lists.find((l) => l.id === state.selectedList) || lists[0];
  state.selectedList = list.id;
  const resolved = resolveList(list, state.collection.games);

  const idLabel = h('span', { class: 'mg-hint', text: `id: ${list.id}` });

  const meta = h('div', { class: 'mg-card' },
    h('div', { class: 'mg-row' },
      field('Name', list.name, (v) => {
        list.name = v;
        // A list's id is its deep link, so renaming an established one must not
        // quietly break every link to it. Until its first save there are no
        // links yet, so the id tracks the name instead of freezing as
        // "new-list-1" -- which is what everybody would otherwise end up with.
        if (state.freshLists.has(list)) {
          const taken = new Set(lists.filter((l) => l !== list).map((l) => l.id));
          let id = slug(v);
          let n = 2;
          while (taken.has(id)) id = `${slug(v)}-${n++}`;
          list.id = id;
          state.selectedList = id;
          idLabel.textContent = `id: ${id}`;
        }
        markDirty('lists');
      }),
      field('Description', list.description, (v) => {
        list.description = v || null; markDirty('lists');
      }, { placeholder: 'Optional' })),
    h('div', { class: 'mg-row mg-row--tight' },
      idLabel,
      h('button', {
        type: 'button',
        class: 'mg-mini',
        'aria-pressed': String(Boolean(list.wants)),
        title: 'The one list of games you are hunting',
        onclick: () => {
          const on = !list.wants;
          // One canonical wishlist: turning this on turns any other off.
          for (const l of lists) delete l.wants;
          if (on) list.wants = true;
          markDirty('lists');
          renderLists();
        },
      }, h('span', { text: list.wants ? '★ Wishlist' : 'Mark as wishlist' })),
      h('span', { class: 'mg-grow' }),
      h('span', { class: 'mg-hint',
        text: `${resolved.ownedCount} of ${resolved.total} owned` }),
      iconButton('Delete list', () => {
        if (!confirm(`Delete "${list.name}"? The games themselves are untouched.`)) return;
        state.lists.lists = lists.filter((l) => l !== list);
        state.selectedList = state.lists.lists[0]?.id || null;
        markDirty('lists');
        renderLists();
      }, { danger: true })));

  const rows = resolved.entries.map((entry, i) => {
    const { game, owned, missing } = entry;
    const item = list.items[i];

    const note = h('input', {
      class: 'mg-input mg-input--slim',
      placeholder: 'Note (optional)',
      value: item.note || '',
      oninput: (e) => { item.note = e.target.value || undefined; markDirty('lists'); },
    });

    // A game added by `ref` is a pointer at a collection entry, so its title and
    // platform belong to that game and are edited on the Games tab -- here only
    // the note is yours to change. A wanted entry stores its own title and
    // platform, so both are editable in place.
    const body = item.ref
      ? h('div', { class: 'mg-item__body' },
          h('span', { class: 'mg-item__name', text: game.title }),
          h('span', { class: 'mg-item__meta',
            text: missing ? 'broken link. No such game id'
              : `${game.platform} · in your collection` }),
          note)
      : h('div', { class: 'mg-item__body' },
          h('input', {
            class: 'mg-input mg-input--slim mg-item__title',
            placeholder: 'Title',
            value: item.title || '',
            oninput: (e) => { item.title = e.target.value; markDirty('lists'); },
          }),
          h('div', { class: 'mg-item__edit' },
            platformSelect(item.platform, (v) => {
              item.platform = v; markDirty('lists'); renderLists();
            }),
            h('span', { class: 'mg-item__meta',
              text: owned ? 'you own a copy' : 'not owned yet' })),
          note);

    return h('div', { class: owned ? 'mg-item' : 'mg-item mg-item--wanted' },
      thumb(game),
      body,
      h('div', { class: 'mg-item__acts' },
        iconButton('↑', () => {
          if (i === 0) return;
          [list.items[i - 1], list.items[i]] = [list.items[i], list.items[i - 1]];
          markDirty('lists'); renderLists();
        }, { title: 'Move up' }),
        iconButton('↓', () => {
          if (i === list.items.length - 1) return;
          [list.items[i + 1], list.items[i]] = [list.items[i], list.items[i + 1]];
          markDirty('lists'); renderLists();
        }, { title: 'Move down' }),
        iconButton('Remove', () => {
          list.items.splice(i, 1); markDirty('lists'); renderLists();
        }, { danger: true })));
  });

  const addButton = h('button', {
    type: 'button', class: 'pillbutton pillbutton--accent mg-add',
    onclick: async () => {
      // A game you own is pinned by ref, so its platform is already fixed. One
      // you don't own is stored by title, and the platform is what says which
      // version you want -- so the picker asks, with "any" allowed.
      const picked = await openPicker({
        title: 'Add a game to this list', needPlatform: true, allowAnyPlatform: true,
      });
      if (!picked) return;
      if (picked.kind === 'owned') {
        list.items.push({ ref: picked.game.id });
      } else {
        const g = picked.game;
        list.items.push({
          title: g.title, platform: picked.platform || null, year: g.year, cover: g.cover,
          description: g.description, genres: g.genres, developer: g.developer,
          publisher: g.publisher, igdbId: g.igdbId,
        });
      }
      markDirty('lists');
      renderLists();
    },
  }, h('span', { text: '+ Add a game' }));

  wrap.replaceChildren(picker, meta,
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'This list is empty.' })),
    addButton);
}

/* --- Games tab ------------------------------------------------------------ */

/**
 * Scroll a freshly added or edited game into view and flash it.
 *
 * Alphabetical order can drop a new entry anywhere in a list of hundreds, so
 * without this you are told something was added and shown no evidence of it.
 * The highlight matters as much as the scroll: landing mid-list with no marker
 * leaves you working out which row is yours.
 */
function revealGame(id) {
  // After renderGames() the row exists but has not been laid out, so measuring
  // or scrolling in the same frame lands in the wrong place.
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-game-id="${CSS.escape(id)}"]`);
    if (!row) return;

    // Align the top, not the centre. A row whose editor is open is around a
    // thousand pixels tall, so centring it pushes the header carrying the
    // game's name off the top of the screen and you land in the middle of a
    // form with nothing saying what it belongs to. scroll-margin-top in the
    // stylesheet keeps it clear of the sticky header.
    row.scrollIntoView({ block: 'start', behavior: 'smooth' });

    row.classList.remove('is-new');
    // Reading offsetWidth forces the class removal to take effect before it is
    // re-added, or the animation would not restart on a second add.
    void row.offsetWidth;
    row.classList.add('is-new');
    setTimeout(() => row.classList.remove('is-new'), 2200);
  });
}

/**
 * Getting box art onto a game that has none.
 *
 * Four ways in, because the answer depends on where the picture is: drop a file,
 * pick one, paste an image straight off the clipboard, or paste the address of
 * one you found. All four end the same way, with the file saved into
 * assets/covers and the path filled in, so nobody has to know where it went.
 *
 * A pasted address is downloaded rather than linked. Hotlinking works right up
 * until the day somebody else deletes their file.
 */
function coverPicker(game, { field: imageField = 'cover', label = 'cover' } = {}) {
  const preview = h('div', { class: 'mg-cover__art' });
  const origin = h('p', { class: 'mg-cover__origin' });

  // Replacing a cover reuses the same filename, so the browser would keep
  // showing the old one. The buster lives on this element only, never in the
  // stored path, which has to stay a plain relative path.
  let bust = 0;

  const paintPreview = () => {
    if (!game[imageField]) {
      preview.replaceChildren(h('span', { class: 'mg-cover__none', text: 'no art' }));
      return;
    }
    const img = coverImage({ cover: game[imageField], platform: game.platform });
    img.className = 'mg-cover__img';
    if (bust && !/^https?:/i.test(game[imageField])) {
      img.src = `${game[imageField]}?v=${bust}`;
    }
    preview.replaceChildren(img);
  };

  /**
   * Say where this cover actually lives.
   *
   * The box downloads what you give it; the url field below stores whatever you
   * type. Both are reasonable, since most covers here are IGDB links and
   * downloading hundreds of them would bloat the repo for nothing. But the
   * difference was invisible, so it is spelled out, with one click to change it.
   */
  const paintOrigin = () => {
    const cover = game[imageField] || '';
    if (!cover) { origin.replaceChildren(); return; }

    if (!/^https?:\/\//i.test(cover)) {
      origin.replaceChildren(h('span', { class: 'mg-hint', text: `Stored in your repo at ${cover}` }));
      return;
    }

    let host = cover;
    try { host = new URL(cover).hostname.replace(/^www\./, ''); } catch { /* keep the raw value */ }
    origin.replaceChildren(
      h('span', { class: 'mg-hint', text: `Linked from ${host}, not stored here. ` }),
      h('button', {
        type: 'button', class: 'mg-linkbtn',
        onclick: () => send({ url: game[imageField] }, 'a copy'),
      }, h('span', { text: 'Save a local copy' })));
  };

  const paint = () => { paintPreview(); paintOrigin(); };
  paint();

  const zone = h('div', {
    class: 'mg-cover__zone', tabindex: '0', role: 'button',
    'aria-label': `Choose a ${label} image for ${game.title || game.name}`,
  },
    h('span', {},
      h('span', { class: 'mg-cover__lead', text: 'Drop an image here, or ' }),
      h('span', { class: 'mg-cover__link', text: 'choose a file' })));

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'mg-file' });
  zone.append(fileInput);

  const send = async (payload, what) => {
    try {
      status(`Saving ${what}…`);
      const res = await fetch('/api/cover', {
        method: 'PUT', headers: API.headers,
        body: JSON.stringify({ id: game.id, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save that image.');
      game[imageField] = json.path;
      markDirty('collection');
      bust = Date.now();
      paint();
      // Games and hardware live on different tabs, so the picker is told how
      // to redraw rather than assuming which list it belongs to.
      if (imageField === 'cover') renderGames(); else renderHardware();
      status(`Image saved to ${json.path} (${Math.round(json.bytes / 1024)} KB).`);
    } catch (err) {
      status(err.message, 'error');
    }
  };

  const fromFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      status('That is not an image file.', 'error');
      return;
    }
    send({ dataUrl: await downscaleImage(file, 600) }, 'image');
  };

  fileInput.addEventListener('change', () => fromFile(fileInput.files?.[0]));
  zone.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, () => zone.classList.remove('is-over'));
  }
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) { fromFile(file); return; }
    // Dragging an image between browser tabs hands over a url, not a file.
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text');
    if (url) send({ url: url.trim() }, 'linked image');
  });

  zone.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); fromFile(item.getAsFile()); return; }
    const text = e.clipboardData?.getData('text')?.trim();
    if (text && /^https?:\/\//i.test(text)) { e.preventDefault(); send({ url: text }, 'linked image'); }
  });

  // A visible field for the link case.
  //
  // The drop zone opens a file dialog when clicked, so pasting into it was only
  // possible by tabbing for focus first and pressing ctrl-V, which is not a
  // thing anyone would find. A link needs somewhere to actually put it.
  const urlInput = h('input', {
    class: 'mg-input mg-cover__url', type: 'url',
    placeholder: 'or paste a link to an image and download it',
    'aria-label': 'Download a cover image from a link',
  });
  const grab = () => {
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    send({ url }, 'linked image').then(() => { urlInput.value = ''; });
  };
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); grab(); }
  });
  const grabButton = h('button', {
    type: 'button', class: 'mg-mini', onclick: grab,
  }, h('span', { text: 'Download' }));

  const node = h('div', {},
    h('div', { class: 'mg-cover' }, preview, zone),
    h('div', { class: 'mg-cover__urlrow' }, urlInput, grabButton),
    origin);
  // The url field below edits the same value, so it needs to redraw this.
  node.refresh = paint;
  return node;
}

function gameEditor(game) {
  const cover = coverPicker(game);
  const set = (key) => (v) => {
    game[key] = v === '' ? null : v;
    markDirty('collection');
  };

  return h('div', { class: 'mg-card mg-editor' },
    h('div', { class: 'mg-editor__head' },
      thumb(game),
      h('div', { class: 'mg-grow' },
        field('Title', game.title, (v) => { game.title = v; markDirty('collection'); }),
        platformField(game.platform, async (v) => {
          game.platform = v;
          markDirty('collection');
          // Keyless art is chosen per platform, so a game added before a
          // platform was picked can only get its cover at this moment.
          if ((!game.cover || !game.boxart) && v) {
            const params = new URLSearchParams({ title: game.title, platform: v });
            if (game.region) params.set('region', game.region);
            const found = await fetch(`/api/cover?${params}`, { headers: API.headers })
              .then((r) => r.json()).catch(() => ({}));
            if (found.cover && !game.cover) game.cover = found.cover;
            if (found.boxart) {
              game.boxart = found.boxart;
              game.boxartRatio = found.boxartRatio ?? null;
            }
            if (found.cover || found.boxart) {
              // Same rule as adding: art found for you goes into the repo now.
              if (game.id) await storeArtFor(game);
              status('Found box art for that platform, and stored it.');
              renderGames();
            }
          }
        })),
      iconButton('Delete', () => {
        if (!confirm(`Remove "${game.title}" from your collection?`)) return;
        state.collection.games = state.collection.games.filter((g) => g !== game);
        state.editing = null;
        markDirty('collection');
        renderGames();
      }, { danger: true })),

    // The play-through fields sit first: while a project is running these are
    // the only ones being edited, and the catalogue metadata is already done.
    h('div', { class: 'mg-track' },
      h('div', { class: 'mg-row mg-row--tight' },
        h('span', { class: 'mg-field__label', text: 'Status' }),
        ...['unplayed', ...STATUSES].map((key) => h('button', {
          type: 'button',
          class: playStatus(game) === key ? 'mg-mini mg-statuspick is-on' : 'mg-mini mg-statuspick',
          onclick: () => {
            game.status = key === 'unplayed' ? null : key;
            // Finishing something usually happens today, so fill the date in
            // rather than making it a second chore.
            if (key === 'beaten' && !game.beatenOn) {
              game.beatenOn = todayIso();
            }
            if (key === 'unplayed') { game.beatenOn = null; }
            markDirty('collection');
            renderGames();
          },
        }, h('span', { text: STATUS_LABEL[key] })))),
      h('div', { class: 'mg-row' },
        field('Date beaten', game.beatenOn, (v) => {
          game.beatenOn = v || null; markDirty('collection');
        }, { type: 'date' }),
        field('Episode link', game.video, (v) => {
          game.video = v || null; markDirty('collection');
        }, { placeholder: 'https://youtube.com/watch?v=...' })),
      field('Verdict', game.verdict, (v) => {
        game.verdict = v || null; markDirty('collection');
      }, { rows: 2, placeholder: 'Your one-line take, shown on the game\'s page' })),

    h('div', { class: 'mg-row' },
      field('Year', game.year ?? '', (v) => {
        game.year = v ? Number(v) : null; markDirty('collection');
      }, { type: 'number' }),
      field('Condition', game.condition, set('condition'),
        { placeholder: 'CIB, Loose, Boxed, New…' }),
      field('Copies', game.copies ?? 1, (v) => {
        game.copies = Math.max(1, Number(v) || 1); markDirty('collection');
      }, { type: 'number' })),

    h('div', { class: 'mg-row' },
      field('Developer', game.developer, set('developer')),
      field('Publisher', game.publisher, set('publisher'))),

    h('div', { class: 'mg-row' },
      field('Region', game.region, set('region'), { placeholder: 'USA, JP, PAL…' }),
      field('Edition', game.release, set('release'), { placeholder: 'Demo, Not For Resale…' }),
      field('Metascore', game.metacritic ?? '', (v) => {
        game.metacritic = v ? Number(v) : null; markDirty('collection');
      }, { type: 'number' })),

    field('Genres (comma separated)', (game.genres || []).join(', '), (v) => {
      game.genres = v.split(',').map((s) => s.trim()).filter(Boolean);
      markDirty('collection');
    }),
    cover,
    field('Cover image path or url', game.cover, (v) => { set('cover')(v); cover.refresh(); },
      { placeholder: 'https://…  or  assets/covers/foo.jpg' }),
    field('Description', game.description, set('description'), { rows: 4 }),
    field('Your note', game.notes, set('notes'),
      { rows: 2, placeholder: 'Anything personal: where it came from, what state it\'s in' }));
}

function renderGames() {
  const wrap = $('#tab-games');
  const term = state.gameQuery.trim().toLowerCase();
  const games = term
    ? state.collection.games.filter((g) =>
        g.title.toLowerCase().includes(term) || g.platform.toLowerCase().includes(term))
    : state.collection.games;

  const search = h('div', { class: 'mg-listbar mg-listbar--sticky' },
    h('input', {
      class: 'cmp__input', type: 'search', placeholder: 'Filter your games…',
      value: state.gameQuery,
      oninput: (e) => { state.gameQuery = e.target.value; renderGames(); },
    }),
    h('span', { class: 'mg-hint', text: `${games.length} of ${plural(state.collection.games.length, 'game')}` }),
    h('span', { class: 'mg-grow' }),
    h('button', {
      type: 'button', class: 'pillbutton pillbutton--accent',
      onclick: async () => {
        const picked = await openPicker({
          title: 'Add a game you own', allowOwned: false, needPlatform: true,
        });
        if (!picked || !picked.platform) return;
        const g = picked.game;
        const game = {
          id: '', title: g.title, platform: picked.platform, year: g.year, cover: g.cover,
          description: g.description, genres: g.genres || [], developer: g.developer,
          publisher: g.publisher, region: null, release: null, condition: null,
          copies: 1, metacritic: null, notes: null,
          added: todayIso(),
          boxart: g.boxart ?? null, boxartRatio: g.boxartRatio ?? null,
          igdbId: g.igdbId ?? null, wikidataId: g.wikidataId ?? null,
        };
        game.id = uniqueGameId(game);
        await storeArtFor(game);
        state.collection.games.push(game);
        state.collection.games.sort((a, b) =>
          a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
        state.editing = game.id;
        // Keep the whole list and go to the new entry, rather than filtering
        // down to it. Seeing it land in alphabetical order among everything
        // else is the point: it confirms it is really in the collection.
        state.gameQuery = '';
        markDirty('collection');
        renderGames();
        revealGame(game.id);
        status(`Added ${game.title}: ${game.platform}.`)
      },
    }, h('span', { text: '+ Add a game' })));

  const rows = games.slice(0, 400).map((game) => {
    const open = state.editing === game.id;
    return h('div', { class: 'mg-gamerow', dataset: { gameId: game.id } },
      h('button', {
        type: 'button',
        class: open ? 'mg-gamerow__head is-open' : 'mg-gamerow__head',
        onclick: () => { state.editing = open ? null : game.id; renderGames(); },
      },
        thumb(game),
        h('div', { class: 'mg-item__body' },
          h('span', { class: 'mg-item__name', text: game.title }),
          h('span', { class: 'mg-item__meta',
            // Status goes in the collapsed row too, so a long list stays
            // scannable during a play-through without opening every entry.
            text: [game.platform || '⚠ no platform', game.year, game.condition,
              playStatus(game) === 'unplayed' ? null : STATUS_LABEL[playStatus(game)]]
              .filter(Boolean).join(' · ') })),
        h('span', { class: 'mg-hint', text: open ? '−' : 'edit' })),
      open ? gameEditor(game) : null);
  });

  wrap.replaceChildren(search,
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'Nothing matches.' })),
    games.length > 400
      ? h('p', { class: 'mg-hint', text: 'Showing the first 400: narrow the filter to see more.' })
      : null);
}

function uniqueGameId(game) {
  const base = `${game.platform || 'game'}-${game.title}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const taken = new Set(state.collection.games.map((g) => g.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/* --- Hardware tab --------------------------------------------------------- */

function renderHardware() {
  const wrap = $('#tab-hardware');
  const items = state.collection.hardware;

  const rows = items.map((item, i) => {
    const photo = coverPicker(item, { field: 'image', label: 'photo' });
    return h('div', { class: 'mg-card' },
      h('div', { class: 'mg-row' },
        field('Name', item.name, (v) => { item.name = v; markDirty('collection'); }),
        platformField(item.platform, (v) => { item.platform = v; markDirty('collection'); })),

      h('div', { class: 'mg-row mg-row--tight' },
        h('span', { class: 'mg-field__label', text: 'Kind' }),
        ...HARDWARE_KINDS.map((kind) => h('button', {
          type: 'button',
          class: hardwareKind(item) === kind ? 'mg-mini mg-statuspick is-on' : 'mg-mini mg-statuspick',
          onclick: () => {
            // console is the default, so storing it would be noise in the file.
            item.kind = kind === 'console' ? null : kind;
            markDirty('collection');
            renderHardware();
          },
        }, h('span', { text: KIND_LABEL[kind] })))),

      h('div', { class: 'mg-row' },
        field('How many', String(hardwareQuantity(item)), (v) => {
          const n = Math.max(1, Math.floor(Number(v) || 1));
          item.quantity = n > 1 ? n : null;
          markDirty('collection');
        }, { type: 'number' }),
        field('Condition', item.condition, (v) => {
          item.condition = v || null; markDirty('collection');
        })),

      photo,
      field('Photo path or url', item.image, (v) => {
        item.image = v || null; markDirty('collection'); photo.refresh();
      }),
      field('Note', item.notes, (v) => {
        item.notes = v || null; markDirty('collection');
      }),

      h('div', { class: 'mg-row' },
        h('span', { class: 'mg-grow' }),
        iconButton('Remove', () => {
          items.splice(i, 1); markDirty('collection'); renderHardware();
        }, { danger: true })));
  });

  const counts = HARDWARE_KINDS
    .map((kind) => {
      const n = items.filter((x) => hardwareKind(x) === kind)
        .reduce((sum, x) => sum + hardwareQuantity(x), 0);
      // "memory and expansion" does not take an s, so use the proper plurals.
      return n ? `${n} ${n === 1 ? KIND_LABEL[kind].toLowerCase() : KIND_PLURAL[kind]}` : null;
    })
    .filter(Boolean);

  wrap.replaceChildren(
    h('div', { class: 'mg-listbar' },
      h('span', { class: 'mg-hint', text: counts.join(' · ') || 'Nothing yet' }),
      h('span', { class: 'mg-grow' }),
      h('button', {
        type: 'button', class: 'pillbutton pillbutton--accent',
        onclick: () => {
          items.push({ id: `hardware-${Date.now()}`, name: 'New item', kind: null,
            platform: '', quantity: null, image: null, condition: null, notes: null });
          markDirty('collection'); renderHardware();
        },
      }, h('span', { text: '+ Add hardware' }))),
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'No hardware listed.' })));
}

/* --- Site tab ------------------------------------------------------------- */

/**
 * Pull a newly added game's art into the repo straight away.
 *
 * The id only exists once the game is built, and the filename is the id, so
 * this is the first moment the download can happen. Doing it here rather than
 * leaving it for the backup button is the difference between a collection that
 * owns its pictures and one that owns them whenever somebody remembers.
 *
 * Quiet on failure: the entry keeps its link, which still displays, and both
 * the Site tab and the publish dialog will say it is still linked.
 */
async function storeArtFor(game) {
  const jobs = [['cover', game.cover], ['boxart', game.boxart]]
    .filter(([, url]) => /^https?:\/\//i.test(String(url ?? '')));
  if (!jobs.length) return;

  await Promise.all(jobs.map(async ([field, url]) => {
    try {
      const res = await fetch('/api/cover', {
        method: 'PUT', headers: API.headers,
        body: JSON.stringify({ id: game.id, url, field }),
      });
      const json = await res.json();
      if (res.ok && json.path) game[field] = json.path;
    } catch { /* keep the link: the backup card will offer it again */ }
  }));
}

/* --- Artwork backup ------------------------------------------------------- */

/**
 * How much of the collection's art is a link to somebody else's server.
 *
 * Counted here rather than asked for, so the card is right the moment you add
 * a game rather than after a round trip.
 */
function artCounts() {
  const remote = (url) => /^https?:\/\//i.test(String(url ?? ''));
  let total = 0;
  let linked = 0;
  const bump = (url) => { if (url) { total += 1; if (remote(url)) linked += 1; } };
  for (const game of state.collection.games) { bump(game.cover); bump(game.boxart); }
  for (const item of state.collection.hardware) bump(item.image);
  return { total, linked };
}

/**
 * Download every linked image into the repo.
 *
 * The server reads and writes data/collection.json itself, so anything unsaved
 * here would be overwritten by the next save. Rather than merging two versions
 * of the truth, this saves first and reloads afterwards.
 */
async function backupArt(button) {
  const { linked } = artCounts();
  if (!linked) { status('Every image is already stored in your repo.'); return; }

  if (state.dirty.size) await save();
  if (state.dirty.size) return; // The save failed and already said so.

  button.disabled = true;
  const previous = button.textContent;
  button.textContent = `Downloading ${linked}…`;
  status(`Downloading ${plural(linked, 'image')}. This can take a minute.`);

  try {
    const res = await fetch('/api/vendor', { method: 'POST', headers: API.headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Could not download the artwork.');

    // Adopt what the server wrote, or the next save would put the links back.
    const fresh = await fetch('/api/state', { headers: API.headers }).then((r) => r.json());
    state.collection = fresh.collection?.games ? fresh.collection : state.collection;
    state.collection.hardware = state.collection.hardware || [];

    const stored = `Stored ${plural(json.stored, 'image')}, ${(json.bytes / 1024 / 1024).toFixed(1)} MB.`;
    status(json.failed.length
      ? `${stored} ${plural(json.failed.length, 'image')} could not be downloaded and `
        + 'kept the link: try again, or replace them by hand.'
      : `${stored} Your art is all in the repo now.`,
      json.failed.length ? 'warn' : 'info');
    renderTab();
  } catch (err) {
    status(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

function artCard() {
  const { total, linked } = artCounts();
  const button = h('span', {
    text: linked ? `Download ${plural(linked, 'image')}` : 'Nothing to download',
  });
  const go = h('button', {
    type: 'button', class: linked ? 'pillbutton pillbutton--accent' : 'pillbutton',
    onclick: () => backupArt(button),
  }, button);
  go.disabled = !linked;

  return h('div', { class: 'mg-card' },
    h('h2', { class: 'mg-card__title', text: 'Artwork backup' }),
    h('p', { class: 'mg-hint',
      text: linked
        ? `${linked} of your ${total} images ${linked === 1 ? 'is a link' : 'are links'} to `
          + 'other sites. A link works until the day that site reorganises, and then the '
          + 'art is gone with no copy of your own. Downloading them puts every picture in '
          + 'your repo, where it is yours and it is published with the rest of the site.'
        : `All ${total} of your images are stored in your repo. Nothing here `
          + 'depends on anybody else staying online.' }),
    go);
}

function renderSite() {
  const wrap = $('#tab-site');
  const config = state.config;
  const set = (key) => (v) => { config[key] = v === '' ? null : v; markDirty('config'); };

  const accent = h('input', { class: 'mg-color', type: 'color' });
  accent.value = /^#[0-9a-f]{6}$/i.test(config.accent || '') ? config.accent : '#f0a04b';
  accent.addEventListener('input', () => {
    config.accent = accent.value;
    document.documentElement.style.setProperty('--accent', accent.value);
    markDirty('config');
  });

  const friends = Array.isArray(config.friends) ? config.friends : (config.friends = []);
  const directories = Array.isArray(config.directories)
    ? config.directories : (config.directories = []);

  wrap.replaceChildren(
    artCard(),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Identity' }),
      h('div', { class: 'mg-row' },
        field('Site title', config.title, set('title')),
        h('label', { class: 'mg-field mg-field--narrow' },
          h('span', { class: 'mg-field__label', text: 'Accent colour' }), accent)),
      field('Tagline', config.tagline, set('tagline')),
      field('Published address', config.siteUrl, set('siteUrl'),
        { placeholder: 'https://you.github.io/GameLog' }),
      h('p', { class: 'mg-hint',
        text: 'Used for the link preview card when someone shares your page: '
          + 'an absolute address is the only kind a crawler can resolve an image from.' }),
      field('Footer', config.footer, set('footer'),
        { rows: 2, placeholder: 'Markdown links and **bold** work here' }),
      h('label', { class: 'mg-check' },
        (() => {
          const box = h('input', { type: 'checkbox' });
          box.checked = config.showHardware !== false;
          box.addEventListener('change', () => {
            config.showHardware = box.checked; markDirty('config');
          });
          return box;
        })(),
        h('span', { text: 'Show the hardware section on the site' }))),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Shelves you follow' }),
      h('p', { class: 'mg-hint',
        text: 'One-click buttons on Compare, and the source of the Following river '
          + 'and its friends-of-friends suggestions.' }),
      h('div', { class: 'mg-items' },
        friends.map((friend, i) => h('div', { class: 'mg-row mg-row--tight' },
          field('Name', friend.name, (v) => { friend.name = v; markDirty('config'); }),
          field('Address', friend.url, (v) => { friend.url = v; markDirty('config'); },
            { placeholder: 'https://someone.github.io/GameLog/' }),
          iconButton('Remove', () => {
            friends.splice(i, 1); markDirty('config'); renderSite();
          }, { danger: true })))),
      h('button', {
        type: 'button', class: 'pillbutton',
        onclick: () => { friends.push({ name: '', url: '' }); markDirty('config'); renderSite(); },
      }, h('span', { text: '+ Add a shelf' }))),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Directories' }),
      h('p', { class: 'mg-hint',
        text: 'A directory is a shared, published list of GameLog shelves. Subscribe '
          + 'to one and its shelves appear as suggestions on Following, so you can '
          + 'find people without knowing their address first.' }),
      h('div', { class: 'mg-items' },
        directories.map((url, i) => h('div', { class: 'mg-row mg-row--tight' },
          field('Directory address', url, (v) => { directories[i] = v; markDirty('config'); },
            { placeholder: 'https://someone.github.io/ring/directory.json' }),
          iconButton('Remove', () => {
            directories.splice(i, 1); markDirty('config'); renderSite();
          }, { danger: true })))),
      h('button', {
        type: 'button', class: 'pillbutton',
        onclick: () => { directories.push(''); markDirty('config'); renderSite(); },
      }, h('span', { text: '+ Subscribe to a directory' }))));
}


/* --- Profile tab ---------------------------------------------------------- */

/**
 * Shrink a chosen photo in the browser before it is ever uploaded.
 *
 * A phone photo is several megabytes and would sit in the git history forever
 * at full size, for something rendered at 120px. 512px on the long edge is
 * plenty for both the header avatar and the About page.
 */
function downscaleImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image this can read.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        // PNG keeps transparency; everything else is smaller as JPEG.
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderProfileTab() {
  const wrap = $('#tab-profile');
  const profile = state.config.profile || (state.config.profile = {});
  const links = Array.isArray(profile.links) ? profile.links : (profile.links = []);
  const set = (key) => (v) => { profile[key] = v === '' ? null : v; markDirty('config'); };

  const preview = h('div', { class: 'mg-avatar' });
  const paint = () => {
    if (profile.photo) {
      const img = h('img', { src: `${profile.photo}?t=${Date.now()}`, alt: '' });
      img.addEventListener('error', () => {
        preview.replaceChildren(h('span', { class: 'mg-avatar__none', text: 'not found' }));
      }, { once: true });
      preview.replaceChildren(img);
    } else {
      preview.replaceChildren(h('span', { class: 'mg-avatar__none', text: 'no photo' }));
    }
  };
  paint();

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'mg-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      status('Resizing…');
      const dataUrl = await downscaleImage(file);
      const res = await fetch('/api/photo', {
        method: 'PUT', headers: API.headers, body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      profile.photo = json.path;
      markDirty('config');
      paint();
      status(`Photo saved to ${json.path} (${Math.round(json.bytes / 1024)} KB). `
        + 'Press Save to point your profile at it.');
    } catch (err) {
      status(err.message, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  wrap.replaceChildren(
    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'About you' }),
      h('p', { class: 'mg-hint',
        text: 'All optional. Leave it empty and the About tab never appears on your site.' }),
      h('div', { class: 'mg-profilehead' },
        preview,
        h('div', { class: 'mg-grow' },
          field('Your name', profile.name, set('name'),
            { placeholder: 'Shown at the top of the About page' }),
          h('div', { class: 'mg-row mg-row--tight' },
            h('label', { class: 'mg-mini mg-file__label' },
              h('span', { text: 'Choose a photo…' }), fileInput),
            profile.photo
              ? iconButton('Remove photo', () => {
                  profile.photo = null; markDirty('config'); paint(); renderProfileTab();
                }, { danger: true })
              : null),
          h('p', { class: 'mg-hint',
            text: 'Resized to 512px before saving, so it stays small in your repo.' }))),
      field('About', profile.about, set('about'),
        { rows: 6,
          placeholder: 'A few lines about you and what you collect. Blank lines make '
            + 'paragraphs; [links](https://example.com) and **bold** work.' }),
      field('Photo path or url', profile.photo, set('photo'),
        { placeholder: 'assets/profile/avatar.jpg, or paste any image url' })),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Links' }),
      h('p', { class: 'mg-hint',
        text: 'GitHub, Twitch, Bluesky, Mastodon, YouTube and mailto: get their own icon. '
          + 'Anything else gets a globe. Leave the label blank to use the address.' }),
      h('div', { class: 'mg-items' },
        links.map((link, i) => h('div', { class: 'mg-row mg-row--tight' },
          field('Label', link.label, (v) => { link.label = v || null; markDirty('config'); },
            { placeholder: labelFor(link.url || '') || 'Optional' }),
          field('Address', link.url, (v) => { link.url = v; markDirty('config'); },
            { placeholder: 'https://…  or  mailto:you@example.com' }),
          iconButton('Remove', () => {
            links.splice(i, 1); markDirty('config'); renderProfileTab();
          }, { danger: true })))),
      h('button', {
        type: 'button', class: 'pillbutton',
        onclick: () => { links.push({ label: '', url: '' }); markDirty('config'); renderProfileTab(); },
      }, h('span', { text: '+ Add a link' }))));
}

/* --- Publishing ----------------------------------------------------------- */

const STATE_WORDS = { M: 'changed', A: 'added', D: 'deleted', R: 'renamed', '??': 'new' };

async function openPublisher() {
  const dialog = $('#publisher');
  const body = $('#pub-body');
  const where = $('#pub-where');
  const status = $('#pub-status');
  status.hidden = true;
  $('#pub-go').disabled = false;

  body.replaceChildren(h('p', { class: 'mg-hint', text: 'Checking…' }));
  dialog.showModal();

  const git = await fetch('/api/git', { headers: API.headers })
    .then((r) => r.json()).catch(() => null);

  if (!git?.isRepo) {
    where.textContent = '';
    body.replaceChildren(h('p', { class: 'cmp__none',
      text: 'This folder is not a git repository, so there is nothing to publish to.' }));
    $('#pub-go').disabled = true;
    return;
  }

  where.textContent = git.remote
    ? `${git.branch} → ${git.remote.replace(/^https:\/\/[^@]*@/, 'https://')}`
    : `${git.branch}. No remote set`;

  const parts = [];

  if (state.dirty.size) {
    parts.push(h('p', { class: 'mg-pub__warn',
      text: 'You have unsaved edits. Save them first, or they will not be included.' }));
  }

  // Publishing is the moment linked art matters: from here on, the site is
  // being read by people whose browsers have to reach that other server too.
  const art = artCounts();
  if (art.linked) {
    parts.push(h('p', { class: 'mg-pub__warn',
      text: `${art.linked} of your ${art.total} images ${art.linked === 1 ? 'is' : 'are'} `
        + 'hotlinked rather than stored in your repo. Your site will publish fine, but '
        + 'that art is not yours to keep. The Site tab has a one-click backup.' }));
  }

  if (git.mine.length) {
    parts.push(h('p', { class: 'mg-field__label', text: 'Will be published' }));
    parts.push(h('ul', { class: 'mg-pub__files' },
      git.mine.map((c) => h('li', {},
        h('span', { class: 'mg-pub__state', text: STATE_WORDS[c.state] || c.state }),
        h('span', { text: c.path })))));
  } else if (git.unpushed > 0) {
    parts.push(h('p', { class: 'mg-hint',
      text: `No new edits, but ${plural(git.unpushed, 'commit')} have never been pushed.` }));
  } else {
    parts.push(h('p', { class: 'cmp__none', text: 'Nothing to publish: everything is up to date.' }));
    $('#pub-go').disabled = true;
  }

  if (git.others.length) {
    parts.push(h('p', { class: 'mg-field__label', text: 'Left alone' }));
    parts.push(h('ul', { class: 'mg-pub__files mg-pub__files--muted' },
      git.others.map((c) => h('li', {},
        h('span', { class: 'mg-pub__state', text: STATE_WORDS[c.state] || c.state }),
        h('span', { text: c.path })))));
    parts.push(h('p', { class: 'mg-hint',
      text: 'The manager only publishes what it edits. Handle these in git yourself.' }));
  }

  if (!git.remote) $('#pub-go').disabled = true;
  body.replaceChildren(...parts);
}

async function doPublish() {
  const status = $('#pub-status');
  $('#pub-go').disabled = true;
  status.hidden = false;
  status.dataset.kind = 'info';
  status.textContent = 'Publishing…';

  try {
    const res = await fetch('/api/publish', {
      method: 'POST', headers: API.headers,
      body: JSON.stringify({ message: $('#pub-message').value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Publish failed.');
    status.dataset.kind = 'info';
    status.textContent = `${json.summary}  Your site updates in a minute or so.`;
    $('#pub-message').value = '';
  } catch (err) {
    status.dataset.kind = 'error';
    status.textContent = err.message;
    $('#pub-go').disabled = false;
  }
}

/* --- Updates tab ---------------------------------------------------------- */

/** A url-safe, deep-linkable id from a post's date and title. */
function postId(post, taken) {
  const base = `${String(post.date || '').slice(0, 10)}-${post.title}`
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || String(post.date || 'post');
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Freeze an id once the post has a title, the way a saved list's id is frozen. */
function ensurePostId(post) {
  if (post.id || !post.title.trim()) return;
  const taken = new Set(state.feed.posts.map((p) => p.id).filter(Boolean));
  post.id = postId(post, taken);
}

function renderUpdates() {
  const wrap = $('#tab-updates');
  const posts = state.feed.posts;
  const byId = new Map(state.collection.games.map((g) => [g.id, g]));

  const add = h('button', {
    type: 'button', class: 'mg-mini mg-mini--add',
    onclick: () => {
      posts.unshift({ id: null, date: todayIso(), title: '', body: '', ref: null });
      markDirty('feed');
      renderUpdates();
    },
  }, h('span', { text: '+ Write a post' }));

  const head = h('div', { class: 'mg-listbar' },
    h('span', { class: 'mg-listbar__label', text: plural(posts.length, 'post') }),
    add);

  // Newest first, matching how the log reads. Play-through milestones are added
  // by the site itself, so they are not editable here -- this is the hint.
  const ordered = [...posts].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)));

  const cards = ordered.map((post) => {
    const linked = post.ref ? byId.get(post.ref) : null;

    const attach = post.ref
      ? h('div', { class: 'mg-postgame' },
          linked ? thumb(linked) : null,
          h('span', { class: 'mg-postgame__name',
            text: linked ? linked.title : `${post.ref} (not in collection)` }),
          iconButton('Detach', () => { post.ref = null; markDirty('feed'); renderUpdates(); },
            { title: 'Remove the linked game' }))
      : h('button', {
          type: 'button', class: 'mg-mini',
          onclick: async () => {
            const picked = await openPicker({
              title: 'Attach a game you own', allowOwned: true, allowSearch: false });
            if (picked?.kind === 'owned' && picked.game?.id) {
              post.ref = picked.game.id;
              markDirty('feed');
              renderUpdates();
            }
          },
        }, h('span', { text: 'Attach a game' }));

    return h('div', { class: 'mg-postcard' },
      h('div', { class: 'mg-postcard__row' },
        field('Title', post.title, (v) => {
          post.title = v; ensurePostId(post); markDirty('feed');
        }, { placeholder: 'Finally found a boxed Halo' }),
        field('Date', post.date, (v) => { post.date = v; markDirty('feed'); },
          { type: 'date' })),
      field('Body', post.body, (v) => { post.body = v; markDirty('feed'); },
        { rows: 3, placeholder: 'Blank lines make paragraphs. **bold** and [links](https://…) work.' }),
      h('div', { class: 'mg-postcard__foot' },
        attach,
        iconButton('Delete', () => {
          const i = posts.indexOf(post);
          if (i !== -1) posts.splice(i, 1);
          markDirty('feed');
          renderUpdates();
        }, { danger: true })));
  });

  const hint = h('p', { class: 'mg-hint',
    text: 'Games you mark beaten or dropped on the Games tab appear in the log on '
      + 'their own, with their date — you don\'t need a post for those.' });

  wrap.replaceChildren(head, hint,
    ...(cards.length ? cards : [h('p', { class: 'cmp__none', text: 'No posts yet.' })]));
}

/* --- Tabs and boot -------------------------------------------------------- */


function renderTab() {
  for (const tab of $('#mg-tabs').children) {
    tab.setAttribute('aria-current', String(tab.dataset.tab === state.tab));
  }
  $('#tab-lists').hidden = state.tab !== 'lists';
  $('#tab-games').hidden = state.tab !== 'games';
  $('#tab-hardware').hidden = state.tab !== 'hardware';
  $('#tab-updates').hidden = state.tab !== 'updates';
  $('#tab-profile').hidden = state.tab !== 'profile';
  $('#tab-site').hidden = state.tab !== 'site';

  if (state.tab === 'lists') renderLists();
  else if (state.tab === 'games') renderGames();
  else if (state.tab === 'hardware') renderHardware();
  else if (state.tab === 'updates') renderUpdates();
  else if (state.tab === 'profile') renderProfileTab();
  else renderSite();
}

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem('gamelog-theme') || 'auto';

  let data;
  try {
    const res = await fetch('/api/state', { headers: API.headers });
    if (!res.ok) throw new Error('no api');
    data = await res.json();
  } catch {
    // No local server: this is the published copy, or `npm run serve` rather
    // than `npm run manage`.
    $('#mg-offline').hidden = false;
    document.querySelector('.mg-main').hidden = true;
    document.querySelector('.mg-top__actions').hidden = true;
    document.querySelector('#mg-tabs').hidden = true;
    return;
  }

  // Optional platform overrides, so the platform pickers and badges here match
  // the site. The server already merged them for its own IGDB mapping.
  try {
    const res = await fetch('data/platforms.json', { cache: 'no-cache' });
    if (res.ok) {
      const parsed = await res.json();
      registerPlatforms(Array.isArray(parsed) ? parsed : parsed?.platforms);
    }
  } catch { /* no overrides */ }

  state.collection = data.collection?.games ? data.collection : { games: [], hardware: [] };
  state.collection.hardware = state.collection.hardware || [];
  state.lists = data.lists?.lists ? data.lists : { lists: [] };
  state.feed = data.feed?.posts ? data.feed : { posts: [] };
  state.config = data.config || {};
  state.igdb = Boolean(data.igdb);
  state.selectedList = state.lists.lists[0]?.id || null;

  if (state.config.accent) {
    document.documentElement.style.setProperty('--accent', state.config.accent);
  }

  $('#mg-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.viewtab');
    if (tab) { state.tab = tab.dataset.tab; renderTab(); }
  });

  $('#save').addEventListener('click', save);
  $('#publish').addEventListener('click', openPublisher);
  $('#pub-go').addEventListener('click', doPublish);
  $('#pub-cancel').addEventListener('click', () => $('#publisher').close());

  $('#theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark'
      || (root.dataset.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    localStorage.setItem('gamelog-theme', root.dataset.theme);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      save();
    }
  });

  // Losing edits to a stray tab close is a bad way to learn about the Save button.
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty.size) { event.preventDefault(); event.returnValue = ''; }
  });

  if (!state.igdb) {
    status('No IGDB keys in .env. You can still edit everything, but searching for '
      + 'games you don\'t own is unavailable.', 'warn');
  }

  renderTab();
}

boot();
