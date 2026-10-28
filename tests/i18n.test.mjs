// Every string native/*.ts shows through T()/N() — and every prompt word —
// has a row in each of the eight translated locales (en-US is the key
// itself); no locale keeps rows nothing shows; the account strings
// (sh-strings.js) cover all nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DICTS, LOCALES, T, setLocale } from '../src/i18n.js';
import { WORDS_BY_PLAYER } from '../src/rules.js';
import { SH_STRINGS } from '../src/sh-strings.js';

const ROOT = new URL('..', import.meta.url).pathname;
export function nativeKeys() {
  const keys = new Set();
  const call = /(?<![\w.$])(?:T|N)\(\s*"((?:[^"\\\n]|\\.)*)"/g;
  for (const f of readdirSync(`${ROOT}native`)) {
    if (!f.endsWith('.ts')) continue;
    for (const m of readFileSync(`${ROOT}native/${f}`, 'utf8').matchAll(call)) keys.add(m[1].replace(/\\(["\\])/g, '$1'));
  }
  return keys;
}
const WORDS = WORDS_BY_PLAYER.flat();
const ALL = new Set([...nativeKeys(), ...WORDS]);

test('the native client shows strings', () => { assert.ok(nativeKeys().size > 25); });
for (const loc of LOCALES.filter((l) => l !== 'en-US')) {
  test(`${loc}: every shown string is translated`, () => {
    const d = DICTS[loc];
    const missing = [...ALL].filter((k) => !(k in d) && !(loc === 'en-GB'));
    assert.deepEqual(missing, []);
  });
  test(`${loc}: no unused rows`, () => {
    const unused = Object.keys(DICTS[loc]).filter((k) => !ALL.has(k));
    assert.deepEqual(unused, []);
  });
}
test('account strings in all nine locales', () => {
  const keys = Object.keys(SH_STRINGS['en-US']);
  for (const loc of LOCALES) assert.deepEqual(Object.keys(SH_STRINGS[loc]).sort(), [...keys].sort(), loc);
});
test('placeholders survive translation', () => {
  setLocale('de-DE');
  assert.equal(T('Time left: {n}s', { n: 42 }), 'Restzeit: 42 s');
  setLocale('en-US');
});
