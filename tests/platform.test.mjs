// Sketch Relay — platform adapter tests (node, stubbed browser globals).
// Loads src/platform.js over the shipped StarHermit SDK with a stubbed fetch
// and launch fragment: token read/strip, Bearer auth, profile nickname,
// cloud-save round-trip on game:<slug>, settings KV patch, control bindings,
// sign-out, and the tokenless path (localStorage only, no fetch at all).
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

const sdkModule = { exports: {} };
new Function('module', readFileSync(new URL('../starhermit-sdk.js', import.meta.url), 'utf8'))(sdkModule);
const SDK = sdkModule.exports;

const USER = 'u1234abcd-xyz';
const SIGNIN_HOST = '0b9d6f2e-3c4a-4e5b-9a7c-1d2e3f405162.starhermit.com';
const SLUG = 'sketch-relay-test';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64u({ alg: 'none' }) + '.' + b64u({ sub: USER, game_scope: SLUG, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), (msg || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
globalThis.document = { addEventListener() {}, hidden: false };
globalThis.window = { addEventListener() {} };

function res(status, body) {
  const bytes = body instanceof Uint8Array ? body : null;
  const text = bytes || body == null ? '' : JSON.stringify(body);
  return {
    status, ok: status >= 200 && status < 300, statusText: String(status),
    text: async () => text, json: async () => JSON.parse(text),
    arrayBuffer: async () => (bytes || Buffer.from(text)).slice().buffer,
  };
}
const calls = [];
let cloudZip = null;
let cloudVer = 0;
const settings = {};
async function fetchStub(url, opts = {}) {
  const method = opts.method || 'GET';
  calls.push({ url, method, headers: opts.headers || {}, body: opts.body, keepalive: opts.keepalive });
  const path = url.split('?')[0];
  if (path === `/api/v1/users/${USER}/profile`) return res(200, { username: 'hermit_ana', nickname: 'Hermit Ana' });
  const slot = '/api/v1/me/cloud-saves/' + encodeURIComponent('game:' + SLUG);
  if (path === slot + '/info') return res(200, cloudZip ? { exists: true, etag: 'v' + cloudVer } : { exists: false });
  if (path === slot) {
    if (method === 'PUT') {
      const h = opts.headers || {};
      const cur = cloudZip ? 'v' + cloudVer : null;
      if ((h['If-Match'] && h['If-Match'] !== cur) || (h['If-None-Match'] === '*' && cur)) return res(412, { etag: cur });
      cloudZip = Buffer.from(JSON.parse(opts.body).dataBase64, 'base64');
      cloudVer++;
      return res(200, { etag: 'v' + cloudVer });
    }
    return cloudZip ? res(200, new Uint8Array(cloudZip)) : res(404);
  }
  if (path === `/api/v1/games/${SLUG}/settings`) {
    if (method === 'PATCH') Object.assign(settings, JSON.parse(opts.body).settings);
    return res(200, { settings });
  }
  if (path === `/api/v1/games/${SLUG}/controls`) return res(200, { actions: [{ action: 'submit', codes: ['Tab'] }] });
  return res(404);
}

// --- hosted -------------------------------------------------------------------
let stripped = null;
const win = {
  location: { hash: '#game_token=' + JWT + '&session_id=sess-1', search: '', pathname: '/', hostname: 'localhost', href: 'http://localhost/' },
  history: { state: null, replaceState(_a, _b, url) { stripped = url; } },
};
globalThis.StarHermit = SDK.create({ window: win, fetch: fetchStub, setTimeout: () => 0, clearTimeout() {} });
const P = await import('../src/platform.js');

const r = await P.init();
ok(r.hosted === true, 'hosted with fragment token');
eq(stripped, '/', 'game_token + session_id stripped from the fragment');
eq(P.getSlug(), SLUG, 'slug from game_scope');
ok(r.cloud === null, '404 cloud slot → null doc');
await new Promise((res) => setTimeout(res, 10));
eq(P.getNickname(), 'Hermit Ana', 'nickname from profile');
ok(calls.every((c) => c.headers.Authorization === 'Bearer ' + JWT), 'Bearer on every call');
ok(!calls.some((c) => c.url === '/api/v1/me'), 'never /api/v1/me');
eq(P.actionFor('Tab'), 'submit', 'control override applied');
eq(P.actionFor('Escape'), 'back', 'default control kept');

const doc = { v: 1, rules: { seat: 2, wordIndex: 1 }, results: { games: 3, wins: 1, bestSolved: 20, totalSolved: 41 } };
P.save(doc);
eq(P.getStatus(), 'saving', 'save marks saving');
ok(store.has('sketchrelay.save.v1'), 'localStorage offline cache written');
await P.flush();
eq(P.getStatus(), 'synced', 'flush confirms synced');
const put = calls.find((c) => c.method === 'PUT');
ok(put && put.url.endsWith('/cloud-saves/game%3A' + SLUG), 'PUT to game:<slug>');
ok(put.keepalive === true, 'flush uses keepalive');
const back = await globalThis.StarHermit.loadJSON();
eq(back.results, doc.results, 'cloud round-trip');

// another device saves first: this device's next write is refused (412),
// surfaced through onSaveConflict, and a reload + save goes through again
const other = SDK.create({ window: { location: { hash: '#game_token=' + JWT, search: '', pathname: '/', hostname: 'localhost', href: 'http://localhost/' }, history: { replaceState() {} } }, fetch: fetchStub, setTimeout: () => 0, clearTimeout() {} });
other.init();
await other.loadJSON();
await other.writeSave(JSON.stringify({ v: 1, rules: {}, results: { games: 9, wins: 0, bestSolved: 0, totalSolved: 0 } }));
let conflicts = 0;
P.onSaveConflict(() => { conflicts++; });
P.save(doc);
await P.flush();
eq(conflicts, 1, 'saveconflict reaches the game');
eq(P.getStatus(), 'saving', 'conflict is not shown as an error');
const theirs = await P.loadCloud();
eq(theirs.results.games, 9, 'reload sees the other device');
P.save(Object.assign({}, doc, { results: { games: 9, wins: 1, bestSolved: 20, totalSolved: 41 } }));
await P.flush();
eq(P.getStatus(), 'synced', 'merged save goes through after the reload');
eq((await other.loadJSON()).results.wins, 1, 'merged save landed');

P.pushSettings({ graphics: { preset: 'low' } });
await new Promise((res) => setTimeout(res, 0));
eq(settings.graphics, { preset: 'low' }, 'settings PATCH');
eq((await P.loadSettings()).graphics, { preset: 'low' }, 'settings read back');
ok(P.inviteLink().includes(`/game-invite/${USER}/${SLUG}`), 'invite link');
ok(P.canSignIn() === false, 'no sign-in button when signed in');

globalThis.StarHermit.signOut('expired');
ok(P.isHosted() === false && P.inviteLink() === null, 'signed out → local play');

// --- tokenless ------------------------------------------------------------------
const P2 = await import('../src/platform.js?standalone');
const quiet = [];
globalThis.StarHermit = SDK.create({
  window: { location: { hash: '', search: '', pathname: '/', hostname: 'localhost', href: 'http://localhost/' }, history: { replaceState() {} } },
  fetch: async (u) => { quiet.push(u); return res(500); },
});
store.clear();
const r2 = await P2.init();
ok(r2.hosted === false, 'no token → not hosted');
P2.save(doc);
await P2.flush();
P2.pushSettings({ graphics: {} });
eq(await P2.loadSettings(), {}, 'no settings standalone');
eq(P2.getStatus(), 'offline');
ok(store.has('sketchrelay.save.v1'), 'offline save still hits localStorage');
eq(P2.loadLocal().rules, doc.rules, 'loadLocal returns the cached doc');
ok(P2.canSignIn() === false, 'no sign-in off-platform');
eq(await P2.submitScore(12), { posted: false, rank: null }, 'no score post standalone');
eq(quiet.length, 0, 'no fetch standalone');

// on the game's own <uuid>.starhermit.com host without a token: sign-in offered
globalThis.StarHermit = SDK.create({
  window: { location: { hash: '', search: '', pathname: '/', hostname: SIGNIN_HOST, href: 'https://' + SIGNIN_HOST + '/' }, history: { replaceState() {} } },
  fetch: async () => res(500),
});
globalThis.StarHermit.init();
ok(P2.canSignIn() === true, 'sign-in offered on <uuid>.starhermit.com');

console.log(`platform: ${passed} assertions passed`);
process.exit(0);
