# VibeLens — Technical Specification

**Version:** 0.1.0-draft
**Last Updated:** 2026-03-10
**Status:** Draft

---

## 1. Browser Extension — Detailed Spec

### 1.1 Manifest V3 Configuration

```jsonc
{
  "manifest_version": 3,
  "name": "VibeLens",
  "version": "0.1.0",
  "description": "Visual preview, annotation & direct manipulation for AI-assisted development",
  "permissions": [
    "sidePanel",
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://localhost:*/*", "http://127.0.0.1:*/*"],
      "js": ["content-script.js"],
      "css": ["content-styles.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

### 1.2 Service Worker (Background)

**Responsibilities:**
1. Maintain WebSocket connection to bridge server
2. Route messages between content scripts and bridge
3. Manage annotation persistence (chrome.storage.local)
4. Handle extension lifecycle (install, update, suspend/wake)

**WebSocket Connection Management:**

```typescript
// Reconnection strategy
const WS_CONFIG = {
  url: 'ws://localhost:9119',
  reconnectInterval: 2000,     // Start at 2s
  reconnectBackoff: 1.5,       // Multiply by 1.5 each attempt
  maxReconnectInterval: 30000, // Cap at 30s
  maxReconnectAttempts: 50,    // Give up after 50 attempts
  heartbeatInterval: 10000,    // Ping every 10s
  heartbeatTimeout: 5000,      // Consider dead after 5s no pong
};
```

**Storage Schema:**

```typescript
// chrome.storage.local schema
interface VibeLensStorage {
  // Connection settings
  bridgeUrl: string;                    // default: ws://localhost:9119
  previewUrl: string;                   // default: auto-detect

  // Annotations (per project)
  annotations: Record<string, {         // keyed by project ID
    items: Annotation[];
    lastUpdated: string;
  }>;

  // Preferences
  preferences: {
    annotationMode: 'click' | 'hover';
    diffOverlay: boolean;
    diffAutoDismiss: number;            // seconds, 0 = never
    viewportPreset: 'mobile' | 'tablet' | 'desktop' | 'custom';
    customViewport: { width: number; height: number };
    theme: 'light' | 'dark' | 'auto';
  };

  // Snapshot history
  snapshots: SnapshotMeta[];            // lightweight references
}
```

### 1.3 Content Script

**Responsibilities:**
1. Observe DOM mutations for diff detection
2. Render annotation overlay (pins, diff highlights)
3. Handle element selection for inspector
4. Capture element screenshots

**DOM Observation Strategy:**

```typescript
// MutationObserver config — watch for style and structure changes
const OBSERVER_CONFIG: MutationObserverInit = {
  childList: true,       // Added/removed nodes
  subtree: true,         // Entire DOM tree
  attributes: true,      // Attribute changes
  attributeFilter: [     // Only style-relevant attributes
    'class', 'style', 'id', 'data-*'
  ],
  characterData: true,   // Text content changes
};

// Debounce mutations to avoid processing every micro-change
// Batch mutations over 150ms window before computing diff
const MUTATION_DEBOUNCE_MS = 150;
```

**CSS Selector Generation:**

```typescript
// Strategy: Generate the shortest unique selector for an element
// Priority order:
// 1. ID:           #my-button
// 2. Unique class: .unique-card-header
// 3. Data attr:    [data-testid="submit"]
// 4. Nth-child:    main > section:nth-child(2) > div.card
// 5. Full path:    html > body > main > div > div > button (last resort)

// Validation: selector must match exactly 1 element
// Fallback: store parent selector + child index for re-anchoring
```

### 1.4 Side Panel UI

**Component Tree:**

```
SidePanel
├── Toolbar
│   ├── URLInput (preview URL with auto-detect)
│   ├── ViewportControls (mobile/tablet/desktop/custom)
│   ├── RefreshButton
│   └── SettingsButton
├── PreviewFrame
│   └── iframe (sandboxed, pointing to dev server)
├── BottomDrawer (collapsible)
│   ├── TabBar
│   │   ├── "Annotations" tab
│   │   ├── "Changes" tab (pending style changes)
│   │   └── "Timeline" tab (Phase 3)
│   ├── AnnotationList
│   │   ├── AnnotationCard (per annotation)
│   │   └── ExportButton
│   ├── ChangesList
│   │   ├── PendingChange (per change)
│   │   └── ApplyAllButton
│   └── Timeline (Phase 3)
│       └── SnapshotScrubber
└── StatusBar
    ├── ConnectionIndicator
    ├── FrameworkBadge
    ├── AnnotationCount
    └── LastUpdateTimestamp
```

---

## 2. Bridge Server — Detailed Spec

### 2.1 CLI Interface

```
Usage: vibelens [options]

Options:
  -d, --dir <path>       Project directory (default: cwd)
  -p, --port <number>    WebSocket server port (default: 9119)
  --dev-server <url>     Dev server URL (default: auto-detect)
  --framework <name>     Force framework (react|vue|svelte|html)
  --no-git               Disable git integration
  --verbose              Verbose logging
  -v, --version          Show version
  -h, --help             Show help

Examples:
  vibelens                              # Watch current directory
  vibelens --dir ./frontend --port 9200 # Custom dir and port
  vibelens --dev-server http://localhost:4321  # Force Astro server
```

### 2.2 Auto-Detection

**Dev Server Detection:**

```typescript
// Probe common ports in order:
const DEV_SERVER_PORTS = [
  5173,  // Vite
  5174,  // Vite (fallback)
  3000,  // Next.js, CRA, Remix
  3001,  // Next.js (fallback)
  4321,  // Astro
  8080,  // Vue CLI, generic
  8888,  // Parcel
  1234,  // Parcel (alt)
  4200,  // Angular
];

// Detection: HTTP GET to each port, check response headers
// Identify framework from: X-Powered-By, meta tags, script sources
```

**Framework Detection:**

```typescript
// Check project files in priority order:
const FRAMEWORK_SIGNALS = {
  react: ['next.config.*', 'vite.config.*(jsx|tsx)', 'react-scripts', 'package.json:react'],
  vue: ['vue.config.*', 'nuxt.config.*', 'package.json:vue'],
  svelte: ['svelte.config.*', 'package.json:svelte'],
  astro: ['astro.config.*', 'package.json:astro'],
  angular: ['angular.json', 'package.json:@angular/core'],
  html: ['index.html'],  // fallback
};
```

### 2.3 File Watcher

```typescript
// chokidar configuration
const WATCHER_CONFIG = {
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/coverage/**',
    '**/*.map',
  ],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,  // Wait 100ms for writes to settle
    pollInterval: 50,
  },
};

// Relevant file extensions
const WATCHED_EXTENSIONS = [
  '.tsx', '.jsx', '.ts', '.js',
  '.vue', '.svelte',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm',
  '.json',  // for tailwind config, etc.
];
```

### 2.4 Source Map Resolution

**Resolution Pipeline:**

```
Input: CSS selector + page URL
  │
  ├─ Step 1: Check for `data-vibelens-src` attribute (build plugin)
  │   └─ If found: return file:line directly
  │
  ├─ Step 2: Query framework DevTools protocol
  │   ├─ React: Chrome DevTools Protocol → fiber tree → source
  │   ├─ Vue: Vue DevTools → component → SFC file
  │   └─ Svelte: Svelte DevTools → component → file
  │
  ├─ Step 3: Source map lookup
  │   └─ Parse .map files from dev server
  │       → Map generated CSS/JS → original source
  │
  └─ Step 4: Fuzzy file search (fallback)
      └─ Search project files for:
          - CSS selector as class name
          - Element tag name + class combination
          - Text content (for identifying components)
      └─ Rank by specificity, return best match

Output: { file: string, line: number, column: number, confidence: number }
```

### 2.5 Code Writer — AST Strategies

#### CSS File Writer

```typescript
// Uses postcss to parse and modify CSS files
// Strategy: Find rule by selector, modify declaration

// Input:  selector=".card", property="padding", value="16px"
// Process:
//   1. Parse CSS file with postcss
//   2. Walk rules, find ".card" selector
//   3. Find or create "padding" declaration
//   4. Set value to "16px"
//   5. Stringify and write back

// Handles:
//   - Nested selectors (Sass, PostCSS nesting)
//   - Media queries (modify within correct query)
//   - CSS Modules (class name mangling → source map lookup)
```

#### JSX Inline Style Writer

```typescript
// Uses @babel/parser to parse JSX, modify style objects
// Strategy: Find JSX element, modify style prop

// Input:  file="Button.tsx", line=8, property="borderRadius", value="12px"
// Process:
//   1. Parse file with babel (preserveComments: true)
//   2. Traverse to JSX element at line 8
//   3. Find style={...} prop
//   4. If exists: modify/add property in object expression
//   5. If not exists: add style prop with property
//   6. Generate code (preserving formatting)

// Edge cases:
//   - Spread styles: style={{...baseStyles, borderRadius: '12px'}}
//   - Template literals in styles
//   - Conditional styles (ternary in style prop)
```

#### Tailwind Class Writer

```typescript
// Custom engine: maps CSS property+value → Tailwind utility class
// Strategy: Find className string, swap/add utility class

// Reverse lookup table (built from tailwind config):
const TAILWIND_REVERSE: Record<string, Record<string, string>> = {
  'padding': {
    '4px': 'p-1',
    '8px': 'p-2',
    '12px': 'p-3',
    '16px': 'p-4',
    // ... generated from theme
  },
  'border-radius': {
    '0': 'rounded-none',
    '2px': 'rounded-sm',
    '4px': 'rounded',
    '6px': 'rounded-md',
    '8px': 'rounded-lg',
    '12px': 'rounded-xl',
    '16px': 'rounded-2xl',
    '9999px': 'rounded-full',
  },
  // ... all utility mappings
};

// Process:
//   1. Parse JSX, find className at target location
//   2. Tokenize class string: "p-2 rounded-sm bg-blue-500"
//   3. Find token matching old value: "rounded-sm"
//   4. Replace with new token: "rounded-xl"
//   5. Write back: "p-4 rounded-xl bg-blue-500"

// Handles:
//   - clsx(), cn(), classnames() function calls
//   - Template literals: `p-${size} rounded`
//   - Conditional classes: isActive ? 'bg-blue' : 'bg-gray'
```

---

## 3. DOM Diff Engine

### 3.1 Snapshot Format

```typescript
// Minimal snapshot — only style-relevant properties
interface LightSnapshot {
  timestamp: number;
  nodes: Map<string, NodeFingerprint>;  // keyed by CSS selector
}

interface NodeFingerprint {
  tag: string;
  selector: string;
  classes: string[];
  textHash: string;          // hash of textContent (not full text)
  styleHash: string;         // hash of computed style subset
  boundingBox: { x: number; y: number; w: number; h: number };
  children: string[];        // child selectors
}
```

### 3.2 Diff Algorithm

```
Compare previous snapshot (S1) to current snapshot (S2):

1. New nodes:     selector in S2 but not in S1 → ADDED
2. Removed nodes: selector in S1 but not in S2 → REMOVED
3. Modified nodes: selector in both, but:
   - styleHash differs → STYLE_CHANGED
   - textHash differs  → CONTENT_CHANGED
   - boundingBox differs → POSITION_CHANGED
   - classes differ    → CLASS_CHANGED
4. Unchanged:     selector in both, all hashes match → SKIP

Output: DiffResult[] with type, selector, and detail
```

### 3.3 Computed Style Subset

Only hash these properties (not all 300+ computed styles):

```typescript
const TRACKED_STYLES = [
  'color', 'background-color', 'background-image',
  'font-size', 'font-weight', 'font-family', 'line-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-radius', 'border-width', 'border-color', 'border-style',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
  'grid-template-columns', 'grid-template-rows',
  'opacity', 'visibility',
  'box-shadow', 'text-shadow',
  'transform', 'transition',
  'overflow', 'position', 'z-index',
];
```

---

## 4. Build Plugin (Optional Enhancement)

For projects that want maximum resolution accuracy, a Vite/Webpack plugin injects source metadata:

### Vite Plugin

```typescript
// vite-plugin-vibelens
// Injects data-vibelens-src="file:line" attributes into JSX elements during dev

export function vibeLensPlugin(): Plugin {
  return {
    name: 'vite-plugin-vibelens',
    enforce: 'pre',
    apply: 'serve',  // dev only, never in production

    transform(code, id) {
      if (!id.match(/\.(tsx|jsx|vue|svelte)$/)) return;

      // Parse JSX, inject data-vibelens-src on each element
      // <div className="card">
      //   becomes:
      // <div className="card" data-vibelens-src="Dashboard.tsx:42">

      return { code: transformedCode, map: sourceMap };
    },
  };
}
```

---

## 5. Error Handling Strategy

| Component | Error Type | Handling |
|-----------|-----------|---------|
| Extension WS | Connection lost | Auto-reconnect with backoff. Show "Reconnecting..." status. |
| Extension WS | Bridge not found | Show setup instructions. Probe every 5s. |
| Content Script | Selector not found | Use fallback selector. Log warning. |
| Content Script | iframe CSP block | Inject CSP override via `webRequest`. Show manual fallback. |
| Bridge File Watch | Permission denied | Skip file, log error, notify extension. |
| Bridge Source Map | Resolution failed | Return confidence: 0, offer fuzzy search results. |
| Bridge Code Writer | Parse error | Abort write, return error with details. Never write corrupt code. |
| Bridge Code Writer | File conflict | Warn user, offer overwrite/retry/cancel. |
| Bridge Code Writer | Formatter error | Write without formatting, warn user to run formatter. |

---

## 6. Testing Strategy

| Layer | Tool | Focus |
|-------|------|-------|
| Extension Unit | Vitest | State management, selector generation, diff engine |
| Extension Integration | Playwright + Extension | Side panel rendering, annotation CRUD, export |
| Bridge Unit | Vitest | File watching, source mapping, code writing |
| Bridge Integration | Vitest + temp projects | End-to-end: file change → WS message → write-back |
| Code Writer | Snapshot tests | AST transformations: input file → expected output |
| Protocol | Vitest | Message serialization, validation |
| E2E | Playwright | Full flow: bridge + extension + preview |
