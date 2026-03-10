# VibeLens — Architecture Decision Records (ADRs)

**Last Updated:** 2026-03-10

Each decision follows the format: Context → Decision → Consequences.

---

## ADR-001: Two-Component Architecture (Extension + Bridge)

**Status:** Accepted
**Date:** 2026-03-10

### Context
VibeLens needs to both render UI in the browser AND read/write files on the local filesystem. Browser extensions are sandboxed and cannot access the filesystem directly.

### Options Considered
1. **Extension-only** — Use Chrome's File System Access API
2. **Extension + Bridge CLI** — Separate Node.js process for filesystem ops
3. **VS Code Extension** — Build everything inside VS Code's extension model
4. **Desktop App** — Electron/Tauri standalone application

### Decision
**Option 2: Extension + Bridge CLI.**

### Rationale
- File System Access API (Option 1) requires user to grant per-directory access via picker — poor UX for ongoing use, and can't watch files
- VS Code extension (Option 3) locks us to one editor — we want to be editor-agnostic
- Desktop app (Option 4) is heavyweight and redundant — the browser is already running
- Bridge CLI is lightweight, starts in < 2s, works with any editor/AI tool

### Consequences
- **Positive:** Editor-agnostic. Works with Claude Code, Cursor, Vim, anything.
- **Positive:** Clean separation of concerns (UI vs. filesystem).
- **Negative:** User must run two things (extension + CLI). Mitigated by auto-detection and clear onboarding.
- **Negative:** WebSocket connection management adds complexity.

---

## ADR-002: Chrome Manifest V3 Side Panel

**Status:** Accepted
**Date:** 2026-03-10

### Context
The extension needs persistent UI — a popup closes when you click away, which breaks the annotation workflow.

### Options Considered
1. **Popup** — Standard extension popup
2. **Side Panel** — Chrome's side panel API (MV3)
3. **DevTools Panel** — Tab inside Chrome DevTools
4. **New Tab** — Dedicated tab with extension page

### Decision
**Option 2: Side Panel.**

### Rationale
- Popup (Option 1) closes on click-away — unusable for annotation workflow
- DevTools panel (Option 3) requires DevTools to be open — adds friction, feels "developer-only"
- New tab (Option 4) can't overlay content on preview page — separate window
- Side panel stays open alongside the page, can communicate with content script, feels native

### Consequences
- **Positive:** Persistent, always-visible UI alongside the preview.
- **Positive:** Native Chrome feel, no fighting the browser.
- **Negative:** Side panel API is relatively new — may have quirks. Must test thoroughly.
- **Negative:** Firefox doesn't have side panel API — will need alternative for Firefox port (sidebar_action).

---

## ADR-003: Preact Over React for Extension UI

**Status:** Accepted
**Date:** 2026-03-10

### Context
Extension bundle size directly impacts install size and memory usage. We have a 500KB budget.

### Options Considered
1. **React 18+** — Full React
2. **Preact** — React-compatible, 3KB
3. **Svelte** — Compile-time framework
4. **Vanilla JS** — No framework

### Decision
**Option 2: Preact.**

### Rationale
- React (Option 1) adds ~40KB min-gzipped — too much for an extension
- Preact is 3KB, API-compatible with React, supports hooks and JSX
- Svelte (Option 3) would work but has a smaller ecosystem for UI component libraries
- Vanilla JS (Option 4) is viable but makes complex UI (inspector, timeline) painful to maintain

### Consequences
- **Positive:** Tiny bundle. Fast load. React-compatible API means easy transition if needed.
- **Negative:** Some React libraries may not work with Preact. Must test each dependency.
- **Negative:** preact/compat adds some overhead if React compatibility layer is needed.

---

## ADR-004: WebSocket for Real-Time Communication

**Status:** Accepted
**Date:** 2026-03-10

### Context
Bridge needs to push events to extension (file changes, source resolution results) in real-time. Extension needs to send requests to bridge (source resolution, write-back).

### Options Considered
1. **WebSocket** — Full-duplex real-time connection
2. **HTTP Polling** — Extension polls bridge periodically
3. **Server-Sent Events (SSE)** — Server → client stream only
4. **Chrome Native Messaging** — Chrome's IPC mechanism

### Decision
**Option 1: WebSocket.**

### Rationale
- Full-duplex: both sides can initiate messages (bridge sends file events, extension sends write requests)
- Low latency: < 50ms for localhost
- Mature: `ws` library is battle-tested
- HTTP polling (Option 2) adds latency and unnecessary requests
- SSE (Option 3) is server→client only — can't send write requests
- Native Messaging (Option 4) requires a native host app — too complex

### Consequences
- **Positive:** Sub-50ms latency. Bidirectional. Clean event model.
- **Negative:** Connection management: reconnection, heartbeat, error handling.
- **Negative:** Service worker (MV3) may suspend WebSocket connections. Need keepalive strategy.

---

## ADR-005: CSS Selector Paths for Annotation Anchoring

**Status:** Accepted
**Date:** 2026-03-10

### Context
Annotations must survive page reloads, viewport resizes, and minor DOM changes. We need a stable way to identify elements.

### Options Considered
1. **Pixel coordinates** — x, y position on page
2. **CSS selector path** — Structural path like `main > div.card:nth-child(2)`
3. **XPath** — XML path expression
4. **Element ID / data attribute** — Direct identifier
5. **Visual fingerprint** — Image hash of element

### Decision
**Option 2: CSS selector path** with fallback strategies.

### Rationale
- Coordinates (Option 1) break on resize, scroll, or any layout change
- CSS selectors survive layout changes if structure is stable
- XPath (Option 3) is more fragile than CSS selectors for typical web pages
- Element IDs (Option 4) often don't exist on elements users want to annotate
- Visual fingerprint (Option 5) is expensive to compute and ambiguous

**Fallback cascade:** Primary selector → broader parent selector → nearest ID ancestor + offset → manual re-anchor.

### Consequences
- **Positive:** Works across reloads, resizes, and minor DOM changes.
- **Negative:** Selectors break when DOM structure changes significantly (e.g., AI rewrites component).
- **Mitigation:** Fallback selectors, user notification when anchor is lost.

---

## ADR-006: AST-Aware Code Writing

**Status:** Accepted
**Date:** 2026-03-10

### Context
When writing CSS changes back to source files, we need to modify code without breaking it.

### Options Considered
1. **String replacement** — Find/replace text patterns
2. **Regex-based modification** — Pattern matching
3. **AST parsing and modification** — Parse → modify → generate

### Decision
**Option 3: AST-based modification.**

### Rationale
- String replacement (Option 1) is fragile: `padding: 8px` might appear in comments, strings, or unrelated rules
- Regex (Option 2) can't handle nested structures, multi-line values, or context-dependent replacements
- AST (Option 3) understands code structure: finds the right node, modifies it, regenerates code
- postcss for CSS, babel for JSX/TSX — both are industry-standard, well-maintained

### Consequences
- **Positive:** Correct modifications even in complex files. No false positives.
- **Positive:** Can preserve formatting, comments, and whitespace.
- **Negative:** Slower than string replacement (parse + transform + generate). Budget: < 500ms.
- **Negative:** Each CSS-in-JS library may need its own writer strategy.
- **Mitigation:** Cache parsed ASTs per file. Only re-parse on external file change.

---

## ADR-007: Licensing Strategy

**Status:** Accepted
**Date:** 2026-03-10

### Context
VibeLens needs a licensing model. Key considerations: adoption speed, community contributions, potential monetization.

### Options Considered

| Option | License | Pros | Cons |
|--------|---------|------|------|
| A | MIT (fully open) | Maximum adoption, community trust | No monetization lever |
| B | AGPL-3.0 | Copyleft encourages contributions | Scares corporate users |
| C | BSL (Business Source License) | Open source with delayed release | Complex, less familiar |
| D | Open core (MIT core + proprietary features) | Best of both | Requires maintaining two codebases |

### Decision
**Option A: MIT license — maximize adoption first, monetize later.**

### Rationale
- Priority is adoption and community momentum. MIT removes all friction.
- Monetization comes later via hosted services, not license restrictions:
  - **VibeLens Cloud** — team annotation sync, shared visual history, hosted screenshot diff
  - **VibeLens Pro CLI** — CI visual regression integration, batch annotation API
  - **Enterprise Support** — priority support, custom adapters, SLA
- MIT allows the codebase to be the distribution channel. Revenue comes from services on top.

### Monetization Timeline
- **Months 1-6:** Pure MIT open source. Build community, gather feedback, grow DAU.
- **Months 6-12:** Introduce VibeLens Cloud (annotation sync, team features) as paid SaaS.
- **Year 2+:** Enterprise tier with CI integration, SSO, audit trails.

### Consequences
- **Positive:** Zero adoption friction. Corporate-friendly. Community contributions welcome.
- **Positive:** Cloud monetization decouples revenue from codebase licensing.
- **Negative:** Competitors can fork without restriction. Mitigated by velocity + brand.
- **Negative:** Must build and maintain cloud service later — additional infrastructure cost.

---

## ADR-008: Monorepo Structure

**Status:** Accepted
**Date:** 2026-03-10

### Context
VibeLens has multiple packages (extension, bridge, shared types, framework adapters). Need to decide on code organization.

### Decision
**pnpm workspaces monorepo.**

### Rationale
- Shared types between extension and bridge must stay in sync
- pnpm is fastest, most disk-efficient package manager
- Workspaces allow shared dev dependencies and scripts
- Turborepo or nx can be added later if build caching becomes needed

### Structure
```
packages/
  extension/    # Chrome extension
  bridge/       # CLI bridge server
  shared/       # Protocol types, constants
  adapters/     # Framework-specific code (Phase 4)
```

---

## ADR-009: Dual Distribution — CLI + VS Code Extension

**Status:** Accepted
**Date:** 2026-03-10

### Context
The bridge server needs to run locally to watch files and resolve source maps. Users may prefer different workflows — some use terminal-first tools (Claude Code, Vim), others use VS Code/Cursor. We need to support both without fragmenting the codebase.

### Options Considered
1. **CLI only** (`npx vibelens`) — terminal-first, editor-agnostic
2. **VS Code extension only** — deep IDE integration, auto-start
3. **Both CLI + VS Code extension** — maximum reach, same bridge core

### Decision
**Option 3: Both CLI and VS Code extension, sharing the same bridge core.**

### Rationale
- CLI serves terminal-first users (Claude Code, Vim, Neovim, any editor)
- VS Code extension serves the largest IDE userbase + Cursor users (Cursor is VS Code-based)
- Both distribution methods wrap the same `packages/bridge` core — no code duplication
- VS Code extension auto-starts the bridge when a project opens — zero-friction onboarding

### Architecture

```
packages/bridge/         ← shared core (file watcher, source mapper, code writer)
  │
  ├── packages/cli/      ← CLI wrapper: npx vibelens
  │     └── bin/vibelens.ts (imports bridge core, adds CLI args)
  │
  └── packages/vscode/   ← VS Code extension wrapper
        └── extension.ts (imports bridge core, adds VS Code lifecycle)
        └── provides:
            - Auto-start bridge on workspace open
            - Status bar indicator (connected/disconnected)
            - Command palette: "VibeLens: Start", "VibeLens: Stop"
            - Settings: port, watched dirs, framework override
```

### Consequences
- **Positive:** Covers both terminal-first and IDE-first users.
- **Positive:** VS Code extension = zero-config onboarding for Cursor/VS Code users.
- **Positive:** Same bridge core = no feature divergence.
- **Negative:** Must maintain two distribution wrappers (CLI + VS Code). Low cost since wrappers are thin.
- **Negative:** VS Code extension adds a package to the monorepo. Manageable.

---

## ADR-010: Dual Persona Support — Vibe Coders + Experienced Devs

**Status:** Accepted
**Date:** 2026-03-10

### Context
VibeLens targets two distinct user types with different skill levels and expectations. We need to support both without making the tool too complex for beginners or too limited for experts.

### Decision
**Support both personas with a progressive disclosure UI.**

### Design Strategy

| Layer | Vibe Coder (Non-Expert) | AI-Assisted Dev (Experienced) |
|-------|------------------------|------------------------------|
| **Onboarding** | Guided setup wizard, auto-detect everything | CLI flags, manual config |
| **Annotations** | Simple pin + comment | Pin + comment + computed styles + source location |
| **Inspector** | Preset controls (sliders, pickers) | Raw CSS property editing, custom values |
| **Export** | "Copy feedback" button (markdown) | JSON export, AI prompt format, webhook |
| **Diff** | Green/yellow/red highlights (visual only) | Detailed diff panel with property-level changes |
| **Settings** | Minimal (on/off toggles) | Full config (ports, adapters, ignore patterns) |

### Implementation
- **Default mode:** "Simple" — shows essential controls, hides advanced options
- **Advanced mode:** Toggle via settings or keyboard shortcut (Cmd+Shift+X)
- **Progressive disclosure:** Advanced features are always accessible but not in the way
- **No separate builds** — one extension, one bridge, UI adapts to preference

### Consequences
- **Positive:** Broadest possible audience. Beginners aren't overwhelmed. Experts aren't limited.
- **Positive:** Simple mode is the marketing surface. Advanced mode is the retention hook.
- **Negative:** Must design every feature twice (simple + advanced view). Increases UI work.
- **Mitigation:** Start with advanced mode in Phase 1 (dev audience), add simple mode wrapper in Phase 2.

---

## Decision Log (Quick Reference)

| ADR | Decision | Status |
|-----|---------|--------|
| 001 | Extension + Bridge CLI architecture | Accepted |
| 002 | Chrome Side Panel for persistent UI | Accepted |
| 003 | Preact for extension UI framework | Accepted |
| 004 | WebSocket for bridge communication | Accepted |
| 005 | CSS selector paths for annotation anchoring | Accepted |
| 006 | AST-aware code writing for source sync | Accepted |
| 007 | MIT license, monetize via cloud services later | Accepted |
| 008 | pnpm workspaces monorepo | Accepted |
| 009 | Dual distribution: CLI + VS Code extension | Accepted |
| 010 | Dual persona: progressive disclosure UI | Accepted |
