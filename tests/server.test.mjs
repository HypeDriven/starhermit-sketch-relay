// Sketch Relay — server tests.
// Binds an ephemeral port (PORT=0) so the test never collides with a
// running server, then verifies the export shape and that / serves HTML.
import http from 'http';

process.env.PORT = '0';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }

const mod = await import('../server.js');
ok(mod && typeof mod.server === 'object', 'module exports the http server');
ok(mod.default && mod.default.server === mod.server, 'default export carries the same server');
ok(mod.httpServer === mod.server, 'httpServer alias matches');

const srv = mod.server;
if (!srv.listening) await new Promise((resolve, reject) => { srv.once('listening', resolve); srv.once('error', reject); });
const port = srv.address().port;
ok(port > 0, 'server bound to an ephemeral port');

// fetch / and confirm it serves index.html with a 200 status
await new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
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

// path traversal outside the game root is rejected
await new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/../agents.md' }, (res) => {
    res.resume();
    res.on('end', () => {
      try {
        ok(res.statusCode === 404, 'traversal outside root returns 404');
        resolve();
      } catch (e) { reject(e); }
    });
  }).on('error', reject);
});

// static assets get correct content types
await new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/favicon.svg' }, (res) => {
    res.resume();
    res.on('end', () => {
      try {
        ok(res.statusCode === 200, 'favicon served');
        ok(res.headers['content-type'] === 'image/svg+xml', 'favicon has svg content type');
        resolve();
      } catch (e) { reject(e); }
    });
  }).on('error', reject);
});

for (const [url, status] of [['/.git/config',403],['/%ZZ',400]]) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`);
  ok(res.status === status, 'private/malformed path rejected');
}

console.log(`server: ${passed} assertions passed`);
srv.close();
process.exit(0);
