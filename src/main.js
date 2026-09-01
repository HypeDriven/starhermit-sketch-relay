// Sketch Relay — application entry: game state, input, DOM UI.
import { Rules } from './rules.js';
import * as T from './threejs.js';
import * as Sfx from './sfx.js';

let rules;                  // Rules instance, created at module init below
let screenName = 'title';   // 'title' | 'game'
let paused = false;
let lastWord = '';          // word of the current drawing segment (for stroke flush)
const drawBuf = [];         // pending strokes [x0,y0,x1,y1] to flush on word change

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

function showScreen(name) {
  screenName = name;
  elScreenTitle.hidden = name !== 'title';
  elScreenGame.hidden = name !== 'game';
  elScreenResults.hidden = name !== 'results';
  if (name !== 'game') elScreenPause.hidden = true;
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
  const v = elGuessInput.value;
  elGuessInput.value = '';
  if (String(v).trim() !== '') Sfx.play('guess-submit');
  const seatBefore = rules.seat, wiBefore = rules.wordIndex;
  const solvedBefore = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
  rules.submitGuess(v);
  const solvedAfter = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
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
  rules.reset();
  paused = false;
  T.setTickEnabled(true);
  showScreen('game');
  setHud(); updatePromptPanel(); updateGuessPanel();
}
function showResults() {
  const solved = rules.solvedWords.reduce((n, s) => n + (s ? 1 : 0), 0);
  elResultsHeadline.textContent = rules.winReason === 'all-words-completed' ? 'All words completed!' : "Time's up!";
  elResultsBody.textContent = 'Words solved: ' + solved + ' of ' + rules.solvedWords.length + ' · Guesses: ' + rules.guessCount;
  showScreen('results');
}
if (elBtnPlay) elBtnPlay.addEventListener('click', startGame);
if (elBtnPause) elBtnPause.addEventListener('click', () => { paused = true; T.setTickEnabled(false); elScreenPause.hidden = false; });
if (elBtnResume) elBtnResume.addEventListener('click', () => { paused = false; T.setTickEnabled(true); elScreenPause.hidden = true; });
if (elBtnQuitToTitle) elBtnQuitToTitle.addEventListener('click', () => { paused = false; showScreen('title'); });
if (elBtnBackToTitle) elBtnBackToTitle.addEventListener('click', () => showScreen('title'));
if (elBtnGuessSubmit) elBtnGuessSubmit.addEventListener('click', onGuessSubmit);
if (elGuessInput) elGuessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') onGuessSubmit(); });

// game-over jingle, whichever path (guess or timer) ended the game
let wasOver = false;
function watchGameOver() {
  if (!rules) return;
  if (rules.over && !wasOver) {
    Sfx.play(rules.winReason === 'time-expired' ? 'game-over-time' : 'game-over-win');
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
if (typeof window !== 'undefined') window.addEventListener('resize', resizeCanvas);

export function _debug() {
  return { screen: screenName, paused, rules };
}

// module init (runs once at import)
rules = new Rules();
T.setRules(rules);
T.setTickEnabled(false);
T.init(elCanvas);
showScreen('title');
setHud(); updatePromptPanel(); updateGuessPanel();
resizeCanvas();
if (elScreenLoading) elScreenLoading.hidden = true;
T.start();
