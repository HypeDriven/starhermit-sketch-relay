// Sketch Relay — StarHermit platform server (Node http).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.opus': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  let p;
  try { p = decodeURIComponent(url.split('?')[0]); } catch { res.writeHead(400); res.end('bad path'); return; }
  if (p.split(/[\\/]/).some(s => s.startsWith('.') && s !== '..' || ['data', 'node_modules'].includes(s))) { res.writeHead(403); res.end('forbidden'); return; }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => { console.log('sketch-relay server listening on :' + server.address().port); });

export default { server };
export { server };
export const httpServer = server;
