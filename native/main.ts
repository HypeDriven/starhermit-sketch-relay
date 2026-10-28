// Sketch Relay on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (src/rules.js), the localized prompts
// (src/prompts.js) and the save merge (src/save-merge.js) are the browser
// build's, unchanged; this module is what src/main.js did around them — the
// screen flow (title → the relay ⇄ pause → results → title), the guess field
// and its feedback, the 60-second segment clock, the records, the save, the
// leaderboard post and the lifecycle (a hidden window pauses the round, as
// visibilitychange did). The studio is drawn by render.ts (starhermit:scene),
// every screen here with starhermit:ui.
//
// Time is the runtime's fixed steps: the relay clock (rules.tick) advances
// 1/60 s per fixed step while the round plays (the browser build ticked it by
// requestAnimationFrame's wall time), so slow frames never change a round and
// play scripts replay exactly.
//
// What the old page really was (checked before the port): a solo "prompt
// relay" — twelve studio artists each show three prompts and the player types
// the prompt shown. Nothing is drawn by players and there is no multiplayer:
// the old client never opened a session or room (its "Invite a friend" only
// copied the platform's invite link, its server.js was a static file server),
// so there is no hosted play to referee; the solved-word count posts to the
// words-solved board through score-script.js, as before.
import { clipboard, frame, onFixedUpdate, onPreferencesChange, onRender, onResume, onStart, onSuspend, onUpdate, openMenu, preferences, setFixedRate } from "starhermit:engine";
import { onAction, onKey, primaryPointer } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, requestSignIn } from "starhermit:platform";
import { Rules, SAVE_VERSION, canonicalGuess, type RelayRules } from "./game.ts";
import * as audio from "./audio.ts";
import { N, S, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { initStyles } from "./style.ts";

type Screen = "title" | "game" | "results";
type RulesT = RelayRules;

// ------------------------------------------------------------------ state (main.js)
let rules: RulesT = new Rules();
let screen: Screen = "title";
let paused = false;
let pauseOpenedFrame = -1;
let results: platform.Records = { games: 0, wins: 0, bestSolved: 0, totalSolved: 0 };
let startedOnce = false;
let wasOver = false;
let guessText = "";
let feedback: { key: string; vars?: Record<string, string> } | null = null;
let lbState: platform.Posted | "posting" | null = null;
let toastMsg: { text: string; until: number } | null = null;
let clockMs = 0;
let focusNext: string | null = null;
const GUESS_ID = "guess-input";

const solvedCount = (): number => rules.solvedWords.reduce((n: number, s: boolean) => n + (s ? 1 : 0), 0);
function toast(text: string, ms = 3200): void { toastMsg = { text, until: clockMs + ms }; }
const pending: (() => void)[] = [];
/** A widget's press, run once the frame's UI is built (state changes mid-build would break later widgets). */
function later(fn: () => void): void { pending.push(fn); }
let spoken = "";
function announce(text: string): void { spoken = spoken ? `${spoken} ${text}` : text; }

// ------------------------------------------------------------------ the save (main.js currentDoc / applyDoc / persist)
function currentDoc(): platform.SaveDoc {
  return { v: SAVE_VERSION, savedAt: Date.now(), rules: rules.serialize(), results: { ...results } };
}
function applyResults(r: Partial<platform.Records> | undefined): void {
  if (r) results = { games: 0, wins: 0, bestSolved: 0, totalSolved: 0, ...r };
}
function applyDoc(doc: platform.SaveDoc | null): void {
  if (!doc || doc.v !== SAVE_VERSION) return;
  applyResults(doc.results);
  if (!doc.rules || doc.rules.over) return;
  rules = Rules.deserialize(doc.rules);
}
function persist(): void { platform.persist(currentDoc()); }
/** The round is this device's when the player started one here this session or is in one (main.js mergeRemoteDoc). */
const keepLocalRound = (): boolean => startedOnce || screen !== "title";
platform.onMerged((d) => {
  applyResults(d.results);
  if (keepLocalRound()) return;
  rules = !d.rules || d.rules.over ? new Rules() : Rules.deserialize(d.rules);
  wasOver = rules.over;
});
function roundInProgress(): boolean {
  return !rules.over && (rules.guessCount > 0 || rules.elapsedMs > 0 || rules.seat > 0 || rules.wordIndex > 0 || rules.solvedWords.some(Boolean));
}

// ------------------------------------------------------------------ the flow
function setFeedback(key: string | null, vars?: Record<string, string>): void {
  feedback = key ? (vars ? { key, vars } : { key }) : null;
  if (feedback) announce(T(feedback.key, feedback.vars));
}
function enterGame(): void {
  paused = false;
  screen = "game";
  guessText = "";
  focusNext = primaryPointer() === "coarse" ? null : GUESS_ID;
}
function startGame(): void {
  audio.play("game-start");
  startedOnce = true;
  rules.reset();
  wasOver = false;
  lbState = null;
  enterGame();
  setFeedback(N("Type the prompt shown and press Enter."));
  persist();
}
function resumeRound(): void {
  if (!roundInProgress()) return;
  audio.play("game-start");
  enterGame();
}
function pause(): void {
  if (screen !== "game" || paused || rules.over) return;
  audio.play("pause-open");
  paused = true;
  pauseOpenedFrame = frame().frame;
  focusNext = primaryPointer() === "coarse" ? null : "btn-resume";
}
function resume(): void {
  if (!paused) return;
  audio.play("pause-resume");
  paused = false;
  focusNext = primaryPointer() === "coarse" ? null : GUESS_ID;
}
function quitToTitle(): void {
  audio.play("quit-to-title");
  paused = false;
  persist();
  showTitle();
}
function showTitle(): void {
  screen = "title";
  focusNext = primaryPointer() === "coarse" ? null : "btn-play";
}

/** main.js onGuessSubmit. */
function submitGuess(): void {
  if (screen !== "game" || paused || rules.over) return;
  const v = canonicalGuess(guessText, rules.currentWord);
  const typed = String(guessText).trim();
  guessText = "";
  if (String(v).trim() !== "") audio.play("guess-submit");
  const seatBefore = rules.seat, wiBefore = rules.wordIndex;
  const before = solvedCount();
  rules.submitGuess(v);
  const solved = solvedCount() > before;
  persist();
  if (typed === "") setFeedback(N("Type the prompt shown, then press Enter."));
  else if (solved) setFeedback(N("Correct! Next prompt."));
  else setFeedback(N("Not quite — “{guess}” is not the prompt. Try again."), { guess: typed });
  if (solved) {
    audio.play("guess-correct");
    if (!rules.over) {
      if (rules.seat !== seatBefore) audio.play("turn-advance");
      else if (rules.wordIndex !== wiBefore) audio.play("word-advance");
    }
  } else if (String(v).trim() !== "") audio.play("guess-wrong");
}

/** main.js watchGameOver: the records, the jingle, the leaderboard post and the results, whichever path ended it. */
function watchGameOver(): void {
  if (rules.over && !wasOver) {
    const solved = solvedCount();
    results.games++;
    results.totalSolved += solved;
    if (rules.winReason === "all-words-completed") results.wins++;
    if (solved > results.bestSolved) results.bestSolved = solved;
    persist();
    audio.play(rules.winReason === "time-expired" ? "game-over-time" : "game-over-win");
    if (platform.signedIn()) {
      lbState = "posting";
      void platform.postScore(solved).then((r) => { lbState = r; });
    } else lbState = null;
    if (screen === "game") {
      screen = "results";
      paused = false;
      focusNext = primaryPointer() === "coarse" ? null : "btn-back-to-title";
      announce(resultsHeadline());
    }
  }
  wasOver = rules.over;
}
const resultsHeadline = (): string => (rules.winReason === "all-words-completed" ? T("All words completed!") : T("Time’s up!"));

// ------------------------------------------------------------------ account (sign-in, invite)
function signIn(): void { void requestSignIn().catch(() => undefined); }
function invite(): void {
  const link = platform.inviteLink();
  if (!link) return;
  try { clipboard.writeText(link); toast(S("copied")); } catch { toast(`${S("copyFailed")}: ${link}`, 6000); }
}
const SYNC_LABEL: Record<string, string> = { synced: N("synced"), saving: N("saving…"), error: N("error (retrying)"), offline: N("offline") };
function statusText(): string {
  return platform.signedIn()
    ? T("Playing as {name} · Cloud save: {status}", { name: platform.displayName() || "…", status: T(SYNC_LABEL[platform.syncState()]!) })
    : T("Local play — progress is saved on this device");
}

// ------------------------------------------------------------------ layout helpers
interface Layout { lw: number; lh: number; land: boolean; narrow: boolean }
function layoutNow(): Layout {
  const f = frame(), sc = ui.preferences().scale, sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  return { lw, lh, land: lw > lh && lh <= 500, narrow: lw <= 520 };
}
const textW = (text: string, cls: string, kind?: "button"): number =>
  ui.measureText(text, { ...(kind ? { kind } : {}), style: [cls] }).width / ui.preferences().scale;
/** Text up to `width` wide: one label when it fits, else a wrapped paragraph. */
function para(text: string, width: number, cls: string, size?: number): void {
  const st = size ? [cls, { text: { size } }] : [cls];
  if (textW(text, cls) * (size ? size / 16 : 1) <= width && !size) ui.style(...st).label(text);
  else ui.style(...st).paragraph(text, Math.max(20, width));
}
interface Btn { id: string; text: string; cls?: string; act: () => void; size?: number; pad?: [number, number] }
function button(b: Btn): void {
  const extra = b.size || b.pad ? [{ ...(b.size ? { text: { size: b.size } } : {}), ...(b.pad ? { padding: { top: b.pad[0], bottom: b.pad[0], start: b.pad[1], end: b.pad[1] } } : {}) }] : [];
  if (ui.id(b.id).style(b.cls ?? "btn", ...extra).button(b.text)) later(b.act);
}
/** A centred flex-wrap row of buttons (.menu-buttons). */
function flow(id: string, list: Btn[], width: number, gap: number): void {
  const rows: Btn[][] = [[]];
  let used = 0;
  for (const b of list) {
    const w = textW(b.text, b.cls ?? "btn", "button");
    if (rows[rows.length - 1]!.length && used + gap + w > width) { rows.push([]); used = 0; }
    rows[rows.length - 1]!.push(b);
    used += (used ? gap : 0) + w;
  }
  ui.column(id, () => {
    rows.forEach((r, i) => ui.row(`${id}-${i}`, () => { for (const b of r) button(b); }, { spacing: gap, align: "center" }));
  }, { spacing: gap, align: "center" });
}
/** The prompt word at the panel's width (34 px, 24 in short landscape; smaller for long words). */
function fitSize(text: string, cls: string, base: number, width: number): number {
  const w = textW(text, cls) * (base / 34);
  return w <= width ? base : Math.max(14, Math.floor((base * width) / w));
}

// ------------------------------------------------------------------ screens
const lastSize = new Map<string, ui.Rect>();
const heightOf = (id: string, fallback: number): number => {
  const r = lastSize.get(id);
  return r ? r.height / ui.preferences().scale : fallback;
};

function drawTitle(L: Layout): void {
  const w = Math.min(L.lw - 24, 720);
  const panelW = L.land ? Math.min(720, L.lw * 0.92) : Math.min(560, L.lw * 0.88);
  const gap = L.land ? 8 : 18;
  const h = heightOf("title-col", 500);
  const build = (): void => {
    const r = ui.column("title-col", () => {
      ui.style("title-name", L.land ? { text: { size: 26 } } : null).label("Sketch Relay");
      ui.style("pill").column("tagline-pill", () => para(T("A party game of drawing and guessing."), Math.min(w, 560) - 24, "tagline", L.land ? 14 : undefined));
      ui.style("panel", L.land ? { padding: { top: 10, bottom: 10, start: 16, end: 16 } } : null).column("how-to", () => {
        ui.style("panel-title", L.land ? { text: { size: 12 } } : null).label(T("Solo relay practice"));
        ui.style("how-text", L.land ? { text: { size: 13 } } : null).paragraph(T("This build is a prompt relay: twelve studio artists take turns and each shows you three prompts. Type the prompt shown into the guess box and press Enter (or Submit) before the 60-second timer runs out. Wrong or misspelled guesses are counted and you can try again."), panelW - (L.land ? 32 : 44));
      }, { width: panelW, spacing: L.land ? 4 : 8 });
      const pad: [number, number] | undefined = L.land ? [10, 22] : undefined;
      const size = L.land ? 16 : undefined;
      const list: Btn[] = [{ id: "btn-play", text: T("Play"), cls: "btn-primary", act: startGame, ...(pad ? { pad, size } : {}) }];
      if (roundInProgress()) list.push({ id: "btn-resume-round", text: T("Resume round"), act: resumeRound, ...(pad ? { pad, size } : {}) });
      list.push({ id: "btn-settings", text: T("Settings"), act: () => openMenu(), ...(pad ? { pad, size } : {}) });
      if (!platform.signedIn()) list.push({ id: "btn-signin", text: S("signIn"), act: signIn, ...(pad ? { pad, size } : {}) });
      if (platform.inviteLink()) list.push({ id: "btn-invite", text: S("invite"), act: invite, ...(pad ? { pad, size } : {}) });
      flow("menu-buttons", list, w, 12);
      ui.style("pill").column("status-pill", () => para(statusText(), w - 24, "status"));
    }, { width: w, spacing: gap, align: "center" });
    lastSize.set("title-col", r);
  };
  if (h + 36 > L.lh) {
    ui.place("title-scroll", { anchor: "top-start", x: 0, y: 0 }, () => {
      ui.scrollArea("title-area", { width: L.lw, height: L.lh }, () => {
        ui.column("title-pad", build, { width: L.lw, align: "center", padding: { top: 18, bottom: 18 } });
      });
    });
  } else {
    ui.place("title", { anchor: "top-start", x: (L.lw - w) / 2, y: Math.max(18, (L.lh - h) / 2) }, build);
  }
}

function drawHudTop(L: Layout, w: number): void {
  const pill = L.narrow ? [{ padding: { top: 6, bottom: 6, start: 8, end: 8 } }] : [];
  const item = L.narrow ? [{ text: { size: 15 } }] : [];
  ui.row("hud-top", () => {
    ui.style("pill", ...pill).row("hud-round", () => ui.style("hud-item", ...item).label(T("Artist: {name}", { name: rules.artistName })));
    ui.spacer();
    ui.style("pill", ...pill).row("hud-timer", () => ui.style("hud-item", ...item).label(T("Time left: {n}s", { n: rules.secondsLeft })));
    ui.spacer();
    button({ id: "btn-pause", text: T("Pause"), cls: "btn-small", act: () => pause() });
  }, { width: w, align: "center", spacing: L.narrow ? 8 : 16 });
}
function promptPanel(L: Layout, w: number): void {
  const word = rules.currentWord;
  if (!word) return;
  const padX = L.land ? 14 : 22;
  ui.style("panel", L.land ? { padding: { top: 10, bottom: 10, start: 14, end: 14 } } : null).column("prompt-panel", () => {
    ui.style("panel-title", L.land ? { text: { size: 13 } } : null).label(T("Prompt"));
    const text = T(word);
    ui.style("panel-text", { text: { size: fitSize(text, "panel-text", L.land ? 24 : 34, w - padX * 2) } }).id("prompt-word").label(text);
  }, { width: w, align: "center", spacing: 8 });
}
function guessPanel(L: Layout, w: number): void {
  if (rules.over || !rules.currentWord) return;
  const padX = L.land ? 14 : 22, inner = w - padX * 2;
  ui.style("panel", L.land ? { padding: { top: 10, bottom: 10, start: 14, end: 14 } } : null).column("guess-panel", () => {
    para(T("Your guess — type the prompt shown"), inner, "panel-label", L.land ? 13 : undefined);
    const submitW = textW(T("Submit"), L.land ? "btn-small" : "btn-primary", "button");
    const stacked = L.land || inner < 380 + 12 + submitW;
    const fieldW = stacked ? Math.min(inner, Math.max(200, inner)) : Math.min(380, inner - 12 - submitW);
    const field = (): void => {
      guessText = ui.id(GUESS_ID).style("field", L.land ? { text: { size: 16 }, padding: { top: 8, bottom: 8, start: 10, end: 10 } } : null)
        .textField(T("Your guess"), guessText, { width: fieldW, maxChars: 40, placeholder: T("Type a word and press Enter"), arrows: false });
      if (ui.submitted(T("Your guess"))) later(submitGuess);
    };
    const submit = (): void => button({ id: "btn-guess-submit", text: T("Submit"), cls: "btn-primary", act: () => { audio.play("ui-click"); submitGuess(); focusNext = primaryPointer() === "coarse" ? null : GUESS_ID; }, ...(L.land ? { size: 16, pad: [10, 18] as [number, number] } : {}) });
    if (stacked) { field(); submit(); }
    else ui.row("guess-row", () => { field(); submit(); }, { spacing: 12, align: "center" });
    ui.style("feedback").column("feedback-box", () => { if (feedback) para(T(feedback.key, feedback.vars), inner, "feedback"); else ui.label(" "); });
  }, { width: w, align: "center", spacing: L.land ? 6 : 8 });
}
function statusPill(w: number): void {
  ui.row("hud-bottom", () => {
    ui.style("pill").column("hud-status", () => para(statusText(), w - 24, "status"));
    ui.spacer();
  }, { width: w });
}

function drawGame(L: Layout): void {
  const barW = Math.min(1040, L.lw * 0.92);
  const pad = L.land ? 8 : 18;
  ui.place("screen-game", { anchor: "top-start", x: (L.lw - barW) / 2, y: pad }, () => {
    ui.column("game-col", () => {
      drawHudTop(L, barW);
      ui.spacer();
      if (L.land) {
        const half = (barW - 16) / 2;
        ui.row("panels", () => { promptPanel(L, half); guessPanel(L, half); }, { spacing: 16, align: "center" });
      } else {
        const pw = Math.min(560, L.lw * 0.88);
        promptPanel(L, pw);
        ui.spacer();
        guessPanel(L, pw);
      }
      ui.spacer();
      statusPill(barW);
    }, { width: barW, height: L.lh - pad * 2, align: "center", spacing: L.land ? 6 : 0 });
  });
}

function drawPause(): void {
  const open = ui.style("dlg-pause").dialog(T("Paused"), "", true, () => {
    ui.column("pause-col", () => {
      ui.style("overlay-title").label(T("Paused"));
      const w = Math.max(200, textW(T("Quit to title"), "btn", "button"), textW(T("Resume"), "btn-primary", "button"), textW(T("Settings"), "btn", "button"));
      const wide = { width: w, text: { align: "center" as const } };
      if (ui.id("btn-resume").style("btn-primary", wide).button(T("Resume"))) later(resume);
      if (ui.id("btn-pause-settings").style("btn", wide).button(T("Settings"))) later(() => openMenu());
      if (ui.id("btn-quit-to-title").style("btn", wide).button(T("Quit to title"))) later(quitToTitle);
    }, { spacing: 18, align: "center" });
  });
  // Escape closes the dialog: resume (not on the frame that opened it)
  if (!open && frame().frame !== pauseOpenedFrame) later(resume);
}

function drawResults(L: Layout): void {
  const total = rules.solvedWords.length;
  const parts = [T("Words solved: {n} of {total}", { n: solvedCount(), total }), T("Guesses: {n}", { n: rules.guessCount })];
  if (results.games > 0) parts.push(T("Best round: {best}/{total}", { best: results.bestSolved, total }));
  const w = Math.min(560, L.lw * 0.88);
  ui.style("dlg-results").dialog(resultsHeadline(), "", true, () => {
    ui.column("results-col", () => {
      ui.style("overlay-title", L.narrow ? { text: { size: 26 } } : null).id("results-headline").paragraph(resultsHeadline(), w);
      ui.style("panel").column("results-body", () => para(parts.join(" · "), w - 44, "body-text"), { width: w, align: "center" });
      if (lbState) {
        const text = lbState === "posting" ? S("lbPosting") : !lbState.posted ? S("lbNotPosted") : lbState.rank ? S("lbRank", { rank: lbState.rank }) : S("lbPosted");
        ui.style("panel").column("results-lb", () => para(text, w - 44, "body-text"), { width: w, align: "center" });
      }
      if (ui.id("btn-back-to-title").style("btn-primary").button(T("Back to title"))) later(() => { audio.play("ui-click"); showTitle(); });
    }, { spacing: 18, align: "center" });
  });
}

function drawToast(L: Layout): void {
  if (!toastMsg) return;
  const w = Math.min(L.lw * 0.92, 520);
  const tw = Math.min(w - 32, textW(toastMsg.text, "toast-text"));
  ui.place("toast", { anchor: "bottom", y: 16 }, () => {
    ui.style("toast").column("toast-box", () => para(toastMsg!.text, tw + 1, "toast-text"), { align: "center" });
  });
}

function drawScreens(): void {
  const L = layoutNow();
  if (screen === "title") drawTitle(L);
  else if (screen === "game") { drawGame(L); if (paused) drawPause(); }
  else drawResults(L);
  drawToast(L);
  if (focusNext) { ui.setFocus(focusNext); focusNext = null; }
}

// ------------------------------------------------------------------ keys and pads
onAction((e) => {
  if (!e.pressed) return;
  if (e.action === "back") {
    if (screen === "game" && !paused) later(pause);
  } else if (e.action === "submit") {
    if (screen === "game" && !paused) later(submitGuess);
  }
});
// The guess field holds the keyboard (no actions while it types): Escape there pauses too.
onKey((e) => {
  if (e.pressed && !e.repeat && e.code === "Escape" && ui.capturingKeys() && screen === "game" && !paused) later(pause);
});

// ------------------------------------------------------------------ the clock
let hidden = false;
let sinceSave = 0;
onFixedUpdate(() => {
  if (hidden) return;
  clockMs += 1000 / 60;
  if (screen === "game" && !paused && !rules.over) {
    rules.tick(1000 / 60);
    // keep the mirrored round state fresh while playing (main.js every 5 s)
    sinceSave += 1000 / 60;
    if (sinceSave >= 5000) { sinceSave = 0; persist(); }
  }
});

// ------------------------------------------------------------------ boot and lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = `${f.quality}:${f.levelIndex}`;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
onStart(() => {
  setFixedRate(60);
  initStyles();
  platform.initPlatform(keepLocalRound);
  applyDoc(platform.loaded());
  wasOver = rules.over;
  render.setReducedMotion(preferences().reducedMotion);
  applyLook();
  showTitle();
});
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
onSessionEnded(() => toast(S("signedOut"), 3600));
onSuspend(() => {
  hidden = true;
  if (screen === "game" && !rules.over && !paused) { paused = true; pauseOpenedFrame = frame().frame; }
  if (screen === "game") persist();
  platform.flush();
});
onResume(() => { hidden = false; });

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  audio.update();
  watchGameOver();
  if (toastMsg && toastMsg.until <= clockMs) toastMsg = null;
});
onRender(() => {
  drawScreens();
  for (const fn of pending.splice(0)) fn();
  watchGameOver();
  const f = frame();
  render.update(frameDt, f.width, f.height, { seat: rules.over ? -1 : rules.seat, secondsLeft: rules.secondsLeft });
  if (spoken) { try { ui.announce(spoken.slice(0, 500)); } catch { /* busy */ } spoken = ""; }
});
