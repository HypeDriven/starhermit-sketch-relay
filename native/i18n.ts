// Localization: the engine's string tables (assets/strings.json: US English
// source strings as keys, the nine StarHermit locales) in the interface
// language the runtime reports (the player's choice in Options › Language,
// else the account's preferred language or the device's). Every string is drawn
// through T() each frame, so a change shows on the next frame and never
// restarts a round. The account lines are the engine's own `starhermit.*` strings.
import { strings } from "starhermit:engine";
import * as ui from "starhermit:ui";
import * as I18n from "../src/i18n.js";

export type Vars = Record<string, string | number>;
strings.load("assets/strings.json");
strings.defaultLocale = "en-US";
ui.setLanguage(strings.locale);
strings.onChange((locale) => ui.setLanguage(locale));
I18n.setTranslator((k: string) => strings.has(k), (k: string, v?: Vars) => strings.t(k, v));

export function currentLocale(): string { return strings.locale; }
/** An English source string in the player's language; `{name}` placeholders from vars. */
export function T(key: string, vars?: Vars | null): string { return vars ? I18n.T(key, vars) : I18n.T(key); }
/** Marks an English key that is translated with T() where it is shown. */
export const N = (s: string): string => s;
const ACCOUNT = {
  signIn: "signIn", invite: "invite", copied: "inviteCopied", copyFailed: "inviteFailed", signedOut: "signedOut",
  lbPosting: "leaderboardPosting", lbRank: "leaderboardRank", lbPosted: "leaderboardPosted", lbNotPosted: "leaderboardNotPosted",
} as const;
/** An account line (the engine's) in the player's language. */
export function S(key: keyof typeof ACCOUNT, vars?: Vars): string { return strings.t(`starhermit.${ACCOUNT[key]}`, vars); }
