# VibeLens — Product Requirements Document

**Version:** 0.1.0-draft
**Last Updated:** 2026-03-10
**Status:** Draft — Awaiting Review
**Author:** Shandar Junaid / Affordance Design Studios

---

## 1. Executive Summary

VibeLens is a browser extension + local CLI tool that provides visual preview, annotation, and direct manipulation capabilities for developers using AI coding tools. It sits between the AI's code output and the developer's visual expectations, enabling a tighter feedback loop.

**One-liner:** A visual co-pilot for vibe coding — see changes, annotate problems, tweak styles, all in the browser.

---

## 2. Problem Statement

### 2.1 Target Users

| Persona | Description | Pain Points |
|---------|-------------|-------------|
| **Vibe Coder** | Uses AI tools (Claude Code, Cursor, Copilot) as primary coding method. Non-expert to mid-level dev. | Can't articulate visual feedback precisely; roundtrips between AI and browser are slow |
| **AI-Assisted Developer** | Experienced developer using AI as an accelerator. | Small cosmetic tweaks don't warrant another AI prompt; wants direct control over visual details |
| **Design-Aware Developer** | Frontend developer who cares about visual quality. | AI output is "close but not quite"; needs pixel-level tweaking without switching contexts |
| **Team Reviewer** | Reviews PRs or AI-generated output for visual correctness. | No structured way to give visual feedback; comments like "fix the spacing" are vague |

### 2.2 Core Problems

1. **Feedback Precision Gap** — Describing visual issues in text is lossy. "Make the header bigger" could mean font-size, padding, margin, or height. Visual pointing eliminates ambiguity.

2. **Context Switch Tax** — Every round-trip (see problem → switch to IDE/AI → describe problem → wait for fix → switch to browser → verify) adds 30-90 seconds of friction per micro-fix.

3. **Cosmetic Change Overhead** — A 2px border-radius change shouldn't require a full AI prompt cycle. Direct manipulation is 10x faster for cosmetic work.

4. **No Visual History** — When an AI tool makes 5 iterations, there's no easy way to compare "what did version 3 look like?" vs the current state.

5. **Fragmented Tooling** — DevTools can inspect but not write back. VisBug can edit but not sync. No tool combines preview + annotate + edit + sync.

---

## 3. Product Vision

### 3.1 Vision Statement

> Every AI-generated UI change should be visually verifiable, annotatable, and tweakable in under 5 seconds — without leaving the browser.

### 3.2 Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Time to first annotation | < 3 seconds after page load | Extension telemetry (opt-in) |
| Visual tweak → source sync latency | < 500ms | Bridge server logs |
| Annotation export → AI tool feedback cycle | < 30 seconds | User testing |
| Daily active users (6 months post-launch) | 5,000 | Chrome Web Store analytics |
| User retention (30-day) | > 40% | Extension telemetry (opt-in) |

### 3.3 Non-Goals (v1)

- **Not a design tool** — We don't compete with Figma. No drawing, layout creation, or asset management.
- **Not a testing framework** — We don't run visual regression tests in CI. We're an interactive, human-in-the-loop tool.
- **Not an IDE** — We don't edit JavaScript/TypeScript logic. Only CSS/style/class modifications.
- **Not a deployment tool** — We don't build, bundle, or deploy.

---

## 4. Feature Requirements

### 4.1 Feature Priority Matrix

| # | Feature | Priority | Phase | User Value |
|---|---------|----------|-------|------------|
| F1 | Live Preview Panel | P0 | 1 | See AI output without context switching |
| F2 | Click-to-Annotate | P0 | 1 | Precise visual feedback |
| F3 | Annotation Export (JSON/Markdown) | P0 | 1 | Feed annotations back to AI tools |
| F4 | Visual Diff Overlay | P1 | 1 | See what changed between iterations |
| F5 | Direct CSS Manipulation | P1 | 2 | Tweak colors, spacing, typography visually |
| F6 | Source Sync (write-back) | P1 | 2 | Visual changes persist in source code |
| F7 | Snapshot Timeline | P2 | 3 | Compare visual states across iterations |
| F8 | Before/After Slider | P2 | 3 | Side-by-side visual comparison |
| F9 | Framework Adapters (React, Vue, Svelte) | P1 | 2-4 | Deep source mapping for popular frameworks |
| F10 | Tailwind Class Reverse-Lookup | P2 | 4 | Map computed CSS → Tailwind utilities |
| F11 | AI Tool Integration API | P2 | 5 | Programmatic feedback to Claude Code, Cursor |
| F12 | Git Integration (auto-branch) | P3 | 4 | Separate visual tweaks from AI-generated code |

### 4.2 Feature Details

#### F1: Live Preview Panel

**What:** A side panel (or dedicated tab) in the browser that loads an iframe pointing at the user's dev server.

**Requirements:**
- Auto-detect running dev servers on common ports (3000, 3001, 4321, 5173, 5174, 8080, 8888)
- Manual URL input as fallback
- Responsive viewport controls (mobile / tablet / desktop presets + custom)
- Reload button and auto-reload on file change (via bridge WebSocket)
- CSP handling: relax Content-Security-Policy for localhost iframe embedding

**Acceptance Criteria:**
- User starts dev server → opens extension → sees preview within 2 seconds
- Preview updates within 500ms of file save
- Works with Next.js, Vite, Create React App, and static HTML

#### F2: Click-to-Annotate

**What:** Click any element in the preview → a pin appears → type a note.

**Requirements:**
- Annotation pins anchored to DOM elements via CSS selector paths (not coordinates)
- Pins persist across page reloads (re-anchored by selector)
- Pin colors by category: comment (blue), bug (red), suggestion (yellow), style-change (green)
- Annotation includes: message text, element selector, computed styles snapshot, screenshot crop
- Maximum 50 annotations per page (UX constraint)
- Keyboard shortcut to toggle annotation mode (Cmd/Ctrl + Shift + A)

**Acceptance Criteria:**
- User clicks element → pin appears in < 200ms
- Pin stays anchored after window resize
- Pin re-anchors correctly after minor DOM changes

#### F3: Annotation Export

**What:** Export all annotations as structured data (JSON) or human-readable markdown.

**Requirements:**
- JSON format includes: selector, message, computed styles, suggested styles, source location, timestamp, screenshot
- Markdown format includes: numbered list with element description, message, and inline screenshot
- Copy-to-clipboard with one click
- "Send to AI" button pre-formats as a prompt for common AI tools

**Acceptance Criteria:**
- JSON export is parseable and includes all annotation data
- Markdown is readable without rendering (plain text friendly)
- Claude Code can act on exported annotations without reformatting

#### F4: Visual Diff Overlay

**What:** Highlight elements that changed between file saves.

**Requirements:**
- Green outline/highlight: newly added elements
- Yellow outline/highlight: modified elements (style or content changed)
- Red strikethrough or faded: removed elements
- Toggle overlay on/off (Cmd/Ctrl + Shift + D)
- Diff resets on next file save (shows only latest changes)

**Acceptance Criteria:**
- After saving a file that adds a new `<div>`, that div glows green in preview
- After changing a button's color in code, that button glows yellow
- Diff detection completes within 300ms of DOM update

#### F5: Direct CSS Manipulation

**What:** Click an element → floating inspector panel → edit CSS properties visually.

**Requirements:**
- Properties: color (picker), background-color (picker), padding (4-side sliders), margin (4-side sliders), border-radius (slider), font-size (slider), font-weight (dropdown), opacity (slider), gap (slider)
- Changes apply instantly in the preview (live feedback)
- Changes are staged until user clicks "Apply to Source"
- Undo/redo stack (Cmd/Ctrl + Z / Cmd/Ctrl + Shift + Z)
- Show diff of what will change in source before applying

**Acceptance Criteria:**
- User adjusts padding slider → preview updates in < 100ms
- "Apply to Source" writes correct CSS to the right file within 500ms
- Undo reverts both preview and queued source changes

#### F6: Source Sync (Write-Back)

**What:** Visual changes in the inspector get written back to the actual source file.

**Requirements:**
- AST-aware code modification (not string replacement)
- Supports: CSS files, CSS-in-JS (styled-components, emotion), inline JSX styles, Tailwind classes, Vue SFC `<style>` blocks, Svelte `<style>` blocks
- Preview diff before writing: show the user exactly what line(s) will change
- Never modify non-style code (no logic, no structure changes)
- Conflict detection: warn if file was modified externally since last read

**Acceptance Criteria:**
- Change `padding: 8px` to `padding: 16px` in inspector → correct CSS file updated
- Change Tailwind `p-2` to `p-4` via inspector → correct JSX file updated
- Concurrent file edit by AI tool → user warned before overwrite

---

## 5. Technical Constraints

| Constraint | Detail |
|-----------|--------|
| Browser Extension Platform | Chrome Manifest V3 (primary), Firefox WebExtension (secondary) |
| Bridge Runtime | Node.js 18+ (for broad compatibility) |
| Protocol | WebSocket for real-time, HTTP for file operations |
| Framework Support (v1) | React + plain HTML/CSS. Vue/Svelte in later phases |
| Performance Budget | Extension JS bundle < 500KB. Bridge memory < 100MB. |
| Security | Bridge listens on localhost only. No external network calls. No telemetry without opt-in. |

---

## 6. User Research Questions (Open)

These need answers before finalizing the spec:

1. **Annotation persistence** — Should annotations persist across browser sessions? Stored where — extension storage, local file, or cloud?
2. **Multi-page support** — How do annotations work across routes in an SPA?
3. **Collaboration** — Is real-time collaborative annotation needed, or is export/import sufficient?
4. **AI tool specificity** — Should we build specific integrations (Claude Code plugin, Cursor extension) or keep it generic (clipboard export)?
5. **Pricing model** — Free/open-source core + paid features? Fully open-source? Commercial license?

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Source map resolution fails for complex builds | High | High | Fallback to fuzzy matching; build plugin for explicit source tags |
| Writing CSS back to source corrupts file | Medium | Critical | AST-aware writer, dry-run preview, git safety net |
| Chrome MV3 limitations block iframe embedding | Medium | High | Use `webRequest` API to modify CSP; fallback to new tab mode |
| Low adoption — tool is too niche | Medium | High | Start with annotation-only (broader appeal) before adding editing |
| Framework churn — new frameworks emerge | Low | Medium | Adapter architecture isolates framework-specific code |

---

## 8. Resolved Decisions

- [x] **Chrome first** — v1 targets Chrome only. Firefox in Phase 4.
- [x] **Dual distribution** — Both `npx vibelens` CLI AND VS Code/Cursor extension. Same bridge core. (ADR-009)
- [x] **Generic export** — Clipboard-based export in Phase 1. AI-tool-specific integrations in Phase 5.
- [x] **MIT license** — Fully open-source. Monetize later via cloud services (team sync, CI integration). (ADR-007)
- [x] **Dual persona** — Support both vibe coders and experienced devs via progressive disclosure UI. (ADR-010)
- [x] **Visual diff in Phase 1** — Included in MVP, not deferred.

## 9. Open Questions (Remaining)

- [ ] Annotation persistence — extension storage vs. local `.vibelens/` file in project?
- [ ] Multi-page SPA support — annotations per-route or per-project?
- [ ] Collaboration — real-time sync vs. export/import? (deferred to cloud monetization phase)

---

## Appendix A: Competitive Landscape

| Tool | Preview | Annotate | Edit CSS | Source Sync | Visual Diff | AI Integration |
|------|---------|----------|----------|-------------|-------------|----------------|
| Chrome DevTools | Via tab | No | Yes | No | No | No |
| VisBug | In-page | No | Yes | No | No | No |
| Percy/Chromatic | Screenshot | No | No | No | Yes | No |
| Storybook | Components | No | No | No | No | No |
| Claude Preview | Side panel | No | No | No | No | Claude only |
| **VibeLens** | **Side panel** | **Yes** | **Yes** | **Yes** | **Yes** | **Any tool** |
