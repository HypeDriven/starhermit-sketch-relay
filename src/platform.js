// Sketch Relay — StarHermit platform adapter over window.StarHermit
// (starhermit-sdk.js, loaded before the game): launch token + renewal,
// identity, cloud save (slot game:<slug>), settings KV, keyboard bindings,
// sign-in and invite link. Without a token the module is inert: the game stays
// fully local, localStorage is the only store, and no network call is made.

const LOCAL_KEY = 'sketchrelay.save.v1';

// Keyboard actions; mirrors the control.* lines in starhermit.txt.
export const DEFAULT_CONTROLS = {
  submit: ['Enter', 'NumpadEnter'],
  back: ['Escape'],
};

const SH = () => globalThis.StarHermit || null;

let nickname = null;   // platform display name, or the "Player "+id fallback
let status = 'offline'; // offline | saving | synced | error
let controls = cloneControls(DEFAULT_CONTROLS);
let wired = false;
const listeners = new Set();

function cloneControls(c) {
  const out = {};
  for (const k of Object.keys(c)) out[k] = c[k].slice();
  return out;
}
function emit() { for (const fn of listeners) { try { fn(); } catch { /* listener errors are not platform errors */ } } }
function setStatus(s) { if (status !== s) { status = s; emit(); } }

async function loadProfile() {
  const p = await SH().profile().catch(() => null);
  nickname = p ? p.displayName : 'Player ' + String(SH().userId).slice(0, 6);
  emit();
}

// --- cloud save -------------------------------------------------------------

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

// Save pipeline: localStorage always (offline cache), cloud when hosted
// (debounced by the SDK).
export function save(doc) {
  doc.savedAt = Date.now();
  writeLocal(doc);
  if (!isHosted()) { setStatus('offline'); return; }
  setStatus('saving');
  SH().saveJSON(doc);
}

// Immediate flush (visibilitychange / pagehide; keepalive so it survives unload).
export function flush() { return isHosted() ? SH().flushSave(true) : Promise.resolve(false); }

// --- lifecycle ----------------------------------------------------------------

// Starts the SDK (idempotent), profile load, and returns the remote save doc
// when hosted (null otherwise / on error). On a boot conflict the caller
// prefers the returned remote doc over the local cache.
export async function init() {
  const sh = SH();
  if (!sh) { setStatus('offline'); return { hosted: false, cloud: null }; }
  if (!sh.token) sh.init();
  if (!wired) {
    wired = true;
    sh.on('saved', (ok) => setStatus(ok ? 'synced' : 'error'));
    sh.on('auth', (a) => { if (!a.signedIn) { nickname = null; status = 'offline'; emit(); } });
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', () => { flush(); });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
      }
    }
  }
  if (!sh.signedIn) { setStatus('offline'); return { hosted: false, cloud: null }; }
  loadProfile();
  const cloud = await sh.loadJSON().catch(() => null);
  setStatus('synced'); // link confirmed; empty slot is not an error
  controls = await sh.loadBindings(DEFAULT_CONTROLS).catch(() => controls);
  return { hosted: true, cloud };
}

// --- settings KV ----------------------------------------------------------------
/** The player's platform settings ({} when none / standalone). */
export function loadSettings() { return isHosted() ? SH().getSettings().catch(() => ({})) : Promise.resolve({}); }
/** Merge preference keys into the platform settings (no-op standalone). */
export function pushSettings(obj) { if (isHosted()) SH().patchSettings(obj); }

// --- controls -------------------------------------------------------------------
export function actionFor(code) {
  for (const a of Object.keys(controls)) if (controls[a].includes(code)) return a;
  return null;
}

// Signed in: post a finished game's solved-word count to the words-solved board
// (score-script.js). Resolves { posted, rank }. Standalone: no request.
export async function submitScore(solved) {
  const sh = SH();
  if (!sh || !isHosted()) return { posted: false, rank: null };
  const keys = await sh.submitScores({ 'words-solved': solved }).catch(() => []);
  if (keys.indexOf('words-solved') < 0) return { posted: false, rank: null };
  try {
    const r = await sh.leaderboard('words-solved', { pageSize: 100 });
    const me = (r.items || []).find((i) => i.userId === sh.userId);
    return { posted: true, rank: me ? me.rank : null };
  } catch { return { posted: true, rank: null }; }
}

export function isHosted() { const sh = SH(); return !!(sh && sh.signedIn); }
export function canSignIn() { const sh = SH(); return !!(sh && sh.canSignIn()); }
export function signIn() { const sh = SH(); return !!(sh && sh.signIn()); }
export function inviteLink() { return isHosted() ? SH().inviteLink() : null; }
export function getSlug() { const sh = SH(); return sh ? sh.slug : null; }
export function getUserId() { const sh = SH(); return sh ? sh.userId : null; }
export function getNickname() { return nickname; }
export function getStatus() { return status; }
export function onChange(fn) { listeners.add(fn); }
export function loadLocal() { return readLocal(); }
