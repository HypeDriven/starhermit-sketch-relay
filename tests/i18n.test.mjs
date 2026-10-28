// Localization coverage: every string native/*.ts shows through T()/N() and
// every prompt word has a row (same placeholders) in each translated locale,
// no locale keeps rows nothing shows, the account strings (sh-strings.js)
// cover all nine locales, and prompts are accepted in the game language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DICTS, LOCALES, T, getLang, setLocale } from '../src/i18n.js';
import { Rules, WORDS_BY_PLAYER } from '../src/rules.js';
import { SH_STRINGS, shStrings } from '../src/sh-strings.js';
import { canonicalGuess } from '../src/prompts.js';

const ROOT = new URL('..', import.meta.url).pathname;
function nativeKeys() {
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
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the key set covers the UI and every prompt', () => {
  assert.equal(WORDS.length, 36);
  assert.ok(ALL.size >= 60, `only ${ALL.size} keys found`);
});

for (const locale of LOCALES.filter((l) => l !== 'en-US' && l !== 'en-GB')) {
  test(`${locale}: every key is translated with the same placeholders`, () => {
    const dict = DICTS[locale];
    const missing = [...ALL].filter((k) => !Object.prototype.hasOwnProperty.call(dict, k));
    assert.deepEqual(missing, [], `${missing.length} missing in ${locale}`);
    const bad = [...ALL].filter((k) => placeholders(dict[k]) !== placeholders(k));
    assert.deepEqual(bad, [], `placeholder mismatch in ${locale}`);
    const words = WORDS.map((w) => dict[w].toLowerCase());
    assert.equal(new Set(words).size, words.length, `duplicate prompt words in ${locale}`);
  });
}

test('no locale carries keys that no longer exist', () => {
  for (const locale of LOCALES) {
    const stray = Object.keys(DICTS[locale]).filter((k) => !ALL.has(k));
    assert.deepEqual(stray, [], locale);
  }
});

test('the StarHermit account strings cover all nine locales', () => {
  const keys = Object.keys(SH_STRINGS['en-US']).sort();
  for (const locale of LOCALES) assert.deepEqual(Object.keys(shStrings(locale)).sort(), keys, locale);
  assert.notEqual(shStrings('it-IT').signIn, 'Sign in with StarHermit');
});

test('T falls back to the key and fills placeholders; regional dictionaries inherit', () => {
  setLocale('de-DE');
  assert.equal(getLang(), 'de-DE');
  assert.equal(T('Not a real key {x}', { x: 1 }), 'Not a real key 1');
  assert.equal(T('Paused'), 'Pausiert');
  assert.equal(T('Time left: {n}s', { n: 42 }), 'Restzeit: 42 s');
  setLocale('fr-CA');
  assert.equal(T('Paused'), 'En pause'); // inherited from fr-FR
  assert.equal(T('quilt'), 'courtepointe');
  setLocale('en-GB');
  assert.equal(T('harbor'), 'harbour');
  setLocale('xx-YY');
  assert.equal(getLang(), 'en-US');
  assert.equal(T('Paused'), 'Paused');
});

test('a prompt is accepted in the game language (any case/accents) or in English', () => {
  const r = new Rules();
  setLocale('fr-FR');
  assert.equal(r.currentWord, 'apple');
  assert.equal(canonicalGuess('Pomme', 'apple'), 'apple');
  assert.equal(canonicalGuess('apple', 'apple'), 'apple');
  assert.equal(canonicalGuess('poire', 'apple'), 'poire');
  assert.equal(canonicalGuess('ELEPHANT', 'elephant'), 'elephant');
  assert.equal(canonicalGuess('Éléphant', 'elephant'), 'elephant');
  r.submitGuess(canonicalGuess(' pomme ', r.currentWord));
  assert.equal(r.solvedWords[0], true);
  setLocale('en-US');
});
