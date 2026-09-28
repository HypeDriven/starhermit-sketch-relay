// Sketch Relay — Three.js presentation layer (WebGL).
// A warm shared studio: plank floor, plaster walls, a framed drawing wall with
// the relay timer, pendant lamps, props and a row of twelve seated artists.
// Quality is driven by gfx.js (presets + per-category overrides) and applied
// live through setGraphics().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROSTER_SIZE, ROUND_SECONDS } from './rules.js';
import { detectPreset, resolve, describe, SHADOW_MAP, PARTICLE_COUNT } from './gfx.js';

export const C = {
  floor: '#2b3040', wall: '#8f97a6', panel: '#eef1f5', card: '#edf0f4',
  timer: '#f7c948', particle: '#ffe4c4',
  // studio palette used by the detailed tier
  plank: '#8a6445', plaster: '#9c9384', wainscot: '#3c4658', frame: '#6b4a32', lamp: '#ffd9a0'
};

export const SHIRTS = ['#cc4b37', '#3a6ea5', '#c98a10', '#4a8a5c'];
const SKIN = ['#e0b394', '#a8714f', '#f1c9a8', '#7b4f36', '#c98f6b', '#5c3a28'];

let renderer = null, scene = null, camera = null;
let rafId = 0, running = false, lastTs = 0;
let qualityTier = 'high';
const hasWebGL = typeof window !== 'undefined' && !!(window.WebGLRenderingContext);

// entity handles (created in init)
let floorMesh, backWallMesh, leftWallMesh, rightWallMesh, frontWallMesh;
let panelMesh, timerBarMesh, wordCardMesh, artistRing, keyLight, ambLight;
let playerMeshes = [];       // shirt/body meshes (one material each)
let playerGroups = [];
let particlePoints = null, particleSeed = null;
let detailGroup = null;      // props shown only at detail = detailed
let bulbMaterial = null;
const texturedMats = [];     // { mat, map } pairs toggled by detail
let rulesRef = null;
let tickEnabled = true;

// graphics state
let gpuName = '', detected = 'balanced', q = null;
let composer = null, postKey = null, postFailed = false, gradePass = null;
let size = [1, 1], devicePR = 1, pixelRatio = 1, adaptiveScale = 1, frames = [], fps = 0;
let reducedMotion = false, time = 0;
const gfxListeners = new Set();

// seeded decoration stream (cosmetic only, never touches rules)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- procedural textures

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function woodTexture(rnd) {
  return canvasTex(512, 512, (g, w, h) => {
    const planks = 6, pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const l = 0.82 + rnd() * 0.3;
      g.fillStyle = `rgb(${Math.round(138 * l)},${Math.round(100 * l)},${Math.round(69 * l)})`;
      g.fillRect(i * pw, 0, pw, h);
      // grain
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(60,36,20,${0.05 + rnd() * 0.08})`;
        g.lineWidth = 0.6 + rnd() * 1.4;
        const x = i * pw + rnd() * pw;
        g.beginPath(); g.moveTo(x, 0);
        g.bezierCurveTo(x + (rnd() - 0.5) * 8, h * 0.33, x + (rnd() - 0.5) * 8, h * 0.66, x + (rnd() - 0.5) * 6, h);
        g.stroke();
      }
      // seams and plank ends
      g.fillStyle = 'rgba(30,18,10,0.55)';
      g.fillRect(i * pw, 0, 2, h);
      const endY = rnd() * h;
      g.fillRect(i * pw, endY, pw, 2);
    }
  }, [5, 5]);
}

function plasterTexture(rnd) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = C.plaster; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 14;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }, [6, 3]);
}

// Whiteboard with faint grid and ghosted earlier sketches (never over the word card area).
function boardTexture(rnd) {
  return canvasTex(1024, 480, (g, w, h) => {
    g.fillStyle = C.panel; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,140,170,0.13)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ink = (c, a) => { g.strokeStyle = c; g.globalAlpha = a; g.lineWidth = 5; };
    // left: a little house and sun
    ink('#2f5fa8', 0.55);
    g.strokeRect(70, 300, 120, 100);
    g.beginPath(); g.moveTo(58, 305); g.lineTo(130, 235); g.lineTo(202, 305); g.stroke();
    g.strokeRect(115, 345, 30, 55);
    ink('#d98a12', 0.6);
    g.beginPath(); g.arc(90, 90, 34, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.beginPath(); g.moveTo(90 + Math.cos(a) * 46, 90 + Math.sin(a) * 46); g.lineTo(90 + Math.cos(a) * 62, 90 + Math.sin(a) * 62); g.stroke();
    }
    // right: a cat-ish doodle and a squiggle
    ink('#c23b2e', 0.5);
    g.beginPath(); g.arc(890, 340, 50, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(852, 305); g.lineTo(860, 262); g.lineTo(880, 292); g.moveTo(900, 292); g.lineTo(920, 262); g.lineTo(928, 305); g.stroke();
    ink('#3d8a57', 0.45);
    g.beginPath(); g.moveTo(820, 90);
    for (let i = 0; i < 9; i++) g.quadraticCurveTo(835 + i * 18, 50 + (i % 2) * 80, 850 + i * 18, 90);
    g.stroke();
    // eraser smudges
    g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(160,170,190,0.07)';
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 60 + rnd() * 90, 20 + rnd() * 30, rnd(), 0, Math.PI * 2); g.fill();
    }
  });
}

function dotTexture() {
  const t = canvasTex(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
  return t;
}

// ---------------------------------------------------------------- post: colour grade

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.24 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      vec3 lc = clamp(c, 0.0, 1.0);
      // gentle S-curve, a touch more saturation, warm highlights / cool shadows
      vec3 s = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.18);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.1);
      s *= mix(vec3(0.96, 0.98, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.2, 0.8, l));
      s = s * 0.97 + 0.02;
      c = mix(c, s + max(c - 1.0, 0.0), uAmount);
      float d = length(vUv - 0.5);
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};

// ---------------------------------------------------------------- scene

function std(color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0 }, extra || {}));
}

function makePlayerMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.78, metalness: 0.0 });
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}

function buildRoom(rnd) {
  const woodMap = woodTexture(rnd), plasterMap = plasterTexture(rnd), boardMap = boardTexture(rnd);

  const floorMat = std(C.floor, { roughness: 0.62 });
  texturedMats.push({ mat: floorMat, map: woodMap, color: '#ffffff', plainColor: C.floor });
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const wallMat = std(C.wall, { roughness: 0.92 });
  texturedMats.push({ mat: wallMat, map: plasterMap, color: '#ffffff', plainColor: C.wall });
  backWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
  backWallMesh.position.set(0, 6.5, -5);
  backWallMesh.receiveShadow = true;
  scene.add(backWallMesh);

  leftWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), wallMat);
  leftWallMesh.rotation.y = Math.PI / 2;
  leftWallMesh.position.set(-10, 6.5, 0);
  leftWallMesh.receiveShadow = true;
  scene.add(leftWallMesh);

  rightWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), wallMat);
  rightWallMesh.rotation.y = -Math.PI / 2;
  rightWallMesh.position.set(10, 6.5, 0);
  rightWallMesh.receiveShadow = true;
  scene.add(rightWallMesh);

  frontWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
  frontWallMesh.rotation.y = Math.PI;
  frontWallMesh.position.set(0, 6.5, 10);
  scene.add(frontWallMesh);

  // drawing panel on the back wall: a glossy whiteboard slab
  const panelMat = new THREE.MeshPhysicalMaterial({ color: C.panel, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  texturedMats.push({ mat: panelMat, map: boardMap, color: '#ffffff', plainColor: C.panel });
  panelMesh = new THREE.Mesh(new THREE.BoxGeometry(9, 4.2, 0.08), panelMat);
  panelMesh.position.set(0, 3.6, -4.94);
  panelMesh.receiveShadow = true;
  scene.add(panelMesh);

  // timer: dark track with an emissive amber bar anchored at its left end
  const track = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.4, 0.1), std('#1f2330', { roughness: 0.5 }));
  track.position.set(0, 6.4, -4.93);
  scene.add(track);
  const tbGeo = new THREE.BoxGeometry(7.2, 0.28, 0.15);
  tbGeo.translate(3.6, 0, 0);
  timerBarMesh = new THREE.Mesh(tbGeo, std(C.timer, { emissive: C.timer, emissiveIntensity: 0.55, roughness: 0.35 }));
  timerBarMesh.position.set(-3.6, 6.4, -4.86);
  scene.add(timerBarMesh);

  // word card (paper) pinned between the bar and the panel
  wordCardMesh = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.6, 0.02), new THREE.MeshPhysicalMaterial({ color: C.card, roughness: 0.7, clearcoat: 0.3, clearcoatRoughness: 0.5 }));
  wordCardMesh.position.set(0, 4.7, -4.88);
  wordCardMesh.castShadow = true;
  wordCardMesh.receiveShadow = true;
  scene.add(wordCardMesh);

  // artist marker: a grounded ring that slides under the current artist
  artistRing = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.56, 40), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.9, toneMapped: false }));
  artistRing.rotation.x = -Math.PI / 2;
  artistRing.position.set(0, 0.012, 2.4);
  artistRing.visible = false;
  scene.add(artistRing);
}

function buildProps(rnd) {
  detailGroup = new THREE.Group();
  scene.add(detailGroup);
  const wood = std(C.frame, { roughness: 0.55 });
  const wainMat = std(C.wainscot, { roughness: 0.7 });

  // wainscot band + baseboard on the back wall
  box(30, 1.3, 0.06, wainMat, 0, 0.65, -4.96, detailGroup).castShadow = false;
  box(30, 0.08, 0.1, wood, 0, 1.32, -4.93, detailGroup).castShadow = false;
  // board frame and marker tray
  box(9.3, 0.15, 0.16, wood, 0, 5.77, -4.9, detailGroup);
  box(9.3, 0.15, 0.16, wood, 0, 1.43, -4.9, detailGroup);
  box(0.15, 4.5, 0.16, wood, -4.575, 3.6, -4.9, detailGroup);
  box(0.15, 4.5, 0.16, wood, 4.575, 3.6, -4.9, detailGroup);
  box(3.2, 0.06, 0.34, wood, 0, 1.52, -4.72, detailGroup);
  const markerGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10);
  ['#c23b2e', '#2f5fa8', '#3d8a57', '#1b1d22'].forEach((col, i) => {
    const m = new THREE.Mesh(markerGeo, std(col, { roughness: 0.35 }));
    m.rotation.z = Math.PI / 2;
    m.position.set(-0.9 + i * 0.6, 1.6, -4.68);
    m.castShadow = true;
    detailGroup.add(m);
  });

  // cork pinboard with sticky notes (left)
  box(2.2, 2.6, 0.06, std('#b08457', { roughness: 0.95 }), -7.0, 3.8, -4.95, detailGroup);
  const noteCols = ['#ffe27a', '#ffb3c1', '#9fe3c4', '#a9c9ff', '#ffe27a', '#ffcf99'];
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), std(noteCols[i], { roughness: 0.9 }));
    n.position.set(-7.6 + (i % 3) * 0.62, 4.6 - Math.floor(i / 3) * 0.9 - rnd() * 0.25, -4.91);
    n.rotation.z = (rnd() - 0.5) * 0.3;
    detailGroup.add(n);
  }

  // shelf with paint pots and books (right)
  box(2.6, 0.1, 0.5, wood, 7.0, 3.3, -4.72, detailGroup);
  box(2.6, 0.1, 0.5, wood, 7.0, 4.8, -4.72, detailGroup);
  const potGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.34, 16);
  ['#cc4b37', '#3a6ea5', '#f7c948', '#4a8a5c'].forEach((col, i) => {
    const p = new THREE.Mesh(potGeo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 0.8 }));
    p.position.set(6.1 + i * 0.55, 3.52, -4.7);
    p.castShadow = true;
    detailGroup.add(p);
  });
  for (let i = 0; i < 6; i++) {
    const h = 0.55 + rnd() * 0.3;
    const b = box(0.14, h, 0.42, std(['#6b3b52', '#2e5b6b', '#8c6d2a', '#3f4c7a', '#7a3b2e', '#476b3a'][i], { roughness: 0.75 }), 6.0 + i * 0.17, 4.85 + h / 2, -4.72, detailGroup);
    b.rotation.z = i === 5 ? -0.25 : 0;
  }

  // potted plants on the floor
  const potMat = std('#c07a52', { roughness: 0.7 });
  const leafMat = std('#3f7a45', { roughness: 0.65 });
  for (const x of [-8.2, 8.2]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 20), potMat);
    pot.position.set(x, 0.4, -3.8);
    pot.castShadow = pot.receiveShadow = true;
    detailGroup.add(pot);
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + rnd() * 0.2, 0), leafMat);
      leaf.position.set(x + (rnd() - 0.5) * 0.6, 1.1 + rnd() * 0.9, -3.8 + (rnd() - 0.5) * 0.5);
      leaf.castShadow = true;
      detailGroup.add(leaf);
    }
  }

  // pendant lamps with emissive bulbs (the bloom highlights)
  bulbMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: C.lamp, emissiveIntensity: 3.2 });
  const shadeMat = std('#2a2f3a', { roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  const cordMat = std('#111318');
  for (const x of [-6.6, 6.6]) {
    const g = new THREE.Group();
    g.position.set(x, 6.3, -2.6);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 6, 6), cordMat);
    cord.position.y = 3.2;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.55, 24, 1, true), shadeMat);
    shade.position.y = 0.1;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), bulbMaterial);
    bulb.position.y = -0.12;
    g.add(cord, shade, bulb);
    g.userData.phase = x;
    detailGroup.add(g);
  }
}

function buildPlayers(rnd) {
  const bodyGeo = new THREE.CapsuleGeometry(0.34, 0.55, 8, 16);
  const headGeo = new THREE.SphereGeometry(0.26, 20, 16);
  const stoolGeo = new THREE.CylinderGeometry(0.3, 0.26, 0.28, 16);
  const stoolMat = std('#4a3527', { roughness: 0.6 });
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const g = new THREE.Group();
    g.position.set(-5.25 + i * 0.94, 0, 2.4);
    const body = new THREE.Mesh(bodyGeo, makePlayerMaterial(SHIRTS[i % SHIRTS.length]));
    body.position.y = 0.9;
    const head = new THREE.Mesh(headGeo, std(SKIN[Math.floor(rnd() * SKIN.length)], { roughness: 0.6 }));
    head.position.y = 1.62;
    const stool = new THREE.Mesh(stoolGeo, stoolMat);
    stool.position.y = 0.14;
    for (const m of [body, head, stool]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.userData = { body, head, lift: 0, phase: rnd() * Math.PI * 2 };
    scene.add(g);
    playerGroups.push(g);
    playerMeshes.push(body);
  }
}

function buildParticles(rnd) {
  const max = PARTICLE_COUNT.high;
  const pos = new Float32Array(max * 3);
  particleSeed = new Float32Array(max * 2);
  for (let i = 0; i < max; i++) {
    pos[i * 3] = -8 + rnd() * 16;
    pos[i * 3 + 1] = rnd() * 7.5;
    pos[i * 3 + 2] = -4.5 + rnd() * 9;
    particleSeed[i * 2] = rnd() * Math.PI * 2;
    particleSeed[i * 2 + 1] = 0.05 + rnd() * 0.12;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particlePoints = new THREE.Points(pgeo, new THREE.PointsMaterial({
    color: C.particle, size: 0.09, map: dotTexture(), transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  particlePoints.frustumCulled = false;
  scene.add(particlePoints);
}

function readGpu(gl) {
  try {
    const ff = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || '');
    if (ff) return String(gl.getParameter(gl.RENDERER) || '');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  } catch (_) { return ''; }
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse || /Mobi|Android|iPhone|iPad/i.test((navigator && navigator.userAgent) || '');
}

export function init(canvas) {
  if (!canvas) throw new Error('webgl unavailable');
  if (!hasWebGL) return null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    renderer = null;
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  gpuName = readGpu(renderer.getContext());
  detected = detectPreset(gpuName, isMobileDevice());

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#161922');

  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.4, 10.5);
  camera.lookAt(0, 1.8, -1);

  // image-based fill: a neutral studio environment for PBR reflections
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    pmrem.dispose();
  } catch (_) { /* environment is an enhancement */ }

  // lights: hemisphere fill + small ambient + warm key with a fitted shadow box
  scene.add(new THREE.HemisphereLight('#ffeed8', '#3a3040', 0.6));
  ambLight = new THREE.AmbientLight('#6e6e7a', 0.25);
  scene.add(ambLight);
  keyLight = new THREE.DirectionalLight('#fff4e5', 1.6);
  keyLight.position.set(5, 11, 9);
  keyLight.target.position.set(0, 1.5, -1);
  const sc = keyLight.shadow.camera;
  Object.assign(sc, { left: -9, right: 9, top: 7, bottom: -5, near: 2, far: 32 });
  sc.updateProjectionMatrix();
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.03;
  keyLight.shadow.radius = 3;
  scene.add(keyLight, keyLight.target);

  const rnd = mulberry32(98);
  buildRoom(rnd);
  buildProps(rnd);
  buildPlayers(rnd);
  buildParticles(rnd);

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', (e) => { reducedMotion = e.matches; });
  }
  setGraphics({});
  return { renderer, scene, camera };
}

export function isAvailable() { return hasWebGL; }
export function getQualityTier() { return qualityTier; }
export function setQuality(tier) { if (tier) qualityTier = tier; }
export function start() { if (!running && rafId === 0) { running = true; lastTs = performance.now(); rafId = requestAnimationFrame(frame); } }
export function stop() { running = false; if (rafId !== 0) { cancelAnimationFrame(rafId); rafId = 0; } }

export function setRules(rules) { rulesRef = rules || null; lastArtistSeat = -1; }
export function setTickEnabled(v) { tickEnabled = !!v; }
export function setReducedMotion(v) { reducedMotion = !!v; }

// ---------------------------------------------------------------- graphics settings

/** Apply saved graphics settings ({} = Auto). Live: no reload needed. */
export function setGraphics(saved) {
  const g = resolve(saved || {}, detected);
  q = g;
  qualityTier = g.preset;
  if (!renderer) { notify(); return g; }
  const sm = SHADOW_MAP[g.shadows];
  renderer.shadowMap.enabled = sm > 0;
  keyLight.castShadow = sm > 0;
  if (sm > 0 && keyLight.shadow.mapSize.x !== sm) {
    keyLight.shadow.mapSize.set(sm, sm);
    if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
  }
  const detailed = g.detail === 'detailed';
  for (const t of texturedMats) {
    t.mat.map = detailed ? t.map : null;
    t.mat.color.set(detailed ? t.color : t.plainColor);
  }
  if (detailGroup) detailGroup.visible = detailed;
  ambLight.intensity = detailed ? 0.25 : 0.55;
  if (particlePoints) {
    const n = PARTICLE_COUNT[g.particles];
    particlePoints.visible = n > 0;
    particlePoints.geometry.setDrawRange(0, n);
  }
  // materials pick up shadow-map / map changes on recompile
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
  });
  adaptiveScale = 1;
  frames = [];
  postKey = null;
  postFailed = false;
  fpsVisible(g.showFps);
  applySize();
  notify();
  return g;
}

export function onGraphicsChange(fn) { gfxListeners.add(fn); }
function notify() { for (const fn of gfxListeners) { try { fn(); } catch (_) { /* listener errors never break rendering */ } } }

/** What the settings panel shows: GPU, auto choice, resolved tiers, cost summary. */
export function graphicsInfo() {
  const r = q || resolve({}, detected);
  const px = [Math.round(size[0] * pixelRatio), Math.round(size[1] * pixelRatio)];
  return {
    gpu: gpuName || 'unknown GPU',
    detected,
    resolved: r,
    summary: describe(r, px),
    pixels: px,
    fps: Math.round(fps || 0),
    adaptiveScale: Math.round(adaptiveScale * 100) / 100,
    postFailed: !!postFailed,
    webgl: !!renderer,
  };
}

function fpsVisible(on) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('fps-meter');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'fps-meter';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '… fps';
    document.body.append(el);
  }
  if (el) el.hidden = !on;
}

function currentRatio() {
  const g = q || resolve({}, detected);
  return Math.min(devicePR || 1, g.maxRatio) * g.scale * adaptiveScale;
}

function applySize() {
  if (!renderer) return;
  const ratio = currentRatio();
  pixelRatio = ratio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(size[0], size[1], false);
}

function buildPost() {
  const g = q;
  if (composer) { composer.dispose(); composer = null; }
  gradePass = null;
  if (!g.post || postFailed) return;
  const [w, h] = size;
  try {
    const target = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * pixelRatio)), Math.max(1, Math.round(h * pixelRatio)), {
      type: THREE.HalfFloatType, samples: g.antialias === 'msaa' ? 4 : 0,
    });
    const c = new EffectComposer(renderer, target);
    c.setPixelRatio(pixelRatio);
    c.setSize(w, h);
    c.addPass(new RenderPass(scene, camera));
    if (g.ao !== 'off') {
      const ao = new GTAOPass(scene, camera, w * pixelRatio, h * pixelRatio);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.7;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: g.ao === 'high' ? 16 : 8 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: g.ao === 'high' ? 6 : 4, rings: 2, samples: g.ao === 'high' ? 16 : 8 });
      c.addPass(ao);
    }
    // high threshold: only lamp bulbs, the timer bar and the artist ring bloom
    if (g.bloom === 'on') c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.45, 0.4, 0.92));
    if (g.grade === 'on') { gradePass = new ShaderPass(GradeShader); c.addPass(gradePass); }
    c.addPass(new OutputPass());
    if (g.antialias === 'smaa') c.addPass(new SMAAPass());
    if (g.antialias === 'fxaa') {
      const fxaa = new ShaderPass(FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
      c.addPass(fxaa);
    }
    composer = c;
  } catch (_) {
    // post-processing is an enhancement: render directly and report it in the panel
    postFailed = true;
    composer = null;
    notify();
  }
}

// Adaptive resolution: ~90-frame average; step down when slow, back up when fast.
function adapt(dt) {
  frames.push(dt);
  if (frames.length < 90) return false;
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  frames.length = 0;
  fps = 1000 / avg;
  const el = document.getElementById('fps-meter');
  if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
  if (!q.adaptive) return false;
  const before = adaptiveScale;
  if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
  else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
  return before !== adaptiveScale;
}

// ---------------------------------------------------------------- per-frame

let lastArtistSeat = -1;

function syncSceneToRules() {
  if (!rulesRef) return;
  if (timerBarMesh) {
    const frac = Math.max(0.001, Math.min(1, rulesRef.secondsLeft / ROUND_SECONDS));
    timerBarMesh.scale.x = frac;
    const low = frac < 0.2;
    timerBarMesh.material.emissive.set(low ? '#ff7a45' : C.timer);
    timerBarMesh.material.color.set(low ? '#ff7a45' : C.timer);
  }
  const seat = rulesRef.over ? -1 : rulesRef.seat;
  if (seat !== lastArtistSeat && playerMeshes.length === ROSTER_SIZE) {
    for (let i = 0; i < ROSTER_SIZE; i++) {
      playerMeshes[i].material.emissive.set(i === seat ? '#f7c948' : '#000000');
      playerMeshes[i].material.emissiveIntensity = i === seat ? 0.45 : 0;
    }
    lastArtistSeat = seat;
  }
}

function animate(dt) {
  const moving = !reducedMotion;
  const s = dt / 1000;
  if (moving) time += s;
  const seat = lastArtistSeat;
  // artist lift + marker (critically damped toward target; frame-rate independent)
  const k = 1 - Math.exp(-s * 10);
  for (let i = 0; i < playerGroups.length; i++) {
    const g = playerGroups[i], u = g.userData;
    const target = i === seat ? 0.22 : 0;
    u.lift = reducedMotion ? target : u.lift + (target - u.lift) * k;
    const breathe = moving ? Math.sin(time * 1.6 + u.phase) * 0.015 : 0;
    u.body.position.y = 0.9 + u.lift + breathe;
    u.head.position.y = 1.62 + u.lift + breathe * 1.4 + (i === seat && moving ? Math.sin(time * 3) * 0.02 : 0);
  }
  if (artistRing) {
    artistRing.visible = seat >= 0;
    if (seat >= 0) {
      const tx = playerGroups[seat].position.x;
      artistRing.position.x = reducedMotion ? tx : artistRing.position.x + (tx - artistRing.position.x) * k;
      artistRing.material.opacity = 0.75 + (moving ? Math.sin(time * 2.5) * 0.15 : 0);
    }
  }
  if (particlePoints && particlePoints.visible && moving) {
    const a = particlePoints.geometry.attributes.position, p = a.array;
    const n = particlePoints.geometry.drawRange.count;
    const cnt = Number.isFinite(n) ? n : 0;
    for (let i = 0; i < cnt; i++) {
      const ph = particleSeed[i * 2], sp = particleSeed[i * 2 + 1];
      p[i * 3 + 1] += sp * s;
      p[i * 3] += Math.sin(time * 0.4 + ph) * 0.06 * s;
      if (p[i * 3 + 1] > 7.5) p[i * 3 + 1] = 0.2;
    }
    a.needsUpdate = true;
  }
  if (detailGroup && detailGroup.visible && bulbMaterial) {
    bulbMaterial.emissiveIntensity = 3.2 + (moving ? Math.sin(time * 5.3) * 0.08 + Math.sin(time * 2.1) * 0.06 : 0);
  }
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dtMs = Math.min(100, ts - lastTs); lastTs = ts;
  if (tickEnabled && rulesRef && typeof rulesRef.tick === 'function') rulesRef.tick(dtMs);
  syncSceneToRules();
  if (!renderer || !scene || !camera) return;
  animate(dtMs);
  if (adapt(dtMs) || Math.abs(currentRatio() - pixelRatio) > 1e-6) { applySize(); notify(); }
  const key = q.post && !postFailed ? [q.ao, q.bloom, q.grade, q.antialias, size[0], size[1], pixelRatio].join('|') : 'none';
  if (key !== postKey) { postKey = key; buildPost(); }
  if (composer) composer.render(dtMs / 1000);
  else renderer.render(scene, camera);
}

export function resize(w, h, dpr) {
  if (!renderer || !camera || w <= 0 || h <= 0) return;
  const ar = w / h;
  camera.aspect = ar;
  // portrait: widen and pull back so the drawing wall and the artist row stay in frame
  const tall = Math.max(0, 1 / ar - 1);
  camera.fov = 50 + Math.min(12, tall * 10);
  camera.position.set(0, 3.4 + Math.min(1.5, tall * 1.2), 10.5 + Math.min(5.5, tall * 4.5));
  camera.lookAt(0, 2.2, -1);
  camera.updateProjectionMatrix();
  devicePR = dpr > 0 ? dpr : 1;
  size = [Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h))];
  applySize();
  notify();
}

/** Dev/test hook: scene handles for visual checks (never used by gameplay). */
export function _debugScene() { return { scene, camera, playerGroups, artistRing }; }
