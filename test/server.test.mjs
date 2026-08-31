// Sketch Relay — server tests.
import http from 'http';
import { createServer } from 'https';
void createServer;

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }

const mod = await import('../server.js');
ok(mod && typeof mod.server === 'object', 'module exports the http server');

// fetch / and confirm it serves index.html with a 200 status
await new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: 3000, path: '/' }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      try {
        ok(res.statusCode === 200, 'root responds with status 200');
        ok(body.length > 100 && /html/i.test(body), 'root serves an html document');
        resolve();
      } catch (e) { reject(e); }
    });
  }).on('error', reject);
});

console.log(`server: ${passed} assertions passed`);
process.exit(0);
