/**
 * VibeLens Content Script — Thin Orchestrator
 *
 * H13: Decomposed from a 1483-line monolith into focused modules.
 * This file wires together message listeners, command dispatch,
 * SPA navigation cleanup, and the ready announcement.
 *
 * Module dependency graph (no circular imports):
 *   messaging.ts (leaf)
 *   style-utils.ts (leaf)
 *   selector.ts (leaf)
 *   ├── diff-overlay.ts
 *   ├── pin-rendering.ts
 *   ├── tooltip-editor.ts
 *   ├── annotation-mode.ts → tooltip-editor
 *   └── edit-mode.ts
 *   content-script.ts (this orchestrator) → all above
 */

import { sendToSidePanel } from './messaging.js'
import { toggleAnnotationMode, isAnnotationMode, removeHighlight, getHighlightedElement } from './annotation-mode.js'
import { toggleDiffOverlay, captureAndStoreSnapshot, showDiffFromPayload } from './diff-overlay.js'
import { renderPins, clearPins } from './pin-rendering.js'
import { showTooltipEditor, hideTooltipEditor } from './tooltip-editor.js'
import { toggleEditMode, isEditMode } from './edit-mode.js'
import { toggleToolbar, hideToolbar, refreshToolbarState } from './toolbar.js'
import { toggleInspector, hideInspector, refreshInspector } from './inspector-panel.js'
import { loadChanges, changesToCSS } from './change-store.js'
import { restoreConnection } from './fs-writer.js'

/* ─── Iframe Detection ─── */

const isInIframe = window !== window.top

/* ─── Message Listeners ─── */

// Chrome runtime messages (from service worker / keyboard commands)
chrome.runtime.onMessage.addListener((message) => {
  if (message.source === 'vibelens-bridge' && message.type === 'file:changed') {
    // Only auto-reload in standalone tab — iframe reload is handled by side panel
    if (!isInIframe) window.location.reload()
  }

  if (message.source === 'vibelens-command') {
    handleCommand(message.command, message.payload)
  }
})

// postMessage (from side panel when running as iframe preview)
// C6: validate event.origin to prevent spoofing from foreign scripts
window.addEventListener('message', (event) => {
  // Only accept messages from same origin (localhost) or the extension itself
  if (event.origin !== window.location.origin && !event.origin.startsWith('chrome-extension://')) {
    return
  }
  if (event.data?.source !== 'vibelens-sidepanel') return
  handleCommand(event.data.command, event.data.payload)
})

/* ─── Command Dispatch ─── */

function handleCommand(command: string, payload?: unknown): void {
  switch (command) {
    case 'toggle-annotations':
      toggleAnnotationMode()
      break
    case 'set-annotation-mode': {
      const p = payload as { active: boolean } | undefined
      if (p && p.active !== isAnnotationMode()) toggleAnnotationMode()
      break
    }
    case 'toggle-diff':
      toggleDiffOverlay()
      break
    case 'show-pins': {
      const p = payload as { annotations?: Array<{ id: string; selector: string }> }
      renderPins(p?.annotations ?? [])
      break
    }
    case 'clear-pins':
      clearPins()
      break
    case 'capture-snapshot': {
      const elementCount = captureAndStoreSnapshot()
      sendToSidePanel({
        source: 'vibelens-content',
        type: 'snapshot:captured',
        payload: { elementCount },
      })
      break
    }
    case 'show-diff': {
      const p = payload as { added?: string[]; modified?: string[]; removed?: string[] }
      if (p) showDiffFromPayload(p)
      break
    }
    case 'show-tooltip-editor': {
      const p = payload as { selector?: string }
      if (p?.selector) {
        const el = document.querySelector(p.selector) as HTMLElement | null
        if (el) showTooltipEditor(el)
      } else {
        const highlighted = getHighlightedElement()
        if (highlighted) showTooltipEditor(highlighted)
      }
      break
    }
    case 'hide-tooltip-editor':
      hideTooltipEditor()
      break
    case 'toggle-edit-mode':
      toggleEditMode()
      break
    case 'set-edit-mode': {
      const p = payload as { active: boolean } | undefined
      if (p && p.active !== isEditMode()) toggleEditMode()
      break
    }
    case 'toggle-toolbar':
      toggleToolbar()
      break
    case 'toggle-inspector':
      toggleInspector()
      break
  }

  // Sync toolbar/inspector button highlights after every command dispatch
  refreshToolbarState()
  refreshInspector()
}

/* ─── M12: SPA Navigation Cleanup ─── */

/**
 * When a SPA navigates (pushState/replaceState/popstate) or the page is hidden,
 * clean up stale VibeLens state so we don't leak references to old DOM nodes.
 */
function cleanupOnNavigation(): void {
  // Hide toolbar (also deactivates all modes internally)
  hideToolbar()

  // Hide inspector panel
  hideInspector()

  // Tear down annotation mode
  if (isAnnotationMode()) {
    toggleAnnotationMode()
  }

  // Tear down edit mode
  if (isEditMode()) {
    toggleEditMode()
  }

  // Remove any lingering highlight
  removeHighlight()

  // Hide tooltip editor
  hideTooltipEditor()
}

// SPA client-side navigation detection
window.addEventListener('popstate', cleanupOnNavigation)

// Intercept pushState/replaceState to detect programmatic navigation
const originalPushState = history.pushState.bind(history)
const originalReplaceState = history.replaceState.bind(history)

history.pushState = function (...args: Parameters<typeof originalPushState>) {
  cleanupOnNavigation()
  return originalPushState(...args)
}

history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
  cleanupOnNavigation()
  return originalReplaceState(...args)
}

// Page visibility change — clean up when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    cleanupOnNavigation()
  }
})

/* ─── Restore Saved CSS Changes ─── */

async function restoreSavedChanges(): Promise<void> {
  try {
    const changes = await loadChanges(window.location.href)
    if (!changes.length) return

    // Separate CSS changes from text changes
    const cssChanges = changes.filter(c => c.property !== 'textContent')
    const textChanges = changes.filter(c => c.property === 'textContent')

    // Restore CSS via injected <style>
    if (cssChanges.length) {
      document.getElementById('vibelens-persisted')?.remove()
      const css = changesToCSS(cssChanges)
      if (css) {
        const style = document.createElement('style')
        style.id = 'vibelens-persisted'
        style.textContent = css
        document.head.appendChild(style)
      }
    }

    // Restore text changes by finding elements and setting their textContent
    for (const tc of textChanges) {
      try {
        const el = document.querySelector(tc.selector)
        if (el && el.textContent !== tc.value) {
          el.textContent = tc.value
        }
      } catch {
        // Selector might not match — skip
      }
    }

    console.debug(`[VibeLens] Restored ${changes.length} saved change(s) (${cssChanges.length} CSS, ${textChanges.length} text)`)
  } catch {
    // Storage may not be available in all contexts
  }
}

restoreSavedChanges()

// Try to restore folder connection from a previous session
restoreConnection().catch(() => {})

/* ─── Ready Announcement ─── */

sendToSidePanel({
  source: 'vibelens-content',
  type: 'content:ready',
  payload: { url: window.location.href },
})
