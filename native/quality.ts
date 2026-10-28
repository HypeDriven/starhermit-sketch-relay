// The look per graphics level: the browser build's four presets and budgets
// (src/gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU
// its Auto gave it) keyed by the runtime's quality tier (frame().quality),
// with the dust motes scaled within the tier by the level (frame().levelIndex,
// at most 2×), as the browser build scaled them by its hardware level. The
// runtime owns the rest of what the old Graphics panel did: Auto and the level
// choice, render scale and the pixel-ratio cap, adaptive resolution, the
// frame-rate limit and readout. The old panel's per-effect overrides are not
// offered (the runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Look {
  preset: QualityTier;
  shadows: 0 | 1024 | 2048 | 4096;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  /** Dust motes: share of the budget ("low" a third). */
  particles: "low" | "high";
  /** Plank floor, plaster, the whiteboard doodles and the props (Studio detail). */
  detailed: boolean;
  /** Whiteboard, word card and paint pots: standard or clear-coated physical. */
  material: "standard" | "physical";
  motes: number;
  bloomRes: number;
  aoRes: number;
}

/** gfx.js TABLE. */
const TABLE: Record<QualityTier, Pick<Look, "shadows" | "ao" | "bloom" | "grade" | "antialias" | "particles" | "detailed">> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", particles: "low", detailed: false },
  balanced: { shadows: 1024, ao: "off", bloom: true, grade: true, antialias: "fxaa", particles: "low", detailed: true },
  high: { shadows: 2048, ao: "on", bloom: true, grade: true, antialias: "smaa", particles: "high", detailed: true },
  ultra: { shadows: 4096, ao: "high", bloom: true, grade: true, antialias: "msaa", particles: "high", detailed: true },
};
/** gfx.js BUDGETS (anisotropy is the runtime's texture filtering). */
const BUDGETS: Record<QualityTier, { material: "standard" | "physical"; particles: number; bloomRes: number; aoRes: number }> = {
  low: { material: "standard", particles: 150, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", particles: 240, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", particles: 420, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", particles: 600, bloomRes: 1, aoRes: 1 },
};
/** The first level index of each tier. */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };
export const PARTICLE_MAX = 1200;

/** The look for a quality tier at a level index (0 … 9). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const row = TABLE[preset], b = BUDGETS[preset];
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  const budget = Math.min(PARTICLE_MAX, Math.round(b.particles * k));
  const motes = Math.round(budget * (row.particles === "high" ? 1 : 1 / 3));
  return { preset, ...row, material: b.material, motes, bloomRes: b.bloomRes, aoRes: b.aoRes };
}
