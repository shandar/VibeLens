# VibeLens — Technical Architecture

**Version:** 0.1.0-draft
**Last Updated:** 2026-03-10
**Status:** Draft

---

## 1. System Overview

VibeLens is a two-component system:

1. **Browser Extension** — Chrome MV3 extension providing preview, annotation, and visual editing UI
2. **Bridge Server** — Node.js CLI tool that watches files, resolves source maps, and writes changes back to source

They communicate over WebSocket (real-time events) and HTTP (file operations).

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER EXTENSION                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Preview Panel │  │ Annotation   │  │ Style Inspector   │ │
│  │ (iframe)      │  │ Overlay      │  │ (CSS editing)     │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐ │
│  │                  Extension Core                         │ │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │ │
│  │  │ WS Client  │ │ State    │ │ DOM Diff   │ │ Export │ │ │
│  │  │            │ │ Manager  │ │ Engine     │ │ Engine │ │ │
│  │  └─────┬──────┘ └──────────┘ └───────────┘ └────────┘ │ │
│  └────────┼───────────────────────────────────────────────┘ │
└───────────┼─────────────────────────────────────────────────┘
            │
            │  WebSocket (ws://localhost:9119)
            │  HTTP      (http://localhost:9119)
            │
┌───────────▼─────────────────────────────────────────────────┐
│                     BRIDGE SERVER (CLI)                       │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ File Watcher  │ │ Source Map   │ │ Code Writer          │ │
│  │ (chokidar)   │ │ Resolver     │ │ (AST-aware)          │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │                │                     │            │
│  ┌──────▼────────────────▼─────────────────────▼──────────┐ │
│  │                  Framework Adapter Layer                 │ │
│  │  ┌────────┐ ┌───────┐ ┌────────┐ ┌──────────────────┐ │ │
│  │  │ React  │ │ Vue   │ │ Svelte │ │ Plain HTML/CSS   │ │ │
│  │  └────────┘ └───────┘ └────────┘ └──────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Project File System (read/write)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 Browser Extension

**Platform:** Chrome Manifest V3

```
packages/extension/
├── manifest.json              # MV3 manifest
├── src/
│   ├── background/
│   │   └── service-worker.ts  # Extension lifecycle, WS connection manager
│   ├── content/
│   │   └── content-script.ts  # Injected into preview page for DOM observation
│   ├── sidepanel/
│   │   ├── SidePanel.tsx      # Main side panel UI
│   │   ├── PreviewFrame.tsx   # iframe wrapper with viewport controls
│   │   ├── AnnotationList.tsx # List of annotations
│   │   └── ExportPanel.tsx    # Export annotations as JSON/Markdown
│   ├── overlay/
│   │   ├── AnnotationPin.tsx  # Individual annotation marker
│   │   ├── DiffHighlight.tsx  # Visual diff outline
│   │   └── Inspector.tsx      # CSS property editor panel
│   ├── core/
│   │   ├── ws-client.ts       # WebSocket connection to bridge
│   │   ├── state.ts           # Zustand store for extension state
│   │   ├── dom-differ.ts      # Snapshot + diff DOM trees
│   │   ├── selector.ts        # Generate robust CSS selectors for elements
│   │   └── export.ts          # Format annotations as JSON/Markdown/Prompt
│   └── shared/
│       ├── types.ts           # Shared TypeScript types
│       └── protocol.ts        # WebSocket message protocol types
├── public/
│   ├── icons/                 # Extension icons (16, 32, 48, 128)
│   └── sidepanel.html         # Side panel HTML entry
└── vite.config.ts             # Build config (Vite + CRXJS)
```

**Key Design Decisions:**
- **Side Panel** (not popup) — persistent UI that stays open while browsing
- **Content Script** — injected into the preview page to observe DOM and overlay annotations
- **Service Worker** — manages WebSocket lifecycle, survives tab navigation
- **Zustand** for state — lightweight, no boilerplate, works well with React in extension context
- **Preact** for UI — smaller bundle than React, compatible API

### 2.2 Bridge Server

**Platform:** Node.js 18+, distributed via npm

```
packages/bridge/
├── bin/
│   └── vibelens.ts            # CLI entry point
├── src/
│   ├── server/
│   │   ├── ws-server.ts       # WebSocket server (ws library)
│   │   ├── http-server.ts     # HTTP endpoints for file ops
│   │   └── router.ts          # HTTP route definitions
│   ├── watcher/
│   │   ├── file-watcher.ts    # chokidar-based file watcher
│   │   └── change-detector.ts # Classify changes (style vs. structure vs. logic)
│   ├── resolver/
│   │   ├── source-mapper.ts   # Source map resolution engine
│   │   ├── react-adapter.ts   # React fiber → source location
│   │   ├── vue-adapter.ts     # Vue SFC → source location
│   │   ├── svelte-adapter.ts  # Svelte component → source location
│   │   └── generic-adapter.ts # Fallback: CSS selector → file search
│   ├── writer/
│   │   ├── code-writer.ts     # Orchestrates write-back
│   │   ├── css-writer.ts      # Modify .css / .scss / .less files
│   │   ├── jsx-style-writer.ts # Modify inline JSX style objects
│   │   ├── tailwind-writer.ts # Modify Tailwind class strings
│   │   └── vue-style-writer.ts # Modify Vue SFC <style> blocks
│   ├── snapshot/
│   │   ├── screenshot.ts      # Capture page screenshots (Puppeteer-lite)
│   │   └── timeline.ts        # Manage snapshot history
│   ├── git/
│   │   └── git-ops.ts         # Branch creation, status checks
│   └── shared/
│       ├── types.ts
│       └── protocol.ts        # Shared with extension
├── package.json
└── tsconfig.json
```

### 2.3 Shared Protocol Package

```
packages/shared/
├── src/
│   ├── protocol.ts            # WebSocket message types
│   ├── annotation.ts          # Annotation data model
│   ├── types.ts               # Shared types
│   └── constants.ts           # Port numbers, version, etc.
├── package.json
└── tsconfig.json
```

---

## 3. Communication Protocol

### 3.1 WebSocket Messages (ws://localhost:9119)

All messages follow this envelope:

```typescript
interface WSMessage {
  type: string;
  id: string;          // unique message ID (nanoid)
  timestamp: number;   // Unix ms
  payload: unknown;
}
```

#### Bridge → Extension Messages

| Type | Payload | When |
|------|---------|------|
| `file:changed` | `{ files: string[], changeType: 'style' \| 'structure' \| 'content' }` | File saved in project |
| `source:resolved` | `{ selector: string, file: string, line: number, column: number, framework: string }` | Response to source resolution request |
| `write:result` | `{ success: boolean, file: string, diff: string, error?: string }` | After source write-back |
| `snapshot:captured` | `{ id: string, timestamp: number, thumbnail: string }` | After screenshot capture |
| `bridge:status` | `{ connected: boolean, project: string, framework: string, files: number }` | On connection + periodic heartbeat |

#### Extension → Bridge Messages

| Type | Payload | When |
|------|---------|------|
| `source:resolve` | `{ selector: string, pageUrl: string }` | User clicks element, need source location |
| `write:request` | `{ file: string, changes: StyleChange[] }` | User applies visual change to source |
| `write:preview` | `{ file: string, changes: StyleChange[] }` | User requests diff preview before writing |
| `snapshot:request` | `{ url: string, viewport: Viewport }` | Capture current page state |
| `bridge:ping` | `{}` | Heartbeat check |

### 3.2 HTTP Endpoints (http://localhost:9119)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/status` | Bridge health check + project info |
| `GET` | `/api/files/:path` | Read source file content |
| `GET` | `/api/snapshots` | List captured snapshots |
| `GET` | `/api/snapshots/:id` | Get snapshot image |
| `POST` | `/api/annotations/import` | Import annotations from file |
| `GET` | `/api/annotations/export` | Export annotations as JSON |

---

## 4. Data Models

### 4.1 Annotation

```typescript
interface Annotation {
  id: string;                          // nanoid
  selector: string;                    // CSS selector path to element
  selectorFallback: string;            // Broader selector if primary breaks
  type: 'comment' | 'bug' | 'suggestion' | 'style-change';
  message: string;
  category?: string;                   // user-defined grouping

  // Context
  pageUrl: string;
  viewport: { width: number; height: number };
  elementRect: DOMRect;                // position at time of annotation
  screenshot?: string;                 // base64 cropped element image

  // Style context
  computedStyles?: Record<string, string>;
  suggestedStyles?: Record<string, string>;  // if user tweaked via inspector

  // Source mapping
  sourceLocation?: {
    file: string;
    line: number;
    column: number;
    framework: string;
  };

  // Metadata
  createdAt: string;                   // ISO 8601
  updatedAt: string;
  resolved: boolean;
}
```

### 4.2 Style Change

```typescript
interface StyleChange {
  selector: string;
  property: string;          // CSS property name
  oldValue: string;
  newValue: string;
  writeTarget: {
    type: 'css-file' | 'inline-style' | 'tailwind-class' | 'css-module' | 'styled-component';
    file: string;
    line: number;
  };
}
```

### 4.3 DOM Snapshot (for diffing)

```typescript
interface DOMSnapshot {
  id: string;
  timestamp: number;
  url: string;
  tree: SnapshotNode[];      // serialized DOM tree
  screenshot?: string;        // full page screenshot base64
}

interface SnapshotNode {
  tag: string;
  selector: string;
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;  // subset of relevant styles
  textContent?: string;
  children: SnapshotNode[];
}
```

---

## 5. Security Model

### 5.1 Threat Surface

VibeLens has a unique security profile: it reads/writes source files and modifies browser behavior.

| Threat | Mitigation |
|--------|-----------|
| Bridge exposed to network | Bind to `127.0.0.1` only. Reject non-localhost connections. |
| Malicious page triggers write-back | Extension only processes messages from known bridge WS. Content script validates origin. |
| Bridge writes arbitrary files | Code writer restricted to project directory. Path traversal checks. No writes outside project root. |
| Extension data exfiltration | No external network requests. All data stays local. No analytics without opt-in. |
| Supply chain (npm dependencies) | Minimal dependencies. Lock file integrity checks. Bundle audit in CI. |

### 5.2 Trust Boundaries

```
┌─────────────────────────────────────────┐
│ TRUSTED: Extension Service Worker       │
│ - Manages WS connection                │
│ - Validates all bridge messages         │
│ - Controls what content script can do   │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│ SEMI-TRUSTED: Content Script            │
│ - Observes DOM (read-only by default)   │
│ - Renders overlay (annotation pins)     │
│ - Cannot write to filesystem            │
│ - Cannot initiate WS connection         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│ UNTRUSTED: Preview Page                 │
│ - User's dev server output              │
│ - May contain arbitrary code            │
│ - Sandboxed in iframe                   │
└─────────────────────────────────────────┘
```

---

## 6. Performance Budgets

| Metric | Budget | Rationale |
|--------|--------|-----------|
| Extension JS bundle | < 500KB (gzipped) | Fast install, low memory footprint |
| Extension memory | < 50MB | Shouldn't bloat browser |
| Content script injection | < 100ms | Must not visibly slow page load |
| DOM diff computation | < 300ms for 5000 nodes | Must feel instant after file save |
| Source map resolution | < 200ms | User expects instant feedback on click |
| Write-back to file | < 500ms | Must feel responsive |
| Bridge startup time | < 2 seconds | Fast enough to not break flow |
| Bridge memory (idle) | < 50MB | Background process should be light |
| Bridge memory (active) | < 100MB | Even during file watching + screenshots |
| WebSocket latency | < 50ms | Local-only, should be near-instant |

---

## 7. Technology Choices

| Component | Technology | Why |
|-----------|-----------|-----|
| Extension UI | Preact + TypeScript | Tiny bundle, React-compatible API |
| Extension Build | Vite + CRXJS | Fast builds, HMR during dev, MV3 support |
| Extension State | Zustand | Lightweight, no boilerplate |
| Bridge Runtime | Node.js 18+ | Broad compatibility, good fs/child_process support |
| Bridge WS | `ws` library | Mature, minimal, no bloat |
| Bridge HTTP | `fastify` | Fast, typed, low overhead |
| File Watching | `chokidar` | Cross-platform, reliable, handles edge cases |
| CSS Parsing | `postcss` | Industry standard, plugin ecosystem |
| JS/TS AST | `@babel/parser` + `@babel/traverse` | Handles JSX, TypeScript, modern syntax |
| HTML Parsing | `htmlparser2` | Fast, forgiving, streaming |
| Tailwind Lookup | Custom reverse index | No existing library does this well |
| Screenshot | `puppeteer-core` (optional) | Reuse user's Chrome, no extra download |
| CLI Framework | `citty` or `commander` | Lightweight CLI argument parsing |
| Monorepo | `pnpm workspaces` | Fast, disk-efficient, good for monorepos |

---

## 8. Deployment Architecture

```
Distribution:

  Browser Extension:
    ├── Chrome Web Store (primary)
    ├── Firefox Add-ons (Phase 4)
    └── Manual .crx sideload (dev/testing)

  Bridge — Dual Distribution (same core, two wrappers):

    CLI (terminal-first users — Claude Code, Vim, any editor):
    ├── npm registry: `npm install -g vibelens`
    ├── npx: `npx vibelens` (zero-install)
    └── Homebrew (future): `brew install vibelens`

    VS Code Extension (IDE-first users — VS Code, Cursor):
    ├── VS Code Marketplace: "VibeLens"
    ├── Open VSX Registry (for Cursor, Codium)
    └── Provides:
        - Auto-start bridge on workspace open
        - Status bar: "VibeLens ● Connected"
        - Command palette: "VibeLens: Start / Stop / Export Annotations"
        - Settings UI for port, framework, ignore patterns

  Framework Plugins (optional):
    ├── npm: `vite-plugin-vibelens`
    └── npm: `webpack-plugin-vibelens`
```

No cloud infrastructure required. Everything runs locally.

### 8.1 Bridge Core Sharing

Both CLI and VS Code extension import the same `packages/bridge` core:

```
packages/bridge/          ← Core: file watcher, source mapper, code writer, WS server
  │
  ├── packages/cli/       ← Thin wrapper: CLI args → bridge.start(config)
  │
  └── packages/vscode/    ← Thin wrapper: VS Code lifecycle → bridge.start(config)
                            - activationEvents: onStartupFinished
                            - deactivate: bridge.stop()
                            - workspace.onDidChangeConfiguration → bridge.restart()
```

Feature parity between CLI and VS Code extension is guaranteed because both
are thin wrappers around the same core. The wrappers handle only:
- **CLI:** argument parsing, terminal output, signal handling
- **VS Code:** activation lifecycle, status bar, command palette, settings UI

---

## 9. Extensibility Points

| Extension Point | Mechanism | Purpose |
|----------------|-----------|---------|
| Framework Adapters | Plugin interface in bridge | Add support for new frameworks |
| CSS Write Strategies | Plugin interface in code writer | Support new CSS-in-JS libraries |
| Export Formats | Plugin interface in extension | Add new annotation export formats |
| AI Tool Integrations | Webhook / CLI pipe | Connect to any AI coding tool |
| Build Plugins | Vite/Webpack plugin | Inject source location metadata |
