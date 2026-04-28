/**
 * VibeLens floating toolbar — on-page activation hub for all modes.
 *
 * Shows a white pill-shaped bar at bottom-center with icon buttons for
 * Edit, Annotate, Diff, Snapshot, and Close. Each button dispatches the
 * corresponding mode toggle and highlights when active. A status dot
 * reflects the bridge connection state.
 *
 * The toolbar replaces the old "click icon → toggle edit mode" flow so
 * users can discover and switch between all VibeLens features from one
 * compact UI without opening the side panel.
 */

import { toggleEditMode, isEditMode } from './edit-mode.js'
import { toggleAnnotationMode, isAnnotationMode, removeHighlight } from './annotation-mode.js'
import { toggleDiffOverlay, isDiffVisible, captureAndStoreSnapshot } from './diff-overlay.js'
import { hideTooltipEditor } from './tooltip-editor.js'

/* ─── Constants ─── */

const TOOLBAR_ID = 'vibelens-toolbar'
const HINT_ID = 'vibelens-toolbar-hint'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

/** Mode hint messages shown transiently above the toolbar */
const HINTS: Record<string, string> = {
  edit: 'Click any text to edit \u00B7 Enter to save \u00B7 Esc to cancel',
  annotate: 'Hover to highlight \u00B7 Click to inspect & style',
  diff: 'Comparing DOM snapshots\u2026',
  snapshot: 'Baseline snapshot captured',
}

/* ─── State ─── */

let toolbar: HTMLElement | null = null
let hintTimer: ReturnType<typeof setTimeout> | null = null
let visible = false

/* ─── Public API ─── */

export function isToolbarVisible(): boolean {
  return visible
}

export function toggleToolbar(): void {
  if (visible) hideToolbar()
  else showToolbar()
}

export function showToolbar(): void {
  if (toolbar && document.body.contains(toolbar)) {
    visible = true
    return
  }
  toolbar = createToolbar()
  document.body.appendChild(toolbar)

  // Trigger entry animation on next frame
  requestAnimationFrame(() => {
    if (!toolbar) return
    toolbar.style.opacity = '1'
    toolbar.style.transform = 'translateX(-50%) translateY(0)'
  })

  visible = true
  queryBridgeStatus()
}

export function hideToolbar(): void {
  // Deactivate all modes
  if (isEditMode()) toggleEditMode()
  if (isAnnotationMode()) toggleAnnotationMode()
  if (isDiffVisible()) toggleDiffOverlay()
  removeHighlight()
  hideTooltipEditor()
  dismissHint()

  if (toolbar) {
    toolbar.style.opacity = '0'
    toolbar.style.transform = 'translateX(-50%) translateY(16px)'
    const el = toolbar
    setTimeout(() => el.remove(), 200)
    toolbar = null
  }
  visible = false
}

/**
 * Re-render active/inactive state on all mode buttons.
 * Cheap to call — just reads booleans and toggles styles.
 */
export function refreshToolbarState(): void {
  if (!toolbar) return
  const btns = toolbar.querySelectorAll<HTMLElement>('[data-vl-mode]')
  btns.forEach((btn) => {
    const mode = btn.dataset.vlMode
    let active = false
    if (mode === 'edit') active = isEditMode()
    else if (mode === 'annotate') active = isAnnotationMode()
    else if (mode === 'diff') active = isDiffVisible()
    applyButtonState(btn, mode ?? '', active)
  })
}

/* ─── DOM Construction ─── */

function createToolbar(): HTMLElement {
  const bar = document.createElement('div')
  bar.id = TOOLBAR_ID

  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%) translateY(16px)',
    height: '48px',
    background: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: '24px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
    zIndex: '2147483646',
    fontFamily: FONT,
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    gap: '2px',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    pointerEvents: 'auto',
    userSelect: 'none',
  } as CSSStyleDeclaration)

  // VibeLens label
  const label = document.createElement('div')
  Object.assign(label.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 8px 0 10px',
    cursor: 'default',
  } as CSSStyleDeclaration)

  // Status dot
  const dot = document.createElement('div')
  dot.id = 'vibelens-status-dot'
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#d1d5db',
    flexShrink: '0',
    transition: 'background 0.3s ease',
  } as CSSStyleDeclaration)
  label.appendChild(dot)

  // Brand text
  const brand = document.createElement('span')
  brand.textContent = 'VibeLens'
  Object.assign(brand.style, {
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: '0.3px',
  } as CSSStyleDeclaration)
  label.appendChild(brand)
  bar.appendChild(label)

  // Separator
  bar.appendChild(createSeparator())

  // Mode buttons
  bar.appendChild(createModeButton('edit', 'Edit text', ICON_EDIT))
  bar.appendChild(createModeButton('annotate', 'Inspect & annotate', ICON_ANNOTATE))
  bar.appendChild(createModeButton('diff', 'Diff overlay', ICON_DIFF))
  bar.appendChild(createActionButton('snapshot', 'Capture snapshot', ICON_SNAPSHOT, handleSnapshot))

  // Separator
  bar.appendChild(createSeparator())

  // Close button
  bar.appendChild(createActionButton('close', 'Close VibeLens', ICON_CLOSE, () => hideToolbar()))

  return bar
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div')
  Object.assign(sep.style, {
    width: '1px',
    height: '24px',
    background: 'rgba(0, 0, 0, 0.06)',
    margin: '0 4px',
    flexShrink: '0',
  } as CSSStyleDeclaration)
  return sep
}

function createModeButton(mode: string, title: string, svgPath: string): HTMLElement {
  const btn = createButtonBase(title, svgPath)
  btn.dataset.vlMode = mode
  btn.addEventListener('click', () => handleModeClick(mode))
  return btn
}

function createActionButton(
  _name: string,
  title: string,
  svgPath: string,
  handler: () => void,
): HTMLElement {
  const btn = createButtonBase(title, svgPath)
  btn.addEventListener('click', handler)
  return btn
}

function createButtonBase(title: string, svgContent: string): HTMLElement {
  const btn = document.createElement('button')
  btn.title = title
  btn.innerHTML = svgContent

  Object.assign(btn.style, {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    background: 'transparent',
    color: '#64748b',
    transition: 'all 0.15s ease',
    flexShrink: '0',
    padding: '0',
    outline: 'none',
  } as CSSStyleDeclaration)

  // Hover effects
  btn.addEventListener('mouseenter', () => {
    if (btn.dataset.vlActive === 'true') return
    btn.style.background = 'rgba(0, 0, 0, 0.04)'
    btn.style.color = '#1e293b'
  })
  btn.addEventListener('mouseleave', () => {
    if (btn.dataset.vlActive === 'true') return
    btn.style.background = 'transparent'
    btn.style.color = '#64748b'
  })

  return btn
}

/* ─── Button State ─── */

const ACTIVE_STYLES: Record<string, { bg: string; color: string }> = {
  edit: { bg: '#ecfeff', color: '#0891b2' },
  annotate: { bg: '#f5f3ff', color: '#7c3aed' },
  diff: { bg: '#eef2ff', color: '#4f46e5' },
}

function applyButtonState(btn: HTMLElement, mode: string, active: boolean): void {
  const styles = ACTIVE_STYLES[mode]
  btn.dataset.vlActive = String(active)
  if (active && styles) {
    btn.style.background = styles.bg
    btn.style.color = styles.color
  } else {
    btn.style.background = 'transparent'
    btn.style.color = '#64748b'
  }
}

/* ─── Handlers ─── */

function handleModeClick(mode: string): void {
  // Deactivate other modes first (mutual exclusion)
  if (mode !== 'edit' && isEditMode()) toggleEditMode()
  if (mode !== 'annotate' && isAnnotationMode()) {
    toggleAnnotationMode()
  }

  // Toggle the requested mode
  if (mode === 'edit') {
    toggleEditMode()
    if (isEditMode()) showHint('edit')
  } else if (mode === 'annotate') {
    toggleAnnotationMode()
    if (isAnnotationMode()) showHint('annotate')
  } else if (mode === 'diff') {
    toggleDiffOverlay()
    if (isDiffVisible()) showHint('diff')
  }

  refreshToolbarState()
}

function handleSnapshot(): void {
  const count = captureAndStoreSnapshot()
  showHint('snapshot')

  // Brief green flash on the snapshot button
  const btn = toolbar?.querySelector<HTMLElement>('[title="Capture snapshot"]')
  if (btn) {
    btn.style.background = '#dcfce7'
    btn.style.color = '#16a34a'
    setTimeout(() => {
      btn.style.background = 'transparent'
      btn.style.color = '#64748b'
    }, 600)
  }

  // Log for debugging
  console.debug(`[VibeLens] Snapshot captured: ${count} elements`)
}

/* ─── Hint Label ─── */

function showHint(mode: string): void {
  dismissHint()
  const text = HINTS[mode]
  if (!text) return

  const hint = document.createElement('div')
  hint.id = HINT_ID
  Object.assign(hint.style, {
    position: 'fixed',
    bottom: '76px',
    left: '50%',
    transform: 'translateX(-50%) translateY(4px)',
    padding: '6px 14px',
    borderRadius: '8px',
    background: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    color: '#475569',
    fontSize: '12px',
    fontFamily: FONT,
    fontWeight: '500',
    whiteSpace: 'nowrap',
    zIndex: '2147483646',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    pointerEvents: 'none',
  } as CSSStyleDeclaration)
  hint.textContent = text
  document.body.appendChild(hint)

  requestAnimationFrame(() => {
    hint.style.opacity = '1'
    hint.style.transform = 'translateX(-50%) translateY(0)'
  })

  hintTimer = setTimeout(() => {
    hint.style.opacity = '0'
    hint.style.transform = 'translateX(-50%) translateY(4px)'
    setTimeout(() => hint.remove(), 200)
    hintTimer = null
  }, 3000)
}

function dismissHint(): void {
  if (hintTimer) {
    clearTimeout(hintTimer)
    hintTimer = null
  }
  document.getElementById(HINT_ID)?.remove()
}

/* ─── Bridge Status ─── */

function queryBridgeStatus(): void {
  try {
    chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
      if (chrome.runtime.lastError) return
      updateStatusDot(response?.status ?? 'disconnected')
    })
  } catch {
    // Extension context may be invalid
  }

  // Also listen for status broadcasts
  chrome.runtime.onMessage.addListener(statusListener)
}

function statusListener(message: { source?: string; status?: string }): void {
  if (message.source === 'vibelens-status' && message.status) {
    updateStatusDot(message.status)
  }
}

function updateStatusDot(status: string): void {
  const dot = document.getElementById('vibelens-status-dot')
  if (!dot) return
  const colors: Record<string, string> = {
    connected: '#22c55e',
    connecting: '#f59e0b',
    disconnected: '#ef4444',
  }
  dot.style.background = colors[status] ?? '#d1d5db'
  dot.title = `Bridge: ${status}`
}

/* ─── SVG Icons (20x20, stroke-based) ─── */

const svgWrap = (inner: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const ICON_EDIT = svgWrap(
  '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
)

const ICON_ANNOTATE = svgWrap(
  '<circle cx="12" cy="12" r="1"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
)

const ICON_DIFF = svgWrap(
  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8m-4-4h8"/>',
)

const ICON_SNAPSHOT = svgWrap(
  '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
)

const ICON_CLOSE = svgWrap(
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
)
