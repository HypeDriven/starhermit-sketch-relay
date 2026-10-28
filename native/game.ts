// Typed views of the browser build's unchanged ES modules (src/rules.js,
// src/prompts.js, src/save-merge.js): allowJs infers their class fields
// loosely, so the native modules use these interfaces.
import * as RulesJs from "../src/rules.js";
import * as PromptsJs from "../src/prompts.js";
import * as MergeJs from "../src/save-merge.js";

export interface RelayRules {
  seat: number; wordIndex: number; elapsedMs: number; guessCount: number;
  correctBySeat: number[]; solvedWords: boolean[]; over: boolean; winReason: string | null;
  readonly artistName: string; readonly currentWord: string; readonly secondsLeft: number;
  reset(): void; submitGuess(word: string): boolean; tick(dtMs: number): void; serialize(): Record<string, unknown>;
}
interface RulesClass { new (): RelayRules; deserialize(o: unknown): RelayRules }
export const Rules = RulesJs.Rules as unknown as RulesClass;
export const ROSTER_SIZE = RulesJs.ROSTER_SIZE as number;
export const ROUND_SECONDS = RulesJs.ROUND_SECONDS as number;
export const WORDS_BY_PLAYER = RulesJs.WORDS_BY_PLAYER as readonly (readonly string[])[];
export const canonicalGuess = PromptsJs.canonicalGuess as (input: string, word: string) => string;
export const SAVE_VERSION = MergeJs.SAVE_VERSION as number;
export const mergeDocs = MergeJs.mergeDocs as (remote: unknown, local: unknown, opts?: { keepLocalRound?: boolean }) => unknown;
