# VibeLens

**Visual Preview, Annotation & Direct Manipulation Layer for AI-Assisted Development**

VibeLens bridges the gap between AI-generated code and visual output. It's a browser extension + local bridge server that lets developers see changes live, annotate what needs fixing, and make cosmetic tweaks that write back to source — all without leaving the browser.

---

## The Problem

When using AI coding tools (Claude Code, Cursor, Copilot, Windsurf, etc.), there's a friction loop:

1. **Context switch** — AI generates code, but you must alt-tab to the browser to see what it looks like
2. **Feedback is verbal** — Describing visual problems in words ("make the padding bigger", "that color is off") is imprecise
3. **Small tweaks are expensive** — A 2px spacing fix requires going back to the AI tool or IDE
4. **No visual history** — Hard to see what changed between iterations

## The Solution

VibeLens gives you three superpowers in the browser:

| Capability | What it does |
|-----------|-------------|
| **See** | Live preview with visual diff highlighting — green for new, yellow for modified |
| **Annotate** | Click any element, drop a pin, type a note — anchored to DOM, not pixels |
| **Tweak** | Click an element, adjust CSS visually (colors, spacing, typography) — changes write back to source files |

## How It Works

```
Browser Extension  ←— WebSocket —→  Local Bridge Server  ←— File System —→  Your Project
     (preview,                        (file watcher,                         (React, Vue,
      annotate,                        source mapper,                         Svelte, HTML,
      tweak)                           code writer)                           Tailwind...)
```

The extension connects to a lightweight local bridge (`npx vibelens`) that watches your project files, maps DOM elements back to source locations, and writes visual changes back to the correct files.

## Quick Start (Coming Soon)

```bash
# Install the bridge
npm install -g vibelens

# Start watching your project
cd your-project
vibelens

# Install the browser extension from Chrome Web Store
# Open your dev server — VibeLens auto-detects it
```

## Project Status

**Phase: Planning & Documentation**

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased delivery plan.

## Documentation

| Document | Purpose |
|----------|---------|
| [PRD](docs/PRD.md) | Product requirements — what we're building and why |
| [Architecture](docs/ARCHITECTURE.md) | System design — how the pieces fit together |
| [User Flows](docs/USER_FLOWS.md) | Step-by-step user journeys |
| [Technical Spec](docs/TECHNICAL_SPEC.md) | Detailed component specifications |
| [Roadmap](docs/ROADMAP.md) | Phased implementation plan with milestones |
| [Decisions](docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [Changelog](CHANGELOG.md) | Release history |

## Repository Structure

```
VibeLens/
├── README.md                  # This file
├── CLAUDE.md                  # AI assistant project instructions
├── CHANGELOG.md               # Release history
├── docs/
│   ├── PRD.md                 # Product Requirements Document
│   ├── ARCHITECTURE.md        # Technical Architecture
│   ├── USER_FLOWS.md          # User Flows & Journeys
│   ├── TECHNICAL_SPEC.md      # Detailed Technical Specification
│   ├── ROADMAP.md             # Phased Roadmap
│   └── DECISIONS.md           # Architecture Decision Records
├── packages/                  # (future) Monorepo packages
│   ├── extension/             # Browser extension (Chrome MV3)
│   ├── bridge/                # Bridge core (file watcher, source mapper, code writer)
│   ├── cli/                   # CLI wrapper (npx vibelens)
│   ├── vscode/                # VS Code/Cursor extension wrapper
│   ├── shared/                # Shared types and protocols
│   └── adapters/              # Framework-specific adapters
└── assets/                    # Brand, icons, screenshots
```

## License

MIT — See [LICENSE](LICENSE). Monetization strategy via cloud services documented in [ADR-007](docs/DECISIONS.md#adr-007-licensing-strategy).
