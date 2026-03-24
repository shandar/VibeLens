# VibeLens — Tester Setup Guide

Thanks for testing VibeLens! This guide will get you up and running in about 5 minutes.

---

## Prerequisites

You need these installed on your machine:

| Tool | Minimum Version | Check with |
|------|----------------|------------|
| **Node.js** | 18+ | `node --version` |
| **pnpm** | 9+ | `pnpm --version` |
| **Google Chrome** | any recent version | — |

**Don't have pnpm?** Install it with:
```bash
npm install -g pnpm
```

---

## Step 1 — Unzip and build

1. Unzip `VibeLens-test.zip` wherever you like
2. Open your terminal and run:

```bash
cd VibeLens

# Install all dependencies
pnpm install

# Build the bridge and CLI
pnpm build
```

If the build succeeds with no errors, you're good. If you see errors, screenshot them and send to Shandar.

---

## Step 2 — Install the Chrome extension

1. Open Chrome
2. Go to `chrome://extensions` (type it in the address bar)
3. Turn on **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Navigate to the VibeLens folder you unzipped, then select:
   ```
   VibeLens/packages/extension/dist
   ```
6. You should see "VibeLens" appear in your extensions list with the magnifying glass icon

**Pin it:** Click the puzzle piece icon in Chrome's toolbar → find VibeLens → click the pin icon so it's always visible.

---

## Step 3 — Start the bridge in your project

Open a terminal, navigate to **any web project you're working on** (anything with HTML/CSS), and run:

```bash
# Replace <path-to-VibeLens> with where you unzipped it
node <path-to-VibeLens>/packages/cli/bin/vibelens.js
```

For example, if you unzipped VibeLens into your home folder:
```bash
# macOS/Linux
node ~/VibeLens/packages/cli/bin/vibelens.js

# Windows
node C:\Users\YourName\VibeLens\packages\cli\bin\vibelens.js
```

You should see output like:
```
VibeLens bridge started on ws://127.0.0.1:9119
Watching: /your/project/path
```

**Keep this terminal open** — the bridge needs to stay running.

---

## Step 4 — Start your dev server

In a **second terminal**, start your project's dev server as you normally would:

```bash
# Examples — use whatever applies to your project:
npm run dev          # Vite, Next.js, etc.
npx serve .          # Static HTML files
python -m http.server 3000   # Python simple server
```

Open the local URL in Chrome (e.g., `http://localhost:5173` or `http://localhost:3000`).

---

## Step 5 — Use VibeLens

1. **Click the VibeLens icon** in Chrome's toolbar
2. The side panel should open showing connection status
3. **Green dot** = connected to bridge. **Red dot** = bridge not running (check Step 3)

### Things to try:

| Feature | How |
|---------|-----|
| **Inspect an element** | Click any element on the page — the side panel shows its CSS properties |
| **Edit CSS** | Change a color, padding, or font-size in the panel → click Apply → the change writes back to your source file |
| **Annotate** | Press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows) to toggle annotation mode, then click elements to add notes |
| **Visual Diff** | Press `Cmd+Shift+D` (Mac) or `Ctrl+Shift+D` (Windows) to see what changed since last snapshot |

---

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Bridge not connected" in the panel | Make sure the bridge terminal (Step 3) is still running and shows no errors |
| Extension doesn't appear | Make sure you loaded the `dist` folder (not `src` or the root `extension` folder) |
| Changes don't write back to files | The bridge must be started in the same directory as your source files |
| `pnpm: command not found` | Run `npm install -g pnpm` first |
| `pnpm install` fails | Make sure you're using Node 18+. Run `node --version` to check |
| Side panel doesn't open | Right-click the VibeLens icon → "Open side panel". Some Chrome versions need this |

---

## What to report

When you find something off, please note:

1. **What you were doing** (e.g., "clicked a button, tried to change its color")
2. **What you expected** (e.g., "color should change in the source file")
3. **What actually happened** (e.g., "nothing happened" / "wrong file was changed" / "error in console")
4. **Screenshots** if it's a visual issue
5. **Console errors** — right-click the VibeLens side panel → Inspect → Console tab → screenshot any red errors

Send feedback to Shandar directly.

---

## Summary

```
Terminal 1                          Terminal 2                    Chrome
─────────                          ──────────                    ──────
node .../vibelens.js               npm run dev                   1. Load extension from dist/
  ↓                                  ↓                           2. Open localhost:xxxx
Bridge running on :9119  ←──ws──→  Your app on :5173             3. Click VibeLens icon
  ↓                                                              4. Click elements, edit CSS
Reads/writes your files
```

That's it! Two terminals + one Chrome extension = VibeLens running.
