// Sketch Relay — cloud/local save merge (pure; no DOM).
// A save doc is { v, savedAt, rules (round snapshot), results (records) }.
// Records only ever grow, so each counter keeps the larger value. The round
// snapshot cannot be combined: this device's round is kept when the player
// started one here this session (keepLocalRound), otherwise the newer save's.

export const SAVE_VERSION = 1;
const RECORD_KEYS = ['games', 'wins', 'bestSolved', 'totalSolved'];

export function mergeResults(a, b) {
  const out = {};
  for (const k of RECORD_KEYS) out[k] = Math.max(Number(a && a[k]) || 0, Number(b && b[k]) || 0);
  return out;
}

/** Merge a cloud doc into the local one; never loses records. */
export function mergeDocs(remote, local, { keepLocalRound = false } = {}) {
  const okR = remote && remote.v === SAVE_VERSION;
  const okL = local && local.v === SAVE_VERSION;
  if (!okR) return okL ? local : null;
  if (!okL) return remote;
  const localRound = keepLocalRound || (Number(local.savedAt) || 0) >= (Number(remote.savedAt) || 0);
  return {
    v: SAVE_VERSION,
    savedAt: Math.max(Number(remote.savedAt) || 0, Number(local.savedAt) || 0),
    rules: localRound ? local.rules : remote.rules,
    results: mergeResults(remote.results, local.results),
  };
}
