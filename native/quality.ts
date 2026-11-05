// The look per graphics level. The engine owns its effects: shadows and their
// map size, ambient occlusion, bloom, the grade and anti-aliasing come from
// levelSettings(). The game keeps its art (src/gfx.js BUDGETS and the rest of
// its TABLE) keyed by the runtime's quality tier, with the dust motes scaled
// within the tier by the level's particle budget (at most 2×). The runtime owns
// the rest of what the old Graphics panel did: Auto and the level choice, render
// scale and the pixel-ratio cap, adaptive resolution, the frame-rate limit and
// readout. The old panel's per-effect overrides are not offered (the runtime's
// Options choose a level).
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Look {
  preset: QualityTier;
  /** The level's shadow map size, 0 = off. */
  shadows: number;
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution, null = off. */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  /** Dust motes: share of the budget ("low" a third). */
  particles: "low" | "high";
  /** Plank floor, plaster, the whiteboard doodles and the props (Studio detail). */
  detailed: boolean;
  /** Whiteboard, word card and paint pots: standard or clear-coated physical. */
  material: "standard" | "physical";
  motes: number;
}

/** gfx.js TABLE: the game's art columns. */
const ART: Record<QualityTier, Pick<Look, "particles" | "detailed">> = {
  low: { particles: "low", detailed: false },
  balanced: { particles: "low", detailed: true },
  high: { particles: "high", detailed: true },
  ultra: { particles: "high", detailed: true },
};
/** gfx.js BUDGETS (anisotropy is the runtime's texture filtering). */
const BUDGETS: Record<QualityTier, { material: "standard" | "physical"; particles: number }> = {
  low: { material: "standard", particles: 150 },
  balanced: { material: "standard", particles: 240 },
  high: { material: "physical", particles: 420 },
  ultra: { material: "physical", particles: 600 },
};
/** Each tier's anchor level: its budgets are at this level's particle count. */
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };
export const PARTICLE_MAX = 1200;

/** The look for a graphics level's settings. */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const row = ART[preset], b = BUDGETS[preset];
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const budget = Math.min(PARTICLE_MAX, Math.round(b.particles * k));
  const motes = Math.round(budget * (row.particles === "high" ? 1 : 1 / 3));
  return {
    preset, ...row, material: b.material, motes,
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    antialias: s.antialias,
  };
}
