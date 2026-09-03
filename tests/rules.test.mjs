// Sketch Relay — rules engine tests.
import { ROSTER_SIZE, HUMAN_SEAT, ROUND_SECONDS, WORDS_PER_TURN, ROSTER, WORDS_BY_PLAYER, Rules } from '../src/rules.js';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }

ok(ROSTER_SIZE === 12, 'roster size is 12');
ok(HUMAN_SEAT === 0, 'human seat is 0');
ok(ROUND_SECONDS === 60, 'round length is 60 seconds');
ok(WORDS_PER_TURN === 3, 'three words per turn');

ok(ROSTER.length === ROSTER_SIZE, 'roster has 12 entries');
for (let i = 0; i < ROSTER_SIZE; i++) ok(ROSTER[i].id === i + 1, `roster id ${i}`);

// word bank: at least 36 words; each player gets three distinct ones; all 36 unique
const seen = new Set();
for (let p = 0; p < ROSTER_SIZE; p++) {
  const ws = WORDS_BY_PLAYER[p];
  ok(ws.length === WORDS_PER_TURN, `player ${p} word count`);
  for (const w of ws) { ok(!seen.has(w), 'words are unique across players'); seen.add(w); }
}

// fresh state
let r = new Rules();
ok(r.seat === 0 && r.wordIndex === 0, 'fresh seat/word index zero');
ok(r.elapsedMs === 0 && r.guessCount === 0, 'fresh timers/counters zero');
ok(!r.over && r.winReason === null, 'not over initially');
for (let i = 0; i < ROSTER_SIZE; i++) ok(r.correctBySeat[i] === 0, `no correct guesses seat ${i}`);
ok(r.solvedWords.every((b) => !b), 'nothing solved initially');

// getters on fresh state
ok(r.artistName === ROSTER[0].name, 'artist is first roster entry');
ok(r.currentWord === WORDS_BY_PLAYER[0][0], 'current word is first of player 0');
ok(r.secondsLeft === ROUND_SECONDS, 'full time remains initially');

// legality: non-empty words legal; empty and over are not
ok(r.isLegalGuess('x') === true, 'non-empty guess legal');
ok(r.isLegalGuess('') === false, 'empty string illegal');
ok(r.isLegalGuess(null) === false, 'null illegal');

// a wrong guess is recorded but changes nothing else
r.submitGuess('zzz-not-a-word');
ok(r.guessCount === 1, 'one guess submitted');
ok(r.seat === 0 && r.wordIndex === 0, 'seat/word unchanged after wrong guess');

// timer: 59s leaves one second; the next second rolls into word index 1 with zero elapsed
r.tick(59000);
ok(r.elapsedMs === 59000, 'elapsed 59 seconds');
ok(!r.over, 'still active at 59 seconds');
ok(r.secondsLeft === ROUND_SECONDS - Math.floor(59), 'one second left after 59s tick');
r.tick(ROUND_SECONDS * 1000);
ok(r.wordIndex === 1 && r.seat === 0, 'advanced to word index 1 same seat');

// each further full minute advances: word 2, then next seat with zero elapsed
r.tick(ROUND_SECONDS * 1000);
ok(r.wordIndex === 2 && r.elapsedMs === 0, 'word index 2 after another full round');
r.tick(ROUND_SECONDS * 1000);
ok(r.seat === 1 && r.wordIndex === 0 && r.elapsedMs === 0, 'next seat word 0 zero elapsed');

// state hash is a stable string; serialize carries the version and seat
const h = r.stateHash();
ok(typeof h === 'string' && h.length > 0, 'state hash non-empty string');
const s = r.serialize();
ok(s.v === 1 && s.seat === 1, 'serialized v=1 seat=1');

let r2 = Rules.fromJSON(JSON.stringify(r.serialize()));
ok(r2.stateHash() === h, 'hash identical after json round trip');
ok(r2.guessCount === r.guessCount && r2.seat === r.seat, 'counters/seat preserved through json');

console.log(`rules: ${passed} assertions passed`);
