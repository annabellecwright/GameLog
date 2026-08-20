// Downloading and storing artwork inside the repo.
//
// The point of all of this is that a published GameLog should not depend on
// anybody else's server staying up. A hotlinked cover works right until the day
// the host reorganises a directory, and then a shelf full of art turns into a
// shelf full of placeholders with no local copy to fall back on.
//
// Shared by the manager (which writes one image at a time, from a drop or a
// link) and by `npm run vendor` (which walks the whole collection).

import { writeFile, rename, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { ROOT } from './collection.mjs';

/**
 * Formats accepted, and the extension each one is stored under.
 *
 * The extension comes from the declared type, never from whatever a url or a
 * request chooses to call the file.
 */
export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Profile photos, game covers, and true-shape box scans. */
export const PHOTO_DIR = join(ROOT, 'assets', 'profile');
export const COVER_DIR = join(ROOT, 'assets', 'covers');
export const BOXART_DIR = join(ROOT, 'assets', 'boxart');

/** Hostnames that are obviously not routable, checked before any lookup. */
export const PRIVATE_HOST = /^(localhost|.*\.local)$/i;

/** How many redirects to follow before giving up. */
const MAX_REDIRECTS = 5;

const UA = 'GameLog/1.0 (collection manager)';

/**
 * Whether an IP literal is one a fetch from this machine must not reach: its
 * own loopback, the private ranges, link-local (including cloud metadata at
 * 169.254.169.254), and the IPv6 equivalents.
 */
export function isPrivateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    return a === 0 || a === 127 || a === 10
      || (a === 169 && b === 254)          // link-local + cloud metadata
      || (a === 192 && b === 168)
      || (a === 172 && b >= 16 && b <= 31)
      || a >= 224;                         // multicast / reserved
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // IPv4-mapped (::ffff:127.0.0.1) is just an IPv4 address in disguise.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const head = lower.split(':')[0];
    // Unique-local fc00::/7 and link-local fe80::/10.
    return /^f[cd]/.test(head) || /^fe[89ab]/.test(head);
  }
  return true; // Not a recognisable IP: refuse rather than guess.
}

/**
 * A hostname can encode an IP in ways a simple regex misses -- a bare decimal
 * ("2130706433" is 127.0.0.1) or hex ("0x7f000001"). Turn those back into a
 * dotted quad so isPrivateIp can judge them; leave real names untouched.
 */
function canonicalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return host;
  let n = null;
  if (/^\d+$/.test(host)) n = Number(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) n = parseInt(host, 16);
  if (n != null && Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  return host;
}

/**
 * Refuse a url that points -- now, or after resolving its name -- at this
 * machine or a private network. Checks the literal/numeric host first, then
 * resolves the name and checks every address it answers with, so a public
 * hostname with a private A record cannot slip through either.
 */
async function assertPublicUrl(parsed) {
  if (PRIVATE_HOST.test(parsed.hostname)) {
    throw new Error('That address points back at this machine or a private network.');
  }
  const canon = canonicalHost(parsed.hostname);
  if (isIP(canon)) {
    if (isPrivateIp(canon)) {
      throw new Error('That address points back at this machine or a private network.');
    }
    return;
  }
  let resolved;
  try {
    resolved = await lookup(parsed.hostname, { all: true });
  } catch {
    // A name that does not resolve here will not connect at fetch time either,
    // so there is nothing to protect against -- let the fetch surface the real
    // failure rather than turning a lookup blip into a refusal.
    return;
  }
  if (resolved.some((r) => isPrivateIp(r.address))) {
    throw new Error('That address points back at this machine or a private network.');
  }
}

/**
 * Download a remote image.
 *
 * Pasting an address is how anyone actually finds box art: you search, you
 * right-click, you copy the image address. Fetching it here also fixes the
 * quieter problem that a hotlinked url is somebody else's to delete.
 */
export async function fetchImage(url) {
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    throw new Error('That is not a web address.');
  }

  // Redirects are followed by hand rather than by fetch, because a permitted
  // public url can 302 to a private one, and only re-checking each hop catches
  // that. `redirect: 'manual'` hands us the Location instead of chasing it.
  let res;
  for (let hop = 0; ; hop++) {
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error('Only http and https addresses can be fetched.');
    }
    // This runs on your machine, so a fetch from it reaches your network.
    await assertPublicUrl(parsed);

    res = await fetch(parsed, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': UA },
    }).catch(() => { throw new Error('Could not reach that address.'); });

    if (res.status < 300 || res.status >= 400) break;

    const location = res.headers.get('location');
    if (!location) break; // A redirect with nowhere to go; let the status check handle it.
    if (hop >= MAX_REDIRECTS) throw new Error('That address redirects too many times.');
    try {
      parsed = new URL(location, parsed);
    } catch {
      throw new Error('That address redirects somewhere invalid.');
    }
  }

  if (!res.ok) throw new Error(`That address answered with HTTP ${res.status}.`);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) {
    throw new Error(`That link is ${type || 'not an image'}, not a jpg, png, webp or gif.`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('That image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('That image is larger than 3 MB.');
  return { type, bytes };
}

export async function fetchImageAsDataUrl(url) {
  const { type, bytes } = await fetchImage(url);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/**
 * Store an image under a fixed name, replacing whatever extension that name
 * previously had. Written to a temp file and renamed, so an interrupted save
 * cannot leave a half-written picture behind.
 */
export async function storeImage({ type, bytes }, dir, basename) {
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`${type} isn't an image type this accepts (jpg, png, webp, gif).`);

  await mkdir(dir, { recursive: true });
  await Promise.all(Object.values(IMAGE_TYPES)
    .filter((other) => other !== ext)
    .map((other) => rm(join(dir, `${basename}.${other}`), { force: true })));

  const tmp = join(dir, `${basename}.${ext}.tmp`);
  await writeFile(tmp, bytes);
  await rename(tmp, join(dir, `${basename}.${ext}`));
  return { ext, bytes: bytes.length };
}

/** Decode a base64 image data url and store it. */
export async function writeImage(dataUrl, dir, basename, maxBytes = MAX_IMAGE_BYTES) {
  const match = /^data:([a-z]+\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Expected a base64 image data url.');

  const type = match[1].toLowerCase();
  if (!IMAGE_TYPES[type]) {
    throw new Error(`${type} isn't an image type this accepts (jpg, png, webp, gif).`);
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new Error('That image is empty.');
  if (bytes.length > maxBytes) {
    throw new Error(`That image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  return storeImage({ type, bytes }, dir, basename);
}

/** Bytes on disk under a repo-relative path, or 0 if it isn't there. */
export async function sizeOf(relative) {
  try {
    return (await stat(join(ROOT, relative))).size;
  } catch {
    return 0;
  }
}
