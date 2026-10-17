// Key extraction for the i18n coverage test: literal T('…') / N('…') calls in
// src/, data-i18n markup in index.html, and the prompt words of the rules.
// (settings.js and sh-strings.js carry their own nine-locale tables.)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WORDS_BY_PLAYER } from '../src/rules.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['i18n.js', 'settings.js', 'sh-strings.js']);
const unescape = (s) => s.replace(/\\(['"\\`])/g, '$1');

export function sourceKeys() {
  const keys = new Set();
  const call = /(?<![\w.$])(?:T|N)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  const dir = join(ROOT, 'src');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || SKIP.has(f)) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(call)) keys.add(unescape(m[1] ?? m[2]));
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/g)) keys.add(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  return keys;
}

export const WORDS = WORDS_BY_PLAYER.flat();
export const ALL = new Set([...sourceKeys(), ...WORDS]);
