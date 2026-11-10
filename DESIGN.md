# Toolbench design direction

Direction chosen by the owner: **workshop / craft feel**. Dark theme stays supported.

Dial: ENERGY 2 / RHYTHM 1 / MOTION 1
(RHYTHM 1 on purpose: this is a tool shell, panes must be predictable.)

## Themes
Five themes, each a neutral ramp plus one accent: Graphite (default, brass), Ember (coral), Solder (lime), Paper (burnt brass), Sage (green). Colors live in `styles.css`; `THEMES` in `app.js` lists them and sets light or dark kind.

## Identity
- Graphite (dark) and paper (light) warm neutrals, one brass accent. Semantic green and red are for status only.
- Type: IBM Plex Sans for UI, IBM Plex Mono for code, Fraunces only for the wordmark, the empty state heading, modal titles and note headings.
- Shapes: 3 to 9px radius, hard 1px borders, no pills.
- Motif: a ruler strip under the topbar.
- Dividers between side-by-side panes can be dragged (or moved with arrow keys; double-click resets).
- Shadow only on things that float (palette, modal, toast, mobile drawer). No blur, glow, gradients or background patterns.

## Open items for the owner
- No blue or purple anywhere: themes, syntax colors, icons and emoji are all warm. Keep it that way when adding themes.
- The app icon keeps the original bracket concept, redrawn in brass on graphite. The topbar wordmark is text. Swap in a final logo when you have one.
