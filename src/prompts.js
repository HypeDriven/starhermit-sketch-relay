// Sketch Relay — localized prompts. The rules engine works on the canonical
// (US English) prompt words; the game shows each prompt in the game language
// and accepts it typed in that language or in English.
import { T } from './i18n.js';

/** Case- and accent-insensitive form: "Éléphant" → "elephant". */
export const foldWord = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** The canonical word when `input` matches the prompt (localized or English); otherwise `input` unchanged. */
export function canonicalGuess(input, word) {
  if (!word) return input;
  const g = foldWord(input);
  return g && (g === foldWord(T(word)) || g === foldWord(word)) ? word : input;
}
