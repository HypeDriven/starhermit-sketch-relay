# Known Issues — Sketch Relay

## Resolved: loading screen never cleared / game never reached first screen

**Symptom:** On load the `#screen-loading` overlay stayed visible forever; the
game never reached the title screen. This is the exact condition the e2e
playthrough (`tests/e2e.mjs`) failed on, timing out on
`await page.waitForSelector('#screen-loading', { state: 'hidden' })`.

**Root cause:** Startup was blocked before the loading overlay could be hidden.
The app module (`src/main.js`) only hid `#screen-loading` at the very end of
module init, so anything that threw (or didn't run) during startup left it
stuck. The concrete blockers were:

- `index.html` referenced `./style.css` but the file is at `src/style.css`, so
  the 3D scene/screen stacking never applied.
- The bare `three` import could not resolve in the browser (no node_modules),
  so `src/threejs.js` never loaded — the WebGL scene never initialized.
- `threejs.js` called static `Rules.tick` / `Rules.ROSTER_SIZE`, which do not
  exist; it now ticks the live `Rules` instance via `setRules`/`setTickEnabled`.
- `showScreen()` only assigned a `screenName` variable; it never toggled the
  screen elements (`#screen-title`, `#screen-game`, `#screen-results`,
  `#screen-pause`), so no screen ever became visible and the loading overlay
  was never hidden.
- The canvas intercepted all pointer events; screens now stack above it and
  `[hidden] { display: none !important; }` always wins over flex layouts.

**Fix:** `commit 7573a28` ("Fix startup blockers") vendored `three`
(`vendor/three.module.min.js` + `three.core.min.js`), added the importmap,
corrected the stylesheet path to `src/style.css`, wired the screen flow and
UI stacking, and hooked the Play/Pause/Resume/Quit/Back buttons.

**Hardening added on top:** `src/main.js` `showScreen()` now hides
`#screen-loading` whenever any screen becomes active, so the loading overlay
is guaranteed to clear even if a later startup step were to fail. The loading
clear is no longer a one-time line at the end of module init.

**Verification:** `node tests/e2e.mjs` exits 0 and prints
`E2E PASS — sketch-relay: full playthrough (desktop + mobile), no page errors`.
`npm test` is green (rules + threejs unit tests).

## Open / out of current scope

- `tests/main.test.mjs` imports `src/main.js`, which touches the DOM at module
  load; it requires a DOM environment (e.g. jsdom) and is not run by `npm test`.

## Resolved: server test fragility and static-server hardening

- `tests/server.test.mjs` previously checked `mod.server` (missing named
  export), bound the fixed port 3000, and raced the listen callback. It now
  sets `PORT=0` (ephemeral port — `server.js` honors an explicit `PORT`,
  including 0), waits for `listening`, and uses the actual bound port. It is
  part of `npm test`.
- `server.js` previously served any path under the process filesystem via
  `path.join(ROOT, p)` (e.g. `/../agents.md` escaped the game root). Requests
  that normalize outside the game root now return 404. Added missing MIME
  types for `.svg`, `.png`, `.ico`, `.mjs` (favicon/cover art were served as
  `application/octet-stream`).

## Resolved: rules deserialization dropped game-over state

- `Rules.deserialize` ignored the persisted `over`/`winReason` fields and
  instead heuristically marked any state at the final seat's last word as
  over — corrupting mid-game restores. It now restores `over`/`winReason`
  directly, clamps out-of-range seat/word indices, and only infers a win
  reason when `over` is set without one. Covered by new round-trip tests in
  `tests/rules.test.mjs`.
