// The shared studio on starhermit:scene, as the browser build's src/threejs.js
// drew it with three.js r182: plank floor, plaster walls, the framed drawing
// wall with the relay timer bar and the paper word card, pendant lamps,
// pinboard, shelf, plants and a row of twelve seated artists (the current
// artist lifted, glowing and ringed), with drifting dust motes. Graphics
// follow the runtime's quality tier (native/quality.ts: gfx.js's presets and
// budgets).
//
// From three.js r182 (physically based lights): colours as written, the
// punctual, ambient and hemisphere intensities as written (engine.minor 23+
// takes r155+ units). threejs.js's `new RoomEnvironment()` at r182 is the bright
// (renderer) room — `new RoomEnvironment(renderer)` here — at the old page's
// own scene.environmentIntensity 0.3. The old composer (RenderPass → GTAO →
// UnrealBloom 0.45 / 0.4 / 0.92 → the colour grade → OutputPass with ACES at
// exposure 1 → SMAA / FXAA) is the runtime's renderer.ao / bloom / post /
// antialias; the grade is the old shader in WGSL as renderer.post (the engine
// runs it before bloom; the old one ran after it). The old canvas filled the
// window with the DOM UI over it; so does the scene here.
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Points, PointsMaterial, RepeatWrapping,
  RingGeometry, OrthographicCamera, RoomEnvironment, SphereGeometry, SRGBColorSpace, renderer, scene, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas, type OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { ROSTER_SIZE, ROUND_SECONDS } from "./game.ts";
import { PARTICLE_MAX, type Look } from "./quality.ts";

export const C = {
  floor: "#2b3040", wall: "#8f97a6", panel: "#eef1f5", card: "#edf0f4",
  timer: "#f7c948", particle: "#ffe4c4",
  plank: "#8a6445", plaster: "#9c9384", wainscot: "#3c4658", frame: "#6b4a32", lamp: "#ffd9a0",
};
const SHIRTS = ["#cc4b37", "#3a6ea5", "#c98a10", "#4a8a5c"];
const SKIN = ["#e0b394", "#a8714f", "#f1c9a8", "#7b4f36", "#c98f6b", "#5c3a28"];

/** threejs.js mulberry32: the seeded decoration stream (cosmetic only). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- procedural textures (threejs.js, same drawing)
type Ctx = OffscreenCanvasRenderingContext2D;
function canvasTex(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, repeat?: [number, number]): CanvasTexture {
  const c = new OffscreenCanvas(w, h);
  draw(c.getContext("2d"), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function woodTexture(rnd: () => number): CanvasTexture {
  return canvasTex(512, 512, (g, w, h) => {
    const planks = 6, pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const l = 0.82 + rnd() * 0.3;
      g.fillStyle = `rgb(${Math.round(138 * l)},${Math.round(100 * l)},${Math.round(69 * l)})`;
      g.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(60,36,20,${0.05 + rnd() * 0.08})`;
        g.lineWidth = 0.6 + rnd() * 1.4;
        const x = i * pw + rnd() * pw;
        g.beginPath(); g.moveTo(x, 0);
        g.bezierCurveTo(x + (rnd() - 0.5) * 8, h * 0.33, x + (rnd() - 0.5) * 8, h * 0.66, x + (rnd() - 0.5) * 6, h);
        g.stroke();
      }
      g.fillStyle = "rgba(30,18,10,0.55)";
      g.fillRect(i * pw, 0, 2, h);
      const endY = rnd() * h;
      g.fillRect(i * pw, endY, pw, 2);
    }
  }, [5, 5]);
}
function plasterTexture(rnd: () => number): CanvasTexture {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = C.plaster; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 14;
      d[i] = d[i]! + n; d[i + 1] = d[i + 1]! + n; d[i + 2] = d[i + 2]! + n;
    }
    g.putImageData(img, 0, 0);
  }, [6, 3]);
}
/** The whiteboard: faint grid and ghosted earlier sketches (never over the word card area). */
function boardTexture(rnd: () => number): CanvasTexture {
  return canvasTex(1024, 480, (g, w, h) => {
    g.fillStyle = C.panel; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,140,170,0.13)"; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineCap = "round"; g.lineJoin = "round";
    const ink = (c: string, a: number): void => { g.strokeStyle = c; g.globalAlpha = a; g.lineWidth = 5; };
    ink("#2f5fa8", 0.55);
    g.strokeRect(70, 300, 120, 100);
    g.beginPath(); g.moveTo(58, 305); g.lineTo(130, 235); g.lineTo(202, 305); g.stroke();
    g.strokeRect(115, 345, 30, 55);
    ink("#d98a12", 0.6);
    g.beginPath(); g.arc(90, 90, 34, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath(); g.moveTo(90 + Math.cos(a) * 46, 90 + Math.sin(a) * 46); g.lineTo(90 + Math.cos(a) * 62, 90 + Math.sin(a) * 62); g.stroke();
    }
    ink("#c23b2e", 0.5);
    g.beginPath(); g.arc(890, 340, 50, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(852, 305); g.lineTo(860, 262); g.lineTo(880, 292); g.moveTo(900, 292); g.lineTo(920, 262); g.lineTo(928, 305); g.stroke();
    ink("#3d8a57", 0.45);
    g.beginPath(); g.moveTo(820, 90);
    for (let i = 0; i < 9; i++) g.quadraticCurveTo(835 + i * 18, 50 + (i % 2) * 80, 850 + i * 18, 90);
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      g.fillStyle = "rgba(160,170,190,0.07)";
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 60 + rnd() * 90, 20 + rnd() * 30, rnd(), 0, Math.PI * 2); g.fill();
    }
  });
}
function dotTexture(): CanvasTexture {
  return canvasTex(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

// ---------------------------------------------------------------- post: the colour grade (threejs.js GradeShader in WGSL)
const GRADE = {
  pixel: /* wgsl */ `
fn pixel(p: Pixel) -> vec4f {
  let src = scene_color(p.uv);
  var c = src.rgb;
  let lc = clamp(c, vec3f(0.0), vec3f(1.0));
  var s = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.18);
  let l = dot(s, vec3f(0.299, 0.587, 0.114));
  s = mix(vec3f(l), s, 1.1);
  s = s * mix(vec3f(0.96, 0.98, 1.05), vec3f(1.04, 1.0, 0.95), smoothstep(0.2, 0.8, l));
  s = s * 0.97 + 0.02;
  c = s + max(c - 1.0, vec3f(0.0));
  let d = length(p.uv - vec2f(0.5));
  c = c * (1.0 - 0.24 * smoothstep(0.35, 0.85, d));
  return vec4f(c, src.a);
}`,
};

// ---------------------------------------------------------------- the scene
const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 200);
camera.position.set(0, 3.4, 10.5);
camera.lookAt(0, 1.8, -1);
renderer.camera = camera;
scene.background = new Color("#161922");

const hemi = new HemisphereLight("#ffeed8", "#3a3040", 0.6);
const ambLight = new AmbientLight("#6e6e7a", 0.25);
const keyLight = new DirectionalLight("#fff4e5", 1.6);
keyLight.position.set(5, 11, 9);
keyLight.target.position.set(0, 1.5, -1);
// three's fitted shadow box (-9…9 × -5…7, 2–32 m): the engine fits directional shadows to the view
const sc = keyLight.shadow.camera as OrthographicCamera;
sc.left = -9; sc.right = 9; sc.top = 7; sc.bottom = -5; sc.near = 2; sc.far = 32;
sc.updateProjectionMatrix();
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.03;
keyLight.shadow.radius = 3;
scene.add(hemi, ambLight, keyLight, keyLight.target);

let envTex: Texture | null = null;
try {
  const pmrem = new PMREMGenerator(renderer);
  envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.3;
} catch (e) { console.warn(`environment: ${String(e)}`); }

const std = (color: string, extra?: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...(extra ?? {}) });

/** A clear-coated physical material with a plain standard twin; the look picks one (gfx.js budget.material). */
interface Coated { mesh: Mesh; physical: MeshPhysicalMaterial; standard: MeshStandardMaterial }
const coatedMats: Coated[] = [];
function coated(mesh: Mesh, opts: { color: string; roughness: number; clearcoat: number; clearcoatRoughness?: number }): Mesh {
  const { clearcoat, clearcoatRoughness, ...base } = opts;
  const physical = new MeshPhysicalMaterial({ ...base, clearcoat, clearcoatRoughness: clearcoatRoughness ?? 0 });
  const standard = new MeshStandardMaterial(base);
  coatedMats.push({ mesh, physical, standard });
  mesh.material = physical;
  return mesh;
}
/** Materials whose map and colour follow Studio detail. */
interface Textured { mat: MeshStandardMaterial; map: Texture; plainColor: string }
const texturedMats: Textured[] = [];

function box(w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number, parent: Group): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const rnd = mulberry32(98);
const room = new Group();
scene.add(room);
const woodMap = woodTexture(rnd), plasterMap = plasterTexture(rnd), boardMap = boardTexture(rnd);

const floorMat = std(C.floor, { roughness: 0.62 });
texturedMats.push({ mat: floorMat, map: woodMap, plainColor: C.floor });
const floorMesh = new Mesh(new PlaneGeometry(30, 30), floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
room.add(floorMesh);

const wallMat = std(C.wall, { roughness: 0.92 });
texturedMats.push({ mat: wallMat, map: plasterMap, plainColor: C.wall });
for (const [w, x, z, ry, shadow] of [[30, 0, -5, 0, true], [20, -10, 0, Math.PI / 2, true], [20, 10, 0, -Math.PI / 2, true], [30, 0, 10, Math.PI, false]] as const) {
  const wall = new Mesh(new PlaneGeometry(w, 14), wallMat);
  wall.rotation.y = ry;
  wall.position.set(x, 6.5, z);
  wall.receiveShadow = shadow;
  room.add(wall);
}

// drawing panel on the back wall: a glossy whiteboard slab
const panelMesh = coated(new Mesh(new BoxGeometry(9, 4.2, 0.08)), { color: C.panel, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 });
for (const p of coatedMats) if (p.mesh === panelMesh) for (const mat of [p.physical, p.standard]) texturedMats.push({ mat, map: boardMap, plainColor: C.panel });
panelMesh.position.set(0, 3.6, -4.94);
panelMesh.receiveShadow = true;
room.add(panelMesh);

// timer: dark track with an emissive amber bar anchored at its left end
const track = new Mesh(new BoxGeometry(7.4, 0.4, 0.1), std("#1f2330", { roughness: 0.5 }));
track.position.set(0, 6.4, -4.93);
room.add(track);
const tbGeo = new BoxGeometry(7.2, 0.28, 0.15);
tbGeo.translate(3.6, 0, 0);
const timerMat = std(C.timer, { emissive: C.timer, emissiveIntensity: 0.55, roughness: 0.35 });
const timerBarMesh = new Mesh(tbGeo, timerMat);
timerBarMesh.position.set(-3.6, 6.4, -4.86);
room.add(timerBarMesh);

// word card (paper) pinned between the bar and the panel
const wordCardMesh = coated(new Mesh(new BoxGeometry(6.0, 2.6, 0.02)), { color: C.card, roughness: 0.7, clearcoat: 0.3, clearcoatRoughness: 0.5 });
wordCardMesh.position.set(0, 4.7, -4.88);
wordCardMesh.castShadow = true;
wordCardMesh.receiveShadow = true;
room.add(wordCardMesh);

// artist marker: a grounded ring that slides under the current artist
const ringMat = new MeshBasicMaterial({ color: "#ffcf5a", transparent: true, opacity: 0.9, toneMapped: false });
const artistRing = new Mesh(new RingGeometry(0.44, 0.56, 40), ringMat);
artistRing.rotation.x = -Math.PI / 2;
artistRing.position.set(0, 0.012, 2.4);
artistRing.visible = false;
room.add(artistRing);

// ---------------------------------------------------------------- props (Studio detail)
const detailGroup = new Group();
scene.add(detailGroup);
const bulbMaterial = new MeshStandardMaterial({ color: "#ffffff", emissive: C.lamp, emissiveIntensity: 3.2 });
{
  const wood = std(C.frame, { roughness: 0.55 });
  const wainMat = std(C.wainscot, { roughness: 0.7 });
  box(30, 1.3, 0.06, wainMat, 0, 0.65, -4.96, detailGroup).castShadow = false;
  box(30, 0.08, 0.1, wood, 0, 1.32, -4.93, detailGroup).castShadow = false;
  box(9.3, 0.15, 0.16, wood, 0, 5.77, -4.9, detailGroup);
  box(9.3, 0.15, 0.16, wood, 0, 1.43, -4.9, detailGroup);
  box(0.15, 4.5, 0.16, wood, -4.575, 3.6, -4.9, detailGroup);
  box(0.15, 4.5, 0.16, wood, 4.575, 3.6, -4.9, detailGroup);
  box(3.2, 0.06, 0.34, wood, 0, 1.52, -4.72, detailGroup);
  const markerGeo = new CylinderGeometry(0.045, 0.045, 0.5, 10);
  ["#c23b2e", "#2f5fa8", "#3d8a57", "#1b1d22"].forEach((col, i) => {
    const m = new Mesh(markerGeo, std(col, { roughness: 0.35 }));
    m.rotation.z = Math.PI / 2;
    m.position.set(-0.9 + i * 0.6, 1.6, -4.68);
    m.castShadow = true;
    detailGroup.add(m);
  });
  // cork pinboard with sticky notes (left)
  box(2.2, 2.6, 0.06, std("#b08457", { roughness: 0.95 }), -7.0, 3.8, -4.95, detailGroup);
  const noteCols = ["#ffe27a", "#ffb3c1", "#9fe3c4", "#a9c9ff", "#ffe27a", "#ffcf99"];
  for (let i = 0; i < 6; i++) {
    const n = new Mesh(new PlaneGeometry(0.55, 0.55), std(noteCols[i]!, { roughness: 0.9 }));
    n.position.set(-7.6 + (i % 3) * 0.62, 4.6 - Math.floor(i / 3) * 0.9 - rnd() * 0.25, -4.91);
    n.rotation.z = (rnd() - 0.5) * 0.3;
    detailGroup.add(n);
  }
  // shelf with paint pots and books (right)
  box(2.6, 0.1, 0.5, wood, 7.0, 3.3, -4.72, detailGroup);
  box(2.6, 0.1, 0.5, wood, 7.0, 4.8, -4.72, detailGroup);
  const potGeo = new CylinderGeometry(0.16, 0.14, 0.34, 16);
  ["#cc4b37", "#3a6ea5", "#f7c948", "#4a8a5c"].forEach((col, i) => {
    const p = coated(new Mesh(potGeo), { color: col, roughness: 0.3, clearcoat: 0.8 });
    p.position.set(6.1 + i * 0.55, 3.52, -4.7);
    p.castShadow = true;
    detailGroup.add(p);
  });
  const bookCols = ["#6b3b52", "#2e5b6b", "#8c6d2a", "#3f4c7a", "#7a3b2e", "#476b3a"];
  for (let i = 0; i < 6; i++) {
    const h = 0.55 + rnd() * 0.3;
    const b = box(0.14, h, 0.42, std(bookCols[i]!, { roughness: 0.75 }), 6.0 + i * 0.17, 4.85 + h / 2, -4.72, detailGroup);
    b.rotation.z = i === 5 ? -0.25 : 0;
  }
  // potted plants on the floor
  const potMat = std("#c07a52", { roughness: 0.7 });
  const leafMat = std("#3f7a45", { roughness: 0.65 });
  for (const x of [-8.2, 8.2]) {
    const pot = new Mesh(new CylinderGeometry(0.45, 0.35, 0.8, 20), potMat);
    pot.position.set(x, 0.4, -3.8);
    pot.castShadow = pot.receiveShadow = true;
    detailGroup.add(pot);
    for (let k = 0; k < 5; k++) {
      const leaf = new Mesh(new IcosahedronGeometry(0.42 + rnd() * 0.2, 0), leafMat);
      leaf.position.set(x + (rnd() - 0.5) * 0.6, 1.1 + rnd() * 0.9, -3.8 + (rnd() - 0.5) * 0.5);
      leaf.castShadow = true;
      detailGroup.add(leaf);
    }
  }
  // pendant lamps with emissive bulbs (the bloom highlights)
  const shadeMat = std("#2a2f3a", { roughness: 0.4, metalness: 0.6, side: DoubleSide });
  const cordMat = std("#111318");
  for (const x of [-6.6, 6.6]) {
    const g = new Group();
    g.position.set(x, 6.3, -2.6);
    const cord = new Mesh(new CylinderGeometry(0.02, 0.02, 6, 6), cordMat);
    cord.position.y = 3.2;
    const shade = new Mesh(new ConeGeometry(0.6, 0.55, 24, 1, true), shadeMat);
    shade.position.y = 0.1;
    const bulb = new Mesh(new SphereGeometry(0.17, 16, 12), bulbMaterial);
    bulb.position.y = -0.12;
    g.add(cord, shade, bulb);
    detailGroup.add(g);
  }
}

// ---------------------------------------------------------------- the twelve artists
interface Artist { group: Group; body: Mesh; head: Mesh; bodyMat: MeshStandardMaterial; lift: number; phase: number }
const artists: Artist[] = [];
{
  const bodyGeo = new CapsuleGeometry(0.34, 0.55, 8, 16);
  const headGeo = new SphereGeometry(0.26, 20, 16);
  const stoolGeo = new CylinderGeometry(0.3, 0.26, 0.28, 16);
  const stoolMat = std("#4a3527", { roughness: 0.6 });
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const g = new Group();
    g.position.set(-5.25 + i * 0.94, 0, 2.4);
    const bodyMat = new MeshStandardMaterial({ color: SHIRTS[i % SHIRTS.length]!, roughness: 0.78, metalness: 0 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    const head = new Mesh(headGeo, std(SKIN[Math.floor(rnd() * SKIN.length)]!, { roughness: 0.6 }));
    head.position.y = 1.62;
    const stool = new Mesh(stoolGeo, stoolMat);
    stool.position.y = 0.14;
    for (const m of [body, head, stool]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    scene.add(g);
    artists.push({ group: g, body, head, bodyMat, lift: 0, phase: rnd() * Math.PI * 2 });
  }
}

// ---------------------------------------------------------------- dust motes
const motePos = new Float32Array(PARTICLE_MAX * 3);
const moteSeed = new Float32Array(PARTICLE_MAX * 2);
for (let i = 0; i < PARTICLE_MAX; i++) {
  motePos[i * 3] = -8 + rnd() * 16;
  motePos[i * 3 + 1] = rnd() * 7.5;
  motePos[i * 3 + 2] = -4.5 + rnd() * 9;
  moteSeed[i * 2] = rnd() * Math.PI * 2;
  moteSeed[i * 2 + 1] = 0.05 + rnd() * 0.12;
}
const moteGeo = new BufferGeometry();
moteGeo.setAttribute("position", new BufferAttribute(motePos, 3));
const motes = new Points(moteGeo, new PointsMaterial({
  color: C.particle, size: 0.09, map: dotTexture(), transparent: true, opacity: 0.75, depthWrite: false, blending: AdditiveBlending,
}));
motes.frustumCulled = false;
scene.add(motes);

// ---------------------------------------------------------------- graphics
let look: Look | null = null;
/** The runtime's quality tier applied live (threejs.js setGraphics). */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  look = next;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = next.shadows > 0;
  keyLight.castShadow = next.shadows > 0;
  if (next.shadows > 0) keyLight.shadow.mapSize = next.shadows;
  for (const p of coatedMats) p.mesh.material = next.material === "physical" ? p.physical : p.standard;
  for (const t of texturedMats) {
    t.mat.map = next.detailed ? t.map : null;
    t.mat.color.set(next.detailed ? "#ffffff" : t.plainColor);
  }
  detailGroup.visible = next.detailed;
  ambLight.intensity = next.detailed ? 0.25 : 0.55;
  motes.visible = next.motes > 0;
  moteGeo.setDrawRange(0, Math.min(PARTICLE_MAX, next.motes));
  const hi = next.ao === "high";
  // GTAOPass: radius 0.6, distance exponent 1.4, thickness 1.2, 16 / 8 samples, blend 0.7; the denoise per tier
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.7, radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: hi ? 16 : 8, resolution: next.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: hi ? 6 : 4, rings: 2, samples: hi ? 16 : 8 },
  };
  // high threshold: only lamp bulbs, the timer bar and the artist ring bloom
  renderer.bloom = next.bloom ? { strength: 0.45, radius: 0.4, threshold: 0.92, resolution: next.bloomRes } : null;
  renderer.post = next.grade ? GRADE : null;
  renderer.grade = null;
  renderer.antialias = next.antialias;
}

// ---------------------------------------------------------------- per frame
export interface RelayView { seat: number; secondsLeft: number }
let reducedMotion = false;
export function setReducedMotion(v: boolean): void { reducedMotion = v; }
let time = 0;
let lastSeat = -2;
let size = "";

/** threejs.js resize: portrait widens the view and pulls back so the wall and the artist row stay in frame. */
function fit(w: number, h: number): void {
  const ar = w / h;
  camera.aspect = ar;
  const tall = Math.max(0, 1 / ar - 1);
  camera.fov = 50 + Math.min(12, tall * 10);
  camera.position.set(0, 3.4 + Math.min(1.5, tall * 1.2), 10.5 + Math.min(5.5, tall * 4.5));
  camera.lookAt(0, 2.2, -1);
  camera.updateProjectionMatrix();
}

/** Each frame: the camera fit, the timer bar and artist glow (syncSceneToRules), then the motion (animate). */
export function update(dt: number, w: number, h: number, view: RelayView | null): void {
  if (w > 0 && h > 0 && `${w}x${h}` !== size) { size = `${w}x${h}`; fit(w, h); }
  if (view) {
    const frac = Math.max(0.001, Math.min(1, view.secondsLeft / ROUND_SECONDS));
    timerBarMesh.scale.x = frac;
    const col = frac < 0.2 ? "#ff7a45" : C.timer;
    timerMat.emissive.set(col);
    timerMat.color.set(col);
  }
  const seat = view ? view.seat : -1;
  if (seat !== lastSeat) {
    for (let i = 0; i < artists.length; i++) {
      artists[i]!.bodyMat.emissive.set(i === seat ? "#f7c948" : "#000000");
      artists[i]!.bodyMat.emissiveIntensity = i === seat ? 0.45 : 0;
    }
    lastSeat = seat;
  }
  const moving = !reducedMotion;
  const s = Math.min(0.1, dt);
  if (moving) time += s;
  const k = 1 - Math.exp(-s * 10);
  for (let i = 0; i < artists.length; i++) {
    const a = artists[i]!;
    const target = i === seat ? 0.22 : 0;
    a.lift = reducedMotion ? target : a.lift + (target - a.lift) * k;
    const breathe = moving ? Math.sin(time * 1.6 + a.phase) * 0.015 : 0;
    a.body.position.y = 0.9 + a.lift + breathe;
    a.head.position.y = 1.62 + a.lift + breathe * 1.4 + (i === seat && moving ? Math.sin(time * 3) * 0.02 : 0);
  }
  artistRing.visible = seat >= 0;
  if (seat >= 0) {
    const tx = artists[seat]!.group.position.x;
    artistRing.position.x = reducedMotion ? tx : artistRing.position.x + (tx - artistRing.position.x) * k;
    ringMat.opacity = 0.75 + (moving ? Math.sin(time * 2.5) * 0.15 : 0);
  }
  if (motes.visible && moving) {
    const n = Math.min(PARTICLE_MAX, look?.motes ?? 0);
    for (let i = 0; i < n; i++) {
      const ph = moteSeed[i * 2]!, sp = moteSeed[i * 2 + 1]!;
      motePos[i * 3 + 1] = motePos[i * 3 + 1]! + sp * s;
      motePos[i * 3] = motePos[i * 3]! + Math.sin(time * 0.4 + ph) * 0.06 * s;
      if (motePos[i * 3 + 1]! > 7.5) motePos[i * 3 + 1] = 0.2;
    }
    (moteGeo.attributes.position as BufferAttribute).needsUpdate = true;
  }
  if (detailGroup.visible) {
    bulbMaterial.emissiveIntensity = 3.2 + (moving ? Math.sin(time * 5.3) * 0.08 + Math.sin(time * 2.1) * 0.06 : 0);
  }
}
