// The look of the HUD, panels and overlays: the browser build's
// src/style.css, rewritten class-based in tools/ui-style.css and converted
// once with `starhermit css` into assets/ui-style.json (`npm run css`),
// registered at start with the theme the runtime's own widgets (focus rings,
// text fields, scroll bars) take.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setFont({ family: "sans-serif" });
  ui.setTheme({
    fontSize: 16, smallSize: 14, headingSize: 30, padding: 8, spacing: 12, radius: 10,
    text: "#f3f4f6", muted: "#aab2c0", panel: "#141821", control: "#3b4252", hovered: "#4a5264",
    pressed: "#2f3542", field: "#2a2f3a", accent: "#c9372b", focus: "#f7c948", outline: "#ffffff2a",
  });
  ui.setTokens(css.tokens);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "#f3f4f6" } },
    paragraph: { text: { color: "#f3f4f6" } },
    widget: { focusRing: { color: "#f7c948", width: 3, offset: 2 } },
    scrollArea: { parts: { bar: { background: "#ffffff44", radius: 4 } } },
    // #screen-pause: a darker scrim (rgba(10,12,18,.82)); .overlay (results): rgba(10,12,18,.55)
    ".dlg-pause": { background: "#00000000", padding: 0, parts: { backdrop: { background: "#0a0c12d1" } } },
    ".dlg-results": { background: "#00000000", padding: 0, parts: { backdrop: { background: "#0a0c128c" } } },
  });
}
