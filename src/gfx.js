// Sketch Relay — graphics quality model: presets, per-category overrides, GPU
// detection and a cost summary. Pure (no three.js) so the settings panel, the
// renderer and the unit tests agree on what each setting means.

export const PRESETS = ['low', 'balanced', 'high', 'ultra'];

// Category → allowed tiers, cheapest first.
export const CATEGORIES = {
  shadows: ['off', 'low', 'medium', 'high'],
  ao: ['off', 'on', 'high'],
  bloom: ['off', 'on'],
  grade: ['off', 'on'],
  antialias: ['off', 'fxaa', 'smaa', 'msaa'],
  particles: ['off', 'low', 'high'],
  detail: ['plain', 'detailed'],
};

// Each preset: a tier per category, a render scale (multiplies the capped
// device pixel ratio) and a device-pixel-ratio cap.
const TABLE = {
  low: { scale: 1, maxRatio: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', particles: 'low', detail: 'plain' },
  balanced: { scale: 1, maxRatio: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', particles: 'low', detail: 'detailed' },
  high: { scale: 1, maxRatio: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', particles: 'high', detail: 'detailed' },
  ultra: { scale: 1.25, maxRatio: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', particles: 'high', detail: 'detailed' },
};

export const SHADOW_MAP = { off: 0, low: 1024, medium: 2048, high: 4096 };
export const PARTICLE_COUNT = { off: 0, low: 140, high: 420 };

/**
 * Best preset for this GPU from the unmasked renderer string. Software
 * renderers get Low; discrete GPUs and Apple M-series get High; everything
 * else Balanced. `mobile` caps the result at Balanced.
 */
export function detectPreset(gpu, mobile = false) {
  const g = String(gpu || '').toLowerCase();
  let p = 'balanced';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?! graphics)|apple m\d/.test(g)) p = 'high';
  if (mobile && PRESETS.indexOf(p) > PRESETS.indexOf('balanced')) p = 'balanced';
  return p;
}

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
export function resolve(saved, detected) {
  const s = saved || {};
  const auto = !PRESETS.includes(s.preset);
  const preset = auto ? (PRESETS.includes(detected) ? detected : 'balanced') : s.preset;
  const row = TABLE[preset];
  const renderScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
  const out = { preset, auto, renderScale, scale: row.scale * renderScale, maxRatio: row.maxRatio };
  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    out[cat] = tiers.includes(s[cat]) ? s[cat] : row[cat];
  }
  out.adaptive = s.adaptive !== false;
  out.showFps = !!s.show_fps;
  // The post chain runs only when something needs it; otherwise the canvas's own MSAA is used.
  out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on' || out.antialias === 'fxaa' || out.antialias === 'smaa';
  return out;
}

/** Saved settings after choosing a preset: overrides are cleared, scale/toggles kept. */
export function choosePreset(saved, preset) {
  const s = saved || {};
  const out = { preset: PRESETS.includes(preset) ? preset : 'auto' };
  if (s.render_scale != null) out.render_scale = s.render_scale;
  if (s.adaptive != null) out.adaptive = s.adaptive;
  if (s.show_fps != null) out.show_fps = s.show_fps;
  return out;
}

/** The preset's own tier for a category (for "From preset (…)" labels). */
export function presetTier(preset, cat) {
  return TABLE[preset]?.[cat];
}

export function describe(r, pixels) {
  const parts = [
    r.shadows === 'off' ? 'no shadows' : `${SHADOW_MAP[r.shadows]}² shadows`,
    r.ao === 'off' ? null : r.ao === 'high' ? 'full ambient occlusion' : 'ambient occlusion',
    r.bloom === 'on' ? 'bloom' : null,
    r.grade === 'on' ? 'colour grade' : null,
    r.antialias === 'off' ? 'no anti-aliasing' : r.antialias.toUpperCase(),
    r.particles === 'off' ? null : `${PARTICLE_COUNT[r.particles]} particles`,
    pixels ? `${pixels[0]}×${pixels[1]} px` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
