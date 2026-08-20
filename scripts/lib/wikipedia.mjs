// Descriptions and release years with no signup.
//
// The pairing for libretro's art: Wikipedia supplies the words. Its action API
// takes up to 50 titles per request, so a 184-game collection costs four calls
// rather than 184 -- which matters, because the per-page REST endpoint starts
// returning 429 after about ten hits.
//
// Deliberately NOT used for cover art. Almost all game box art on Wikipedia is
// non-free content hosted under a fair-use rationale that covers the article
// itself, not reuse on someone else's site. Of a sample of ten titles here,
// nine were non-free and one was freely licensed.

import { searchableTitle } from './collection.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const BATCH = 50;
const UA = 'GameLog/1.0 (personal collection site; +https://github.com/AnnabelleChimpton/GameLog)';

/** Wikipedia disambiguates games in a handful of predictable ways. */
function candidates(title, platform) {
  const clean = searchableTitle(title);
  const out = [clean];
  if (!/^the\s/i.test(clean)) out.push(`The ${clean}`);
  out.push(`${clean} (video game)`);
  if (platform) out.push(`${clean} (${platform} video game)`);
  return [...new Set(out)];
}

async function queryTitles(titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|pageprops',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    redirects: '1',
    titles: titles.join('|'),
  });

  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
  const json = await res.json();

  const found = new Map();
  // Redirects and normalisation mean the title asked for is often not the
  // title returned, so both mappings are needed to match results back up.
  const alias = new Map();
  for (const n of json.query?.normalized || []) alias.set(n.from, n.to);
  for (const r of json.query?.redirects || []) alias.set(r.from, r.to);

  for (const page of json.query?.pages || []) {
    if (page.missing || !page.extract) continue;
    found.set(page.title, {
      title: page.title,
      extract: page.extract.replace(/\s+/g, ' ').trim(),
      wikidata: page.pageprops?.wikibase_item || null,
    });
  }
  return { found, alias };
}

/**
 * Free-text search, for adding one game interactively.
 *
 * `generator=search` feeds the search results straight into the extract
 * fetcher, so a search and its summaries cost one request rather than two.
 */
export async function searchTitles(term, { limit = 8 } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${term} video game`,
    gsrlimit: String(limit),
    prop: 'extracts|pageprops',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
  });

  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const json = await res.json();

  return (json.query?.pages || [])
    .filter((page) => page.extract)
    .map((page) => ({
      title: page.title.replace(/\s*\(video game\)$/i, ''),
      articleTitle: page.title,
      extract: page.extract.replace(/\s+/g, ' ').trim(),
      wikidata: page.pageprops?.wikibase_item || null,
      // Search returns pages in relevance order; index preserves it.
      order: page.index ?? 0,
    }))
    .filter((page) => looksRelevant(page.extract))
    .sort((a, b) => a.order - b.order);
}

/** "…is a 1995 role-playing video game…". The year is usually right there. */
export function yearFromExtract(extract) {
  const early = String(extract || '').slice(0, 220);
  const matches = [...early.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
  if (!matches.length) return null;
  // The earliest plausible year in the opening sentence is the release, not a
  // later remaster mentioned afterwards.
  return Math.min(...matches);
}

/** Reject a page that is clearly about something other than this game. */
function looksRelevant(extract) {
  return /\b(video game|game for|arcade game|role-playing|platform game|first-person|racing game)\b/i
    .test(extract);
}

/**
 * Look up many games at once.
 *
 * Returns a Map keyed by the game object, so callers don't have to re-match on
 * title. Games with no article simply don't appear in it.
 */
export async function lookupAll(games, { onProgress } = {}) {
  const results = new Map();
  // Every candidate spelling for every game, remembered so a hit on any of
  // them can be traced back to the game that wanted it.
  const wanted = new Map();
  for (const game of games) {
    for (const candidate of candidates(game.title, game.platform)) {
      if (!wanted.has(candidate)) wanted.set(candidate, []);
      wanted.get(candidate).push(game);
    }
  }

  const all = [...wanted.keys()];
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    let batch;
    try {
      batch = await queryTitles(slice);
    } catch {
      continue; // A failed batch costs those titles, not the whole run.
    }

    for (const asked of slice) {
      const resolved = batch.alias.get(asked) || asked;
      const page = batch.found.get(resolved);
      if (!page || !looksRelevant(page.extract)) continue;
      for (const game of wanted.get(asked) || []) {
        // First candidate to hit wins; they are ordered most-exact first.
        if (!results.has(game)) results.set(game, page);
      }
    }

    onProgress?.(Math.min(i + BATCH, all.length), all.length);
    // Courtesy pause; well inside what the action API tolerates.
    await new Promise((r) => setTimeout(r, 250));
  }

  return results;
}
