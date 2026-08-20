// A tiny static file server for previewing locally.
//
//   npm run serve            -> http://localhost:4321
//   npm run serve -- 8080
//
// You need this rather than opening index.html directly, because the page
// fetches its JSON and loads ES modules -- both of which browsers block on
// file:// urls.
//
// This one is read-only. For the editor, use `npm run manage`.

import { createServer } from 'node:http';
import { serveStatic } from './lib/static.mjs';

const port = Number(process.argv[2]) || 4321;

// 127.0.0.1 rather than every interface: nothing here should be reachable from
// the rest of the network.
createServer(serveStatic).listen(port, '127.0.0.1', () => {
  console.log(`GameLog is running at  http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});
