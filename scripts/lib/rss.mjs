// The RSS feed: feed.xml, generated from the log.
//
// Feed readers and crawlers don't run JavaScript, so the feed has to be a real
// static file on disk -- the same reason the link-preview tags live in
// index.html rather than being built in the browser. This turns data/feed.json,
// plus the milestones derived from the collection, into feed.xml.
//
// Two representations of one source: feed.json for the site's own Log view,
// feed.xml for every reader in the world. buildStream is shared with the view,
// so they can never drift.

import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStream } from '../../assets/js/feed.js';
import { ROOT, COLLECTION_PATH, CONFIG_PATH, FEED_PATH } from './collection.mjs';

const FEED_XML_PATH = join(ROOT, 'feed.xml');

// A reader will only ever show the most recent stretch of a feed, so there is
// no point writing thousands of items into it.
const MAX_ITEMS = 50;

const escapeXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Strip the restrained markdown to plain text for a feed description. */
function plain(text, limit = 500) {
  const t = String(text ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ').trim();
  return t.length > limit ? `${t.slice(0, limit - 1).trimEnd()}…` : t;
}

/** "2026-08-19" -> RFC-822 in UTC, which is the shape RSS pubDate wants. */
function rfc822(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toUTCString();
}

/** Where an item points: a referenced game's detail, else the log itself. */
function itemLink(base, item) {
  if (item.game?.id) return `${base}/#${encodeURIComponent(item.game.id)}`;
  if (item.id) return `${base}/?view=log#log-${encodeURIComponent(item.id)}`;
  return `${base}/?view=log`;
}

/**
 * Build feed.xml, or return null when there is nothing to publish or no
 * absolute siteUrl to hang item links on -- a reader cannot resolve a relative
 * one, exactly the constraint the og:image tag has.
 */
export function buildRssXml({ posts, games, config }) {
  const base = typeof config.siteUrl === 'string'
    ? config.siteUrl.trim().replace(/\/+$/, '') : '';
  if (!/^https?:\/\//i.test(base)) return null;

  const stream = buildStream(posts, games).slice(0, MAX_ITEMS);
  if (!stream.length) return null;

  const owner = config.profile?.name;
  const siteTitle = config.title || 'GameLog';
  const channelTitle = owner && !siteTitle.toLowerCase().includes(owner.toLowerCase())
    ? `${owner}'s ${siteTitle}` : siteTitle;
  const channelDesc = plain(config.tagline)
    || plain(config.profile?.about)
    || 'A video game collection.';

  const items = stream.map((item) => {
    const pub = rfc822(item.date);
    const guid = `gamelog:${item.id || `${item.date}-${item.title}`}`;
    return [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(itemLink(base, item))}</link>`,
      `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
      pub ? `      <pubDate>${pub}</pubDate>` : '',
      `      <description>${escapeXml(plain(item.body) || item.title)}</description>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  });

  const lastBuild = rfc822(stream[0].date);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(base)}/</link>`,
    `    <description>${escapeXml(channelDesc)}</description>`,
    `    <atom:link href="${escapeXml(base)}/feed.xml" rel="self" type="application/rss+xml"/>`,
    lastBuild ? `    <lastBuildDate>${lastBuild}</lastBuildDate>` : '',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].filter(Boolean).join('\n');
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

/**
 * Regenerate feed.xml from the data files, or remove it when there is nothing
 * to publish (or no siteUrl) so a stale feed pointing at the wrong place is
 * never shipped. Written via temp-and-rename like every other file here.
 */
export async function writeFeedXml() {
  const [collection, feed, config] = await Promise.all([
    readJson(COLLECTION_PATH, { games: [] }),
    readJson(FEED_PATH, { posts: [] }),
    readJson(CONFIG_PATH, {}),
  ]);
  const xml = buildRssXml({
    posts: Array.isArray(feed.posts) ? feed.posts : [],
    games: Array.isArray(collection.games) ? collection.games : [],
    config,
  });
  if (xml == null) {
    await rm(FEED_XML_PATH, { force: true }).catch(() => {});
    return null;
  }
  const tmp = `${FEED_XML_PATH}.tmp`;
  await writeFile(tmp, xml, 'utf8');
  await rename(tmp, FEED_XML_PATH);
  return FEED_XML_PATH;
}
