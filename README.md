# Toolbench

A modern, offline-first developer utility toolkit that runs entirely in the browser — no backend, no server, no build step. Built with vanilla HTML, CSS, and JavaScript, styled like a lightweight desktop IDE (VS Code / DevToys inspired).

## Features

**Shell**
- Collapsible sidebar with search/filter, favorites, and categorized tools
- Tabbed workspace — open multiple tools at once, close/reopen freely
- **Duplicate any tab** to work on a second, fully independent instance of the same tool (state — content, queries, selections — carries over into the clone; editing one never affects the other); double-click a tab to rename it
- Command palette (`Ctrl/Cmd + K`) to jump to any tool or command
- Dark / light theme
- Settings panel (font size, indent size, tab restore)
- Workspace auto-saved to `localStorage` — reload and pick up where you left off
- Drag a file onto **Import** to route it straight into the matching tool

**Core Tools**
- **JSON Path Finder** — beautify/minify, live validation, collapsible tree view, JSONPath evaluator with match highlighting
- **XML Path Finder** — beautify/minify, live validation, XPath evaluation (via the browser's native `XPathEvaluator`)
- **SQL Formatter** — beautify/minify, keyword case conversion, dialect selector
- **Text / JSON Diff** — line-level diff, JSON-aware comparison (key sorting), ignore-whitespace mode
- **Data Converter** — JSON ⇄ YAML ⇄ CSV ⇄ XML
- **CSV ⇄ JSON** — a dedicated, richer converter: header detection, dot-path nesting (`address.city` ⇄ nested objects), table preview, file import/export
- **Cron Builder** — visual field-by-field builder, manual editor with validation, common presets, human-readable translation in both directions, and a next-5-runs calculator (standard 5-field Unix cron, plus a basic 6-field seconds variant — no `L`/`W`/`#` Quartz tokens)

**Notes Workspace**
- **Markdown Notes** — a local, offline notes app in the Obsidian/Typora mould:
  - Nested folders, favorites, pinning, full-text + tag search
  - CodeMirror editor with Editor / Split / Preview modes
  - GFM preview (tables, task lists, code fences) via `marked` + `DOMPurify`, syntax-highlighted code blocks, one-click copy
  - Mermaid diagrams and KaTeX math, rendered live
  - `[[Wikilinks]]` with autocomplete-as-you-type and an automatic backlinks panel
  - Tags with color coding, inline find & replace, word count / reading time / cursor position
  - 11 built-in templates (README, meeting notes, bug report, ADR, sprint planning, and more)
  - Export a note as `.md`, `.html`, or `.txt`, or straight to print/PDF
  - Export/import the whole notes workspace as JSON
  - Paste or drag an image straight into a note (embedded as a data URL)

**Developer Utilities**
- JWT Decoder (header/payload/expiry, all local)
- Base64 Utility (text and file encoding, UTF-8 safe)
- URL Encoder/Decoder with a live query-parameter builder
- Regex Tester (live matches, capture groups, common pattern presets)
- UUID Generator (v4, v7, v1-style; single or batch)
- Hash Generator (MD5, SHA-1, SHA-256, SHA-512)
- Timestamp Converter (Unix seconds/ms, ISO 8601, local/UTC, relative time, live clock)
- Number Base Converter (binary/octal/decimal/hex, live, arbitrary-precision via `BigInt`)
- Text Case Converter (camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title/Sentence/upper/lower)
- Random Generator (passwords, random strings, hex tokens, PINs — configurable charset, live entropy estimate)
- HTTP Status Code Reference (searchable, categorized 1xx–5xx)
- Color Picker & Converter (HEX/RGB/RGBA/HSL, complementary/analogous/monochrome palettes, WCAG contrast checker)
- Markdown Table Generator (visual spreadsheet-style grid with per-column alignment)

Everything runs client-side. Nothing you paste into Toolbench leaves your browser.

## Getting started

No install, no build:

```bash
git clone https://github.com/rakeshvadnala/toolbench.git
cd toolbench
```

Then just open `index.html` in a browser — or serve it locally if you prefer:

```bash
npx serve .
```

## Project structure

```
toolbench/
├── index.html   # app shell markup + styles
└── app.js       # shell logic (tabs, sidebar, palette, persistence)
                 # + one registerTool({...}) block per tool
```

- Toolbench uses a small plugin registry: every tool is a single object pushed into a `TOOLS` array with a `mount(container, api)` function. The shell has no knowledge of what any individual tool does — adding tool #22 means writing one new `registerTool({...})` block and nothing else.
- For tab cloning to carry a tool's live state, `mount()` can return `{cleanup, getState, setState}` instead of a bare cleanup function — `getState()` snapshots the tool's current fields, `setState(snapshot)` restores them into a new tab. This is optional; a tool that skips it still works, its clones just open at defaults.
- The Markdown Notes tool lazy-loads its own dependencies (`marked`, `DOMPurify`, `highlight.js`, `Mermaid`, `KaTeX`) the first time it's opened, so the rest of the app doesn't pay for them.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + Shift + P` | Open command palette |
| `Ctrl/Cmd + W` | Close active tab |
| `Esc` | Close palette / settings |

## Known limitations

Toolbench is an actively-developed MVP, not a finished product. Current gaps, tracked for future releases:

- Editors use CodeMirror 5 rather than Monaco
- No web worker / virtual scrolling pipeline yet — large files (tens of MB+) will be slow
- No drag-to-reorder tabs or split-pane view
- JSONPath and XPath support the common real-world syntax, not the full spec
- CodeMirror, js-yaml, and PapaParse load from a CDN, so first load needs an internet connection
- Markdown Notes stores everything in `localStorage` (not IndexedDB / File System Access API) — fine for personal note-taking, not built for thousands of notes; no drag-to-reorder in the folder tree; no version history beyond the editor's own undo stack; pasted images are embedded as data URLs rather than managed as separate assets
- Cron Builder supports standard 5-field Unix cron plus a basic 6-field seconds variant; Quartz-only tokens (`L`, `W`, `#`, `?`) aren't supported, and the human → cron translator only recognizes common phrasings, not free-form English
- Not yet built: QR code generator/reader, X.509 certificate decoder, CSS/JS beautifier & minifier, an image toolbox (Base64⇄image, EXIF viewer, resize/crop/rotate), and a full ASCII/Unicode/emoji explorer — deferred because they need either additional CDN dependencies, careful correctness work (ASN.1 parsing, a real JS parser), or canvas-heavy UI that didn't fit this pass

See [CHANGELOG.md](CHANGELOG.md) for release history and [CONTRIBUTING.md](CONTRIBUTING.md) if you'd like to help close these gaps.

## License

[MIT](LICENSE)
