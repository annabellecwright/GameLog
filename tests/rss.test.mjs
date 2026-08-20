// feed.xml is generated, not hand-written, so the generator is what's tested:
// that it refuses to produce a feed with no absolute address to point at, that
// it escapes hostile text, and that it links each item somewhere real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRssXml } from '../scripts/lib/rss.mjs';

const config = {
  siteUrl: 'https://someone.github.io/GameLog',
  title: 'GameLog',
  tagline: 'A shelf.',
  profile: { name: 'Sam' },
};
const games = [
  { id: 'x-halo', title: 'Halo 2', platform: 'Microsoft Xbox',
    status: 'beaten', beatenOn: '2026-08-15', verdict: 'Holds up.' },
];
const posts = [
  { id: 'p1', date: '2026-08-18', title: 'Boxed copy', body: 'Found one.', ref: 'x-halo' },
  { id: 'p2', date: '2026-08-10', title: 'A note', body: '' },
];

test('no absolute siteUrl means no feed, because item links cannot resolve', () => {
  assert.equal(buildRssXml({ posts, games, config: { ...config, siteUrl: '' } }), null);
  assert.equal(buildRssXml({ posts, games, config: { ...config, siteUrl: '/GameLog' } }), null);
});

test('an empty stream produces no feed', () => {
  assert.equal(buildRssXml({ posts: [], games: [], config }), null);
});

test('the channel names the owner and points at itself', () => {
  const xml = buildRssXml({ posts, games, config });
  assert.match(xml, /<title>Sam's GameLog<\/title>/);
  assert.match(xml, /<atom:link href="https:\/\/someone\.github\.io\/GameLog\/feed\.xml" rel="self"/);
});

test('milestones ride along in the feed, newest first', () => {
  const xml = buildRssXml({ posts, games, config });
  // The post (18th), the milestone (15th), then the older note (10th).
  const titles = [...xml.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]).slice(1);
  assert.deepEqual(titles, ['Boxed copy', 'Beaten: Halo 2', 'A note']);
});

test('hostile text in a title is XML-escaped', () => {
  const xml = buildRssXml({
    posts: [{ id: 'x', date: '2026-08-18', title: 'A & B <script>' }], games: [], config });
  assert.match(xml, /<title>A &amp; B &lt;script&gt;<\/title>/);
  assert.doesNotMatch(xml, /<script>/);
});

test('a referenced game links to its detail; an unref post links to the log', () => {
  const xml = buildRssXml({ posts, games, config });
  assert.match(xml, /<link>https:\/\/someone\.github\.io\/GameLog\/#x-halo<\/link>/);
  assert.match(xml, /<link>https:\/\/someone\.github\.io\/GameLog\/\?view=log#log-p2<\/link>/);
});

test('the feed is capped so a reader is never handed thousands of items', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    id: `p${i}`, date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`, title: `Post ${i}` }));
  const xml = buildRssXml({ posts: many, games: [], config });
  assert.equal((xml.match(/<item>/g) || []).length, 50);
});
