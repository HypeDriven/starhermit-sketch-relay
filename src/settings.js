// Sketch Relay — Settings panel (Graphics section).
// Opened from the title menu and the pause overlay. Every change applies live
// through threejs.setGraphics() and persists in localStorage under its own key.
// The panel's strings are localized (en-US, en-GB, es-419, es-ES, de-DE,
// fr-FR, fr-CA, pt-BR, it-IT); locale comes from ?lang= or navigator.languages.
import * as T from './threejs.js';
import { actionFor } from './platform.js';
import { PRESETS, CATEGORIES, presetTier, choosePreset, SHADOW_MAP, PARTICLE_COUNT } from './gfx.js';

export const STORAGE_KEY = 'sketch-relay.graphics.v1';

const EN = {
  settings: 'Settings', close: 'Close', graphics: 'Graphics', quality: 'Quality',
  auto: 'Auto (detected: {tier})', fromPreset: 'From preset ({tier})', renderScale: 'Render scale',
  adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
  postFailed: 'Post-processing is unavailable here, so the game renders without it.',
  noWebgl: '3D view unavailable; graphics settings have no effect.', unknownGpu: 'unknown GPU',
  preset: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra' },
  cat: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Color grade', antialias: 'Anti-aliasing', particles: 'Dust particles', detail: 'Studio detail' },
  tier: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High', plain: 'Plain', detailed: 'Detailed', particles: 'particles' },
};

export const STRINGS = {
  'en-US': EN,
  'en-GB': Object.assign({}, EN, {
    cat: Object.assign({}, EN.cat, { grade: 'Colour grade' }),
  }),
  'es-419': {
    settings: 'Configuración', close: 'Cerrar', graphics: 'Gráficos', quality: 'Calidad',
    auto: 'Automática (detectada: {tier})', fromPreset: 'Del preajuste ({tier})', renderScale: 'Escala de renderizado',
    adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
    postFailed: 'El posprocesamiento no está disponible aquí; el juego se muestra sin él.',
    noWebgl: 'Vista 3D no disponible; la configuración gráfica no tiene efecto.', unknownGpu: 'GPU desconocida',
    preset: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
    cat: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Antialiasing', particles: 'Partículas de polvo', detail: 'Detalle del estudio' },
    tier: { off: 'Desactivado', on: 'Activado', low: 'Bajo', medium: 'Medio', high: 'Alto', plain: 'Simple', detailed: 'Detallado', particles: 'partículas' },
  },
  'es-ES': {
    settings: 'Ajustes', close: 'Cerrar', graphics: 'Gráficos', quality: 'Calidad',
    auto: 'Automática (detectada: {tier})', fromPreset: 'Del preajuste ({tier})', renderScale: 'Escala de renderizado',
    adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
    postFailed: 'El posprocesado no está disponible en este equipo; el juego se muestra sin él.',
    noWebgl: 'Vista 3D no disponible; los ajustes gráficos no tienen efecto.', unknownGpu: 'GPU desconocida',
    preset: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
    cat: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Suavizado de bordes', particles: 'Partículas de polvo', detail: 'Detalle del estudio' },
    tier: { off: 'Desactivado', on: 'Activado', low: 'Bajo', medium: 'Medio', high: 'Alto', plain: 'Simple', detailed: 'Detallado', particles: 'partículas' },
  },
  'de-DE': {
    settings: 'Einstellungen', close: 'Schließen', graphics: 'Grafik', quality: 'Qualität',
    auto: 'Automatisch (erkannt: {tier})', fromPreset: 'Aus Voreinstellung ({tier})', renderScale: 'Renderskalierung',
    adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
    postFailed: 'Nachbearbeitung ist hier nicht verfügbar, das Spiel wird ohne sie dargestellt.',
    noWebgl: '3D-Ansicht nicht verfügbar; Grafikeinstellungen haben keine Wirkung.', unknownGpu: 'unbekannte GPU',
    preset: { low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra' },
    cat: { shadows: 'Schatten', ao: 'Umgebungsverdeckung', bloom: 'Bloom', grade: 'Farbkorrektur', antialias: 'Kantenglättung', particles: 'Staubpartikel', detail: 'Studiodetails' },
    tier: { off: 'Aus', on: 'An', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', plain: 'Schlicht', detailed: 'Detailliert', particles: 'Partikel' },
  },
  'fr-FR': {
    settings: 'Paramètres', close: 'Fermer', graphics: 'Graphismes', quality: 'Qualité',
    auto: 'Auto (détectée : {tier})', fromPreset: 'Selon le préréglage ({tier})', renderScale: 'Échelle de rendu',
    adaptive: 'Résolution adaptative', showFps: 'Afficher la fréquence d’images',
    postFailed: 'Le post-traitement n’est pas disponible ici ; le jeu s’affiche sans.',
    noWebgl: 'Vue 3D indisponible ; les réglages graphiques sont sans effet.', unknownGpu: 'GPU inconnu',
    preset: { low: 'Faible', balanced: 'Équilibrée', high: 'Élevée', ultra: 'Ultra' },
    cat: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs', antialias: 'Anticrénelage', particles: 'Particules de poussière', detail: 'Détails de l’atelier' },
    tier: { off: 'Désactivé', on: 'Activé', low: 'Faible', medium: 'Moyen', high: 'Élevé', plain: 'Simple', detailed: 'Détaillé', particles: 'particules' },
  },
  'fr-CA': {
    settings: 'Paramètres', close: 'Fermer', graphics: 'Graphiques', quality: 'Qualité',
    auto: 'Auto (détectée : {tier})', fromPreset: 'Selon le préréglage ({tier})', renderScale: 'Échelle de rendu',
    adaptive: 'Résolution adaptative', showFps: 'Afficher la fréquence d’images',
    postFailed: 'Le post-traitement n’est pas offert ici ; le jeu s’affiche sans.',
    noWebgl: 'Vue 3D non disponible ; les paramètres graphiques n’ont aucun effet.', unknownGpu: 'GPU inconnu',
    preset: { low: 'Faible', balanced: 'Équilibrée', high: 'Élevée', ultra: 'Ultra' },
    cat: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Éclat lumineux', grade: 'Correction des couleurs', antialias: 'Anticrénelage', particles: 'Particules de poussière', detail: 'Détails de l’atelier' },
    tier: { off: 'Désactivé', on: 'Activé', low: 'Faible', medium: 'Moyen', high: 'Élevé', plain: 'Simple', detailed: 'Détaillé', particles: 'particules' },
  },
  'pt-BR': {
    settings: 'Configurações', close: 'Fechar', graphics: 'Gráficos', quality: 'Qualidade',
    auto: 'Automática (detectada: {tier})', fromPreset: 'Da predefinição ({tier})', renderScale: 'Escala de renderização',
    adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
    postFailed: 'O pós-processamento não está disponível aqui; o jogo é exibido sem ele.',
    noWebgl: 'Visualização 3D indisponível; as configurações gráficas não têm efeito.', unknownGpu: 'GPU desconhecida',
    preset: { low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
    cat: { shadows: 'Sombras', ao: 'Oclusão ambiente', bloom: 'Brilho', grade: 'Correção de cor', antialias: 'Antisserrilhamento', particles: 'Partículas de poeira', detail: 'Detalhes do estúdio' },
    tier: { off: 'Desligado', on: 'Ligado', low: 'Baixo', medium: 'Médio', high: 'Alto', plain: 'Simples', detailed: 'Detalhado', particles: 'partículas' },
  },
  'it-IT': {
    settings: 'Impostazioni', close: 'Chiudi', graphics: 'Grafica', quality: 'Qualità',
    auto: 'Automatica (rilevata: {tier})', fromPreset: 'Dal preset ({tier})', renderScale: 'Scala di rendering',
    adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
    postFailed: 'La post-elaborazione non è disponibile qui; il gioco viene mostrato senza.',
    noWebgl: 'Vista 3D non disponibile; le impostazioni grafiche non hanno effetto.', unknownGpu: 'GPU sconosciuta',
    preset: { low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra' },
    cat: { shadows: 'Ombre', ao: 'Occlusione ambientale', bloom: 'Bagliore', grade: 'Correzione colore', antialias: 'Antialiasing', particles: 'Particelle di polvere', detail: 'Dettagli dello studio' },
    tier: { off: 'Disattivato', on: 'Attivato', low: 'Basso', medium: 'Medio', high: 'Alto', plain: 'Semplice', detailed: 'Dettagliato', particles: 'particelle' },
  },
};

const FALLBACK = { en: 'en-US', es: 'es-419', de: 'de-DE', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT' };

/** Pick a supported locale for a list of BCP-47 tags. */
export function pickLocale(tags) {
  for (const raw of tags || []) {
    if (!raw) continue;
    const tag = String(raw).replace('_', '-');
    const exact = Object.keys(STRINGS).find((k) => k.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const [lang, region] = tag.toLowerCase().split('-');
    if (lang === 'en' && region && ['gb', 'uk', 'ie', 'au', 'nz'].includes(region)) return 'en-GB';
    if (lang === 'es' && region === 'es') return 'es-ES';
    if (lang === 'fr' && region === 'ca') return 'fr-CA';
    if (FALLBACK[lang]) return FALLBACK[lang];
  }
  return 'en-US';
}

function detectLocale() {
  const tags = [];
  try { const q = new URLSearchParams(location.search).get('lang'); if (q) tags.push(q); } catch (_) { /* no location */ }
  if (typeof navigator !== 'undefined') tags.push(...(navigator.languages || []), navigator.language);
  return pickLocale(tags);
}

// ---------------------------------------------------------------- persistence

export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch (_) { return {}; }
}
function store(saved) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (_) { /* private mode: settings still apply this session */ }
}

// ---------------------------------------------------------------- panel

let S = EN, locale = 'en-US', saved = {};
let opener = null;
const $ = (id) => document.getElementById(id);
const fmt = (s, tier) => s.replace('{tier}', tier);

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('data-') || k === 'for' || k.startsWith('aria-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  for (const c of kids || []) e.append(c);
  return e;
}

function tierLabel(t) { return S.tier[t] || t.toUpperCase(); }

function buildForm() {
  const form = $('gfx-form');
  form.textContent = '';
  const row = (id, label, control) => el('div', { className: 'gfx-row' }, [el('label', { for: id, text: label }), control]);

  const preset = el('select', { id: 'gfx-preset', 'data-gfx': 'preset' });
  preset.append(el('option', { value: 'auto', id: 'gfx-preset-auto' }));
  for (const p of PRESETS) preset.append(el('option', { value: p, text: S.preset[p] }));
  preset.addEventListener('change', () => { saved = choosePreset(saved, preset.value); commit(); });
  form.append(row('gfx-preset', S.quality, preset));

  const scale = el('input', { id: 'gfx-scale', type: 'range', min: 50, max: 200, step: 10, 'data-gfx': 'render_scale' });
  const scaleOut = el('output', { id: 'gfx-scale-value', className: 'gfx-scale-value', for: 'gfx-scale' });
  scale.addEventListener('input', () => { saved.render_scale = Number(scale.value) / 100; commit(); });
  form.append(row('gfx-scale', S.renderScale, el('div', { className: 'gfx-scale' }, [scale, scaleOut])));

  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    const sel = el('select', { id: 'gfx-' + cat, 'data-gfx': cat });
    sel.append(el('option', { value: 'preset', className: 'gfx-from-preset' }));
    for (const t of tiers) sel.append(el('option', { value: t, text: tierLabel(t) }));
    sel.addEventListener('change', () => {
      if (sel.value === 'preset') delete saved[cat]; else saved[cat] = sel.value;
      commit();
    });
    form.append(row('gfx-' + cat, S.cat[cat], sel));
  }

  const check = (id, key, label, def) => {
    const c = el('input', { id, type: 'checkbox', 'data-gfx': key });
    c.addEventListener('change', () => { saved[key] = c.checked; commit(); });
    c.dataset.default = def ? '1' : '0';
    return el('div', { className: 'gfx-row gfx-check' }, [c, el('label', { for: id, text: label })]);
  };
  form.append(check('gfx-adaptive', 'adaptive', S.adaptive, true));
  form.append(check('gfx-show-fps', 'show_fps', S.showFps, false));
}

function summaryText(info) {
  const r = info.resolved;
  const parts = [info.gpu === 'unknown GPU' ? S.unknownGpu : info.gpu];
  if (r.shadows !== 'off') parts.push(`${S.cat.shadows} ${SHADOW_MAP[r.shadows]}²`);
  if (r.ao !== 'off') parts.push(S.cat.ao);
  if (r.bloom === 'on') parts.push(S.cat.bloom);
  if (r.grade === 'on') parts.push(S.cat.grade);
  parts.push(r.antialias === 'off' ? `${S.cat.antialias}: ${S.tier.off}` : r.antialias.toUpperCase());
  if (r.particles !== 'off') parts.push(`${PARTICLE_COUNT[r.particles]} ${S.tier.particles}`);
  parts.push(`${info.pixels[0]}×${info.pixels[1]} px`);
  return parts.join(' · ');
}

function refresh() {
  if (!$('gfx-form')) return;
  const info = T.graphicsInfo();
  const r = info.resolved;
  const presetName = S.preset[r.preset];
  $('gfx-preset-auto').textContent = fmt(S.auto, S.preset[info.detected]);
  $('gfx-preset').value = r.auto ? 'auto' : r.preset;
  $('gfx-scale').value = String(Math.round(r.renderScale * 100));
  $('gfx-scale-value').textContent = Math.round(r.renderScale * 100) + '%';
  for (const cat of Object.keys(CATEGORIES)) {
    const sel = $('gfx-' + cat);
    sel.querySelector('.gfx-from-preset').textContent = fmt(S.fromPreset, tierLabel(presetTier(r.preset, cat)));
    sel.value = CATEGORIES[cat].includes(saved[cat]) ? saved[cat] : 'preset';
  }
  $('gfx-adaptive').checked = r.adaptive;
  $('gfx-show-fps').checked = r.showFps;
  $('gfx-summary').textContent = summaryText(info);
  const note = $('gfx-note');
  note.hidden = info.webgl && !info.postFailed;
  note.textContent = !info.webgl ? S.noWebgl : S.postFailed;
  for (const node of [document.body, $('scene-canvas')]) {
    if (!node) continue;
    node.dataset.gfxPreset = r.preset;
    node.dataset.gfxAuto = r.auto ? '1' : '0';
  }
}

let commitHook = null;
/** Called with the graphics settings after every change (platform settings KV mirror). */
export function onCommit(fn) { commitHook = fn; }

function commit() {
  store(saved);
  T.setGraphics(saved);
  refresh();
  if (commitHook) { try { commitHook(Object.assign({}, saved)); } catch (_) { /* mirror is best-effort */ } }
}

/** Apply graphics settings from the platform (they win over the local copy). */
export function applySaved(obj) {
  if (!obj || typeof obj !== 'object') return;
  saved = Object.assign({}, obj);
  store(saved);
  T.setGraphics(saved);
  refresh();
}

/** The UI locale picked at init. */
export function getLocale() { return locale; }

export function open(from) {
  opener = from || document.activeElement;
  $('screen-settings').hidden = false;
  refresh();
  $('gfx-preset').focus();
}

export function close() {
  $('screen-settings').hidden = true;
  if (opener && typeof opener.focus === 'function') opener.focus();
  opener = null;
}

export function isOpen() { return !!$('screen-settings') && !$('screen-settings').hidden; }

export function init() {
  locale = detectLocale();
  S = STRINGS[locale];
  saved = loadSaved();
  const panel = $('screen-settings');
  if (panel) panel.setAttribute('lang', locale);
  for (const id of ['btn-settings', 'btn-pause-settings']) {
    const b = $(id);
    if (b) { b.textContent = S.settings; b.setAttribute('lang', locale); b.addEventListener('click', () => open(b)); }
  }
  $('settings-title').textContent = S.settings;
  $('gfx-heading').textContent = S.graphics;
  $('btn-settings-close').textContent = S.close;
  $('btn-settings-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
  document.addEventListener('keydown', (e) => {
    if (actionFor(e.code) === 'back' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  buildForm();
  T.onGraphicsChange(() => { if (isOpen()) refresh(); });
  T.setGraphics(saved);
  refresh();
}
