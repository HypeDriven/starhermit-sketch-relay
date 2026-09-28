// Sketch Relay — graphics quality model + settings locale tests (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPreset, resolve, presetTier, choosePreset, describe, CATEGORIES, PRESETS } from '../src/gfx.js';
import { STRINGS, pickLocale } from '../src/settings.js';

test('detectPreset maps GPU strings to tiers', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('Apple M2'), 'high');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(detectPreset('Adreno (TM) 650'), 'balanced');
  assert.equal(detectPreset(''), 'balanced');
});

test('detectPreset caps mobile devices at balanced', () => {
  assert.equal(detectPreset('Apple M1', true), 'balanced');
  assert.equal(detectPreset('SwiftShader', true), 'low');
});

test('resolve: auto uses the detected preset', () => {
  const r = resolve({}, 'low');
  assert.equal(r.preset, 'low');
  assert.equal(r.auto, true);
  assert.equal(r.shadows, 'off');
  assert.equal(r.post, false, 'Low renders without a post chain');
  assert.equal(r.adaptive, true);
  assert.equal(r.showFps, false);
});

test('resolve: explicit preset and overrides', () => {
  const r = resolve({ preset: 'high', shadows: 'off', particles: 'low' }, 'low');
  assert.equal(r.preset, 'high');
  assert.equal(r.auto, false);
  assert.equal(r.shadows, 'off');
  assert.equal(r.particles, 'low');
  assert.equal(r.bloom, presetTier('high', 'bloom'));
  assert.equal(r.post, true);
  // unknown tiers fall back to the preset
  assert.equal(resolve({ preset: 'ultra', ao: 'bogus' }, 'low').ao, presetTier('ultra', 'ao'));
});

test('resolve: render scale is clamped to 50–200%', () => {
  assert.equal(resolve({ preset: 'high', render_scale: 5 }).renderScale, 2);
  assert.equal(resolve({ preset: 'high', render_scale: 0.1 }).renderScale, 0.5);
  assert.equal(resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  assert.equal(resolve({ preset: 'low' }).maxRatio, 1);
});

test('choosing a preset clears overrides but keeps scale and toggles', () => {
  const s = choosePreset({ preset: 'high', shadows: 'off', bloom: 'off', render_scale: 1.5, show_fps: true }, 'low');
  assert.deepEqual(s, { preset: 'low', render_scale: 1.5, show_fps: true });
  assert.deepEqual(choosePreset({ ao: 'on' }, 'auto'), { preset: 'auto' });
});

test('presetTier covers every category of every preset', () => {
  for (const p of PRESETS) for (const [cat, tiers] of Object.entries(CATEGORIES)) assert.ok(tiers.includes(presetTier(p, cat)), `${p}.${cat}`);
});

test('describe summarises cost and pixels', () => {
  const d = describe(resolve({ preset: 'high' }), [1280, 800]);
  assert.match(d, /2048² shadows/);
  assert.match(d, /SMAA/);
  assert.match(d, /1280×800 px/);
});

test('settings panel strings exist for every required locale', () => {
  const required = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, pre + k + '.') : [pre + k]));
  const base = keys(STRINGS['en-US']).sort();
  for (const l of required) {
    assert.ok(STRINGS[l], l);
    assert.deepEqual(keys(STRINGS[l]).sort(), base, `${l} has every key`);
    for (const c of Object.keys(CATEGORIES)) assert.ok(STRINGS[l].cat[c], `${l} cat ${c}`);
  }
});

test('pickLocale matches exact tags, regions and language fallbacks', () => {
  assert.equal(pickLocale(['fr-CA']), 'fr-CA');
  assert.equal(pickLocale(['fr']), 'fr-FR');
  assert.equal(pickLocale(['es-MX']), 'es-419');
  assert.equal(pickLocale(['es-ES']), 'es-ES');
  assert.equal(pickLocale(['en-AU']), 'en-GB');
  assert.equal(pickLocale(['pt-PT']), 'pt-BR');
  assert.equal(pickLocale(['ja-JP', 'de']), 'de-DE');
  assert.equal(pickLocale(['ja']), 'en-US');
});
