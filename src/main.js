// Sketch Relay — application entry: game state, input, DOM UI.
import { Rules } from './rules.js';
import * as T from './threejs.js';
import * as Sfx from './sfx.js';
import * as Platform from './platform.js';
import * as Settings from './settings.js';
import { shStrings } from './sh-strings.js';

let rules;                  // Rules instance, created at module init below
let screenName = 'title';   // 'title' | 'game'
let paused = false;

// DOM elements
const elCanvas = document.getElementById('scene-canvas');
const elScreenTitle = document.getElementById('screen-title');
const elScreenGame = document.getElementById('screen-game');
const elHudRound = document.getElementById('hud-round');
const elHudTimer = document.getElementById('hud-timer');
const elBtnPause = document.getElementById('btn-pause');
const elPromptPanel = document.getElementById('prompt-panel');
const elPromptWord = document.getElementById('prompt-word');
const elGuessPanel = document.getElementById('guess-panel');
const elGuessInput = document.getElementById('guess-input');
const elBtnGuessSubmit = document.getElementById('btn-guess-submit');
const elScreenPause = document.getElementById('screen-pause');
const elBtnResume = document.getElementById('btn-resume');
const elBtnQuitToTitle = document.getElementById('btn-quit-to-title');
const elScreenResults = document.getElementById('screen-results');
const elResultsHeadline = document.getElementById('results-headline');
const elResultsBody = document.getElementById('results-body');
const elBtnBackToTitle = document.getElementById('btn-back-to-title');
const elBtnPlay = document.getElementById('btn-play');
const elScreenLoading = document.getElementById('screen-loading');
const elBtnResumeRound = document.getElementById('btn-resume-round');
const elPlatformStatus = document.getElementById('platform-status');
const elHudStatus = document.getElementById('hud-status');
const elGuessFeedback = document.getElementById('guess-feedback');
const elApp = document.getElementById('app');

// --- persistence: round state + local records --------------------------------
// One versioned doc holds the in-progress/last round (rules.serialize()) and
// local personal records. localStorage is the offline cache; when hosted the
// same doc is mirrored to the platform cloud-save slot (see platform.js).

const SAVE_VERSION = 1;
let results = { games: 0, wins: 0, bestSolved: 0, totalSolved: 0 };
let startedOnce = false;   // a Play click this session: don't clobber with cloud

function currentDoc() {
  return { v: SAVE_VERSION, savedAt: Date.now(), rules: rules.serialize(), results: Object.assign({}, results) };
}

function applyResults(docResults) {
  if (!docResults) return;
  results = Object.assign({ games: 0, wins: 0, bestSolved: 0, totalSolved: 0 }, docResults);
}

// Restore a save doc. Returns true when a live (not over) round came with it.
function applyDoc(doc) {
  if (!doc || doc.v !== SAVE_VERSION) return false;
  applyResults(doc.results);
  if (!doc.rules || doc.rules.over) return false;
  rules = Rules.deserialize(doc.rules);
  T.setRules(rules);
  return true;
}

function persist() {
  Platform.save(currentDoc());
  updateResume();
}

// Remote doc arrived after boot: remote wins on a conflict unless the player
// already started a round this session; records merge by the fuller history.
function mergeRemoteDoc(cloud) {
  if (!cloud || cloud.v !== SAVE_VERSION) return;
  if (!startedOnce && screenName === 'title') {
    // No live round in the cloud means it ended (or never existed) elsewhere:
    // drop the stale local round too, or the persist() below would push it back.
    if (!applyDoc(cloud)) { rules = new Rules(); T.setRules(rules); }
    setHud(); updatePromptPanel(); updateGuessPanel();
  } else if (cloud.results && cloud.results.games > results.games) {
    applyResults(cloud.results);
  }
}

function roundInProgress() {
  return !!rules && !rules.over && (
    rules.guessCount > 0 || rules.elapsedMs > 0 || rules.seat > 0 ||
    rules.wordIndex > 0 || rules.solvedWords.some(Boolean)
  );
}

function updateResume() {
  if (elBtnResumeRound) elBtnResumeRound.hidden = !roundInProgress();
}

// --- platform status line (title + in-game HUD) -------------------------------

const SYNC_LABEL = { synced: 'synced', saving: 'saving…', error: 'error (retrying)', offline: 'offline' };

function updateStatus() {
  const text = Platform.isHosted()
    ? 'Playing as ' + (Platform.getNickname() || '…') + ' · Cloud save: ' + (SYNC_LABEL[Platform.getStatus()] || Platform.getStatus())
    : 'Local play — progress is saved on this device';
  if (elPlatformStatus) elPlatformStatus.textContent = text;
  if (elHudStatus) elHudStatus.textContent = text;
  updateAccountButtons();
}

// --- StarHermit account controls: sign-in (on-platform, no token) and invite ----
const elBtnSignIn = document.getElementById('btn-signin');
const elBtnInvite = document.getElementById('btn-invite');
const elToast = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  if (!elToast) return;
  elToast.textContent = msg;
  elToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elToast.hidden = true; }, 3200);
}
function updateAccountButtons() {
  if (elBtnSignIn) elBtnSignIn.hidden = !Platform.canSignIn();
  if (elBtnInvite) elBtnInvite.hidden = !Platform.inviteLink();
}
function initAccountButtons() {
  const L = shStrings(Settings.getLocale());
  if (elBtnSignIn) { elBtnSignIn.textContent = L.signIn; elBtnSignIn.addEventListener('click', () => Platform.signIn()); }
  if (elBtnInvite) {
    elBtnInvite.textContent = L.invite;
    elBtnInvite.addEventListener('click', async () => {
      const link = Platform.inviteLink();
      if (!link) return;
      try { await navigator.clipboard.writeText(link); toast(L.copied); }
      catch { toast(L.copyFailed + ': ' + link); }
    });
  }
  let wasHosted = false;
  Platform.onChange(() => {
    if (wasHosted && !Platform.isHosted()) toast(L.signedOut);
    wasHosted = Platform.isHosted();
  });
}
Platform.onChange(updateStatus);

function showScreen(name) {
  screenName = name;
  // Guarantee the loading overlay always clears once any screen is active,
  // even if an earlier startup step threw.
  if (elScreenLoading) elScreenLoading.hidden = true;
  elScreenTitle.hidden = name !== 'title';
  elScreenGame.hidden = name !== 'game';
  elScreenResults.hidden = name !== 'results';
  if (name !== 'game') elScreenPause.hidden = true;
  T.setTickEnabled(name === 'game' && !paused);
}

function setHud() {
  const r = rules;
  if (!r) return;
  elHudRound.textContent = 'Artist: ' + r.artistName;
  elHudTimer.textContent = 'Time left: ' + String(r.secondsLeft) + 's';
}

function updatePromptPanel() {
  const w = rules.currentWord;
  if (!w) { elPromptPanel.hidden = true; return; }
  elPromptPanel.hidden = false;
  elPromptWord.textContent = w;
}

function updateGuessPanel() {
  if (rules.over || !rules.currentWord) { elGuessPanel.hidden = true; return; }
  elGuessPanel.hidden = false;
}

function onGuessSubmit() {
  if (screenName !== 'game' || paused || !rules || rules.over) return;
  const v = elGuessInput.value;
  elGuessInput.value = '';
  if (String(v).trim() !== '') Sfx.play('guess-submit');
  const seatBefore = rules.seat, wiBefore = rules.wordIndex;
  const solvedBefore = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
  rules.submitGuess(v);
  const solvedAfter = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
  persist();
  if (elGuessFeedback) {
    if (String(v).trim() === '') elGuessFeedback.textContent = 'Type the prompt shown, then press Enter.';
    else if (solvedAfter > solvedBefore) elGuessFeedback.textContent = 'Correct! Next prompt.';
    else elGuessFeedback.textContent = 'Not quite — "' + String(v).trim() + '" is not the prompt. Try again.';
  }
  if (solvedAfter > solvedBefore) {
    Sfx.play('guess-correct');
    if (!rules.over) {
      if (rules.seat !== seatBefore) Sfx.play('turn-advance');
      else if (rules.wordIndex !== wiBefore) Sfx.play('word-advance');
    }
  } else if (String(v).trim() !== '') {
    Sfx.play('guess-wrong');
  }
}

// audio hooks on the existing UI controls (sound only; no gameplay changes)
if (elBtnPlay) elBtnPlay.addEventListener('click', () => Sfx.play('game-start'));
if (elBtnGuessSubmit) elBtnGuessSubmit.addEventListener('click', () => Sfx.play('ui-click'));
if (elBtnPause) elBtnPause.addEventListener('click', () => Sfx.play('pause-open'));
if (elBtnResume) elBtnResume.addEventListener('click', () => Sfx.play('pause-resume'));
if (elBtnQuitToTitle) elBtnQuitToTitle.addEventListener('click', () => Sfx.play('quit-to-title'));
if (elBtnBackToTitle) elBtnBackToTitle.addEventListener('click', () => Sfx.play('ui-click'));

// screen flow
function startGame() {
  startedOnce = true;
  rules.reset();
  wasOver = false;
  if (elResultsLb) elResultsLb.hidden = true;
  paused = false;
  T.setTickEnabled(true);
  showScreen('game');
  if (elGuessFeedback) elGuessFeedback.textContent = 'Type the prompt shown and press Enter.';
  setHud(); updatePromptPanel(); updateGuessPanel();
  persist();
}
function showResults() {
  const solved = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
  elResultsHeadline.textContent = rules.winReason === 'all-words-completed' ? 'All words completed!' : "Time's up!";
  let body = 'Words solved: ' + solved + ' of ' + rules.solvedWords.length + ' · Guesses: ' + rules.guessCount;
  if (results.games > 0) body += ' · Best round: ' + results.bestSolved + '/' + rules.solvedWords.length;
  elResultsBody.textContent = body;
  showScreen('results');
}
if (elBtnPlay) elBtnPlay.addEventListener('click', startGame);
if (elBtnResumeRound) elBtnResumeRound.addEventListener('click', () => {
  if (!roundInProgress()) return;
  paused = false;
  T.setTickEnabled(true);
  showScreen('game');
  setHud(); updatePromptPanel(); updateGuessPanel();
  updateStatus();
  Sfx.play('game-start');
});
if (elBtnPause) elBtnPause.addEventListener('click', () => { paused = true; T.setTickEnabled(false); elScreenPause.hidden = false; });
if (elBtnResume) elBtnResume.addEventListener('click', () => { paused = false; T.setTickEnabled(true); elScreenPause.hidden = true; });
if (elBtnQuitToTitle) elBtnQuitToTitle.addEventListener('click', () => { paused = false; persist(); showScreen('title'); });
if (elBtnBackToTitle) elBtnBackToTitle.addEventListener('click', () => showScreen('title'));
if (elBtnGuessSubmit) elBtnGuessSubmit.addEventListener('click', onGuessSubmit);
if (elGuessInput) elGuessInput.addEventListener('keydown', (e) => { if (Platform.actionFor(e.code) === 'submit') onGuessSubmit(); });

// Signed in: every finished game posts its solved-word count to the platform
// board; the results screen shows the rank. Standalone shows nothing.
const elResultsLb = document.getElementById('results-lb');
function postToLeaderboard(solved) {
  if (!elResultsLb) return;
  if (!Platform.isHosted()) { elResultsLb.hidden = true; return; }
  const L = shStrings(Settings.getLocale());
  elResultsLb.hidden = false;
  elResultsLb.textContent = L.lbPosting;
  Platform.submitScore(solved).then((r) => {
    elResultsLb.textContent = !r.posted ? L.lbNotPosted
      : r.rank ? L.lbRank.replace('{rank}', r.rank) : L.lbPosted;
  });
}

// game-over jingle, whichever path (guess or timer) ended the game
let wasOver = false;
function watchGameOver() {
  if (!rules) return;
  if (rules.over && !wasOver) {
    const solved = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
    results.games++;
    results.totalSolved += solved;
    if (rules.winReason === 'all-words-completed') results.wins++;
    if (solved > results.bestSolved) results.bestSolved = solved;
    persist();
    Sfx.play(rules.winReason === 'time-expired' ? 'game-over-time' : 'game-over-win');
    postToLeaderboard(solved);
    if (screenName === 'game') showResults();
  }
  wasOver = rules.over;
}
if (typeof window !== 'undefined') window.setInterval(watchGameOver, 250);

// HUD refresh while playing
if (typeof window !== 'undefined') window.setInterval(() => {
  if (screenName !== 'game' || paused || !rules) return;
  setHud(); updatePromptPanel(); updateGuessPanel();
}, 250);

function resizeCanvas() {
  if (!elCanvas) return;
  T.resize(elCanvas.clientWidth, elCanvas.clientHeight, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeCanvas);
  // the iframe can change size (orientation flip) without a window resize
  // event reaching us in time: track the app container itself
  if (typeof ResizeObserver === 'function' && elApp) new ResizeObserver(resizeCanvas).observe(elApp);
}

export function _debug() {
  return { screen: screenName, paused, rules };
}

// module init (runs once at import)
rules = new Rules();
applyDoc(Platform.loadLocal());   // offline cache first; cloud may override below
T.setRules(rules);
T.setTickEnabled(false);
T.init(elCanvas);
Settings.init();
initAccountButtons();
Settings.onCommit((graphics) => Platform.pushSettings({ graphics }));
showScreen('title');
setHud(); updatePromptPanel(); updateGuessPanel();
updateResume();
updateStatus();
resizeCanvas();
if (elScreenLoading) elScreenLoading.hidden = true;
T.start();

// hosted boot: remote save wins on conflict (unless a round already started here)
Platform.init().then((res) => {
  if (res.hosted && res.cloud) {
    mergeRemoteDoc(res.cloud);
    persist();   // re-mirror the merged doc into the local cache (and cloud)
  }
  // platform settings win over the local graphics copy
  if (res.hosted) Platform.loadSettings().then((s) => { if (s && s.graphics) Settings.applySaved(s.graphics); });
  updateStatus();
  updateResume();
}).catch(() => updateStatus());

// keep the mirrored round state fresh while playing (debounced in platform.js)
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (screenName === 'game' && !paused && rules && !rules.over) persist();
  }, 5000);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (screenName === 'game' && !rules.over) { paused = true; T.setTickEnabled(false); elScreenPause.hidden = false; }
    T.stop();
  } else T.start();
});
