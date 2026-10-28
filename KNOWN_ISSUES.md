# Known Issues — Sketch Relay

## Open

- The store description promises drawing and guessing other players' sketches; the game is a solo
  prompt relay (it always was: the browser build had no drawing and never opened a session or
  room). Drawing or multiplayer would be new features, not part of the engine port.
- Gamepad-only players cannot type guesses.
- A relay that ends by time is checked by the rules tests only (a scripted run would take 36 min).

## Resolved history (browser build)

- Loading screen never cleared (missing three import map, wrong stylesheet path, screens never
  toggled) — fixed in 7573a28; the DOM client is gone since the engine port.
- `Rules.deserialize` dropped the game-over state — fixed, covered by `tests/rules.test.mjs`.
- `server.js` path traversal and fixed-port test — fixed, covered by `tests/server.test.mjs`.
