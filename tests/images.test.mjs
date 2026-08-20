// The manager can fetch an image from a pasted link, and that fetch runs on
// your own machine -- so its job is to reach the public web and nothing else.
// These pin down the refusals that keep it from being pointed inward.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, fetchImage } from '../scripts/lib/images.mjs';

/** Stand in for the network for one call, then put the real fetch back. */
async function withFetch(handler, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts);
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('isPrivateIp knows the addresses a fetch must never reach', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1',
    '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(ip), true, `${ip} is private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '140.82.113.3', '2001:4860:4860::8888']) {
    assert.equal(isPrivateIp(ip), false, `${ip} is public`);
  }
});

test('a private host is refused before any request goes out', async () => {
  let called = false;
  await withFetch(() => { called = true; return new Response(''); }, async () => {
    await assert.rejects(fetchImage('http://127.0.0.1/secret.png'), /private network|this machine/);
  });
  assert.equal(called, false, 'no fetch should have been attempted');
});

test('a numeric-encoded private host is normalised and refused', async () => {
  // 2130706433 is 127.0.0.1 written as a single decimal, a classic guard bypass.
  await assert.rejects(fetchImage('http://2130706433/x.png'), /private network|this machine/);
  await assert.rejects(fetchImage('http://0x7f000001/x.png'), /private network|this machine/);
});

test('a redirect from a public url to a private one is caught mid-chain', async () => {
  // The first host does not resolve, so the guard lets it through to fetch,
  // which answers with a redirect pointing back at this machine. Only
  // re-checking the hop catches it.
  const result = withFetch(
    (url) => (url.includes('metadata')
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
      : new Response(null, { status: 200, headers: { 'content-type': 'image/png' } })),
    () => fetchImage('http://redirect-to-metadata.invalid/go'));
  await assert.rejects(result, /private network|this machine/);
});

test('only http and https are fetched', async () => {
  await assert.rejects(fetchImage('ftp://example.test/x.png'), /http/i);
});
