# VibeLens — Implementation Roadmap

**Version:** 0.1.0-draft
**Last Updated:** 2026-03-10
**Status:** Draft

---

## Phase Overview

```
Phase 1          Phase 2           Phase 3           Phase 4           Phase 5
MVP              Visual Editing    Timeline           Framework+Polish  AI Integration
(4-6 weeks)      (3-4 weeks)       (3-4 weeks)        (3-4 weeks)       (2-3 weeks)
─────────────────────────────────────────────────────────────────────────────────────
Preview Panel    CSS Inspector     Screenshot Capture  Vue Adapter       AI Prompt Export
Annotations      Source Sync       Snapshot Timeline   Svelte Adapter    Webhook API
Export JSON/MD   Undo/Redo         Before/After Diff   Tailwind Reverse  Tool-Specific
Visual Diff      Diff Preview      One-Click Revert    Firefox Port      Integrations
Bridge CLI       AST Writers       Visual History      Git Auto-Branch
File Watcher                                           Build Plugins

v0.1.0           v0.2.0            v0.3.0              v0.4.0            v0.5.0
```

---

## Phase 1: MVP — Preview + Annotate (4-6 weeks)

**Goal:** Working extension that shows a live preview and lets users annotate elements.

**Release:** v0.1.0

### Milestones

#### M1.1: Project Scaffold (Week 1)

- [ ] Initialize monorepo with pnpm workspaces
- [ ] Set up `packages/extension` with Vite + CRXJS + Preact + TypeScript
- [ ] Set up `packages/bridge` with Node.js + TypeScript
- [ ] Set up `packages/shared` with protocol types
- [ ] Configure ESLint, Prettier, Vitest across all packages
- [ ] CI: GitHub Actions for lint + type-check + test
- [ ] Create dev workflow docs (how to develop/test the extension locally)

**Exit Criteria:** `pnpm build` succeeds. Extension loads in Chrome. Bridge starts and listens.

#### M1.2: Bridge Server Core (Week 1-2)

- [ ] CLI entry point with argument parsing (citty)
- [ ] WebSocket server on configurable port (default 9119)
- [ ] File watcher with chokidar (configurable ignore patterns)
- [ ] Dev server auto-detection (probe common ports)
- [ ] Framework auto-detection (check project files)
- [ ] `bridge:status` and `file:changed` WebSocket messages
- [ ] HTTP health endpoint (`GET /api/status`)

**Exit Criteria:** `npx vibelens` starts, detects a running Vite dev server, and sends `file:changed` events on save.

#### M1.3: Extension Preview Panel (Week 2-3)

- [ ] MV3 manifest with side panel configuration
- [ ] Service worker: WebSocket client with auto-reconnect
- [ ] Side panel UI: toolbar + iframe + status bar
- [ ] Preview URL input with auto-detect from bridge
- [ ] Viewport presets (mobile / tablet / desktop)
- [ ] Auto-reload on `file:changed` WebSocket event
- [ ] Connection status indicator (connected / reconnecting / disconnected)
- [ ] CSP handling: modify headers for localhost iframe embedding

**Exit Criteria:** Side panel opens, shows live preview of dev server, auto-reloads on file save.

#### M1.4: Annotation System (Week 3-4)

- [ ] Annotation mode toggle (Cmd+Shift+A, toolbar button)
- [ ] Element highlight on hover (content script overlay)
- [ ] Click to place annotation pin
- [ ] CSS selector generation (robust, unique selectors)
- [ ] Annotation form: type picker, message input
- [ ] Pin rendering with numbered markers
- [ ] Pin re-anchoring on DOM changes
- [ ] Annotation persistence (chrome.storage.local)
- [ ] Annotation list in bottom drawer

**Exit Criteria:** User can annotate 5 elements, close/reopen extension, and see annotations re-anchored.

#### M1.5: Visual Diff Overlay (Week 4-5)

- [ ] DOM snapshot capture (lightweight fingerprinting)
- [ ] Diff algorithm (added / modified / removed detection)
- [ ] Overlay rendering: green/yellow/red outlines
- [ ] Toggle diff overlay (Cmd+Shift+D)
- [ ] Auto-dismiss after configurable timeout
- [ ] Diff resets on next file change

**Exit Criteria:** Modify a component's styles in IDE → save → VibeLens highlights the changed element in yellow.

#### M1.6: Export & Polish (Week 5-6)

- [ ] JSON export with full annotation data
- [ ] Markdown export (human-readable)
- [ ] AI Prompt export format (ready to paste)
- [ ] Copy to clipboard with one click
- [ ] Extension settings page (preferences)
- [ ] Error states and empty states
- [ ] Extension icon and branding
- [ ] README for Chrome Web Store listing

**Exit Criteria:** User completes full flow: preview → annotate 3 items → export as AI prompt → paste into Claude Code.

---

## Phase 2: Visual Editing + Source Sync (3-4 weeks)

**Goal:** Click elements to edit CSS visually. Changes write back to source files.

**Release:** v0.2.0

### Milestones

#### M2.1: Style Inspector UI (Week 1-2)

- [ ] Element selection mode (click without annotation mode)
- [ ] Inspector floating panel with CSS property editors
- [ ] Color picker (background, text color, border color)
- [ ] Spacing editor (padding/margin with visual box model)
- [ ] Typography controls (font-size slider, weight dropdown)
- [ ] Border radius slider
- [ ] Opacity slider
- [ ] Live preview: changes apply instantly to DOM
- [ ] Pending changes counter
- [ ] Undo/redo stack (Cmd+Z / Cmd+Shift+Z)

**Exit Criteria:** User clicks button, adjusts 3 properties, sees instant preview update.

#### M2.2: Source Map Resolution (Week 2-3)

- [ ] Source map parser (read .map files from dev server)
- [ ] React adapter: selector → component → source file + line
- [ ] Generic adapter: fuzzy file search fallback
- [ ] `source:resolve` and `source:resolved` WebSocket messages
- [ ] Confidence scoring (how sure are we about the mapping)
- [ ] Cache resolved mappings per session

**Exit Criteria:** Click a React component in preview → bridge returns correct source file and line number.

#### M2.3: Code Writer (Week 3-4)

- [ ] CSS file writer (postcss-based)
- [ ] JSX inline style writer (babel-based)
- [ ] Tailwind class writer (reverse lookup)
- [ ] Write preview: show diff before applying
- [ ] Conflict detection (file modified externally)
- [ ] Formatter integration (detect and run prettier/eslint)
- [ ] `write:request`, `write:preview`, `write:result` messages

**Exit Criteria:** Change border-radius in inspector → click Apply → correct file updated → IDE shows change.

---

## Phase 3: Timeline & Visual History (3-4 weeks)

**Goal:** Capture and compare visual states across code iterations.

**Release:** v0.3.0

- [ ] Screenshot capture on each file save event
- [ ] Snapshot storage (compressed PNG, metadata)
- [ ] Timeline UI in bottom drawer
- [ ] Scrubber to navigate between snapshots
- [ ] Before/after slider comparison view
- [ ] Pixel-diff engine (highlight changed regions between snapshots)
- [ ] One-click revert to previous snapshot (git checkout of changed files)
- [ ] Snapshot export (share visual history)
- [ ] Configurable snapshot retention (max count / max age)

**Exit Criteria:** AI tool makes 5 iterations → user scrubs timeline → clicks "Revert to v3" → files roll back.

---

## Phase 4: Framework Adapters + Polish (3-4 weeks)

**Goal:** Deep framework support, browser compat, quality-of-life features.

**Release:** v0.4.0

- [ ] Vue SFC adapter (source map resolution for `<template>` and `<style>`)
- [ ] Vue style writer (modify SFC `<style>` blocks)
- [ ] Svelte adapter (component → source mapping)
- [ ] Svelte style writer (modify `<style>` blocks)
- [ ] Tailwind config-aware reverse lookup (read tailwind.config.*)
- [ ] Vite plugin: `vite-plugin-vibelens` for `data-vibelens-src` injection
- [ ] Git integration: auto-create `vibelens/tweaks` branch for visual changes
- [ ] Firefox WebExtension port
- [ ] Keyboard shortcut customization
- [ ] Performance optimization pass (large DOM trees, many annotations)
- [ ] Accessibility audit of extension UI

**Exit Criteria:** VibeLens works with React, Vue, and Svelte projects. Available on Chrome and Firefox.

---

## Phase 5: AI Tool Integration (2-3 weeks)

**Goal:** Tight feedback loops with AI coding tools via API.

**Release:** v0.5.0

- [ ] "Send to Claude Code" one-click button
- [ ] AI prompt format with embedded element screenshots
- [ ] Webhook endpoint (bridge sends annotation events to external tools)
- [ ] CLI pipe: `vibelens export --format claude | claude-code`
- [ ] API documentation for third-party integrations
- [ ] Annotation import from AI tool responses (structured format)
- [ ] Batch annotation resolution (mark multiple as resolved)

**Exit Criteria:** Annotate in VibeLens → one click → Claude Code receives structured feedback with screenshots.

---

## Definition of Done (per milestone)

- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Integration tests for critical paths
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint warnings (`eslint`)
- [ ] Performance budgets met
- [ ] Error states handled gracefully
- [ ] Extension loads cleanly in Chrome (no console errors)
- [ ] Bridge starts cleanly (no unhandled rejections)

---

## Dependencies Between Phases

```
Phase 1 (MVP)
  └─► Phase 2 (Visual Editing)
        ├─► Phase 3 (Timeline) — independent of Phase 2 code writers
        └─► Phase 4 (Framework Adapters) — extends Phase 2 writers
              └─► Phase 5 (AI Integration) — builds on all prior phases
```

Phase 3 can start in parallel with late Phase 2 work (timeline UI is independent of write-back).

---

## Risk Register (Phase-Specific)

| Phase | Risk | Likelihood | Mitigation |
|-------|------|-----------|-----------|
| 1 | Chrome MV3 side panel limitations | Medium | Test early, have popup fallback |
| 1 | CSP blocks iframe embedding | Medium | webRequest API, document in known issues |
| 2 | Source map resolution unreliable | High | Invest in build plugin (Phase 4) as reliable fallback |
| 2 | AST writer corrupts code | Medium | Extensive snapshot tests, dry-run preview mandatory |
| 3 | Screenshot capture slow/heavy | Low | Use lightweight capture, compress aggressively |
| 4 | Vue/Svelte adapters complex | Medium | Start with basic support, iterate based on user feedback |
| 5 | AI tools don't accept structured input well | Low | Fall back to human-readable markdown |
