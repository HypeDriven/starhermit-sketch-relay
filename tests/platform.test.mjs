// Sketch Relay — platform adapter tests (run in node with stubbed browser globals).
// Covers the stored-zip helper, JWT decode, launch-token read/strip, and the
// hosted flow against a stubbed fetch: Bearer auth, profile nickname + id8
// fallback, cloud PUT body decodes back to the doc, remote load on reload,
// and the tokenless offline path (localStorage only, no platform calls).
import { Buffer } from 'node:buffer';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64u({ alg: 'none' }) + '.' + b64u({ sub: 'u1234abcd-xyz', game_scope: 'sketch-relay' }) + '.';
const JWT2 = b64u({ alg: 'none' }) + '.' + b64u({ sub: 'u1234abcd-xyz', game_scope: 'sketch-relay', seq: 2 }) + '.';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), (msg || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

// --- stubbed browser environment (must exist before the module is imported) ---
const loc = { pathname: '/', search: '', hash: '#game_token=' + JWT + '&session_id=sess-1' };
let strippedUrl = null;
globalThis.window = { location: loc, addEventListener() {} };
globalThis.history = {
  replaceState(_a, _b, url) {
    strippedUrl = url;
    const i = url.indexOf('#');
    loc.hash = i >= 0 ? url.slice(i) : '';
    const q = url.indexOf('?');
    loc.search = q >= 0 && (i < 0 || q < i) ? url.slice(q, i > q ? i : undefined) : '';
  },
};
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
globalThis.document = { addEventListener() {}, hidden: false };

// --- stubbed platform HTTP ----------------------------------------------------
const calls = [];
let cloudZip = null;                      // what GET cloud-saves returns (null → 404)
const profileMode = { ok: true, nickname: 'Hermit Ana' };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
  const json = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.startsWith('/api/v1/users/') && u.endsWith('/profile')) {
    if (!profileMode.ok) return { ok: false, status: 404, json: async () => ({}) };
    return json({ id: 'u1234abcd-xyz', username: 'hermit_ana', nickname: profileMode.nickname });
  }
  if (u === '/api/v1/me/cloud-saves/sketch-relay' && (opts.method || 'GET') === 'PUT') {
    cloudZip = Buffer.from(JSON.parse(opts.body).dataBase64, 'base64');
    return json({});
  }
  if (u === '/api/v1/me/cloud-saves/sketch-relay') {
    if (!cloudZip) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, arrayBuffer: async () => cloudZip.buffer.slice(cloudZip.byteOffset, cloudZip.byteOffset + cloudZip.byteLength) };
  }
  if (u === '/api/v1/games/sketch-relay/launch-token') return json({ token: JWT2 });
  throw new Error('unexpected fetch: ' + u);
};

const P = await import('../src/platform.js');
const I = P._internals;

// --- stored-zip helper --------------------------------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();
const sample = enc.encode('{"hello":"zip","n":42}');
const zip = I.zipStore('save.json', sample);

ok(I.crc32(enc.encode('123456789')) === 0xcbf43926, 'crc32 known value');
eq(Array.from(zip.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'local header sig');
ok(dec.decode(zip.slice(30, 30 + 'save.json'.length)) === 'save.json', 'entry name in local header');
ok(zip[8] === 0 && zip[9] === 0, 'stored (no compression)');
ok(zip[zip.length - 22] === 0x50 && zip[zip.length - 21] === 0x4b && zip[zip.length - 20] === 0x05 && zip[zip.length - 19] === 0x06, 'EOCD record at end');
const cdOff = zip.length - 22 - ('save.json'.length + 46);
eq([zip[cdOff], zip[cdOff + 1], zip[cdOff + 2], zip[cdOff + 3]], [0x50, 0x4b, 0x01, 0x02], 'central directory where EOCD points');
eq(Array.from(I.unzipFirstEntry(zip)), Array.from(sample), 'zip round trip');
eq(Array.from(I.base64ToBytes(I.bytesToBase64(sample))), Array.from(sample), 'base64 round trip');

const doc = { v: 1, rules: { seat: 2, wordIndex: 1, elapsedMs: 1234, guessCount: 7, solvedWords: '111000000000000000000000000000000000' }, results: { games: 3, wins: 1, bestSolved: 20, totalSolved: 41 } };
eq(I.decodeDoc(I.encodeDoc(doc)), doc, 'encodeDoc/decodeDoc round trip');

eq(I.decodeJwtPayload(JWT), { sub: 'u1234abcd-xyz', game_scope: 'sketch-relay' }, 'JWT payload decoded (sub + game_scope)');
eq(I.decodeJwtPayload('garbage'), {}, 'garbage token decodes to {}');

// --- launch token: fragment read once + stripped -------------------------------
eq(I.readLaunchToken(), JWT, 'fragment token read');
eq(strippedUrl, '/#session_id=sess-1', 'game_token stripped, session_id kept');
eq(loc.hash, '#session_id=sess-1', 'location reflects the strip');
eq(I.readLaunchToken(), null, 'token read exactly once');
loc.hash = '';
eq(I.readLaunchToken(), null, 'no token without hash/query');
loc.search = '?token=' + JWT;
eq(I.readLaunchToken(), JWT, 'query fallback kept for local dev');
loc.search = '';

// --- hosted flow ----------------------------------------------------------------
loc.hash = '#game_token=' + JWT;
const res = await P.init();
ok(res.hosted === true, 'hosted with fragment token');
ok(res.cloud === null, '404 cloud slot → null doc');
const profileCall = calls.find((c) => c.url === '/api/v1/users/u1234abcd-xyz/profile');
ok(!!profileCall, 'profile fetched from /users/{sub}/profile');
eq(profileCall.headers.Authorization, 'Bearer ' + JWT, 'Bearer on profile call');
ok(!calls.some((c) => c.url.includes('/api/v1/me') && c.method === 'GET' && c.url.endsWith('/profile')), 'never GET /api/v1/me');
await new Promise((r) => setTimeout(r, 20));
eq(P.getNickname(), 'Hermit Ana', 'nickname from profile (username never shown)');

const putCalls = () => calls.filter((c) => c.url === '/api/v1/me/cloud-saves/sketch-relay' && c.method === 'PUT');
P.save(doc);
eq(P.getStatus(), 'saving', 'save marks saving');
ok(store.has('sketchrelay.save.v1'), 'localStorage offline cache written');
await P.flush();
eq(P.getStatus(), 'synced', 'flush confirms synced');
eq(putCalls().length, 1, 'one PUT after debounced flush');
eq(putCalls()[0].headers.Authorization, 'Bearer ' + JWT, 'Bearer on cloud PUT');
const sentDoc = I.decodeDoc(JSON.parse(putCalls()[0].body).dataBase64);
eq(sentDoc.rules, doc.rules, 'PUT body decodes back to the doc (rules)');
eq(sentDoc.results, doc.results, 'PUT body decodes back to the doc (results)');
ok(typeof sentDoc.savedAt === 'number', 'doc carries savedAt');
const nCallsAfterFlush = calls.length;
await P.flush();
eq(calls.length, nCallsAfterFlush, 'second flush is a no-op (nothing pending)');

// --- reload: remote doc wins -----------------------------------------------------
loc.hash = '#game_token=' + JWT;
const res2 = await P.init();
ok(res2.hosted === true, 'reload re-hosts');
ok(!!res2.cloud, 'cloud doc returned on reload');
eq(res2.cloud.rules, doc.rules, 'remote round state matches what was saved');
eq(res2.cloud.results, doc.results, 'remote records match');
const getCall = calls[calls.length - 1];
eq(getCall.method, 'GET', 'cloud load is a GET');
eq(getCall.headers.Authorization, 'Bearer ' + JWT, 'Bearer on cloud GET');

// --- profile failure → id8 fallback (fresh module instance: nickname is cached per instance) ---
profileMode.ok = false;
loc.hash = '#game_token=' + JWT;
const P2 = await import('../src/platform.js?fallback-test');
const resF = await P2.init();
ok(resF.hosted === true, 'fallback run hosts');
await new Promise((r) => setTimeout(r, 20));
eq(P2.getNickname(), 'Player u1234abc', 'nickname fallback is Player + id8');
profileMode.ok = true;

// --- tokenless offline path -------------------------------------------------------
const putCount = putCalls().length;
loc.hash = '';
store.clear();
const res3 = await P.init();
ok(res3.hosted === false, 'no token → not hosted');
eq(P.getStatus(), 'offline', 'offline status without token');
P.save(doc);
eq(P.getStatus(), 'offline', 'offline save keeps offline status');
ok(store.has('sketchrelay.save.v1'), 'offline save still hits localStorage');
eq(putCalls().length, putCount, 'offline save issues no platform calls');
eq(P.loadLocal().rules, doc.rules, 'loadLocal returns the cached doc');

console.log(`platform: ${passed} assertions passed`);
process.exit(0);
