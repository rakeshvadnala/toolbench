# Changelog

All notable changes to this project will be documented here.

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
