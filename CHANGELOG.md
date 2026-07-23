# Changelog

All notable changes to this project will be documented here.

## v1.6.1 (2026-07-22)

### Fixed — URL Encoder / Decoder

- Root cause of "decoding doesn't work": neither field updated live — both Encode and Decode only ran on an explicit button click, so typing into the Encoded field did nothing until you clicked. The underlying `decodeURIComponent` logic itself was already correct (verified separately). Both fields now update instantly as you type, matching the encoder's expected behavior.
- Malformed percent-encoded input (a stray `%`, `%zz`, a truncated UTF-8 sequence) now shows a clear, specific error message instead of failing silently — previously the only feedback was a small status-bar label that was easy to miss
- Toggling "Component encode" now live-recomputes the encoded output instead of requiring a manual re-click

### Testing

- Verified with 25 targeted test cases covering: standard percent-encoded characters (`%20`, `%3A`, `%2F`, `%40`, `%25`, etc.), UTF-8/Unicode decoding (accented Latin, CJK, and 4-byte emoji sequences), malformed-input handling and recovery, live real-time behavior in both directions, encode↔decode round-trip consistency, and non-component mode (`encodeURI`/`decodeURI`)

## v1.6.0 (2026-07-22)

### Changed — Design system refresh

- Refined the visual language toward something more restrained and premium: dialed back glow to a few signature accents (primary buttons, active tab, command palette) instead of applying it everywhere; clearer depth hierarchy between surface levels
- Fixed icon inconsistency: 3 tools used full-color emoji (🔑🔒🖼) mixed with plain glyphs of different visual weight — swapped for monochrome symbols so the sidebar reads as one coherent icon system, and forced text-style (non-emoji) rendering everywhere icons appear
- Added a subject-appropriate signature detail: sidebar category labels now render `// Core Tools` style, like code comments — fitting for a developer tool rather than generic decorative styling
- Added motion tokens with full `prefers-reduced-motion` support across the app

### Added — Cross-cutting UX

- **Fullscreen toggle** in the topbar (and browser's native F11)
- **Global drag-and-drop**: drop a file anywhere in the window and it routes to the matching tool, same as the Import button — extended the file→tool mapping to cover Markdown, JS/CSS, and PEM certificates too
- **Responsive drawer sidebar** for tablet and mobile: hamburger toggle, slide-in drawer with backdrop, auto-closes after selecting a tool

### Fixed

- The Image Editor and Notes tool already had their own drag-and-drop handlers; adding the new global one would have caused both to fire on the same drop. Fixed by scoping the existing handlers with `stopPropagation()` — verified a dropped image opens in exactly one place, not two

### Known limitations

- No full custom SVG icon library yet — icons are now consistent monochrome glyphs, not a bespoke icon set
- Complex multi-pane tools (Notes' three-pane view, side-by-side editor+preview tools) use the drawer sidebar and responsive toolbar wrapping at small widths, but don't yet have bespoke mobile-specific layouts — some remain tightest to use on a phone

## v1.5.0 (2026-07-22)

### Changed — Visual redesign

- Dark glassmorphism treatment across the app shell: frosted-glass topbar, sidebar, tab bar, cards, command palette, settings modal, and toasts (semi-transparent backgrounds + backdrop blur)
- Ambient neon gradient glow (indigo → violet → cyan) behind the layout, visible through the translucent chrome
- Glowing accents: neon gradient primary buttons and status bar, glowing active-tab indicator, glow-on-focus for inputs and cards
- Light theme gets a matching frosted-glass treatment without the neon glow (glow doesn't read well on a white background), so toggling themes doesn't feel inconsistent
- Deliberately *not* applied to code editors, textareas, or other dense-text panels — blurring a code editor would hurt readability, so those keep their original solid, high-contrast backgrounds

## v1.4.1 (2026-07-22)

### Added — JSON Path Finder

- Live bracket matching: as the cursor moves through the JSON, the innermost enclosing `{}`/`[]` pair is highlighted (bold accent outline on both brackets) with a subtle background tint over the whole block, similar to VS Code / IntelliJ
- JSON-aware: brackets that appear inside string values (e.g. `"note": "see { this }"`) are correctly ignored when computing matches — verified with escaped-quote and nested-structure test cases before wiring into the editor

## v1.4.0 (2026-07-22)

### Added — Timestamp Converter

- Date & time picker (`datetime-local`) — pick a date visually and every format updates instantly, no page refresh
- **LDAP Generalized Time** support (RFC 4517), e.g. `20260722103045Z`, including fractional seconds and `+HHMM`/`-HHMM` offsets
- **LDAP/AD Windows FileTime** support (100-nanosecond intervals since 1601-01-01 UTC), using `BigInt` arithmetic since real FileTime values exceed `Number.MAX_SAFE_INTEGER`. Verified against the well-known epoch constant (`116444736000000000` = 1970-01-01) and round-tripped through the actual UI, not just unit-tested in isolation.
- Per-field inline validation — each of the 5 formats (Unix seconds, Unix ms, LDAP Generalized Time, LDAP/AD FileTime, ISO 8601) shows its own clear error message on invalid input without clobbering the other fields' last-valid values
- Copy button on every field
- All 5 formats plus the date picker are simultaneously live inputs and outputs — edit any one and the rest update immediately

## v1.3.1 (2026-07-22)

### Fixed

- **QR Code Generator** wasn't generating at all — it referenced `qrcode@1.5.3`, a version that doesn't exist on cdnjs (only up to 1.4.4 is published), so the library 404'd silently. Now generates live as you type, with no need to click Download first; Download just saves whatever's already on screen.
- **JS / CSS Beautifier & Minifier** wasn't working for the same class of reason — `js-beautify@1.15.1` doesn't exist on cdnjs (starts at 1.15.4), and `jsQR`/`Terser` were never actually hosted at the cdnjs paths used. `jsQR` and `Terser` now load from jsdelivr, `qrcode` and `js-beautify` use their real cdnjs versions. All four verified to resolve before shipping.
- Added visible error banners everywhere a lazy-loaded library is fetched, so a future CDN hiccup shows a clear message instead of failing silently
- Added explicit input validation: invalid JS gets a real syntax-error message (via a parse check), invalid CSS gets a brace-mismatch message — previously bad input just produced confusing or silent output
- **Image Editor crop** had no visual feedback while dragging — the overlay-drawing function was an empty stub. Rewritten with a real selection box: dimmed surround, accent border, 8 draggable resize handles, drag-to-move, and explicit Apply/Cancel actions
- Fixed a memory leak introduced during the crop rewrite (document-level drag listeners weren't cleaned up when the tool's tab closed)

## v1.3.0 (2026-07-21)

### Added

- **X.509 Certificate Decoder** — hand-written DER/ASN.1 parser (no external ASN.1 library); subject, issuer, validity, serial number, signature algorithm, SAN, extensions, SHA-1/SHA-256 fingerprints; supports pasting a multi-certificate chain. Verified field-for-field against real openssl-generated certificates, including an expired cert and a leaf+root chain.
- **QR Code Generator & Reader** — generate from text/URL/email/Wi-Fi/vCard, decode from an uploaded image or live webcam scan, download as PNG
- **JS / CSS Beautifier & Minifier** — beautify via `js-beautify`; minify JS via `Terser` (a real minifier — verified the minified output still executes correctly, not just that it looks smaller) and CSS via a safe regex pass
- **Image Editor** — resize (aspect-locked), crop, rotate (90° steps), flip, JPEG compression with live size estimate; pure `<canvas>`, nothing uploaded anywhere

### Fixed

- Cron Builder: "every 5 minutes" (and similar) no longer incorrectly appended a full list of all 12 months to the human-readable description
- QR Generator: Wi-Fi payload had a spurious extra semicolon that would have broken real Wi-Fi QR scanning
- Image Editor: aspect-ratio lock did nothing on a freshly loaded image (only worked after a manual resize)

### Known limitations

- X.509 decoder checks well-formedness and date validity only — it does not verify signatures or check revocation
- QR reader's webcam scanning needs camera permission and HTTPS (or localhost)
- Image Editor: 90°-step rotation only, no arbitrary angle; crop is a simple drag-rectangle, not a resizable crop box
- Not yet built: EXIF viewer, a standalone Base64⇄image utility, full ASCII/Unicode/emoji explorer

## v1.2.0 (2026-07-21)

### Added

- **Tab duplication/cloning** — duplicate any open tab into a fully independent instance with the same content, queries, and selections; rename any tab by double-clicking it
- CSV ⇄ JSON — dedicated converter with dot-path nesting, table preview, and file import/export
- Cron Builder — visual field builder, manual editor with validation, presets, bidirectional human-readable translation, and a next-5-runs calculator
- Number Base Converter (binary/octal/decimal/hex, arbitrary precision)
- Text Case Converter (9 case styles, one-click copy)
- Random Generator (passwords, strings, hex tokens, PINs, live entropy estimate)
- HTTP Status Code Reference (searchable, categorized)
- Color Picker & Converter (HEX/RGB/RGBA/HSL, palette generator, WCAG contrast checker)
- Markdown Table Generator (visual grid editor)

### Known limitations

- Cron Builder: standard 5-field Unix cron + basic 6-field seconds variant only; no Quartz `L`/`W`/`#`/`?` tokens; human → cron only covers common phrasings

## v1.1.0 (2026-07-21)

### Added

- Markdown Notes — an offline notes workspace alongside the developer tools:
  - Nested folders, favorites, pinning, full-text and tag search
  - Editor / Split / Preview modes over a CodeMirror markdown editor
  - GFM preview (tables, task lists, fenced code) with syntax highlighting and one-click copy
  - Mermaid diagrams and KaTeX math rendering
  - `[[Wikilinks]]` with type-ahead autocomplete and an automatic backlinks panel
  - Color-coded tags, inline find & replace, word count / reading time / cursor position
  - 11 built-in note templates, plus export to `.md` / `.html` / `.txt` / print
  - Whole-workspace export/import as JSON
  - Paste/drag-to-insert images (embedded as data URLs)
- Favicon and app icon set (SVG source, `.ico`, PNG sizes, web manifest)

### Known limitations

- Notes are stored in `localStorage`, not IndexedDB or the File System Access API
- No drag-to-reorder folders/notes, no version history beyond editor undo
- Pasted images are embedded as data URLs rather than managed as separate assets

## v1.0.0 (2026-07-21)

### Added

- App shell: sidebar, tabbed workspace, command palette, settings, dark/light theme
- Plugin-style tool registry with `localStorage` workspace persistence
- JSON Path Finder — beautify, minify, tree view, JSONPath evaluator
- XML Path Finder — beautify, minify, native XPath evaluation
- SQL Formatter — beautify, minify, keyword case conversion
- Text / JSON Diff — line diff, JSON-aware comparison
- Data Converter — JSON ⇄ YAML ⇄ CSV ⇄ XML
- JWT Decoder
- Base64 Utility (text + file)
- URL Encoder/Decoder with query builder
- Regex Tester
- UUID Generator (v4 / v7 / v1-style)
- Hash Generator (MD5 / SHA-1 / SHA-256 / SHA-512)
- Timestamp Converter
- File import routing (drop a file, opens the matching tool)

### Known limitations

- CodeMirror 5 used in place of Monaco
- No web worker / virtual scrolling for very large files
- No drag-to-reorder tabs or split-pane view
- JSONPath/XPath cover common syntax, not the full spec
- Requires internet on first load (CDN-hosted editor/parsing libraries)
