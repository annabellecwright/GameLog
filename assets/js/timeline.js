// The timeline view: the collection laid out by release year.
//
// Only years you own something in get a row -- an empty 1987 tells you nothing,
// and 40 blank rows would bury the years that matter. Decade headings carry the
// continuity instead, and a gap of two or more silent years is called out
// explicitly so the holes in a collection stay visible.

import { platformInfo } from './platforms.mjs';
import { h, coverImage, plural, isLocal } from './lib.js';

export function renderTimeline(games, { onOpen }) {
  const dated = games.filter((g) => g.year);
  const undated = games.filter((g) => !g.year);

  if (!dated.length) {
    return h('p', { class: 'empty' },
      h('strong', { text: 'No release years yet.' }),
      h('span', { text: isLocal()
        ? 'Run `npm run enrich` to fill them in, and this view fills itself.'
        : 'This view needs release years, which none of these games have yet.' }));
  }

  const byYear = new Map();
  for (const game of dated) {
    if (!byYear.has(game.year)) byYear.set(game.year, []);
    byYear.get(game.year).push(game);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const rows = [];
  let lastDecade = null;

  years.forEach((year, i) => {
    const decade = Math.floor(year / 10) * 10;
    if (decade !== lastDecade) {
      rows.push(h('h3', { class: 'era', id: `era-${decade}` }, `${decade}s`));
      lastDecade = decade;
    }

    // Call out a real gap, but only between years we actually have.
    const previous = years[i - 1];
    if (previous && year - previous > 1) {
      const missing = year - previous - 1;
      rows.push(h('p', { class: 'gap', text: `nothing from ${plural(missing, 'year')}` }));
    }

    const games_ = byYear.get(year).sort((a, b) => a._sortKey.localeCompare(b._sortKey, 'en'));

    rows.push(h('div', { class: 'yearrow' },
      h('div', { class: 'yearrow__year' },
        h('span', { class: 'yearrow__num', text: String(year) }),
        h('span', { class: 'yearrow__count', text: String(games_.length) })),
      h('div', { class: 'yearrow__games' },
        games_.map((game) => {
          const info = platformInfo(game.platform);
          const img = coverImage(game);
          img.className = 'minitile__cover';

          const tile = h('button', {
            type: 'button',
            class: game.cover ? 'minitile' : 'minitile minitile--noart',
            title: `${game.title}: ${game.platform}`,
            'aria-label': `${game.title}, ${year}, ${game.platform}`,
            onclick: () => onOpen(game),
          },
            img,
            h('span', { class: 'minitile__badge', style: `--badge-color:${info.color}`, text: info.short }),
            h('span', { class: 'minitile__name', text: game.title }));
          return tile;
        }))));
  });

  if (undated.length) {
    rows.push(h('p', { class: 'gap gap--end',
      text: `${plural(undated.length, 'game')} with no release year yet, not shown above.` }));
  }

  return h('div', { class: 'timeline' }, rows);
}
