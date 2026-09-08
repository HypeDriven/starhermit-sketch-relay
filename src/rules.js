// Sketch Relay — pure deterministic rules engine.
// No DOM, no Three.js: only game state and legal-action resolution.

export const ROSTER_SIZE = 12;
export const HUMAN_SEAT = 0;
export const ROUND_SECONDS = 60;
export const WORDS_PER_TURN = 3;

const NAMES = [
  'Aiko', 'Ben', 'Carla', 'Diego', 'Elena', 'Farid',
  'Grace', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Leo'
];

export const ROSTER = Object.freeze(
  NAMES.map((name, i) => ({ id: i + 1, name }))
);

// Word bank. Each player is assigned three distinct words (see WORDS_BY_PLAYER).
const BANK = [
  'apple', 'bridge', 'candle', 'desert', 'eagle', 'flame', 'guitar', 'harbor',
  'island', 'jungle', 'kettle', 'lantern', 'mountain', 'needle', 'ocean',
  'pencil', 'quilt', 'rainbow', 'shadow', 'thunder', 'umbrella', 'violet',
  'whale', 'yarn', 'zebra', 'anchor', 'butterfly', 'castle', 'diamond',
  'elephant', 'fountain', 'ghost', 'hammer', 'iceberg', 'jellyfish', 'knight',
  'lighthouse', 'mushroom', 'narwhal', 'octopus', 'penguin', 'rocket',
  'sandcastle', 'telescope', 'volcano', 'waterfall'
];

export const WORDS_BY_PLAYER = (() => {
  // 12 players x 3 words = 36; the bank holds more than that.
  if (BANK.length < ROSTER_SIZE * WORDS_PER_TURN) {
    throw new Error('word bank too small');
  }
  const out = [];
  for (let p = 0; p < ROSTER_SIZE; p++) {
    out.push(BANK.slice(p * WORDS_PER_TURN, p * WORDS_PER_TURN + WORDS_PER_TURN));
  }
  return Object.freeze(out);
})();

export class Rules {
  constructor() {
    this.reset();
  }

  reset() {
    this.seat = 0;            // index into ROSTER of the current artist (0..11)
    this.wordIndex = 0;       // which word of the current turn is active (0,1,2)
    this.elapsedMs = 0;       // ms elapsed in the current drawing segment
    this.guessCount = 0;      // total guess submissions this game
    this.correctBySeat = new Array(ROSTER_SIZE).fill(0);
    this.solvedWords = new Array(ROSTER_SIZE * WORDS_PER_TURN).fill(false);
    this.over = false;
    this.winReason = null;
  }

  get artistName() { return ROSTER[this.seat].name; }
  get currentWord() { return WORDS_BY_PLAYER[this.seat][this.wordIndex]; }
  get secondsLeft() { return Math.max(0, ROUND_SECONDS - Math.floor(this.elapsedMs / 1000)); }

  // slot = seat * WORDS_PER_TURN + wordIndex ; global index of a drawing segment
  _slot(seat, wi) { return seat * WORDS_PER_TURN + wi; }

  isLegalGuess(word) {
    if (this.over || word === null || word === undefined || String(word).trim() === '') return false;
    return true;
  }

  submitGuess(word) {
    if (!this.isLegalGuess(word)) return false;
    this.guessCount++;
    const w = String(word).trim().toLowerCase();
    if (w === this.currentWord) {
      this.correctBySeat[this.seat]++;
      this.solvedWords[this._slot(this.seat, this.wordIndex)] = true;
      // advance to next word of this turn, or next seat / end of game
      if (this.wordIndex + 1 < WORDS_PER_TURN) {
        this.wordIndex++;
        this.elapsedMs = 0;
      } else if (this.seat + 1 < ROSTER_SIZE) {
        this.seat++;
        this.wordIndex = 0;
        this.elapsedMs = 0;
      } else {
        this.over = true;
        this.winReason = 'all-words-completed';
      }
    }
    return true;
  }

  tick(dtMs) {
    if (this.over || dtMs <= 0) return;
    this.elapsedMs += dtMs;
    // a segment ends when its full time has elapsed without the word being solved
    const slot = this._slot(this.seat, this.wordIndex);
    if (!this.solvedWords[slot] && this.elapsedMs >= ROUND_SECONDS * 1000) {
      if (this.wordIndex + 1 < WORDS_PER_TURN) {
        this.wordIndex++;
        this.elapsedMs = 0;
      } else if (this.seat + 1 < ROSTER_SIZE) {
        this.seat++;
        this.wordIndex = 0;
        this.elapsedMs = 0;
      } else {
        this.over = true;
        this.winReason = 'time-expired';
      }
    }
  }

  stateHash() {
    let h = 2166136261 >>> 0;
    const mix = (n) => { h ^= n >>> 0; h = Math.imul(h, 16777619); };
    mix(this.seat); mix(this.wordIndex); mix(Math.floor(this.elapsedMs));
    mix(this.guessCount);
    for (let i = 0; i < ROSTER_SIZE; i++) { if (this.correctBySeat[i]) mix(i + 1); }
    let s = 0; for (const b of this.solvedWords) if (b) s++; mix(s);
    return h.toString(16).padStart(8, '0');
  }

  serialize() {
    const solved = [];
    for (let i = 0; i < ROSTER_SIZE * WORDS_PER_TURN; i++) solved.push(this.solvedWords[i] ? 1 : 0);
    return {
      v: 1, seat: this.seat, wordIndex: this.wordIndex, elapsedMs: Math.floor(this.elapsedMs),
      guessCount: this.guessCount, over: this.over ? 1 : 0, winReason: this.winReason || '',
      correctBySeat: this.correctBySeat.slice(), solvedWords: solved.join('')
    };
  }

  static deserialize(o) {
    const r = new Rules();
    if (!o) return r;
    r.seat = Math.min(ROSTER_SIZE - 1, Math.max(0, o.seat | 0));
    r.wordIndex = Math.min(WORDS_PER_TURN - 1, Math.max(0, (o.wordIndex || 0) | 0));
    r.elapsedMs = Math.max(0, Number(o.elapsedMs) || 0);
    r.guessCount = (o.guessCount || 0) | 0;
    const solvedStr = typeof o.solvedWords === 'string' ? o.solvedWords : '';
    for (let i = 0; i < ROSTER_SIZE * WORDS_PER_TURN; i++) {
      r.solvedWords[i] = solvedStr.charCodeAt(i) === 49;
    }
    const cbs = Array.isArray(o.correctBySeat) ? o.correctBySeat : [];
    for (let i = 0; i < ROSTER_SIZE; i++) r.correctBySeat[i] = Number(cbs[i]) || 0;
    r.over = !!o.over;
    r.winReason = o.winReason ? String(o.winReason) : null;
    if (r.over && !r.winReason) {
      let allSolved = true;
      for (let i = 0; i < ROSTER_SIZE * WORDS_PER_TURN; i++) if (!r.solvedWords[i]) { allSolved = false; break; }
      r.winReason = allSolved ? 'all-words-completed' : 'time-expired';
    }
    return r;
  }

  static fromJSON(json) {
    try { return Rules.deserialize(JSON.parse(json)); } catch { return new Rules(); }
  }
}
