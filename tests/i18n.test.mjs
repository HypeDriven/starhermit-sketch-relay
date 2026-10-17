// Every player-facing string exists in all nine locales (node --test).
// Keys are the US-English source strings: literal T('…') / N('…') calls in
// src/, data-i18n markup in index.html, and the 36 prompt words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, LOCALES, T, setLocale, getLang } from '../src/i18n.js';
import { shStrings } from '../src/sh-strings.js';
import { STRINGS } from '../src/settings.js';
import { canonicalGuess } from '../src/prompts.js';
import { Rules } from '../src/rules.js';
import { ALL, WORDS } from './i18n-keys.mjs';

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

test('the settings panel and StarHermit chrome tables cover all nine locales', () => {
  for (const locale of LOCALES) {
    assert.ok(STRINGS[locale], locale);
    assert.ok(shStrings(locale).signIn, locale);
  }
  assert.notEqual(shStrings('it-IT').signIn, 'Sign in with StarHermit');
});

test('T falls back to the key and fills placeholders; regional dictionaries inherit', () => {
  setLocale('de-DE');
  assert.equal(getLang(), 'de-DE');
  assert.equal(T('Not a real key {x}', { x: 1 }), 'Not a real key 1');
  assert.equal(T('Paused'), 'Pausiert');
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
