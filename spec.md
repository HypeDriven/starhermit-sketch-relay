# Sketch Relay — specification (StarHermit engine)

Sketch Relay is a StarHermit engine script game (TypeScript on the host API), pinned to engine
**1.29.0** with `engine.minor=31`. One package plays natively in the StarHermit client and in
browsers through the engine's web runtime (`index.html` is the loader `npm run package` writes).

## The game

A **solo prompt relay** in a shared drawing studio. Twelve studio artists (Aiko … Leo) take turns;
each shows three prompts (36 in all, from `src/rules.js`). The player types the prompt shown into
the guess field and submits it (Enter or Submit) before that prompt's 60-second timer runs out.
A correct guess moves to the next prompt (the next artist after three); a wrong, misspelled or
empty guess is counted and the player tries again; a prompt whose timer runs out is skipped. The
relay ends when the last prompt is solved ("All words completed!") or its timer runs out
("Time's up!"). Results show words solved of 36, guesses and the best round.

The prompt is shown in the interface language and accepted typed in that language or in English,
ignoring case and accents (`src/prompts.js`); the rules always receive the canonical English word.

Despite the store description ("draw … guess other players' sketches"), the game has no drawing
and no multiplayer — the browser build never had either (its client opened no session or room;
"Invite a friend" only copies the invite link). There is therefore no hosted play and nothing to
referee; see Known limitations.

## Screens

- **Title** — name, tagline, the "Solo relay practice" how-to panel, Play, Resume round (when a
  round is in progress), Settings (opens the runtime's Options), Sign in with StarHermit (guests),
  Invite a friend (signed in: copies the invite link) and the status line ("Local play — progress
  is saved on this device" or "Playing as NAME · Cloud save: synced/saving…/error (retrying)").
  When the window is too short the title scrolls.
- **Relay** — the HUD (Artist: NAME, Time left: Ns, Pause), the Prompt panel, the guess panel
  (label, field, Submit, feedback line) and the status line at the bottom. Short landscape
  (height ≤ 500 px, wider than tall) puts the prompt and guess panels side by side with compact
  text; narrow phones (≤ 520 px) stack the field over Submit and shrink the HUD pills. Long
  prompt words shrink to fit the panel.
- **Paused** — Resume, Settings (runtime Options), Quit to title (saves the round; Resume round on
  the title continues it). Escape/Back closes it and resumes.
- **Results** — the headline, the summary, the leaderboard line when signed in (posting / rank /
  posted / not posted) and Back to title.
- Toasts (invite copied, signed out) at the bottom.

The studio (`native/render.ts`) fills the window behind every screen: the timer bar on the wall
shrinks with the current prompt's time (orange in the last fifth), the current artist lifts and
glows with a ring sliding under them, dust motes drift and the lamp bulbs shimmer (still under
the runtime's reduced-motion preference).

## Controls

| Action | Keyboard | Gamepad | Pointer / touch |
|---|---|---|---|
| `submit` Submit guess | Enter, Numpad Enter (in the field: Enter) | South | Submit |
| `back` Pause / resume | Escape (also while typing) | Start, East | Pause / Resume |

Guesses are typed into the runtime text field (on phones and tablets tapping it brings up the
on-screen keyboard; paste and input methods work). Menus are navigated with Tab/arrows/Enter or
the D-pad and South, as every runtime UI. Keys and pads are rebound in the runtime's Options.
F1 opens the runtime's Options.

## Settings

The runtime's Options own sound volumes and mute, the voice limit, graphics level and frame-rate
limit, language, controls and accessibility (text scale, high contrast, reduced motion). The
browser build's Graphics panel, Language section and Sound section are not rebuilt.

Graphics follow the runtime's quality tier (`frame().quality`, `native/quality.ts`: the old
`gfx.js` presets and budgets; dust motes scale ≤ 2× within a tier by `frame().levelIndex`):

| Tier | Shadows | AO | Bloom | Grade | AA | Dust | Studio detail | Materials |
|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | 50 (low) | plain (no props/textures) | standard |
| Balanced | 1024 | off | on | on | FXAA | 80 (low) | detailed | standard |
| High | 2048 | on (8 samples) | on | on | SMAA | 420 | detailed | clear-coated |
| Ultra | 4096 | high (16) | on | on | MSAA | 600 | detailed | clear-coated |

Rendering ports three.js r182: punctual, ambient and hemisphere intensities ÷ π (engine light
units), `RoomEnvironment(renderer)` (r182's room) at the old `environmentIntensity` 0.3, ACES at
exposure 1, bloom 0.45 / 0.4 / threshold 0.92, GTAO radius 0.6 blend 0.7, the old colour grade and
vignette as the runtime's linear `renderer.grade` after bloom (smoothstep S-curve 0.18, saturation 1.1,
split tint, levels 0.97 + 0.02, over-range kept, vignette 0.24).

## Sound

The twelve authored clips (`sfx/*.opus`) on the effects bus: UI click, game start, guess submit /
correct / wrong, word and turn advance, win and time-up jingles, pause open/resume, quit. Clips
load one at a time once the mixer runs (in a browser after the first press).

## Saves and platform

- The save is the browser build's document `{ v: 1, savedAt, rules: round snapshot, results:
  { games, wins, bestSolved, totalSolved } }` as the engine save (schema 1; device plus the
  player's cloud slot). Two devices' saves merge with `src/save-merge.js` (records keep the larger
  value; the round is this device's when the player started or is in one here, else the newer).
- The browser build's cloud slot (`game:sketch-relay`, the JS SDK's JSON text) shows as a foreign
  save: it is merged in and replaced once. Guests' old localStorage copies cannot be read.
- The round is saved on every guess, every 5 s of play, on pause by hiding the window, on quit and
  at the end. A hidden window pauses the round (the pause dialog shows on return).
- Signed in, each finished relay posts its solved-word count (0–36) to the **words-solved**
  leaderboard through `score-script.js` (a practice session; the script range-checks the score
  and returns it, as before) and shows the rank.

## Implementation

- `native/main.ts` — screens (starhermit:ui), flow, guess handling, relay clock on fixed steps
  (60 Hz; `rules.tick` only while the relay plays), save, results, lifecycle.
- `native/render.ts` — the studio on starhermit:scene; `native/quality.ts` — looks per tier.
- `native/platform.ts` — save, merge, foreign-slot migration, invite, score posting.
- `native/i18n.ts` — the runtime language → `src/i18n.js` + `src/locales/*` (nine locales) and
  `src/sh-strings.js`; `native/audio.ts` — clips; `native/style.ts` + `tools/ui-style.css` →
  `assets/ui-style.json` (`npm run css`); `native/game.ts` — typed views of the shared modules.
- Unchanged browser-build modules: `src/rules.js`, `src/prompts.js`, `src/save-merge.js`,
  `src/sh-strings.js`, the locale tables; `score-script.js` (server script); `server.js` (a local
  static file server, development only).

## Checks

- `npm run test:unit` — rules (106 assertions), save merge incl. the old cloud slot, i18n coverage
  (every native string and prompt in all locales, placeholders, no stray rows, prompt matching),
  the static server.
- `npm run test:native` (`tests/native.mjs`) — the web index matches the files, `tsc`,
  `starhermit check .` with zero warnings, and the play scripts in `tests/native/` as render
  checks: `menus.play` (title, wrong and right guess, pause, quit, Resume round),
  `relay-keys.play` (the whole relay typed with Enter, wrong guesses, results), `relay-phone.play`
  (390×844 at DPR 3 by finger: field, typing, Submit, pause, results) and `relay-land.play`
  (844×390 at DPR 3). The relay scripts come from `tools/gen-plays.mjs` (`npm run plays`).
- `npm run test:browser` (`tools/browser-play.mjs`) — the packaged game in GPU Chrome
  (`~/games/tools/gpu-chrome.mjs`) at desktop, phone (DPR 3) and landscape (DPR 3): the whole relay
  typed on the desktop with a pause, finger play with quit and resume on the phone; fails on
  console errors.
- `npm run package` regenerates `index.html` + `starhermit-files.json` after every change.

## Known limitations

- No drawing and no multiplayer (never existed in the browser build; the description promises
  both). Hosted play is not offered, so nothing is refereed or recorded beyond the solo
  words-solved post.
- Solo scores are client totals range-checked by `score-script.js` (0–36), as before.
- A relay that ends by time (36 × 60 s) is covered by the rules tests, not by a play script.
- Gamepad players cannot type guesses without a keyboard (as before).
- The synthesized fallback blips the browser build played while a clip loaded are not ported.
