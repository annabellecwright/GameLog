// One-time importer: a Gameye CSV export -> data/collection.json
//
//   npm run import:gameye                    # reads data/gameye-export.csv
//   npm run import:gameye -- path/to/it.csv
//
// This only seeds the collection. Once it has run you edit collection.json
// directly, or use `npm run add "Some Game"`. You never need this again.
//
// Pricing columns are deliberately dropped -- the site never shows money.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadCollection, saveCollection, makeId, uniqueId } from './lib/collection.mjs';

const MISSING = new Set(['', '?', 'missing field', '-1.0', 'n/a', 'null']);

/** RFC 4180 CSV parser: handles quoted fields, embedded commas, "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* ignore, \n handles the break */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (v) => {
  const s = String(v ?? '').trim();
  return MISSING.has(s.toLowerCase()) ? null : s;
};

const list = (v) => {
  const s = clean(v);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

const REGIONS = {
  'united states of america': 'USA',
  'united kingdom': 'UK',
  japan: 'JP',
  europe: 'EU',
  world: 'World',
  canada: 'CA',
  australia: 'AU',
};

const region = (v) => {
  const s = clean(v);
  if (!s) return null;
  return REGIONS[s.toLowerCase()] || s;
};

/** "Oct 8, 2024" -> "2024-10-08" */
const addedDate = (v) => {
  const s = clean(v);
  if (!s) return null;
  const d = new Date(`${s} UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const metacritic = (v) => {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

/** Group key for spotting the same game listed twice on the same platform. */
const dedupeKey = (platform, title) =>
  `${platform}|||${title.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

async function main() {
  const arg = process.argv[2];
  const csvPath = arg ? (arg.startsWith('/') ? arg : join(process.cwd(), arg))
                      : join(ROOT, 'data', 'gameye-export.csv');

  let text;
  try {
    text = await readFile(csvPath, 'utf8');
  } catch {
    console.error(`Could not read ${csvPath}`);
    console.error('Pass the path explicitly:  npm run import:gameye -- ~/Downloads/export.csv');
    process.exit(1);
  }

  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const header = rows.shift().map((h) => h.trim());
  const col = (r, name) => {
    const i = header.indexOf(name);
    return i === -1 ? '' : r[i];
  };

  const gameGroups = new Map();
  const hardware = [];
  let skipped = 0;

  for (const r of rows) {
    const platform = clean(col(r, 'Platform'));
    const title = clean(col(r, 'Title'));
    if (!platform || !title) { skipped += 1; continue; }

    const category = (clean(col(r, 'Category')) || 'Games').toLowerCase();
    const releaseType = clean(col(r, 'ReleaseType'));
    const shared = {
      platform,
      region: region(col(r, 'Country')),
      release: releaseType && releaseType.toLowerCase() !== 'official' ? releaseType : null,
      condition: clean(col(r, 'Ownership')),
      notes: clean(col(r, 'Notes')) || null,
      added: addedDate(col(r, 'CreatedAt')),
    };

    if (category === 'systems' || category === 'hardware' || category === 'accessories') {
      hardware.push({
        name: title,
        // Gameye separates systems from accessories, so keep that rather than
        // flattening everything into one undifferentiated pile.
        kind: category === 'accessories' ? 'accessory' : null,
        quantity: null,
        year: null,
        image: null,
        description: null,
        manufacturer: clean(col(r, 'Publisher')),
        ...shared,
      });
      continue;
    }

    const key = dedupeKey(platform, title);
    const existing = gameGroups.get(key);
    if (existing) {
      existing.copies += 1;
      if (shared.condition && !existing._conditions.includes(shared.condition)) {
        existing._conditions.push(shared.condition);
      }
      if (shared.notes && !existing.notes) existing.notes = shared.notes;
      else if (shared.notes && existing.notes && !existing.notes.includes(shared.notes)) {
        existing.notes = `${existing.notes} · ${shared.notes}`;
      }
      // Keep the earliest acquisition date.
      if (shared.added && (!existing.added || shared.added < existing.added)) {
        existing.added = shared.added;
      }
      continue;
    }

    gameGroups.set(key, {
      title,
      year: null,          // filled in by `npm run enrich`
      cover: null,         //   "
      description: null,   //   "
      genres: list(col(r, 'Genre')),
      developer: clean(col(r, 'Developer')),
      publisher: clean(col(r, 'Publisher')),
      copies: 1,
      metacritic: metacritic(col(r, 'metacritic')),
      _conditions: shared.condition ? [shared.condition] : [],
      ...shared,
    });
  }

  const taken = new Set();
  const games = [...gameGroups.values()]
    .map((g) => {
      const { _conditions, ...rest } = g;
      const id = uniqueId(makeId(g.platform, g.title), taken);
      taken.add(id);
      return { id, ...rest, condition: _conditions.join(', ') || null };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));

  const hardwareOut = hardware
    .map((h) => {
      const id = uniqueId(makeId(h.platform, h.name), taken);
      taken.add(id);
      return { id, ...h };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  // Preserve any enrichment already done, so re-importing is not destructive.
  const previous = await loadCollection();
  const priorById = new Map(previous.games.map((g) => [g.id, g]));
  for (const g of games) {
    const before = priorById.get(g.id);
    if (!before) continue;
    for (const field of ['cover', 'description', 'year', 'igdbId']) {
      if (before[field] != null && g[field] == null) g[field] = before[field];
    }
  }
  const priorHw = new Map(previous.hardware.map((h) => [h.id, h]));
  for (const h of hardwareOut) {
    const before = priorHw.get(h.id);
    if (!before) continue;
    for (const field of ['image', 'description', 'year']) {
      if (before[field] != null && h[field] == null) h[field] = before[field];
    }
  }

  await saveCollection({ games, hardware: hardwareOut });

  const merged = games.filter((g) => g.copies > 1);
  const platforms = new Set(games.map((g) => g.platform));

  console.log(`Imported ${games.length} games and ${hardwareOut.length} hardware items`);
  console.log(`  across ${platforms.size} platforms`);
  if (merged.length) {
    console.log(`  merged ${merged.length} duplicate title(s):`);
    for (const g of merged) console.log(`    ${g.title} (${g.platform}) ×${g.copies}`);
  }
  if (skipped) console.log(`  skipped ${skipped} unusable row(s)`);
  console.log('\nNext:  npm run enrich    (adds cover art, descriptions and release years)');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
