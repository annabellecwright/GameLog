// The platform registry.
//
// One entry per console says everything the rest of the app needs to know about
// it. Nothing breaks without an entry -- an unknown platform falls back to a
// generated label, a neutral colour and a plain grid -- but an entry gives it a
// proper badge, colour, IGDB search, box shape and keyless art source.
//
//   key       canonical name, exactly as it appears in data/collection.json
//   short     the label used on filter chips and cover badges (keep it tiny)
//   color     the platform badge, chip dot and generated placeholder cover
//   igdb      IGDB's numeric platform id, used to narrow cover-art searches.
//             Find one at https://api-docs.igdb.com/#platform, or null to search
//             every platform.
//   box       the case proportion (width ÷ height), used to draw a single-
//             platform shelf at true shape when there is no scan to measure.
//             A disc case is ~0.71, an N64 cartridge box 1.37, a 3DO longbox
//             0.52. Null to leave that shelf a plain grid until it is scanned.
//   libretro  the system directory in libretro's thumbnail repo (No-Intro
//             naming), which is the keyless box-art source. Null for anything
//             libretro doesn't scan -- current-gen especially.
//
// This ships comprehensive on purpose, so a fork whose shelf is nothing but
// TurboGrafx and Neo Geo works out of the box. To add or change one without
// touching this file, put an entry in data/platforms.json (see registerPlatforms
// and the README); it is merged over these at load, by key.

export const PLATFORMS = [
  // --- Atari ---------------------------------------------------------------
  { key: 'Atari 2600',   short: '2600', color: '#c9702e', igdb: 59,  box: 0.72, libretro: 'Atari - 2600' },
  { key: 'Atari 5200',   short: '5200', color: '#b8621f', igdb: 66,  box: 0.72, libretro: 'Atari - 5200' },
  { key: 'Atari 7800',   short: '7800', color: '#a85518', igdb: 60,  box: 0.72, libretro: 'Atari - 7800' },
  { key: 'Atari Lynx',   short: 'LYNX', color: '#d08a2e', igdb: 61,  box: 0.90, libretro: 'Atari - Lynx' },
  { key: 'Atari Jaguar', short: 'JAG',  color: '#8f3f2f', igdb: 62,  box: 0.79, libretro: 'Atari - Jaguar' },

  // --- Coleco / Mattel / Magnavox ------------------------------------------
  { key: 'ColecoVision',       short: 'CV',   color: '#5a7a3a', igdb: 68,   box: 0.72, libretro: 'Coleco - ColecoVision' },
  { key: 'Intellivision',      short: 'INTV', color: '#7a6a3a', igdb: 67,   box: 0.72, libretro: 'Mattel - Intellivision' },
  { key: 'Magnavox Odyssey 2', short: 'O2',   color: '#6a5a4a', igdb: 133,  box: 0.72, libretro: 'Magnavox - Odyssey2' },

  // --- NEC -----------------------------------------------------------------
  { key: 'TurboGrafx-16', short: 'TG16', color: '#d84a2e', igdb: 86,   box: 0.72, libretro: 'NEC - PC Engine - TurboGrafx 16' },
  { key: 'TurboGrafx-CD', short: 'TGCD', color: '#c04428', igdb: 150,  box: 0.79, libretro: 'NEC - PC Engine CD - TurboGrafx-CD' },
  { key: 'PC-FX',         short: 'PCFX', color: '#a03a48', igdb: null, box: 0.87, libretro: 'NEC - PC-FX' },

  // --- Sega ----------------------------------------------------------------
  { key: 'Sega SG-1000',       short: 'SG',  color: '#2b6cb0', igdb: 84,  box: 0.72, libretro: 'Sega - SG-1000' },
  { key: 'Sega Master System', short: 'SMS', color: '#2f74bd', igdb: 64,  box: 0.72, libretro: 'Sega - Master System - Mark III' },
  { key: 'Sega Genesis',       short: 'GEN', color: '#2b6cb0', igdb: 29,  box: 0.72, libretro: 'Sega - Mega Drive - Genesis' },
  { key: 'Sega CD',            short: 'SCD', color: '#3a5a9a', igdb: 78,  box: 0.79, libretro: 'Sega - Mega-CD - Sega CD' },
  { key: 'Sega 32X',           short: '32X', color: '#4a5aaa', igdb: 30,  box: 0.72, libretro: 'Sega - 32X' },
  { key: 'Sega Game Gear',     short: 'GG',  color: '#2b7cb0', igdb: 35,  box: 0.72, libretro: 'Sega - Game Gear' },
  { key: 'Sega Saturn',        short: 'SAT', color: '#4a5568', igdb: 32,  box: 0.87, libretro: 'Sega - Saturn' },
  { key: 'Sega Dreamcast',     short: 'DC',  color: '#e06c3b', igdb: 23,  box: 0.71, libretro: 'Sega - Dreamcast' },

  // --- Nintendo ------------------------------------------------------------
  { key: 'NES/Famicom',              short: 'NES',  color: '#b03a3a', igdb: 18,   box: 0.70, libretro: 'Nintendo - Nintendo Entertainment System' },
  { key: 'Famicom Disk System',      short: 'FDS',  color: '#a03a3a', igdb: null, box: 0.72, libretro: 'Nintendo - Family Computer Disk System' },
  { key: 'SNES/Super Famicom',       short: 'SNES', color: '#7b5ea7', igdb: 19,   box: 1.41, libretro: 'Nintendo - Super Nintendo Entertainment System' },
  { key: 'Nintendo 64',              short: 'N64',  color: '#2f8f4e', igdb: 4,    box: 1.37, libretro: 'Nintendo - Nintendo 64' },
  { key: 'Nintendo GameCube',        short: 'GCN',  color: '#5f5aa2', igdb: 21,   box: 0.71, libretro: 'Nintendo - GameCube' },
  { key: 'Nintendo Wii',             short: 'Wii',  color: '#3a9bd5', igdb: 5,    box: 0.71, libretro: 'Nintendo - Wii' },
  { key: 'Nintendo Wii U',           short: 'Wii U', color: '#2c7bb0', igdb: 41,  box: 0.71, libretro: 'Nintendo - Wii U' },
  { key: 'Nintendo Switch',          short: 'NSW',  color: '#d9424a', igdb: 130,  box: 0.63, libretro: null },
  { key: 'Nintendo Switch 2',        short: 'NSW2', color: '#c0392b', igdb: 508,  box: 0.63, libretro: null },
  { key: 'Nintendo Virtual Boy',     short: 'VB',   color: '#8a2a2a', igdb: 87,   box: 0.80, libretro: 'Nintendo - Virtual Boy' },
  { key: 'Nintendo Game Boy',        short: 'GB',   color: '#6b8f3a', igdb: 33,   box: 0.90, libretro: 'Nintendo - Game Boy' },
  { key: 'Nintendo Game Boy Color',  short: 'GBC',  color: '#5a9a6a', igdb: 22,   box: 0.88, libretro: 'Nintendo - Game Boy Color' },
  { key: 'Nintendo Game Boy Advance', short: 'GBA', color: '#7a4fa3', igdb: 24,   box: 0.90, libretro: 'Nintendo - Game Boy Advance' },
  { key: 'Nintendo DS',              short: 'DS',   color: '#4a6fa5', igdb: 20,   box: 0.88, libretro: 'Nintendo - Nintendo DS' },
  { key: 'Nintendo 3DS',             short: '3DS',  color: '#c0392b', igdb: 37,   box: 0.88, libretro: 'Nintendo - Nintendo 3DS' },
  { key: 'Nintendo Pokemon Mini',    short: 'PKM',  color: '#c0a030', igdb: null, box: 0.85, libretro: 'Nintendo - Pokemon Mini' },

  // --- SNK -----------------------------------------------------------------
  { key: 'Neo Geo',              short: 'NEO',  color: '#c0392b', igdb: 80,  box: 0.85, libretro: 'SNK - Neo Geo' },
  { key: 'Neo Geo CD',           short: 'NGCD', color: '#a5342a', igdb: 136, box: 0.79, libretro: 'SNK - Neo Geo CD' },
  { key: 'Neo Geo Pocket',       short: 'NGP',  color: '#4a4a5a', igdb: 119, box: 0.90, libretro: 'SNK - Neo Geo Pocket' },
  { key: 'Neo Geo Pocket Color', short: 'NGPC', color: '#5a4a6a', igdb: 120, box: 0.90, libretro: 'SNK - Neo Geo Pocket Color' },

  // --- Bandai --------------------------------------------------------------
  { key: 'WonderSwan',       short: 'WS',  color: '#3a5a7a', igdb: 57,  box: 0.90, libretro: 'Bandai - WonderSwan' },
  { key: 'WonderSwan Color', short: 'WSC', color: '#3a6a8a', igdb: 123, box: 0.90, libretro: 'Bandai - WonderSwan Color' },

  // --- Sony ----------------------------------------------------------------
  { key: 'Sony PlayStation',   short: 'PS1',  color: '#5a5a6e', igdb: 7,   box: 0.87, libretro: 'Sony - PlayStation' },
  { key: 'Sony PlayStation 2', short: 'PS2',  color: '#2f4f8f', igdb: 8,   box: 0.71, libretro: 'Sony - PlayStation 2' },
  { key: 'Sony PlayStation 3', short: 'PS3',  color: '#33334d', igdb: 9,   box: 0.78, libretro: 'Sony - PlayStation 3' },
  { key: 'Sony PlayStation 4', short: 'PS4',  color: '#1f5fa8', igdb: 48,  box: 0.78, libretro: 'Sony - PlayStation 4' },
  { key: 'Sony PlayStation 5', short: 'PS5',  color: '#1a4f9c', igdb: 167, box: 0.78, libretro: null },
  { key: 'Sony PSP',           short: 'PSP',  color: '#3d3d52', igdb: 38,  box: 0.63, libretro: 'Sony - PlayStation Portable' },
  { key: 'Sony PS Vita',       short: 'Vita', color: '#2d3d52', igdb: 46,  box: 0.67, libretro: 'Sony - PlayStation Vita' },

  // --- Microsoft -----------------------------------------------------------
  { key: 'Microsoft Xbox',            short: 'Xbox', color: '#3f8f3f', igdb: 11,  box: 0.71, libretro: 'Microsoft - Xbox' },
  { key: 'Microsoft Xbox 360',        short: 'X360', color: '#5aa02c', igdb: 12,  box: 0.71, libretro: 'Microsoft - Xbox 360' },
  { key: 'Microsoft Xbox One',        short: 'XB1',  color: '#3a7a3a', igdb: 49,  box: 0.78, libretro: null },
  { key: 'Microsoft Xbox Series X|S', short: 'XSX',  color: '#2f6b2f', igdb: 169, box: 0.78, libretro: null },

  // --- Other ---------------------------------------------------------------
  { key: '3DO',           short: '3DO', color: '#8b8b8b', igdb: 50,  box: 0.52, libretro: 'The 3DO Company - 3DO' },
  { key: 'Philips CD-i',  short: 'CDi', color: '#5a6a7a', igdb: 117, box: 0.79, libretro: 'Philips - CD-i' },
  { key: 'PC',            short: 'PC',  color: '#6b6b7b', igdb: 6,   box: 0.72, libretro: null },
];

let BY_KEY = new Map(PLATFORMS.map((p) => [p.key.toLowerCase(), p]));

const FALLBACK_COLORS = [
  '#6b7fa8', '#a86b7f', '#7fa86b', '#a8956b', '#8b6ba8', '#6ba8a0',
];

const numberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const stringOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Merge user-defined platforms over the built-ins, matched by key: an entry
 * whose key already exists overrides that console's fields; a new key is added.
 *
 * This is what makes the registry editable without touching code -- the site
 * loads data/platforms.json at boot and the scripts load it at start, each
 * handing it here. The list is the owner's own file, but it is still coerced to
 * the right shapes so a stray value can't break a lookup.
 */
export function registerPlatforms(list) {
  if (!Array.isArray(list)) return;
  const COERCE = {
    short: stringOrNull, color: stringOrNull, igdb: numberOrNull,
    box: numberOrNull, libretro: stringOrNull,
  };
  for (const raw of list) {
    const key = stringOrNull(raw?.key);
    if (!key) continue;

    // Only the fields actually present override; everything else keeps its
    // value -- an existing console's, or a sensible default for a new one -- so
    // changing just a colour doesn't blank the rest.
    const patch = {};
    for (const [field, coerce] of Object.entries(COERCE)) {
      if (field in raw) patch[field] = coerce(raw[field]);
    }

    const i = PLATFORMS.findIndex((p) => p.key.toLowerCase() === key.toLowerCase());
    if (i === -1) {
      PLATFORMS.push({
        key,
        short: patch.short || key.slice(0, 4).toUpperCase(),
        color: patch.color || '#7a7a7a',
        igdb: patch.igdb ?? null,
        box: patch.box ?? null,
        libretro: patch.libretro ?? null,
      });
    } else {
      PLATFORMS[i] = { ...PLATFORMS[i], ...patch, key: PLATFORMS[i].key };
    }
  }
  BY_KEY = new Map(PLATFORMS.map((p) => [p.key.toLowerCase(), p]));
}

/** Look up a platform, synthesising a reasonable entry for unknown ones. */
export function platformInfo(key) {
  if (!key) return { key: 'Unknown', short: '?', color: '#7a7a7a', igdb: null, box: null, libretro: null };
  const hit = BY_KEY.get(String(key).toLowerCase());
  if (hit) return hit;

  // Unknown platform: derive a short label from the initials, and pick a stable
  // colour by hashing the name so it stays the same between runs.
  const short = String(key)
    .split(/[\s/-]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    key,
    short: short || '?',
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
    igdb: null,
    box: null,
    libretro: null,
  };
}

/**
 * IGDB's platform id -> the key used here.
 *
 * Search results say which platforms a game was released on, which is exactly
 * the question "which shelf does this go on?" -- so it is worth translating
 * rather than making someone pick from a list the answer was already in.
 */
export function platformFromIgdbId(id) {
  const hit = PLATFORMS.find((p) => p.igdb === id);
  return hit ? hit.key : null;
}

/** Sort order for platform filter chips: known platforms first, in registry order. */
export function platformSortIndex(key) {
  const i = PLATFORMS.findIndex((p) => p.key.toLowerCase() === String(key).toLowerCase());
  return i === -1 ? PLATFORMS.length : i;
}
