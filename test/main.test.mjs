// Sketch Relay — application entry tests.
import { _debug } from '../src/main.js';

let passed = 0;
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); passed++; }

const d = _debug();
ok(d.screen === 'title', 'starts on the title screen');
ok(d.paused === false, 'not paused initially');
ok(d.rules && typeof d.rules.over === 'boolean' && d.rules.over === false, 'rules present and not over');

console.log(`main: ${passed} assertions passed`);
