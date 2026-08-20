// A small IGDB client.
//
// IGDB authenticates through Twitch: you exchange a client id + secret for an
// app access token, then send both on every request. Tokens last ~60 days but
// we just fetch a fresh one per run -- it's a single extra request.
//
// Rate limit is 4 requests/second, so every call goes through a throttle.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, searchableTitle } from './collection.mjs';
import { platformInfo } from '../../assets/js/platforms.mjs';

const API = 'https://api.igdb.com/v4';
const MIN_REQUEST_GAP_MS = 260; // ~3.8 req/s, just under the documented limit

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** Read .env without pulling in a dependency. Real env vars win. */
export async function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const raw = await readFile(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '').trim();
    }
  }
  const id = process.env.IGDB_CLIENT_ID;
  const secret = process.env.IGDB_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      'Missing IGDB credentials.\n\n' +
        '  1. cp .env.example .env\n' +
        '  2. Fill in IGDB_CLIENT_ID and IGDB_CLIENT_SECRET\n' +
        '     (free, ~2 minutes: https://dev.twitch.tv/console/apps)\n'
    );
  }
  return { id, secret };
}

export async function getToken({ id, secret }) {
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', id);
  url.searchParams.set('client_secret', secret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Could not get a Twitch access token (HTTP ${res.status}).\n` +
        `Check IGDB_CLIENT_ID / IGDB_CLIENT_SECRET in your .env.\n${body}`
    );
  }
  const json = await res.json();
  return json.access_token;
}

export function createClient({ id, token }) {
  return async function query(endpoint, body) {
    await throttle();
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': id,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body,
    });
    if (res.status === 429) {
      // Backed off harder than the throttle expected; wait and retry once.
      await new Promise((r) => setTimeout(r, 1500));
      return query(endpoint, body);
    }
    if (!res.ok) {
      throw new Error(`IGDB ${endpoint} failed (HTTP ${res.status}): ${await res.text()}`);
    }
    return res.json();
  };
}

const FIELDS =
  'fields name, summary, storyline, first_release_date, cover.image_id, ' +
  'platforms, platforms.name, genres.name, total_rating, category, parent_game, ' +
  'release_dates.date, release_dates.platform, ' +
  'version_parent, involved_companies.developer, involved_companies.publisher, ' +
  'involved_companies.company.name;';

/** Pull developer / publisher names out of IGDB's involved_companies join. */
export function companies(game) {
  const involved = game?.involved_companies || [];
  const pick = (role) =>
    involved
      .filter((c) => c[role] && c.company?.name)
      .map((c) => c.company.name);
  return {
    developer: pick('developer').join(', ') || null,
    publisher: pick('publisher').join(', ') || null,
  };
}

function escapeQuotes(s) {
  return String(s).replace(/"/g, '\\"');
}

/** Edition wording that catalogues carry but IGDB's game titles do not. */
const EDITION_SUFFIX =
  /[\s:,-]*\b((collector'?s|special|limited|deluxe|premium|launch|anniversary|legacy|gold|platinum|definitive|complete|player'?s choice|best seller|greatest hits|not for resale)\b[\s-]*)*(edition|choice|hits|seller)\b\s*$/i;

/**
 * Search terms to try for one shelf title, most faithful first.
 *
 * Retail titles rarely match a database exactly: they carry edition wording,
 * a licence prefix, or an article the exporter dropped. Each variant is a
 * different guess at the underlying game, and scoring still decides the winner.
 */
function titleVariants(title) {
  const base = searchableTitle(title);
  const variants = [base];

  const withoutEdition = base.replace(EDITION_SUFFIX, '').trim();
  if (withoutEdition && withoutEdition !== base) variants.push(withoutEdition);

  // "Advanced Dungeons & Dragons: DeathKeep" is catalogued by IGDB as just
  // "Deathkeep" -- the part before the colon is the licence, not the game.
  const colon = base.indexOf(':');
  if (colon > 0) {
    const after = base.slice(colon + 1).trim();
    const before = base.slice(0, colon).trim();
    if (after.length > 2) variants.push(after);
    if (before.length > 2) variants.push(before);
  }

  // Gameye files "The Legend of Zelda" under "Legend of Zelda".
  if (!/^(the|a|an)\s/i.test(base)) variants.push(`The ${base}`);

  return [...new Set(variants)];
}

/**
 * Find the best IGDB match for a title on a given platform.
 *
 * Each title variant is tried platform-filtered first, then unfiltered, and
 * every result is scored against the original title. The search stops as soon
 * as something scores as a confident, platform-confirmed match.
 *
 * Returns null rather than guessing wildly when nothing scores well.
 */
export async function findGame(query, { title, platform }) {
  const clean = searchableTitle(title);
  const igdbPlatform = platformInfo(platform).igdb;

  const attempts = [];
  for (const variant of titleVariants(title)) {
    if (igdbPlatform) {
      attempts.push({
        body: `${FIELDS} search "${escapeQuotes(variant)}"; where platforms = (${igdbPlatform}); limit 20;`,
        platformFiltered: true,
      });
    }
    attempts.push({
      body: `${FIELDS} search "${escapeQuotes(variant)}"; limit 20;`,
      platformFiltered: false,
    });
  }

  let best = null;
  for (const attempt of attempts) {
    const results = await query('games', attempt.body);
    if (!results.length) continue;
    // Always score against the real title, never the variant that found it --
    // otherwise a loose variant would score its own loose match too highly.
    const scored = results
      .map((g) => ({ game: g, score: scoreMatch(g, clean, igdbPlatform, attempt.platformFiltered) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length && (!best || scored[0].score > best.score)) best = scored[0];
    // A confident, platform-confirmed hit is good enough; stop early.
    if (best && best.score >= 90) break;
  }

  return best ? { ...best.game, _matchScore: best.score } : null;
}

/**
 * Free-text search returning several candidates, best first.
 *
 * Ranking matters more than it looks: whoever runs this non-interactively takes
 * candidate 1 sight unseen. Sorting on "has cover art" alone once put the ROM
 * hack "Chrono Trigger+" above Chrono Trigger, so an exact title match and a
 * real main-game release both outrank prettiness.
 */
export async function searchGames(query, term, { platform = null, limit = 8 } = {}) {
  const igdbPlatform = platform ? platformInfo(platform).igdb : null;
  const where = igdbPlatform ? ` where platforms = (${igdbPlatform});` : '';
  const results = await query(
    'games',
    `${FIELDS} search "${escapeQuotes(term)}";${where} limit ${limit * 3};`
  );

  const wanted = normalizeForCompare(term);
  const rank = (g) => {
    let score = 0;
    const name = normalizeForCompare(g.name || '');
    if (name === wanted) score += 100;
    else if (name.startsWith(wanted)) score += 40;
    else if (name.includes(wanted)) score += 15;
    // parent_game is the reliable tell for a derivative. IGDB leaves `category`
    // off the response entirely for main games, so testing it for 0 matches
    // nothing -- every ROM hack of Chrono Trigger carries parent_game 1802
    // while the 1995 original carries none.
    if (g.parent_game || g.version_parent) score -= 60;
    else score += 25;
    // A total_rating means real reviews, which fan patches never have.
    if (typeof g.total_rating === 'number') score += 20;
    if (g.cover?.image_id) score += 10;
    if (g.first_release_date) score += 5;
    return score;
  };

  return results
    .map((g) => ({ g, score: rank(g) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.g);
}

function normalizeForCompare(s) {
  return String(s)
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function scoreMatch(game, wantedTitle, igdbPlatform, platformFiltered) {
  const want = normalizeForCompare(wantedTitle);
  const got = normalizeForCompare(game.name || '');
  if (!got) return 0;

  let score;
  if (got === want) score = 100;
  else if (got.startsWith(want) || want.startsWith(got)) score = 75;
  else if (got.includes(want) || want.includes(got)) score = 55;
  else return 0; // no meaningful overlap -- don't guess

  // Confirm the platform when we know it.
  if (igdbPlatform) {
    if (platformFiltered) score += 10;
    else if (Array.isArray(game.platforms) && game.platforms.includes(igdbPlatform)) score += 10;
    else score -= 15;
  }

  // Prefer originals over hacks, ports, bundles and DLC. parent_game is the
  // dependable signal; `category` is simply absent on main-game responses.
  if (game.category !== undefined && game.category !== 0) score -= 8;
  if (game.parent_game || game.version_parent) score -= 25;

  // A cover is the whole point of the lookup.
  if (!game.cover?.image_id) score -= 20;

  return score;
}

/** IGDB image ids become CDN urls. t_cover_big is 264x374; t_720p is larger. */
export function coverUrl(imageId, size = 't_cover_big_2x') {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

/** Trim IGDB's summary to something that reads well on a card. */
export function tidySummary(summary, storyline) {
  const text = (summary || storyline || '').trim();
  if (!text) return null;
  const collapsed = text.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
  if (collapsed.length <= 600) return collapsed;
  // Cut at the last sentence boundary that fits.
  const cut = collapsed.slice(0, 600);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (lastStop > 300 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…');
}

/**
 * The year this game came out *on this platform*.
 *
 * first_release_date is the earliest release anywhere, which is the wrong
 * answer for a shelf organised by platform: it dated the Switch copy of
 * Knights of the Old Republic to 2003 rather than 2021, and would put a port
 * decades before the console it runs on. IGDB carries per-platform dates, so
 * prefer those and fall back only when it has none.
 */
export function platformReleaseYear(game, platform) {
  const igdbPlatform = platformInfo(platform).igdb;
  if (!igdbPlatform || !Array.isArray(game?.release_dates)) return null;
  const years = game.release_dates
    .filter((r) => r?.platform === igdbPlatform && r?.date)
    .map((r) => new Date(r.date * 1000).getUTCFullYear());
  return years.length ? Math.min(...years) : null;
}

export function releaseYear(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).getUTCFullYear();
}
