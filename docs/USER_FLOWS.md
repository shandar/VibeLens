# VibeLens — User Flows

**Version:** 0.1.0-draft
**Last Updated:** 2026-03-10

---

## Flow Overview

| # | Flow | Phase | Core Value |
|---|------|-------|------------|
| UF1 | First-Time Setup | 1 | Zero-config onboarding |
| UF2 | Preview & Navigate | 1 | See AI output instantly |
| UF3 | Annotate & Export | 1 | Precise visual feedback |
| UF4 | Visual Diff | 1 | See what changed |
| UF5 | Direct Manipulation | 2 | Tweak styles visually |
| UF6 | Source Write-Back | 2 | Persist visual changes in code |
| UF7 | Timeline Comparison | 3 | Compare visual states |
| UF8 | AI Feedback Loop | 5 | Close the loop with AI tools |

---

## UF1: First-Time Setup

**Goal:** User goes from zero to seeing a live preview in under 2 minutes.

```
┌─────────────────────────────────────────────────────────┐
│ STEP 1: Install Extension                                │
│                                                          │
│ User installs VibeLens from Chrome Web Store             │
│ → Extension icon appears in toolbar                      │
│ → Welcome tooltip: "Start your bridge to get going"      │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ STEP 2: Start Bridge                                     │
│                                                          │
│ User opens terminal in their project:                    │
│ $ npx vibelens                                           │
│                                                          │
│ Bridge outputs:                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🔌 VibeLens Bridge v0.1.0                            │ │
│ │ 📁 Watching: /Users/dev/my-project (247 files)       │ │
│ │ 🔗 WebSocket: ws://localhost:9119                    │ │
│ │ 🌐 Detected dev server: http://localhost:5173 (Vite) │ │
│ │                                                      │ │
│ │ Open the VibeLens extension in Chrome to connect.    │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│ STEP 3: Connect Extension                                │
│                                                          │
│ User clicks VibeLens icon → Side panel opens             │
│ → Extension auto-discovers bridge on :9119               │
│ → Shows: "Connected to my-project"                       │
│ → Preview loads with detected dev server URL             │
│                                                          │
│ If no bridge found:                                      │
│ → Shows setup instructions with copy-paste command       │
└─────────────────────────────────────────────────────────┘
```

**Edge Cases:**
- Bridge already running → extension connects immediately
- Multiple bridges running → show picker (project name + port)
- Dev server on non-standard port → user enters URL manually
- No dev server running → show "Start your dev server" hint

---

## UF2: Preview & Navigate

**Goal:** User sees their dev server output in the VibeLens side panel with real-time updates.

```
┌─────────────────────────────────────────────────────────┐
│ SIDE PANEL LAYOUT                                        │
│                                                          │
│ ┌─ Toolbar ───────────────────────────────────────────┐ │
│ │ [URL: localhost:5173/dash... ▼] [📱 💻 🖥️] [↻] [⚙️]│ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Preview Frame ─────────────────────────────────────┐ │
│ │                                                      │ │
│ │  ┌──────────────────────────────────────────┐       │ │
│ │  │           User's App Preview             │       │ │
│ │  │                                          │       │ │
│ │  │  (iframe → localhost:5173)               │       │ │
│ │  │                                          │       │ │
│ │  └──────────────────────────────────────────┘       │ │
│ │                                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Status Bar ────────────────────────────────────────┐ │
│ │ ● Connected │ React │ 3 annotations │ Last: 2s ago  │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Live Update Flow:**

```
AI tool saves file
  → Bridge file watcher detects change
  → Bridge sends `file:changed` via WebSocket
  → Extension shows "Updating..." indicator (subtle pulse)
  → Dev server hot-reloads (HMR)
  → iframe content updates
  → Extension captures new DOM snapshot
  → Visual diff overlay highlights changes (if enabled)
  → Status bar updates "Last: just now"
```

**Viewport Controls:**
- Mobile (375x812) / Tablet (768x1024) / Desktop (1440x900)
- Custom width/height input
- Zoom slider (50% - 200%)
- Rotate (portrait ↔ landscape) for mobile/tablet

---

## UF3: Annotate & Export

**Goal:** User clicks elements, adds notes, and exports structured feedback.

### Adding an Annotation

```
1. User presses Cmd+Shift+A (or clicks 📌 button)
   → Annotation mode activates
   → Cursor changes to crosshair
   → Elements highlight on hover (blue outline)

2. User clicks a card component
   → Pin drops on the element (blue marker with number)
   → Annotation form appears:
     ┌─────────────────────────────────────┐
     │ 📌 Annotation #3                    │
     │                                     │
     │ Element: div.card.bg-white          │
     │ Source:  Dashboard.tsx:42           │
     │                                     │
     │ Type: [Comment ▼]                   │
     │                                     │
     │ ┌─────────────────────────────────┐ │
     │ │ The spacing between cards is    │ │
     │ │ too tight. Needs more breathing │ │
     │ │ room — maybe 16px gap instead   │ │
     │ │ of 8px.                         │ │
     │ └─────────────────────────────────┘ │
     │                                     │
     │         [Cancel]  [Save 📌]         │
     └─────────────────────────────────────┘

3. User saves → Pin persists on element
   → Annotation appears in side panel list
   → Pin re-anchors on DOM changes
```

### Exporting Annotations

```
User clicks "Export" button in annotation panel
  → Format picker:
    ┌────────────────────────────────┐
    │ Export Annotations              │
    │                                │
    │ Format:                        │
    │ ○ JSON (structured data)       │
    │ ○ Markdown (human-readable)    │
    │ ● AI Prompt (ready to paste)   │
    │                                │
    │ Include:                       │
    │ ☑ Element screenshots          │
    │ ☑ Computed styles              │
    │ ☑ Source locations              │
    │ ☐ Full page screenshot         │
    │                                │
    │     [Copy to Clipboard 📋]     │
    └────────────────────────────────┘
```

**AI Prompt Export Format:**

```markdown
## Visual Feedback — VibeLens Annotations

Page: http://localhost:5173/dashboard
Viewport: 1440x900

### Issue 1 (Comment) — div.card:nth-child(2)
**File:** src/components/Dashboard.tsx:42
**Message:** The spacing between cards is too tight. Needs more
breathing room — maybe 16px gap instead of 8px.
**Current styles:** padding: 8px; gap: 8px;
**Suggested:** padding: 16px; gap: 16px;

### Issue 2 (Bug) — header > h1
**File:** src/components/Header.tsx:15
**Message:** Title is cut off on mobile viewport.
**Current styles:** font-size: 32px; white-space: nowrap; overflow: hidden;
**Suggested:** Add text wrapping or reduce font size on small screens.

### Issue 3 (Style Change) — button.primary
**File:** src/components/Button.tsx:8
**Message:** Border radius should be rounded, not sharp.
**Current styles:** border-radius: 2px;
**Suggested:** border-radius: 8px;

---
*Generated by VibeLens. Paste this into your AI coding tool.*
```

---

## UF4: Visual Diff

**Goal:** After each code change, user sees highlighted elements showing what was added, modified, or removed.

```
AI tool modifies Dashboard.tsx
  → Dev server hot-reloads
  → VibeLens captures new DOM snapshot
  → Diff engine compares previous ↔ current snapshot

Visual Result:
  ┌───────────────────────────────────────┐
  │ Dashboard                              │
  │                                        │
  │ ┌──────────┐  ┌──────────┐            │
  │ │ Card 1   │  │ Card 2   │  ← yellow  │
  │ │          │  │ (modified)│    outline  │
  │ └──────────┘  └──────────┘            │
  │                                        │
  │ ┌──────────────────────────┐          │
  │ │ New Stats Section        │  ← green  │
  │ │ (added)                  │    outline │
  │ └──────────────────────────┘          │
  │                                        │
  │ ┌──────────┐                          │
  │ │ Old Widget│  ← red                   │
  │ │ (removed) │    strikethrough         │
  │ └──────────┘                          │
  └───────────────────────────────────────┘

Toggle: Cmd+Shift+D
Auto-dismiss: After 5 seconds (configurable)
Persistent mode: Click "Pin diff" to keep visible
```

**Diff Detection Rules:**
- **Added:** Element present in new snapshot, absent in previous
- **Modified:** Same selector, different computed styles or text content
- **Removed:** Element present in previous snapshot, absent in new
- **Moved:** Same element, different position (show arrow indicator)

---

## UF5: Direct Manipulation

**Goal:** User clicks an element and edits its CSS properties visually, with instant preview.

```
1. User clicks element in preview (without annotation mode)
   → Element gets selection outline (dashed blue)
   → Inspector panel opens:

   ┌─────────────────────────────────────┐
   │ 🔍 Style Inspector                  │
   │                                     │
   │ Element: button.primary             │
   │ Source:  Button.tsx:8               │
   │                                     │
   │ ─── Colors ──────────────────────── │
   │ Color:       [■ #ffffff] ← picker   │
   │ Background:  [■ #3b82f6] ← picker   │
   │                                     │
   │ ─── Spacing ─────────────────────── │
   │       ┌──── 8 ────┐                 │
   │       │            │                 │
   │   12  │  content   │  12             │
   │       │            │                 │
   │       └──── 8 ────┘                 │
   │  (click any number to edit)         │
   │                                     │
   │ ─── Typography ──────────────────── │
   │ Size:    [14px ─────●──── 48px]     │
   │ Weight:  [Regular ▼]                │
   │                                     │
   │ ─── Border ──────────────────────── │
   │ Radius:  [2px ──●───────── 24px]    │
   │                                     │
   │ ─── Effects ─────────────────────── │
   │ Opacity:  [0 ─────────────●── 1]    │
   │                                     │
   │ Changes: 2 pending                  │
   │ [Reset] [Preview Diff] [Apply ✓]    │
   └─────────────────────────────────────┘

2. User drags border-radius slider from 2px to 12px
   → Preview updates instantly (CSS applied to element)
   → Change counter: "1 pending"

3. User picks new background color
   → Preview updates instantly
   → Change counter: "2 pending"

4. User clicks "Preview Diff"
   → Shows source code diff:
     ┌─────────────────────────────────┐
     │ Button.tsx:8                     │
     │                                 │
     │ - className="rounded-sm bg-     │
     │ -   blue-500"                   │
     │ + className="rounded-xl bg-     │
     │ +   blue-600"                   │
     └─────────────────────────────────┘

5. User clicks "Apply ✓"
   → Bridge writes changes to source file
   → IDE shows file as modified
   → Status: "2 changes written to Button.tsx"
```

---

## UF6: Source Write-Back

**Goal:** Changes made in the inspector are written back to the correct source file.

```
Extension sends write:request to bridge
  │
  ├─ Bridge identifies write target:
  │   ├─ Is it a CSS file?         → css-writer
  │   ├─ Is it inline JSX style?   → jsx-style-writer
  │   ├─ Is it Tailwind classes?   → tailwind-writer
  │   ├─ Is it a Vue SFC style?    → vue-style-writer
  │   └─ Is it styled-components?  → css-in-js-writer
  │
  ├─ Writer parses file AST
  ├─ Locates the correct node (by line number + selector context)
  ├─ Applies modification
  ├─ Formats with project's formatter (prettier/eslint if detected)
  ├─ Checks for external modifications (file changed since last read?)
  │   ├─ No conflict → write file
  │   └─ Conflict detected → send warning to extension
  │
  └─ Sends write:result to extension
      ├─ Success → extension shows confirmation
      └─ Failure → extension shows error with details
```

**Conflict Resolution:**

```
Extension shows:
  ┌─────────────────────────────────────┐
  │ ⚠️  File Modified Externally        │
  │                                     │
  │ Button.tsx was changed by another   │
  │ process since VibeLens last read it.│
  │                                     │
  │ [Overwrite] [Re-read & Retry] [Cancel]│
  └─────────────────────────────────────┘
```

---

## UF7: Timeline Comparison

**Goal:** User scrubs through visual history to compare iterations.

```
┌─────────────────────────────────────────────────────────┐
│ 📸 Visual Timeline                                       │
│                                                          │
│  v1        v2        v3        v4        v5 (current)   │
│  ┌──┐      ┌──┐      ┌──┐      ┌──┐      ┌──┐         │
│  │  │      │  │      │  │      │  │      │▓▓│         │
│  └──┘      └──┘      └──┘      └──┘      └──┘         │
│  10:15     10:22     10:28     10:35     10:41          │
│                                                          │
│  ◄────────────────────────●──────────────────►           │
│                          v3                              │
│                                                          │
│  ┌─────────────────────┬─────────────────────┐          │
│  │     Version 3       │     Version 5       │          │
│  │   (selected)        │    (current)        │          │
│  │                     │                     │          │
│  │  ┌────────────┐    │  ┌────────────┐     │          │
│  │  │ Card with  │    │  │ Card with  │     │          │
│  │  │ old style  │    │  │ new style  │     │          │
│  │  └────────────┘    │  └────────────┘     │          │
│  │                     │                     │          │
│  └─────────────────────┴─────────────────────┘          │
│                                                          │
│  [Revert to v3]  [Compare v3 ↔ v5]  [Export]            │
└─────────────────────────────────────────────────────────┘
```

---

## UF8: AI Feedback Loop

**Goal:** Annotations flow seamlessly back to the AI coding tool.

```
┌─────────────────────────────────────────────────────────┐
│ DEVELOPER'S WORKFLOW                                     │
│                                                          │
│  1. Ask AI tool: "Build me a dashboard page"             │
│     └─ AI generates code → dev server updates            │
│                                                          │
│  2. VibeLens shows preview with changes highlighted      │
│     └─ Developer spots 3 issues                          │
│                                                          │
│  3. Developer annotates all 3 issues in VibeLens         │
│     └─ Pins on elements with specific notes              │
│                                                          │
│  4. Developer fixes 1 issue directly via inspector       │
│     └─ Border radius change → written to source          │
│                                                          │
│  5. Developer exports remaining 2 annotations            │
│     └─ "AI Prompt" format → copied to clipboard          │
│                                                          │
│  6. Developer pastes into AI tool                        │
│     └─ AI reads structured feedback with:                │
│        - Exact element selectors                         │
│        - Current computed styles                         │
│        - Source file + line numbers                      │
│        - Developer's notes                               │
│        - Element screenshots                             │
│                                                          │
│  7. AI makes targeted fixes → dev server updates         │
│     └─ VibeLens shows new diff                           │
│                                                          │
│  8. Developer verifies → marks annotations as resolved   │
│                                                          │
│  TOTAL TIME: ~2 minutes instead of ~10 minutes           │
│  PRECISION: Exact selectors instead of vague descriptions│
└─────────────────────────────────────────────────────────┘
```
