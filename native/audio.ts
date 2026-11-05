// Sound, as the browser build's src/sfx.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event on the effects bus.
// The runtime's Options own the volumes and the mute. Every clip loads at the
// start; a cue whose clip is still loading is skipped.
import { loadClip, play as playClip, type AudioClip } from "starhermit:audio";

const SAMPLES = [
  "ui-click", "game-start", "guess-submit", "guess-correct", "guess-wrong", "word-advance", "turn-advance",
  "game-over-win", "game-over-time", "pause-open", "pause-resume", "quit-to-title",
] as const;
export type Sfx = (typeof SAMPLES)[number];
const clips = new Map<string, AudioClip>();

export function play(ev: Sfx): void {
  const clip = clips.get(ev);
  if (!clip) return;
  try { playClip(clip, { bus: "effects" }); } catch { /* the mixer is full this frame: skip it */ }
}

/** Loads every clip (onStart). */
export function loadSfx(): void {
  for (const name of SAMPLES) {
    loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); }, (e: unknown) => { console.warn(`sfx ${name}: ${e instanceof Error ? e.message : String(e)}`); });
  }
}
