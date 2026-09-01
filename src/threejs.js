// Sketch Relay — Three.js presentation layer (WebGL).
import * as THREE from 'three';
import { ROSTER_SIZE } from './rules.js';

export const C = {
  floor: '#2b3040', wall: '#8f97a6', panel: '#eef1f5', card: '#edf0f4',
  timer: '#f7c948', particle: '#ffe4c4'
};

export const SHIRTS = ['#cc4b37', '#3a6ea5', '#c98a10', '#4a8a5c'];

let renderer = null, scene = null, camera = null;
let rafId = 0, running = false, lastTs = 0;
let qualityTier = 'high';
const hasWebGL = typeof window !== 'undefined' && !!(window.WebGLRenderingContext);

// entity handles (created in init)
let floorMesh, backWallMesh, leftWallMesh, rightWallMesh, frontWallMesh;
let panelMesh, timerBarMesh, wordCardMesh;
let playerMeshes = [];
let particlePoints = null;
let rulesRef = null;
let tickEnabled = true;

function makePlayerMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.85, metalness: 0.0 });
}

export function init(canvas) {
  if (!canvas) throw new Error('webgl unavailable');
  if (!hasWebGL) return null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[sketch-relay] WebGL init failed:', e && e.message);
    return null;
  }
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.4, 10.5);
  camera.lookAt(0, 1.8, -1);

  // lights: soft ambient + warm key with shadows
  const amb = new THREE.AmbientLight('#6e6e7a', 1.0);
  scene.add(amb);
  const sun = new THREE.DirectionalLight('#fff4e5', 2.2);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  // room: floor + four walls (back wall faces the camera)
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: C.floor }));
  floorMesh.rotation.x = -Math.PI / 2;
  scene.add(floorMesh);

  const wallMat = new THREE.MeshStandardMaterial({ color: C.wall });
  backWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
  backWallMesh.position.set(0, 6.5, -5);
  scene.add(backWallMesh);

  leftWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), wallMat);
  leftWallMesh.rotation.y = Math.PI / 2;
  leftWallMesh.position.set(-10, 6.5, 0);
  scene.add(leftWallMesh);

  rightWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), wallMat);
  rightWallMesh.rotation.y = -Math.PI / 2;
  rightWallMesh.position.set(10, 6.5, 0);
  scene.add(rightWallMesh);

  frontWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
  frontWallMesh.rotation.y = Math.PI;
  frontWallMesh.position.set(0, 6.5, 10);
  scene.add(frontWallMesh);

  // drawing panel on the back wall (white)
  const panelGeo = new THREE.PlaneGeometry(9, 4.2);
  panelMesh = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({ color: C.panel }));
  panelMesh.position.set(0, 3.6, -4.98);
  scene.add(panelMesh);

  // timer bar (amber) above the panel
  const tbGeo = new THREE.BoxGeometry(7.2, 0.28, 0.15);
  timerBarMesh = new THREE.Mesh(tbGeo, new THREE.MeshStandardMaterial({ color: C.timer }));
  timerBarMesh.position.set(0, 6.4, -4.9);
  scene.add(timerBarMesh);

  // word card (near-white) between the bar and the panel
  const wcGeo = new THREE.PlaneGeometry(6.0, 2.6);
  wordCardMesh = new THREE.Mesh(wcGeo, new THREE.MeshStandardMaterial({ color: C.card }));
  wordCardMesh.position.set(0, 4.7, -4.95);
  scene.add(wordCardMesh);

  // players: 12 capsules in a row facing the panel; human (seat 0) at left end
  const capGeo = new THREE.CapsuleGeometry(0.38, 1.0, 8, 16);
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const m = new THREE.Mesh(capGeo, makePlayerMaterial(SHIRTS[i % SHIRTS.length]));
    m.position.set(-5.25 + i * 0.94, 1.0, 3.6);
    scene.add(m);
    playerMeshes.push(m);
  }

  // ambient particles (warm)
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -8 + Math.random() * 16;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = -5.5 + Math.random() * 11;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particlePoints = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: C.particle, size: 0.12, transparent: true, opacity: 0.8 }));
  scene.add(particlePoints);

  return { renderer, scene, camera };
}

export function isAvailable() { return hasWebGL; }
export function getQualityTier() { return qualityTier; }
export function setQuality(tier) { if (tier) qualityTier = tier; }
export function start() { if (!running && rafId === 0) { running = true; lastTs = performance.now(); rafId = requestAnimationFrame(frame); } }
export function stop() { running = false; if (rafId !== 0) { cancelAnimationFrame(rafId); rafId = 0; } }

export function setRules(rules) { rulesRef = rules || null; }
export function setTickEnabled(v) { tickEnabled = !!v; }

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dtMs = Math.min(100, ts - lastTs); lastTs = ts;
  if (tickEnabled && rulesRef && typeof rulesRef.tick === 'function') rulesRef.tick(dtMs);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

export function resize(w, h, dpr) {
  if (!renderer || !camera || w <= 0 || h <= 0) return;
  const ar = w / h;
  camera.aspect = ar;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr > 0 ? Math.min(2, dpr) : 1);
  renderer.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
}

export function drawStroke(x0, y0, x1, y1, colorHex, widthPx) {
  if (!renderer || !panelMesh) return;
  const ctx = renderer.getContext();
  if (!ctx) return;
  ctx.save();
  try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch {}
  ctx.lineWidth = widthPx > 0 ? widthPx : 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = colorHex || '#222831';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  try { ctx.setTransform(renderer.getPixelRatio(), 0, 0, renderer.getPixelRatio(), 0, 0); } catch {}
  ctx.restore();
}

export function clearCanvas3d() {
  if (!renderer || !panelMesh) return;
  const ctx = renderer.getContext();
  if (!ctx) return;
  try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch {}
  ctx.clearRect(0, 0, renderer.domElement.width, renderer.domElement.height);
  try { ctx.setTransform(renderer.getPixelRatio(), 0, 0, renderer.getPixelRatio(), 0, 0); } catch {}
}
