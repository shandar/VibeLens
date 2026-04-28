<p align="center">
  <img src="packages/extension/public/icon-128.png" width="64" height="64" alt="VibeLens icon">
</p>

<h1 align="center">VibeLens</h1>

<p align="center">
  <strong>Visual CSS inspector for vibe coding</strong><br>
  Click any element. Tweak its styles. Write back to source.<br>
  Chrome extension — no CLI, no terminal, no setup.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/vibelens/ioohnmnbefdobfonfhlbglgonkdifhll"><strong>Install from Chrome Web Store</strong></a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="https://affordance.design">Affordance Design Studio</a>
</p>

---

## The Problem

AI tools generate frontend code, but you still squint at the browser and type vague feedback like *"the spacing looks off."* The AI guesses what you mean. You repeat 3-4 times. A 30-second fix takes 10 minutes.

**VibeLens gives you precision instead of guesswork.**

## Quick Start

```
1. Install VibeLens from the [Chrome Web Store](https://chromewebstore.google.com/detail/vibelens/ioohnmnbefdobfonfhlbglgonkdifhll)
2. Open any localhost page (your dev server)
3. Click the VibeLens icon
4. Click any element — start editing
```

No CLI. No terminal. No Node.js. No accounts. Just a Chrome extension.

**Want auto write-back to source files?** Click "Connect Project Folder" in the panel footer — one-time setup, changes write directly to your CSS/JSX/Vue files.

## Features

### Inspect & Edit

- **Click any element** to see its full CSS breakdown — box model, typography, background, borders, effects
- **Edit values inline** — color pickers, number inputs, dropdowns. Changes apply instantly to the DOM
- **Double-click text** to edit content directly on the page

### State Forcing

- Force **:hover**, **:active**, **:focus** states on any element
- Inspect and edit interactive styles without trying to hover and inspect simultaneously

### Accessibility

- **WCAG contrast ratio** shown inline for every text element
- **AA/AAA compliance badges** — green for pass, red for fail
- **Auto-fix suggestions** — click to apply the nearest accessible color

### CSS Variables

- See what `var(--primary-color)` resolves to
- **Edit the token value** and preview the cascade across all elements using it
- Color swatches for variable values

### Layout Overlays

- Click the **layout badge** (e.g., "flex row", "grid 3×2") to visualize grid lines, flex direction, and gap
- Flex item outlines with direction arrows

### Visual Diff

- Toggle with **Cmd+Shift+D** to see what changed between page loads
- Green = added, yellow = modified, red = removed

### Annotations

- Pin notes on any element — anchored to DOM selectors, not pixel coordinates
- Survive reloads and resizes
- Export as AI-ready prompts

### Export & Persistence

- **Changes persist across page refreshes** via browser storage
- **Copy CSS** — clean CSS patch to clipboard
- **Copy as AI Prompt** — structured prompt for any AI coding tool
- **Connect Project Folder** — write changes directly to source files via File System Access API
- **Element screenshots** — capture any element as PNG

## How It Works

```
Chrome Extension                          Your Source Files
┌─────────────┐     File System API      ┌──────────────┐
│ Inspector    │ ──── (one-time setup) ──→│ .css / .scss │
│ State Force  │                          │ .jsx / .tsx  │
│ Contrast     │     chrome.storage      │ .vue / .svelte│
│ CSS Vars     │ ──── (auto-persist) ──→ │ .html        │
│ Layout       │                          └──────────────┘
│ Diff / Pins  │     Clipboard
│ Screenshots  │ ──── (copy CSS/prompt) ──→ AI tool / editor
└─────────────┘
```

Everything runs in the browser. No external processes, no servers, no WebSocket bridges.

**Optional:** A CLI bridge (`npx vibelens`) is available for advanced use cases — auto-detected if running.

## Works With

Any AI coding tool. Any frontend framework.

**AI Tools:** Claude Code, Cursor, GitHub Copilot, Windsurf, Bolt, v0

**Frameworks:** React, Vue, Svelte, Astro, Next.js, Nuxt, plain HTML — anything that runs on localhost.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click VibeLens icon | Open/close inspector |
| Click element | Inspect its CSS |
| Double-click element | Edit its text |
| Cmd+Shift+L | Toggle annotations |
| Cmd+Shift+D | Toggle visual diff |
| Esc | Deselect element |

## Privacy

VibeLens makes **zero network requests**. Everything runs on localhost.

- No telemetry, no analytics, no usage tracking
- No accounts, no sign-ups
- Extension only activates on `localhost` and `127.0.0.1`
- Your code never leaves your machine
- Open source — audit every line

## Tech Stack

| Component | Technology |
|-----------|------------|
| Extension UI | Preact + TypeScript |
| Build | Vite + CRXJS |
| State | Zustand |
| CSS Parsing | PostCSS |
| JSX Parsing | Babel |
| Monorepo | pnpm workspaces |

## License

MIT — See [LICENSE](LICENSE).

## Built With

Built with ❤ by [Affordance Design Studio](https://affordance.design) & [Shandar Junaid](https://shandarjunaid.com)
