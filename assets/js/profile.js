// The hero: who this is, above what they collect.
//
// Someone arriving from a shared link should learn two things without doing
// anything -- whose shelf this is, and what's on it. So the page opens with the
// person, and the collection begins immediately underneath.
//
// It scrolls away. The controls below it are what stays pinned, because once
// you're browsing, the search box matters more than the biography.

import { h, safeImageUrl, plural, hardwareCounts, richText } from './lib.js';

/**
 * Brand glyphs for the handful of places collectors actually link to. Anything
 * unrecognised gets the globe, which is why this list can stay short instead of
 * chasing every service that will exist next year.
 */
const ICONS = {
  github: 'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z',
  twitch: 'M4 3h16v11l-4 4h-3l-3 3H8v-3H4V3Zm2 2v9h3v3l3-3h3l3-3V5H6Zm5 2h2v5h-2V7Zm5 0h2v5h-2V7Z',
  youtube: 'M22 12s0-3.3-.42-4.88a2.5 2.5 0 0 0-1.76-1.77C18.24 5 12 5 12 5s-6.24 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2C2 8.7 2 12 2 12s0 3.3.42 4.88a2.5 2.5 0 0 0 1.76 1.76C5.76 19 12 19 12 19s6.24 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.76C22 15.3 22 12 22 12ZM10 15.2V8.8l5.2 3.2-5.2 3.2Z',
  bluesky: 'M12 10.8C10.9 8.6 7.9 4.6 5.1 3.1 2.4 1.6 1.4 2.4 1 3.6.6 4.9.4 9.4.7 10.4c.3 1 1.4 1.6 2.5 1.8-1 .2-2.1.5-2.4 1.6-.3 1.1.6 3 3 4 2.1.9 4.6-1.2 5.6-2.5.6-.8 1-1.6 1.2-2.1v-2.4h.8Zm0 0c1.1-2.2 4.1-6.2 6.9-7.7 2.7-1.5 3.7-.7 4.1.5.4 1.3.6 5.8.3 6.8-.3 1-1.4 1.6-2.5 1.8 1 .2 2.1.5 2.4 1.6.3 1.1-.6 3-3 4-2.1.9-4.6-1.2-5.6-2.5-.6-.8-1-1.6-1.2-2.1v-2.4h-1.4Z',
  mastodon: 'M20.9 14.6c-.3 1.5-2.6 3.1-5.2 3.4-1.4.2-2.7.3-4.1.2-2.2-.1-4-.5-4-.5v.7c.3 2.2 2.2 2.4 4 2.4 1.8.1 3.4-.5 3.4-.5l.1 1.6s-1.3.7-3.5.8c-1.3.1-2.8 0-4.6-.5C3.2 21.3 2.5 17 2.4 12.6c0-1.3 0-2.5.1-3.5.2-4.5 3.1-5.8 3.1-5.8C7.1 2.6 9.6 2.3 12.2 2.3h.1c2.6 0 5.1.3 6.6 1 0 0 2.9 1.3 3.1 5.8 0 0 .1 1.4-.1 3.6l-.9 1.9Zm-3.1-5.1v5.2h-2V9.7c0-1.1-.4-1.6-1.3-1.6-1 0-1.5.6-1.5 1.9v2.7h-2V10c0-1.3-.5-1.9-1.5-1.9-.9 0-1.3.5-1.3 1.6v5h-2V9.5c0-1.1.3-1.9.8-2.5.6-.6 1.3-.9 2.2-.9 1.1 0 1.9.4 2.4 1.2l.5.8.5-.8c.5-.8 1.3-1.2 2.4-1.2.9 0 1.6.3 2.2.9.5.6.8 1.4.8 2.5Z',
  mail: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2.2V17h16V7.2l-8 5.3-8-5.3ZM19.6 6H4.4L12 11l7.6-5Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15.6 15.6 0 0 0-1.2-5.4A8 8 0 0 1 18.9 11ZM12 4.2c.7 1 1.6 3.2 1.8 6.8h-3.6c.2-3.6 1.1-5.8 1.8-6.8ZM5.1 11a8 8 0 0 1 4.2-5.4A15.6 15.6 0 0 0 8.1 11h-3Zm0 2h3a15.6 15.6 0 0 0 1.2 5.4A8 8 0 0 1 5.1 13Zm5 0h3.8c-.2 3.6-1.1 5.8-1.8 6.8-.7-1-1.6-3.2-1.9-6.8Zm4.6 5.4a15.6 15.6 0 0 0 1.2-5.4h3a8 8 0 0 1-4.2 5.4Z',
};

function iconFor(url) {
  if (url.startsWith('mailto:')) return 'mail';
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'globe';
  }
  if (host.endsWith('github.com')) return 'github';
  if (host.endsWith('twitch.tv')) return 'twitch';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('bsky.app') || host.endsWith('bsky.social')) return 'bluesky';
  if (host.endsWith('mastodon.social') || host.startsWith('mastodon.')) return 'mastodon';
  return 'globe';
}

/** A sensible label when one wasn't given. */
export function labelFor(url) {
  try {
    if (url.startsWith('mailto:')) return url.slice(7);
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return path && path !== '/' ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

function svgIcon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'plink__icon');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.globe);
  svg.append(path);
  return svg;
}

/** "184 games · 10 platforms · 5 consoles · 1983-2024" */
function factLine(games, hardware) {
  const platforms = new Set(games.map((g) => g.platform)).size;
  const hw = hardwareCounts(hardware);
  const years = games.map((g) => g.year).filter(Boolean).sort((a, b) => a - b);
  return [
    plural(games.length, 'game'),
    plural(platforms, 'platform'),
    // Counted by kind, or four controllers would read as four consoles.
    hw.console ? plural(hw.console, 'console') : null,
    hw.peripherals ? `${hw.peripherals} peripheral${hw.peripherals === 1 ? '' : 's'}` : null,
    years.length ? `${years[0]}-${years[years.length - 1]}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Build the hero.
 *
 * With no profile set this still renders -- the site title, tagline and facts --
 * so a fork that only wants a catalogue gets a proper masthead rather than a
 * gap where a person would have been.
 */
export function renderHero(config, { games, hardware }) {
  const profile = config.profile || {};
  const photo = safeImageUrl(profile.photo);
  const named = Boolean(profile.name);

  const links = (profile.links || [])
    .filter((link) => link && typeof link.url === 'string' && link.url.trim())
    // Only ever render a link we are willing to follow.
    .filter((link) => /^(https?:|mailto:)/i.test(link.url.trim()));

  const heading = h('h1', { class: 'hero__name', text: profile.name || config.title || 'GameLog' });

  // With a person named, the site title becomes their shelf's subtitle rather
  // than competing with their name for the top line.
  const subtitle = named
    ? [config.title, config.tagline].filter(Boolean).join(': ')
    : (config.tagline || '');

  const body = h('div', { class: 'hero__body' },
    heading,
    subtitle ? h('p', { class: 'hero__subtitle', text: subtitle }) : null,
    h('p', { class: 'hero__facts', text: factLine(games, hardware) }));

  if (profile.about) {
    const bio = h('div', { class: 'hero__bio' }, richText(profile.about, { paraClass: 'hero__para' }));
    const more = h('button', {
      class: 'hero__more', type: 'button', hidden: true,
      onclick: () => {
        const open = bio.classList.toggle('is-open');
        more.textContent = open ? 'Show less' : 'Read more';
      },
    }, 'Read more');
    body.append(bio, more);

    // Only offer the toggle when the text is actually being clipped -- a
    // two-line bio with a "Read more" under it looks broken.
    requestAnimationFrame(() => {
      if (bio.scrollHeight - bio.clientHeight > 4) more.hidden = false;
    });
  }

  if (links.length) {
    body.append(h('div', { class: 'hero__links' },
      links.map((link) => {
        const url = link.url.trim();
        return h('a', {
          class: 'plink',
          href: url,
          target: url.startsWith('mailto:') ? null : '_blank',
          rel: 'noopener noreferrer',
        }, svgIcon(iconFor(url)), h('span', { text: link.label?.trim() || labelFor(url) }));
      })));
  }

  const avatar = photo
    ? (() => {
        const img = h('img', { class: 'hero__photo', src: photo,
          alt: profile.name ? `${profile.name}` : '', loading: 'eager', decoding: 'async' });
        // A broken photo url should leave a tidy header, not a torn one.
        img.addEventListener('error', () => img.remove(), { once: true });
        return img;
      })()
    : null;

  return h('div', { class: avatar ? 'hero__inner' : 'hero__inner hero__inner--nophoto' },
    avatar, body);
}

