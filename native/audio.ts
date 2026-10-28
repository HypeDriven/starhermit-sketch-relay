// Sound, as the browser build's src/sfx.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event on the effects bus.
// The synthesized blips sfx.js played while a sample decoded are not ported
// (a live synthesis graph makes clip loads fail on the web runtime): a clip
// still loading is silent. The runtime's Options own the volumes and the
// mute. Clips load once the mixer runs (natively at once, in a browser after
// the first press), one at a time.
import { context, loadClip, play as playClip, type AudioClip } from "starhermit:audio";

const SAMPLES = [
  "ui-click", "game-start", "guess-submit", "guess-correct", "guess-wrong", "word-advance", "turn-advance",
  "game-over-win", "game-over-time", "pause-open", "pause-resume", "quit-to-title",
] as const;
export type Sfx = (typeof SAMPLES)[number];
const clips = new Map<string, AudioClip>();
const queue: string[] = [...SAMPLES];
let loading = false;

export function play(ev: Sfx): void {
  const clip = clips.get(ev);
  if (!clip) return;
  try { playClip(clip, { bus: "effects" }); } catch { clips.delete(ev); if (!queue.includes(ev)) queue.push(ev); }
}

/** Each frame: the next clip once the mixer runs. */
export function update(): void {
  if (context.state !== "running" || loading || !queue.length) return;
  const name = queue.shift()!;
  if (clips.has(name)) return;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => {
    console.warn(`sfx ${name}: ${e instanceof Error ? e.message : String(e)}`);
    loading = false;
  });
}
