/**
 * H13: Inline text editing mode.
 *
 * Enables direct text editing of DOM elements via contentEditable.
 * Handles click-to-edit, Enter/Escape keybindings, and blur finalization
 * with the M10 cancellable timer pattern to prevent double-finalize.
 */

import { sendToSidePanel } from './messaging.js'
import { generateSelector } from './selector.js'
import { NON_TEXT_TAGS, saveInlineStyles, restoreInlineStyles } from './style-utils.js'
import { T } from './design-tokens.js'

/* ─── State ─── */

let editMode = false
let activeEditElement: HTMLElement | null = null
let originalTextContent: string | null = null
/** M10: cancellable timer so blur doesn't race with Enter/Escape finalization */
let editBlurTimer: ReturnType<typeof setTimeout> | null = null

/* ─── Public API ─── */

export function isEditMode(): boolean {
  return editMode
}

export function toggleEditMode(): void {
  editMode = !editMode

  if (editMode) {
    document.body.style.cursor = 'text'
    document.addEventListener('click', handleEditClick, true)
    showEditModeBanner()
  } else {
    document.body.style.cursor = ''
    document.removeEventListener('click', handleEditClick, true)
    finalizeEdit()
    removeEditModeBanner()
  }

  sendToSidePanel({
    source: 'vibelens-content',
    type: 'edit:mode-changed',
    payload: { active: editMode },
  })
}

/* ─── Internal ─── */

function handleEditClick(e: MouseEvent): void {
  if (!editMode) return
  const target = e.target as HTMLElement

  // Skip VibeLens UI elements
  if (target.closest('#vibelens-pin-container')) return
  if (target.closest('#vibelens-tooltip-editor')) return
  if (target.closest('#vibelens-edit-banner')) return
  if (target.closest('#vibelens-diff-container')) return
  if (target.closest('#vibelens-toolbar')) return
  if (target.closest('#vibelens-inspector')) return

  // H10: skip non-text elements using shared constant
  if (NON_TEXT_TAGS.has(target.tagName)) return

  e.preventDefault()
  e.stopPropagation()

  // If clicking a different element, finalize the previous one
  if (activeEditElement && activeEditElement !== target) {
    finalizeEdit()
  }

  // Make element editable
  if (activeEditElement !== target) {
    activeEditElement = target
    originalTextContent = target.textContent
    saveInlineStyles(target, ['outline', 'outline-offset', 'min-height'])
    target.contentEditable = 'true'
    target.style.outline = '2px solid ${T.cyan}'
    target.style.outlineOffset = '2px'
    target.style.minHeight = '1em'
    target.focus()

    // Place cursor at click position
    const selection = window.getSelection()
    if (selection) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (range) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }

    // Listen for blur to finalize
    target.addEventListener('blur', handleEditBlur, { once: true })

    // Escape key cancels edit
    target.addEventListener('keydown', handleEditKeydown)
  }
}

function handleEditKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    // Cancel: revert text
    if (activeEditElement && originalTextContent !== null) {
      activeEditElement.textContent = originalTextContent
    }
    finalizeEdit()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    // Enter (without Shift) finalizes the edit
    e.preventDefault()
    finalizeEdit()
  }
}

function handleEditBlur(): void {
  // M10: small delay so click handlers can process first — cancellable
  // to prevent double-finalize when Enter/Escape already triggered finalizeEdit
  editBlurTimer = setTimeout(() => finalizeEdit(), 100)
}

function finalizeEdit(): void {
  // M10: cancel any pending blur timer to prevent double-finalize
  if (editBlurTimer) {
    clearTimeout(editBlurTimer)
    editBlurTimer = null
  }
  if (!activeEditElement) return

  const el = activeEditElement
  const newText = el.textContent ?? ''
  const oldText = originalTextContent ?? ''

  // Remove editable state and restore original styles
  el.contentEditable = 'false'
  restoreInlineStyles(el)
  el.removeEventListener('keydown', handleEditKeydown)

  // Only send if text actually changed
  if (newText !== oldText) {
    sendToSidePanel({
      source: 'vibelens-content',
      type: 'text:changed',
      payload: {
        selector: generateSelector(el),
        oldText,
        newText,
        pageUrl: window.location.href,
      },
    })
  }

  activeEditElement = null
  originalTextContent = null
}

function showEditModeBanner(): void {
  if (document.getElementById('vibelens-edit-banner')) return

  const banner = document.createElement('div')
  banner.id = 'vibelens-edit-banner'
  Object.assign(banner.style, {
    position: 'fixed',
    top: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#164e63',
    color: '#a5f3fc',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '500',
    zIndex: '999999',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    border: '1px solid ${T.cyan}',
    pointerEvents: 'none',
  })
  banner.textContent = 'Edit Mode — click any text to edit. Esc to cancel, Enter to confirm.'
  document.body.appendChild(banner)
}

function removeEditModeBanner(): void {
  document.getElementById('vibelens-edit-banner')?.remove()
}
