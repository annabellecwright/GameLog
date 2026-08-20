// One-game lookup with no credentials, shaped like the IGDB search result so
// that `npm run add` and the manager's picker can use either interchangeably.
//
// Wikipedia finds the game and describes it; libretro supplies the box art once
// a platform is known. Art is only ever resolved for a platform, because that
// is what selects which scanned set to look in.

import { searchTitles, yearFromExtract } from './wikipedia.mjs';
import { findCover, libretroDir } from './libretro.mjs';

/** Trim an extract to something that reads as a blurb rather than an article. */
function blurb(text) {
  const clean = String(text || '').trim();
  if (clean.length <= 600) return clean || null;
  const cut = clean.slice(0, 600);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > 300 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/**
 * Search for a game without any API key.
 *
 * Returns the same fields the IGDB path produces, minus the ones no keyless
 * source has: genres and companies come back empty rather than guessed at.
 */
export async function searchFree(term, { platform = null, limit = 8, region = 'USA' } = {}) {
  const pages = await searchTitles(term, { limit });

  return Promise.all(pages.map(async (page) => ({
    title: page.title,
    year: yearFromExtract(page.extract),
    description: blurb(page.extract),
    cover: platform ? await findCover(page.title, platform, { region }) : null,
    genres: [],
    developer: null,
    publisher: null,
    wikidataId: page.wikidata,
    platforms: [],
    derivative: false,
  })));
}

/** True when this platform has any keyless art behind it at all. */
export const hasFreeArt = (platform) => Boolean(platform && libretroDir(platform));

/**
 * Resolve art for a title already decided on -- used after the platform is
 * picked, since search may have run before one was chosen.
 */
export async function coverFor(title, platform, { region = 'USA' } = {}) {
  if (!hasFreeArt(platform)) return null;
  return findCover(title, platform, { region });
}
