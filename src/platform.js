// Sketch Relay — StarHermit platform adapter: launch token, identity, cloud save.
// Hosted mode activates only when a launch token was read from the URL; every
// platform call is same-origin and carries `Authorization: Bearer`. Without a
// token the module is inert: the game stays fully local and localStorage is
// the only store (the offline cache). Pass-and-play is untouched either way.

const LOCAL_KEY = 'sketchrelay.save.v1';
const SAVE_NAME = 'save.json';   // single entry inside the cloud-save zip
const REFRESH_MS = 45 * 60 * 1000;    // re-mint the 60-min launch token at 45 min
const REFRESH_RETRY_MS = 60 * 1000;
const SAVE_DEBOUNCE_MS = 2000;

// Minimal ZIP writer/reader (stored entries only, no compression).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(name, dataBytes) {
  const enc = new TextEncoder();
  const nameB = enc.encode(name);
  const crc = crc32(dataBytes);
  const out = [];
  const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(crc); u32(dataBytes.length); u32(dataBytes.length);
  u16(nameB.length); u16(0);
  const local = out.length;
  const head = new Uint8Array(out);
  const cd = [];
  const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
  const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
  c32(crc); c32(dataBytes.length); c32(dataBytes.length);
  c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0); // attrs + local-header offset
  const cdHead = new Uint8Array(cd);
  const cdOff = head.length + nameB.length + dataBytes.length;
  const parts = [head, nameB, dataBytes, cdHead, nameB];
  const eocd = [];
  const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
  e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
  e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
  parts.push(new Uint8Array(eocd));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf;
}
function unzipFirstEntry(zipBytes) {
  // Stored single-entry reader: scan local headers for compression 0.
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let off = 0;
  while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true);
    const size = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataOff = off + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error('unsupported zip entry');
    return zipBytes.slice(dataOff, dataOff + size);
  }
  throw new Error('bad zip');
}
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// --- launch token -----------------------------------------------------------

function readLaunchToken() {
  if (typeof window === 'undefined' || !window.location) return null;
  // Primary path: `#game_token=<jwt>` fragment, read once, then stripped.
  const hash = window.location.hash || '';
  if (hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1));
    const t = params.get('game_token');
    if (t) {
      const rest = hash.slice(1).replace(/(?:^|&)game_token=[^&]*/, '').replace(/^&/, '');
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? '#' + rest : ''));
      }
      return t;
    }
  }
  // Query-param fallbacks are for local dev only; the platform uses fragments.
  const q = new URLSearchParams(window.location.search);
  return q.get('game_token') || q.get('token') || q.get('launch') || null;
}

// base64url-decode the JWT payload (no signature verification; the platform
// verifies). `sub` = user id, `game_scope` = this game's slug.
function decodeJwtPayload(t) {
  const parts = String(t || '').split('.');
  if (parts.length < 2) return {};
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64 + pad));
  } catch {
    return {};
  }
}

// --- auth state -------------------------------------------------------------

let token = null;      // current launch token; never persisted
let userId = null;     // JWT sub
let slug = null;       // JWT game_scope (the cloud-save gameKey)
let nickname = null;   // platform display name, or the "Player "+id8 fallback
let status = 'offline'; // offline | saving | synced | error
let refreshTimer = 0;
const listeners = new Set();

function emit() { for (const fn of listeners) { try { fn(); } catch { /* listener errors are not platform errors */ } } }
function setStatus(s) { if (status !== s) { status = s; emit(); } }

function setTimer(fn, ms) {
  const id = setTimeout(fn, ms);
  if (id && typeof id.unref === 'function') id.unref();
  return id;
}

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  return res;
}

async function refreshToken() {
  refreshTimer = 0;
  try {
    const res = await api('/api/v1/games/' + encodeURIComponent(slug) + '/launch-token', { method: 'POST' });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    if (!data || !data.token) throw new Error('no token in response');
    token = data.token;
    setStatus(pendingDoc ? 'saving' : 'synced');
    scheduleRefresh();
  } catch {
    refreshTimer = setTimer(refreshToken, REFRESH_RETRY_MS);
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimer(refreshToken, REFRESH_MS);
}

async function loadProfile() {
  try {
    const res = await api('/api/v1/users/' + encodeURIComponent(userId) + '/profile');
    if (res.ok) {
      const p = await res.json().catch(() => ({}));
      if (p && p.nickname) nickname = String(p.nickname);
    }
  } catch {
    // fall through to the id-based fallback
  }
  if (!nickname) nickname = 'Player ' + String(userId).slice(0, 8);
  emit();
}

// --- cloud save (zip+base64 in the one platform slot) ------------------------

function encodeDoc(doc) {
  return bytesToBase64(zipStore(SAVE_NAME, new TextEncoder().encode(JSON.stringify(doc))));
}
function decodeDoc(b64) {
  const bytes = unzipFirstEntry(base64ToBytes(b64));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(doc) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); } catch { /* quota/private mode: cloud still mirrors */ }
}

let pendingDoc = null;   // newest doc not yet confirmed by the platform
let saveTimer = 0;
let flushing = false;

// Save pipeline: localStorage always (offline cache), cloud when hosted.
export function save(doc) {
  doc.savedAt = Date.now();
  writeLocal(doc);
  if (!token) { setStatus('offline'); return; }
  pendingDoc = doc;
  setStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimer(flushSave, SAVE_DEBOUNCE_MS);
}

async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  if (!token || !pendingDoc || flushing) return;
  flushing = true;
  const doc = pendingDoc;
  try {
    const res = await api('/api/v1/me/cloud-saves/' + encodeURIComponent(slug), {
      method: 'PUT',
      body: JSON.stringify({ dataBase64: encodeDoc(doc) }),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    if (pendingDoc === doc) pendingDoc = null;
    setStatus('synced');
  } catch {
    setStatus('error');
    saveTimer = setTimer(flushSave, REFRESH_RETRY_MS); // keep pendingDoc queued and retry
  }
  flushing = false;
}

// Immediate flush (visibilitychange). Returns the in-flight promise, if any.
export function flush() { return flushSave(); }

// pagehide: async flush may not complete, so re-send with keepalive.
function flushKeepalive() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  if (!token || !pendingDoc) return;
  const doc = pendingDoc;
  pendingDoc = null;
  try {
    fetch('/api/v1/me/cloud-saves/' + encodeURIComponent(slug), {
      method: 'PUT',
      keepalive: true,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataBase64: encodeDoc(doc) }),
    });
    setStatus('synced');
  } catch {
    pendingDoc = doc;
  }
}

async function loadCloud() {
  const res = await api('/api/v1/me/cloud-saves/' + encodeURIComponent(slug));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('http ' + res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return JSON.parse(new TextDecoder().decode(unzipFirstEntry(bytes)));
}

// --- lifecycle ----------------------------------------------------------------

// Reads the launch token, starts refresh + profile load, and returns the
// remote save doc when hosted (null otherwise / on error). On a boot conflict
// the caller prefers the returned remote doc over the local cache.
export async function init() {
  token = readLaunchToken();
  if (!token) { setStatus('offline'); return { hosted: false, cloud: null }; }
  const payload = decodeJwtPayload(token);
  userId = payload.sub || null;
  slug = payload.game_scope || null;
  if (!userId || !slug) {
    token = null;
    setStatus('offline');
    return { hosted: false, cloud: null };
  }
  scheduleRefresh();
  loadProfile();
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushKeepalive);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    }
  }
  let cloud = null;
  try {
    cloud = await loadCloud();
    if (!pendingDoc) setStatus('synced'); // link confirmed; empty slot is not an error
  } catch {
    // offline start: the local cache below is enough until connectivity returns
  }
  return { hosted: true, cloud };
}

export function isHosted() { return !!token; }
export function getSlug() { return slug; }
export function getUserId() { return userId; }
export function getNickname() { return nickname; }
export function getStatus() { return status; }
export function onChange(fn) { listeners.add(fn); }
export function loadLocal() { return readLocal(); }

export const _internals = {
  zipStore, unzipFirstEntry, bytesToBase64, base64ToBytes, crc32,
  decodeJwtPayload, encodeDoc, decodeDoc, readLaunchToken,
};
