// Pure-data tests. No DOM, no network, no dependencies: `node --test`.
//
// These cover the invariants that actually broke during development, not the
// ones that are obviously true. Each case here corresponds to something that
// went wrong or nearly did.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeId, uniqueId, searchableTitle } from '../scripts/lib/collection.mjs';
import { platformInfo, platformSortIndex, platformFromIgdbId } from '../assets/js/platforms.mjs';
import {
  fold, sortKey, titleKey, conditionGroup, safeImageUrl,
  playStatus, episodeNumbers, progressOf,
  hardwareKind, hardwareQuantity, hardwareCounts,
} from '../assets/js/lib.js';

/* --- ids and titles ------------------------------------------------------- */

test('makeId is url-safe and folds punctuation', () => {
  assert.equal(makeId('Nintendo 64', 'GoldenEye 007'), 'nintendo-64-goldeneye-007');
  // An apostrophe becomes a separator rather than vanishing, so this reads
  // "don-t". Tidier would be "dont", but ids are filenames for cover art and
  // targets for list refs, so changing this would rename existing files and
  // break saved lists. The behaviour is pinned here deliberately.
  assert.equal(makeId('3DO', "Plumbers Don't Wear Ties"), '3do-plumbers-don-t-wear-ties');
  // & has to survive as a word or two different games collapse to one id.
  assert.equal(makeId('3DO', 'Advanced Dungeons & Dragons'),
    '3do-advanced-dungeons-and-dragons');
});

test('makeId strips diacritics rather than dropping the character', () => {
  assert.equal(makeId('Nintendo Switch', 'Pokémon Shield'), 'nintendo-switch-pokemon-shield');
});

test('uniqueId suffixes instead of overwriting', () => {
  const taken = new Set(['a-game']);
  assert.equal(uniqueId('a-game', taken), 'a-game-2');
  taken.add('a-game-2');
  assert.equal(uniqueId('a-game', taken), 'a-game-3');
  assert.equal(uniqueId('other', taken), 'other');
});

test('searchableTitle drops bracketed edition wording', () => {
  assert.equal(searchableTitle("Luigi's Mansion [Player's Choice]"), "Luigi's Mansion");
  assert.equal(searchableTitle('Metroid Dread [Special Edition]'), 'Metroid Dread');
  assert.equal(searchableTitle('Lord of the Rings: The Return of the King (Player\'s Choice)'),
    'Lord of the Rings: The Return of the King');
});

/* --- search and matching -------------------------------------------------- */

test('fold makes accents and punctuation searchable', () => {
  assert.equal(fold('Pokémon Shield'), 'pokemon shield');
  assert.equal(fold("Plumbers Don't Wear Ties"), 'plumbers don t wear ties');
});

test('sortKey files a leading article under the real word', () => {
  assert.equal(sortKey('The Legend of Zelda'), 'legend of zelda');
  assert.equal(sortKey('A Link to the Past'), 'link to the past');
});

test('titleKey matches the same game across two collections', () => {
  // Gameye writes "Legend of Zelda", other exports write "The Legend of Zelda".
  assert.equal(titleKey('The Legend of Zelda: Ocarina of Time'),
    titleKey('Legend of Zelda: Ocarina of Time'));
  assert.notEqual(titleKey('Mario Kart 64'), titleKey('Mario Kart 8'));
});

/* --- conditions ----------------------------------------------------------- */

test('conditionGroup buckets the ten spellings one export produced', () => {
  assert.equal(conditionGroup('CIB'), 'CIB');
  assert.equal(conditionGroup('CIB+'), 'CIB');
  assert.equal(conditionGroup('CIB+, CIB'), 'CIB');
  assert.equal(conditionGroup('Boxed+'), 'Boxed');
  assert.equal(conditionGroup('Loose+'), 'Loose');
  assert.equal(conditionGroup('New'), 'New');
  assert.equal(conditionGroup('Sealed'), 'New');
  assert.equal(conditionGroup('B+'), 'Other');
  assert.equal(conditionGroup(null), null);
  assert.equal(conditionGroup(''), null);
});

/* --- untrusted input ------------------------------------------------------ */

test('safeImageUrl refuses anything that is not an image reference', () => {
  assert.equal(safeImageUrl('https://images.igdb.com/a.jpg'), 'https://images.igdb.com/a.jpg');
  assert.equal(safeImageUrl('assets/covers/x.jpg'), 'assets/covers/x.jpg');
  assert.ok(safeImageUrl('data:image/png;base64,AAA'));
  // Cover urls can arrive from someone else's collection over the network.
  assert.equal(safeImageUrl('javascript:alert(1)'), null);
  assert.equal(safeImageUrl('data:text/html,<script>'), null);
  assert.equal(safeImageUrl(null), null);
  assert.equal(safeImageUrl(42), null);
});

/* --- platforms ------------------------------------------------------------ */

test('platformInfo invents a stable label for an unknown platform', () => {
  assert.equal(platformInfo('Nintendo 64').short, 'N64');
  const a = platformInfo('Bandai WonderSwan');
  const b = platformInfo('Bandai WonderSwan');
  assert.equal(a.short, 'BW');
  assert.equal(a.color, b.color, 'colour must not change between calls');
  assert.ok(platformInfo(null).short);
});

test('platformFromIgdbId maps ids, which is how the picker suggests a shelf', () => {
  assert.equal(platformFromIgdbId(4), 'Nintendo 64');
  assert.equal(platformFromIgdbId(19), 'SNES/Super Famicom');
  assert.equal(platformFromIgdbId(999999), null);
});

test('platformSortIndex puts known platforms before unknown ones', () => {
  assert.ok(platformSortIndex('Nintendo 64') < platformSortIndex('Some Fake Console'));
});

/* --- play tracking -------------------------------------------------------- */

test('playStatus treats anything unrecognised as unplayed', () => {
  assert.equal(playStatus({}), 'unplayed');
  assert.equal(playStatus({ status: 'beaten' }), 'beaten');
  assert.equal(playStatus({ status: 'nonsense' }), 'unplayed');
});

test('episodeNumbers count in the order games were finished, not listed', () => {
  const games = [
    { title: 'Later', status: 'beaten', beatenOn: '2026-03-01' },
    { title: 'First', status: 'beaten', beatenOn: '2026-01-01' },
    { title: 'Unplayed' },
    { title: 'Dropped', status: 'dropped' },
  ];
  const eps = episodeNumbers(games);
  assert.equal(eps.get(games[1]), 1, 'earliest beatenOn is episode 1');
  assert.equal(eps.get(games[0]), 2);
  assert.equal(eps.get(games[2]), undefined, 'unplayed games get no episode');
  assert.equal(eps.get(games[3]), undefined, 'dropped games get no episode');
});

test('progressOf counts dropped as settled but reports it separately', () => {
  const p = progressOf([
    { status: 'beaten' }, { status: 'beaten' }, { status: 'dropped' }, {}, {},
  ]);
  assert.equal(p.total, 5);
  assert.equal(p.beaten, 2);
  assert.equal(p.dropped, 1);
  assert.equal(p.done, 3);
  assert.equal(p.unplayed, 2);
  assert.equal(p.pct, 60);
});

/* --- hardware ------------------------------------------------------------- */

test('hardware written before kinds existed is still a console', () => {
  assert.equal(hardwareKind({ name: 'Nintendo 64 System' }), 'console');
  assert.equal(hardwareKind({ kind: 'controller' }), 'controller');
  assert.equal(hardwareKind({ kind: 'nonsense' }), 'accessory');
});

test('hardwareQuantity refuses nonsense rather than showing it', () => {
  assert.equal(hardwareQuantity({}), 1);
  assert.equal(hardwareQuantity({ quantity: 4 }), 4);
  assert.equal(hardwareQuantity({ quantity: 0 }), 1);
  assert.equal(hardwareQuantity({ quantity: -2 }), 1);
  assert.equal(hardwareQuantity({ quantity: 'lots' }), 1);
});

test('hardwareCounts sums quantity, so four controllers are not one', () => {
  const counts = hardwareCounts([
    { name: 'N64' },
    { name: 'Pad', kind: 'controller', quantity: 4 },
    { name: 'Card', kind: 'memory' },
  ]);
  assert.equal(counts.console, 1);
  assert.equal(counts.controller, 4);
  assert.equal(counts.total, 6);
  // The bug this prevents: peripherals counted as consoles on the front page.
  assert.equal(counts.peripherals, 5);
});
