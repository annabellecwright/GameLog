// The stats view: the collection as a portrait rather than a list.
//
// Every chart here does the same job -- compare magnitude across categories --
// so every chart is a bar in a single hue. Identity is carried by the label
// beside each bar (and a platform dot where one exists), never by colour alone,
// which is why a ten-platform chart needs no ten-colour palette.

import { platformInfo, platformSortIndex } from './platforms.mjs';
import { h, tally, attachTip, conditionGroup, CONDITION_ORDER, plural,
  hardwareCounts, hardwareKind, hardwareQuantity, KIND_PLURAL } from './lib.js';

/** One horizontal bar row: label, bar, value. */
function barRow(label, value, max, { dot = null, tip = null } = {}) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  const bar = h('div', { class: 'bar__fill', style: `width:${pct.toFixed(2)}%` });
  const track = h('div', { class: 'bar__track' }, bar);

  const row = h('div', { class: 'bar', tabindex: '0', role: 'listitem' },
    h('span', { class: 'bar__label' },
      dot ? h('span', { class: 'bar__dot', style: `--dot:${dot}` }) : null,
      h('span', { class: 'bar__labeltext', text: label })),
    track,
    h('span', { class: 'bar__value', text: String(value) }));

  attachTip(row, () => tip || `${label}: ${value}`);
  return row;
}

function barChart(title, rows, { note = null } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return h('section', { class: 'panel' },
    h('h3', { class: 'panel__title', text: title }),
    note ? h('p', { class: 'panel__note', text: note }) : null,
    h('div', { class: 'bars', role: 'list' },
      rows.map((r) => barRow(r.label, r.value, max, { dot: r.dot, tip: r.tip }))));
}

/** Vertical columns, for data with a natural left-to-right order. */
function columnChart(title, rows, { note = null } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0);

  const columns = rows.map((r) => {
    const pct = max > 0 ? (r.value / max) * 100 : 0;
    const col = h('div', { class: 'col', tabindex: '0', role: 'listitem' },
      h('span', { class: 'col__value', text: r.value ? String(r.value) : '' }),
      h('div', { class: 'col__track' },
        h('div', { class: 'col__fill', style: `height:${Math.max(pct, r.value ? 2 : 0).toFixed(2)}%` })),
      h('span', { class: 'col__label', text: r.label }));
    attachTip(col, () => r.tip || `${r.label}: ${r.value}`);
    return col;
  });

  return h('section', { class: 'panel' },
    h('h3', { class: 'panel__title', text: title }),
    note ? h('p', { class: 'panel__note', text: note }) : null,
    h('div', { class: 'cols', role: 'list' }, columns));
}

function statTile(value, label, sub = null) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__value', text: value }),
    h('span', { class: 'stat__label', text: label }),
    sub ? h('span', { class: 'stat__sub', text: sub }) : null);
}

/** A compact ranked list -- better than a fifth bar chart. */
function rankList(title, entries, { note = null } = {}) {
  return h('section', { class: 'panel' },
    h('h3', { class: 'panel__title', text: title }),
    note ? h('p', { class: 'panel__note', text: note }) : null,
    h('ol', { class: 'ranks' },
      entries.map((e, i) => h('li', { class: 'rank' },
        h('span', { class: 'rank__num', text: String(i + 1) }),
        h('span', { class: 'rank__name', text: e.label }),
        h('span', { class: 'rank__value', text: e.value })))));
}

export function renderStats(games, hardware, { filtered = false, total = 0 } = {}) {
  const withYear = games.filter((g) => g.year);
  const years = withYear.map((g) => g.year).sort((a, b) => a - b);
  const rated = games.filter((g) => typeof g.metacritic === 'number');
  const copies = games.reduce((sum, g) => sum + (g.copies || 1), 0);
  const platforms = new Set(games.map((g) => g.platform));

  const hw = hardwareCounts(hardware);

  const avgScore = rated.length
    ? (rated.reduce((s, g) => s + g.metacritic, 0) / rated.length).toFixed(1)
    : '-';

  /* Headline numbers. A row of stat tiles, not a chart -- these are single
     values and a bar chart of five unrelated numbers says nothing. */
  // Say plainly what is being counted, or a filtered page looks like a wrong
  // total rather than a deliberate subset.
  const scope = filtered
    ? h('p', { class: 'stats__scope',
        text: `Describing ${games.length} of ${total} games, matching the current filter.` })
    : null;

  const kpis = h('div', { class: 'stats__kpis' },
    statTile(String(games.length), 'games', copies > games.length ? `${copies} copies` : null),
    statTile(String(platforms.size), 'platforms',
      hw.console ? plural(hw.console, 'console') : null),
    statTile(years.length ? `${years[0]}-${years[years.length - 1]}` : '-', 'years covered',
      years.length ? `median ${years[Math.floor(years.length / 2)]}` : null),
    statTile(String(avgScore), 'avg metascore',
      rated.length ? `across ${rated.length} rated` : null));

  const panels = [];

  /* Decades. Ordered bins, so columns rather than bars. Empty decades between
     the first and last are kept so gaps in a collection stay visible. */
  if (withYear.length) {
    const counts = new Map();
    for (const g of withYear) counts.set(Math.floor(g.year / 10) * 10, (counts.get(Math.floor(g.year / 10) * 10) || 0) + 1);
    const first = Math.min(...counts.keys());
    const last = Math.max(...counts.keys());
    const rows = [];
    for (let d = first; d <= last; d += 10) {
      rows.push({ label: `${String(d).slice(2)}s`, value: counts.get(d) || 0,
        tip: `${d}s: ${plural(counts.get(d) || 0, 'game')}` });
    }
    const peak = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);
    panels.push(columnChart('By decade released', rows, {
      note: `Heaviest in the ${peak.label}: ${plural(peak.value, 'game')}.`,
    }));
  }

  /* Platforms. Registry order, so consoles read chronologically by maker.
     Pointless once filtered to one platform: a chart of a single bar. */
  const byPlatform = tally(games, (g) => g.platform)
    .sort((a, b) => platformSortIndex(a[0]) - platformSortIndex(b[0]));
  if (byPlatform.length > 1) {
    panels.push(barChart('By platform',
      byPlatform.map(([name, count]) => ({
        label: name,
        value: count,
        dot: platformInfo(name).color,
        tip: `${name}: ${plural(count, 'game')}`,
      }))));
  }

  /* Genres. Long tail, so the top ten and an explicit note about the rest. */
  const genres = tally(games, (g) => g.genres);
  if (genres.length) {
    const top = genres.slice(0, 10);
    const rest = genres.length - top.length;
    panels.push(barChart('Most common genres',
      top.map(([name, count]) => ({ label: name, value: count,
        tip: `${name}: ${plural(count, 'game')}` })),
      { note: rest > 0 ? `Showing the top ${top.length} of ${genres.length}; ${rest} more not charted. Games count once per genre they carry.` : 'Games count once per genre they carry.' }));
  }

  /* Metascores, bucketed by ten. */
  if (rated.length) {
    const buckets = new Map();
    for (const g of rated) {
      const b = Math.min(Math.floor(g.metacritic / 10) * 10, 90);
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const lowest = Math.min(...buckets.keys());
    const rows = [];
    for (let b = lowest; b <= 90; b += 10) {
      rows.push({ label: `${b}s`, value: buckets.get(b) || 0,
        tip: `Scored ${b}-${b + 9}: ${plural(buckets.get(b) || 0, 'game')}` });
    }
    panels.push(columnChart('Metascore spread', rows, {
      note: `${rated.length} of ${games.length} games carry a score.`,
    }));
  }

  /* Condition, using the derived buckets rather than the raw strings. */
  const conditions = tally(games, (g) => conditionGroup(g.condition));
  if (conditions.length > 1) {
    conditions.sort((a, b) => CONDITION_ORDER.indexOf(a[0]) - CONDITION_ORDER.indexOf(b[0]));
    panels.push(barChart('By condition',
      conditions.map(([name, count]) => ({ label: name, value: count,
        tip: `${name}: ${plural(count, 'game')}` })),
      { note: 'Grouped from however you wrote it: "CIB+" and "CIB" count together.' }));
  }

  /* Hardware, but only once it is more than a list of consoles. */
  const kindsPresent = Object.entries(hw)
    .filter(([key, n]) => KIND_PLURAL[key] && n > 0);
  if (kindsPresent.length > 1) {
    panels.push(barChart('Hardware',
      kindsPresent.map(([key, n]) => ({
        label: KIND_PLURAL[key].replace(/^./, (c) => c.toUpperCase()),
        value: n,
        tip: `${n} ${KIND_PLURAL[key]}`,
      })),
      { note: 'Counting how many you own, not how many rows there are.' }));
  }

  /* Ranked lists, where a chart would add nothing. */
  const devs = tally(games, (g) => g.developer).filter(([, n]) => n > 1).slice(0, 8);
  if (devs.length) {
    panels.push(rankList('Developers you own most',
      devs.map(([name, count]) => ({ label: name, value: String(count) }))));
  }

  if (rated.length >= 6) {
    const sorted = [...rated].sort((a, b) => b.metacritic - a.metacritic);
    panels.push(h('section', { class: 'panel panel--split' },
      h('div', {},
        h('h3', { class: 'panel__title', text: 'Best reviewed' }),
        h('ol', { class: 'ranks' },
          sorted.slice(0, 5).map((g, i) => h('li', { class: 'rank' },
            h('span', { class: 'rank__num', text: String(i + 1) }),
            h('span', { class: 'rank__name', text: g.title }),
            h('span', { class: 'rank__value', text: String(g.metacritic) }))))),
      h('div', {},
        h('h3', { class: 'panel__title', text: 'Worst reviewed' }),
        h('ol', { class: 'ranks' },
          sorted.slice(-5).reverse().map((g, i) => h('li', { class: 'rank' },
            h('span', { class: 'rank__num', text: String(i + 1) }),
            h('span', { class: 'rank__name', text: g.title }),
            h('span', { class: 'rank__value', text: String(g.metacritic) })))))));
  }

  return h('div', { class: 'stats' }, scope, kpis, h('div', { class: 'stats__grid' }, panels));
}
