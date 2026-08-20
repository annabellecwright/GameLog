// The local manager: the site, plus an editor that can actually save.
//
//   npm run manage            -> http://localhost:4321/manage.html
//   npm run manage -- 8080
//
// Everything you can do by hand-editing data/*.json you can do here instead --
// add and edit games, build lists, set the site's name and colour.
//
// This server writes files, so it binds to 127.0.0.1 only and refuses writes
// that don't come from its own page. It is a local tool; nothing about it ships
// to the published site, which is static files with no server behind them.

import { createServer } from 'node:http';
import { serveStatic } from './lib/static.mjs';
import { handleApi } from './lib/manage-api.mjs';
import { loadPlatformOverrides } from './lib/collection.mjs';

const port = Number(process.argv[2]) || 4321;

// Fold any data/platforms.json overrides into the registry the search endpoint
// maps IGDB ids against, so a custom console is understood here too.
await loadPlatformOverrides();

const server = createServer(async (req, res) => {
  if (await handleApi(req, res, { port })) return;
  await serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log(`  GameLog manager   http://localhost:${port}/manage.html`);
  console.log(`  Your site         http://localhost:${port}`);
  console.log('');
  console.log('  Changes save straight into data/. Commit and push when you like:');
  console.log('    git add data && git commit -m "Update collection" && git push');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
});
