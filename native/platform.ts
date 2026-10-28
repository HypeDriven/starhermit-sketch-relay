// The game's data and the StarHermit platform, on the runtime's modules (what
// src/platform.js did over the JS SDK and localStorage):
// - the save (starhermit:storage `saves`, schema 1: on the device and in the
//   player's cloud slot) is the browser build's save document
//   (src/save-merge.js: { v, savedAt, rules: the round snapshot, results: the
//   records }); two devices' saves merge on a conflict with mergeDocs (records
//   keep the larger value; the round is this device's when the player started
//   one here this session, else the newer save's), as the browser build merged
//   on its saveconflict; the slot the browser build wrote through the JS SDK
//   (game:<slug>, the same JSON document) shows as foreign: it is merged in and
//   replaced once. Guests' old localStorage copies can't be read (accepted);
// - the player, the invite link and posting a finished game's solved-word
//   count through score-script.js (a practice session whose socket carries
//   { type: 'result', scores }, as the JS SDK's submitScores did) with the rank.
import type { JsonValue } from "starhermit:engine";
import { connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, sessions, type Leaderboard } from "starhermit:platform";
import { saves } from "starhermit:storage";
import { SAVE_VERSION, mergeDocs } from "./game.ts";

export interface Records { games: number; wins: number; bestSolved: number; totalSolved: number }
export interface SaveDoc { v: number; savedAt: number; rules: Record<string, unknown> | null; results: Records }

let doc: SaveDoc | null = null;
let lastSavedAt = 0;
let keepLocalRound = (): boolean => false;
const mergedListeners = new Set<(d: SaveDoc) => void>();
/** fn(doc) after a save from the account (another device, the browser build) was merged in. */
export function onMerged(fn: (d: SaveDoc) => void): void { mergedListeners.add(fn); }

/** Canonical JSON (sorted keys): saves compare equal whatever their key order. */
export function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}
function valid(d: unknown): d is SaveDoc { return !!d && typeof d === "object" && (d as SaveDoc).v === SAVE_VERSION; }
function write(next: SaveDoc, opts: { replaceForeign?: boolean } = {}): void {
  doc = next;
  try {
    saves.save(JSON.parse(JSON.stringify(next)) as JsonValue, { schema: 1, ...opts });
    lastSavedAt = saves.load()?.savedAt ?? lastSavedAt;
  } catch (e) { console.warn(`save: ${String(e)}`); }
}
/** The device's save document, or null. */
export function loaded(): SaveDoc | null { return doc; }
/** Saves (the device at once, the account debounced by the runtime). */
export function persist(next: SaveDoc): void { write(next); }

/** mergeDocs(other, this device's); applied when anything changed. */
function adopt(other: unknown): void {
  if (!valid(other)) return;
  const next = (doc ? mergeDocs(other, doc, { keepLocalRound: keepLocalRound() }) : other) as SaveDoc;
  if (doc && canon(next) === canon(doc)) return;
  write(next);
  for (const fn of mergedListeners) fn(next);
}
saves.onConflict((mine, remote) => ({
  merged: (valid(remote.data) ? mergeDocs(remote.data, valid(mine?.data) ? mine!.data : null, { keepLocalRound: keepLocalRound() }) : mine?.data ?? null) as unknown as JsonValue,
}));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    adopt(cur.data);
  }
});
/** The browser build's cloud document (game:<slug>): merged with this device's save, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  let prev: unknown = null;
  try { prev = old.text == null ? null : JSON.parse(old.text); } catch { prev = null; }
  const base = doc ?? fresh();
  const next = (valid(prev) ? mergeDocs(prev, base, { keepLocalRound: keepLocalRound() }) : base) as SaveDoc;
  write(next, { replaceForeign: true });
  if (valid(prev)) for (const fn of mergedListeners) fn(next);
}
export function fresh(): SaveDoc { return { v: SAVE_VERSION, savedAt: 0, rules: null, results: { games: 0, wins: 0, bestSolved: 0, totalSolved: 0 } }; }

/** Reads the device's save (from onStart); keepLocal() says whether this device's round wins a merge. */
export function initPlatform(keepLocal: () => boolean): void {
  keepLocalRound = keepLocal;
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  doc = cur && valid(cur.data) ? (JSON.parse(JSON.stringify(cur.data)) as SaveDoc) : null;
  if (saves.state() === "foreign") migrateForeign();
  refreshPlayer();
}

/** The status line's sync word (platform.js status): offline for a guest. */
export function syncState(): "offline" | "saving" | "synced" | "error" {
  if (!player()) return "offline";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "error";
  if (st === "loading" || st === "foreign" || st === "uploading" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }

// --- the player -------------------------------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
let invite: string | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
function refreshPlayer(): void {
  invite = null;
  board = undefined;
  if (!player()) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
}
const playerListeners = new Set<() => void>();
export function onPlayer(fn: () => void): void { playerListeners.add(fn); }
onPlayerChange(() => { refreshPlayer(); for (const fn of playerListeners) fn(); });

// --- the words-solved board -------------------------------------------------------------------
export const BOARD_KEY = "words-solved";
let board: Leaderboard | null | undefined;
async function wordsBoard(): Promise<Leaderboard | null> {
  if (board !== undefined) return board;
  const list = await leaderboards.list();
  board = list.find((b) => b.key === BOARD_KEY) ?? null;
  return board;
}
export interface Posted { posted: boolean; rank: number | null }
/** Signed in only: post a finished game's solved-word count through score-script.js; { posted, rank }. Never rejects. */
export async function postScore(solved: number): Promise<Posted> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { [BOARD_KEY]: solved } }); });
      socket.on("game", (d) => {
        const m = d as { type?: string; accepted?: string[] } | null;
        if (m && m.type === "result-ack") finish(Array.isArray(m.accepted) ? m.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes(BOARD_KEY)) return { posted: false, rank: null };
  try {
    const b = await wordsBoard();
    if (!b) return { posted: true, rank: null };
    const r = await leaderboards.entries(b.id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
