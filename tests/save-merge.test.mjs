// Cloud/local save merge (node --test): records never shrink; the round
// snapshot is this device's when kept or newer, otherwise the cloud's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocs, mergeResults } from '../src/save-merge.js';

const doc = (savedAt, rules, results) => ({ v: 1, savedAt, rules, results });

test('records keep the larger value per counter', () => {
  assert.deepEqual(mergeResults({ games: 5, wins: 1, bestSolved: 30, totalSolved: 90 }, { games: 3, wins: 2, bestSolved: 36, totalSolved: 70 }),
    { games: 5, wins: 2, bestSolved: 36, totalSolved: 90 });
});

test('newer round wins unless this device keeps its own', () => {
  const remote = doc(2000, { seat: 4 }, { games: 1 });
  const local = doc(1000, { seat: 1 }, { games: 2 });
  assert.deepEqual(mergeDocs(remote, local).rules, { seat: 4 });
  assert.deepEqual(mergeDocs(remote, local, { keepLocalRound: true }).rules, { seat: 1 });
  assert.equal(mergeDocs(remote, local).results.games, 2);
  assert.equal(mergeDocs(remote, local).savedAt, 2000);
});

test('invalid or missing docs fall back to the other side', () => {
  const local = doc(1, { seat: 0 }, { games: 1 });
  assert.equal(mergeDocs(null, local), local);
  assert.equal(mergeDocs({ v: 9 }, local), local);
  assert.equal(mergeDocs(local, null), local);
  assert.equal(mergeDocs(null, null), null);
});

// native/platform.ts migrateForeign: the browser build's cloud slot (the JS SDK's
// saveJSON text of the same doc) merged into this device's first engine save.
test('the old cloud slot migrates into a fresh engine save', () => {
  const fresh = { v: 1, savedAt: 0, rules: null, results: { games: 0, wins: 0, bestSolved: 0, totalSolved: 0 } };
  const oldText = JSON.stringify({ v: 1, savedAt: 1760000000000, rules: { v: 1, seat: 3, wordIndex: 1, elapsedMs: 1200, guessCount: 14, over: 0, winReason: '', correctBySeat: [3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], solvedWords: '111111111' }, results: { games: 4, wins: 1, bestSolved: 36, totalSolved: 80 } });
  const merged = mergeDocs(JSON.parse(oldText), fresh, { keepLocalRound: false });
  assert.deepEqual(merged.results, { games: 4, wins: 1, bestSolved: 36, totalSolved: 80 });
  assert.equal(merged.rules.seat, 3);
  const kept = mergeDocs(JSON.parse(oldText), { ...fresh, savedAt: 1, rules: { v: 1, seat: 0 } }, { keepLocalRound: true });
  assert.equal(kept.rules.seat, 0);
  assert.equal(kept.results.games, 4);
});
