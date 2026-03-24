# VibeLens — Project Instructions

## Project Overview

VibeLens is a browser extension + local CLI bridge for visual preview, annotation, and direct CSS manipulation of AI-generated frontend code. It is tool-agnostic — works with any AI coding tool and any framework.

## Architecture

- **Monorepo:** pnpm workspaces under `packages/`
- **Extension:** Chrome MV3, Preact + TypeScript, Vite + CRXJS
- **Bridge Core:** Node.js 18+, TypeScript, WebSocket (`ws`) + HTTP (`fastify`)
- **CLI:** Thin wrapper around bridge core — `npx vibelens`
- **VS Code Extension:** Thin wrapper around bridge core — auto-starts on workspace open
- **Shared:** Protocol types and constants shared between extension and bridge
- **Communication:** WebSocket on `ws://localhost:9119`, HTTP on `http://localhost:9119`
- **License:** MIT

## Key Documentation

- `docs/PRD.md` — Product requirements and feature matrix
- `docs/ARCHITECTURE.md` — System design, data models, security model
- `docs/USER_FLOWS.md` — Step-by-step user journeys
- `docs/TECHNICAL_SPEC.md` — Component specs, configs, algorithms
- `docs/ROADMAP.md` — Phased milestones with checklists
- `docs/DECISIONS.md` — Architecture Decision Records (ADRs)

## Conventions

### Code Style
- TypeScript strict mode everywhere
- Preact for extension UI (NOT React — bundle size matters)
- Zustand for extension state management
- `postcss` for CSS parsing, `@babel/parser` for JSX/TSX AST
- Naming: `camelCase` functions, `PascalCase` components, `SCREAMING_SNAKE` constants

### File Organization
```
packages/extension/src/
  background/     # Service worker (WS connection, lifecycle)
  content/        # Content script (DOM observation, overlay)
  sidepanel/      # Side panel React components
  overlay/        # Annotation pins, diff highlights, inspector
  core/           # Business logic (state, diff, selectors, export)
  shared/         # Types shared within extension

packages/bridge/src/
  server/         # WS + HTTP server
  watcher/        # File watching and change detection
  resolver/       # Source map resolution
  writer/         # AST-aware code modification
  snapshot/       # Screenshot capture
  git/            # Git operations
```

### WebSocket Protocol
- All messages use `{ type, id, timestamp, payload }` envelope
- Message types are namespaced: `file:changed`, `source:resolve`, `write:request`
- See `packages/shared/src/protocol.ts` for type definitions

### Testing
- Unit tests: Vitest
- Extension integration: Playwright with Chrome extension support
- Code writer tests: Snapshot tests (input file → expected output)
- Run all: `pnpm test`

### Commits
- Format: `type(scope): description`
- Scopes: `extension`, `bridge`, `shared`, `docs`, `ci`
- Examples: `feat(bridge): add react source map adapter`, `fix(extension): pin re-anchor on DOM mutation`

## Critical Rules

1. **Never write to files outside the project root** — the bridge code writer must enforce path containment
2. **Extension must not make external network requests** — everything stays local
3. **Bridge binds to 127.0.0.1 only** — never expose to network
4. **AST-aware writes only** — never use string replacement for code modification
5. **Dry-run before write** — always show diff preview before modifying source files
6. **Bundle budget: < 500KB** for extension JS (gzipped)
7. **No telemetry without explicit opt-in**

## Current Phase

**Phase 1: MVP** — See `docs/ROADMAP.md` for milestone checklists.

## Useful Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm dev              # Dev mode (watch + rebuild)
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm typecheck        # TypeScript check (no emit)
```
