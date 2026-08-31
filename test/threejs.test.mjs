// Sketch Relay — Three.js scene tests.
import * as T from '../src/threejs.js';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }

ok(T.isAvailable() === false, 'webgl reported unavailable in this environment');
ok(typeof T.getQualityTier === 'function', 'quality tier accessor exists');
ok(typeof T.setQuality === 'function', 'quality tier setter exists');
ok(typeof T.start === 'function' && typeof T.stop === 'function', 'start/stop exist');

const C = T.C;
ok(C.floor === '#2b3040', 'floor color is dark blue-grey');
ok(C.wall === '#8f97a6', 'wall color is grey-blue');
ok(C.panel === '#eef1f5', 'panel is near white');
ok(C.card === '#edf0f4', 'card is near white');
ok(C.timer === '#f7c948', 'timer bar is amber');
ok(C.particle === '#ffe4c4', 'particles are warm');

const SHIRTS = T.SHIRTS;
ok(SHIRTS.length === 4, 'four shirt colors');
// each color appears exactly three times among the twelve players
for (let k = 0; k < SHIRTS.length; k++) {
  let n = 0; for (let i = 0; i < 12; i++) if (SHIRTS[i % SHIRTS.length] === SHIRTS[k]) n++;
  ok(n === 3, `shirt color ${k} appears three times`);
}

// init: no canvas throws; with canvas but no webgl returns null
let threw = false; try { T.init(null); } catch (e) { threw = true; }
ok(threw, 'init without canvas throws');
threw = false; let res = null; try { res = T.init({}); } catch (e) { threw = true; }
ok(!threw && res === null, 'init with canvas but no webgl returns null');

console.log(`threejs: ${passed} assertions passed`);
