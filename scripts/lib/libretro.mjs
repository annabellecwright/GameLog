// Cover art with no signup.
//
// libretro publishes scanned box art for emulated systems so that frontends can
// display it, and serves it openly -- no key, no account, no rate limit worth
// worrying about. That makes it the default art source here, because asking
// someone to register a Twitch developer application before their shelf looks
// like anything is a real barrier.
//
// Two honest caveats, both documented in the README:
//   * it is scanned publisher artwork, exactly like IGDB's. Keyless is a setup
//     improvement, not a licensing one.
//   * it covers emulated systems, so anything current-gen is simply absent.
//
// Matching works by downloading a system's file listing once (one request for
// a thousand-odd names) and comparing locally. Guessing urls per title would be
// both slower and far worse at finding things.

import { searchableTitle } from './collection.mjs';
import { platformInfo } from '../../assets/js/platforms.mjs';

const BASE = 'https://thumbnails.libretro.com';

/**
 * A GameLog platform's libretro system directory (No-Intro naming), or null
 * when libretro has no scans for it. This is the one `libretro` field on the
 * platform registry, so a console added there -- built in or via the override
 * file -- brings its art source with it, rather than needing a second list kept
 * in step here. Read live so a script's loaded overrides are reflected.
 */
export const libretroDir = (platform) => platformInfo(platform).libretro || null;

const UA = 'GameLog/1.0 (personal collection site; +https://github.com/AnnabelleChimpton/GameLog)';

/**
 * Reduce a title to something comparable across two very different naming
 * conventions. Three things differ in practice:
 *
 *   * "&" is not filesystem-safe, so libretro writes "Command _ Conquer".
 *     Both sides therefore drop the character rather than expanding it to
 *     "and", which would match one spelling and not the other.
 *   * No-Intro moves leading articles to the end: The Legend of Zelda is filed
 *     as "Legend of Zelda, The". Removing articles wherever they sit makes the
 *     two agree.
 *   * everything else -- punctuation, spacing, ":" versus " - " -- is dropped.
 */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,\s*(the|a|an)\b/g, '')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * An href is escaped twice over: percent-encoding for the url, then HTML
 * entities for the attribute. Decoding only the first leaves "Command &amp;
 * Conquer", which matches nothing -- every ampersand title silently missed.
 */
function decodeHref(href) {
  return decodeURIComponent(href)
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Region and dump tags, e.g. "Banjo-Kazooie (USA) (Rev 1).png". */
function parseEntry(filename) {
  const stem = filename.replace(/\.png$/i, '');
  const tags = [...stem.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const title = stem.replace(/\s*\([^)]*\)/g, '').trim();
  return { filename, stem, title, tags };
}

/**
 * Rank a candidate. Region order reflects who is likely to be running this;
 * unfinished dumps are pushed below finished ones whatever their region.
 */
function score(entry, wanted, region) {
  if (normalize(entry.title) !== wanted) return -1;

  let points = 100;
  const tags = entry.tags.join(' ').toLowerCase();

  if (/\b(beta|proto|demo|sample|debug)\b/.test(tags)) points -= 60;

  // A plain release beats an alternate scan or a re-release of the same game.
  // These are usually the same box photographed or cropped differently, and
  // preferring them is how four different 3DO games ended up sharing one odd
  // 482x680 framing while their plain (USA) scans sat unused at longbox
  // proportions.
  if (/\balt\b/.test(tags)) points -= 25;
  if (/\bre\d\b/.test(tags)) points -= 20;
  if (/\b(usa)\b/.test(tags)) points += region === 'USA' ? 30 : 20;
  else if (/\bworld\b/.test(tags)) points += 18;
  else if (/\b(europe|pal)\b/.test(tags)) points += region === 'EU' ? 30 : 12;
  else if (/\bjapan\b/.test(tags)) points += region === 'JP' ? 30 : 6;
  // A plain name with no region tag at all is still a perfectly good match.
  if (!entry.tags.length) points += 10;
  // A revision tag is not a better scan, just a later pressing.
  if (/\brev\s*\d/.test(tags)) points -= 12;

  // Fewer qualifiers is a better default: "(USA)" over "(USA) (Alt)".
  points -= Math.max(0, entry.tags.length - 1) * 6;

  return points;
}

const cache = new Map();

/** Download and parse one system's boxart listing. Cached per run. */
export async function loadIndex(system) {
  if (cache.has(system)) return cache.get(system);

  const url = `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/`;
  let entries = [];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const html = await res.text();
      entries = [...html.matchAll(/href="([^"]+\.png)"/gi)]
        .map((m) => parseEntry(decodeHref(m[1])));
    }
  } catch {
    entries = []; // Offline or unreachable: treated as "no art available".
  }

  cache.set(system, entries);
  return entries;
}

/**
 * Find cover art for one game. Returns a url, or null when the platform isn't
 * covered or nothing matches.
 */
export async function findCover(title, platform, { region = 'USA' } = {}) {
  const system = libretroDir(platform);
  if (!system) return null;

  const entries = await loadIndex(system);
  if (!entries.length) return null;

  // Try the title as written, then with edition wording removed.
  const attempts = [title, searchableTitle(title)]
    .map(normalize)
    .filter((v, i, a) => v && a.indexOf(v) === i);

  for (const wanted of attempts) {
    let best = null;
    for (const entry of entries) {
      const points = score(entry, wanted, region);
      if (points > 0 && (!best || points > best.points)) best = { entry, points };
    }
    if (best) {
      return `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/` +
        `${encodeURIComponent(best.entry.filename)}`;
    }
  }
  return null;
}

/**
 * A PNG's dimensions live in its IHDR, inside the first 24 bytes.
 *
 * Asking for a byte range rather than the file keeps this to a few KB per game
 * instead of a few hundred. Pulling whole images for thirty games in a row is
 * what made libretro close the connection mid-run.
 */
async function ratioOf(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-33', 'User-Agent': UA } });
    if (!res.ok && res.status !== 206) return null;
    const b = Buffer.from(await res.arrayBuffer());
    if (b.length < 24 || b[0] !== 0x89) return null;
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    return w && h ? Math.round((w / h) * 1000) / 1000 : null;
  } catch {
    if (attempt >= 2) return null;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    return ratioOf(url, attempt + 1);
  }
}

/**
 * The box scan and its proportions together.
 *
 * Every path that adds a game uses this, so a game arrives with its shape
 * already known rather than waiting for someone to remember `npm run boxart`.
 */
export async function findBoxart(title, platform, { region = 'USA' } = {}) {
  const url = await findCover(title, platform, { region });
  if (!url) return null;
  const ratio = await ratioOf(url);
  return ratio ? { url, ratio } : null;
}

/**
 * Which platforms have a keyless art source worth trying.
 *
 * A directory existing is not the same as it being populated -- PlayStation 4
 * has about twenty entries and Xbox 360 about twelve, versus several thousand
 * for the emulated consoles. Reporting those as "covered" would promise art
 * that isn't there, so a nearly-empty index counts as no source.
 */
const MIN_USEFUL_ENTRIES = 50;

export async function coverage(platforms) {
  const covered = [];
  const missing = [];
  for (const platform of platforms) {
    const system = libretroDir(platform);
    if (!system) { missing.push(platform); continue; }
    const entries = await loadIndex(system);
    (entries.length >= MIN_USEFUL_ENTRIES ? covered : missing).push(platform);
  }
  return { covered, missing };
}
