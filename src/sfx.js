// Sketch Relay — sfx module: authored sample playback with synthesized fallbacks.
// Lazy-fetches sfx/<name>.opus after the first user-gesture unlock; every event
// prefers its mapped sample and uses a synthesized blip only while the sample
// is still loading or when it failed to load.

const SFX_BASE = './sfx/';

// runtime event map: audio event -> sample basename (sfx/<name>.opus)
const EVENT_SAMPLES = {
  'ui-click': 'ui-click',
  'game-start': 'game-start',
  'guess-submit': 'guess-submit',
  'guess-correct': 'guess-correct',
  'guess-wrong': 'guess-wrong',
  'word-advance': 'word-advance',
  'turn-advance': 'turn-advance',
  'game-over-win': 'game-over-win',
  'game-over-time': 'game-over-time',
  'pause-open': 'pause-open',
  'pause-resume': 'pause-resume',
  'quit-to-title': 'quit-to-title'
};

let ctx = null;        // AudioContext, created on first user gesture
let master = null;     // master gain -> destination
let fxBus = null;      // effects bus -> master
let unlocked = false;
let muted = false;
let volume = 1.0;
const buffers = new Map();  // name -> AudioBuffer | null (null = load failed)
const pending = new Map();  // name -> in-flight decode promise

function applyVolume() {
  if (master) master.gain.value = muted ? 0 : volume;
}

function ensureContext() {
  if (ctx || typeof window === 'undefined') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  fxBus = ctx.createGain();
  fxBus.connect(master);
  applyVolume();
}

// browser autoplay policy: the context is created/resumed from a real gesture
function unlock() {
  if (unlocked) return;
  unlocked = true;
  ensureContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setMuted(m) { muted = !!m; applyVolume(); }
export function isMuted() { return muted; }
export function setVolume(v) {
  const n = Number(v);
  volume = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1.0;
  applyVolume();
}
export function getVolume() { return volume; }

function load(name) {
  if (pending.has(name)) return pending.get(name);
  const p = fetch(SFX_BASE + name + '.opus')
    .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { buffers.set(name, buf); })
    .catch(() => { buffers.set(name, null); });
  pending.set(name, p);
  return p;
}

function startBuffer(buf) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(fxBus);
  src.start();
}

// --- synthesized fallbacks (used only while a sample loads or after failure) ---

function tone(f0, f1, dur, type, gain, delay) {
  const t0 = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(fxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function synth(event) {
  switch (event) {
    case 'ui-click': tone(880, 660, 0.06, 'square', 0.10); break;
    case 'game-start':
      tone(523, 523, 0.12, 'triangle', 0.16);
      tone(659, 659, 0.12, 'triangle', 0.16, 0.10);
      tone(784, 784, 0.22, 'triangle', 0.18, 0.20);
      break;
    case 'guess-submit': tone(440, 520, 0.08, 'sine', 0.14); break;
    case 'guess-correct':
      tone(784, 784, 0.12, 'sine', 0.18);
      tone(1047, 1047, 0.24, 'sine', 0.18, 0.11);
      break;
    case 'guess-wrong': tone(220, 160, 0.22, 'sawtooth', 0.10); break;
    case 'word-advance': tone(600, 900, 0.10, 'triangle', 0.14); break;
    case 'turn-advance':
      tone(500, 750, 0.12, 'triangle', 0.14);
      tone(750, 1000, 0.14, 'triangle', 0.14, 0.11);
      break;
    case 'game-over-win':
      tone(523, 523, 0.14, 'triangle', 0.18);
      tone(659, 659, 0.14, 'triangle', 0.18, 0.13);
      tone(784, 784, 0.14, 'triangle', 0.18, 0.26);
      tone(1047, 1047, 0.34, 'triangle', 0.20, 0.39);
      break;
    case 'game-over-time':
      tone(392, 392, 0.18, 'sine', 0.16);
      tone(330, 330, 0.30, 'sine', 0.16, 0.17);
      break;
    case 'pause-open': tone(520, 380, 0.10, 'sine', 0.12); break;
    case 'pause-resume': tone(380, 520, 0.10, 'sine', 0.12); break;
    case 'quit-to-title': tone(500, 300, 0.16, 'triangle', 0.12); break;
    default: tone(660, 660, 0.08, 'sine', 0.10); break;
  }
}

// dispatcher: play the mapped sample when cached; otherwise start loading it
// and fall back to synthesis for this call.
export function play(event) {
  const name = EVENT_SAMPLES[event];
  if (!name || !unlocked || !ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const buf = buffers.get(name);
  if (buf) { startBuffer(buf); return; }
  if (buf === undefined) load(name);
  synth(event);
}

export function eventNames() { return Object.keys(EVENT_SAMPLES); }
