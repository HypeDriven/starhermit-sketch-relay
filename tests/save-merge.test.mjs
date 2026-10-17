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
