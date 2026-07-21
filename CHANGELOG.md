# Changelog

All notable changes to this project will be documented here.

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
