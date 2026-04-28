/**
 * H13: Annotation mode — hover highlighting and click-to-inspect.
 *
 * Manages the annotation overlay mode where hovering highlights elements
 * and clicking opens the tooltip editor for style inspection/editing.
 */

import { sendToSidePanel } from './messaging.js'
import { saveInlineStyles, restoreInlineStyles } from './style-utils.js'
import { showTooltipEditor, hideTooltipEditor, getTooltipTarget } from './tooltip-editor.js'
import { T } from './design-tokens.js'

/* ─── State ─── */

let annotationMode = false
let highlightedElement: HTMLElement | null = null

/* ─── Public API ─── */

export function isAnnotationMode(): boolean {
  return annotationMode
}

export function getHighlightedElement(): HTMLElement | null {
  return highlightedElement
}

export function toggleAnnotationMode(): void {
  annotationMode = !annotationMode
  document.body.style.cursor = annotationMode ? 'crosshair' : ''

  if (annotationMode) {
    document.addEventListener('mouseover', handleHover)
    document.addEventListener('mouseout', handleMouseOut)
    document.addEventListener('click', handleAnnotationClick, true)
  } else {
    document.removeEventListener('mouseover', handleHover)
    document.removeEventListener('mouseout', handleMouseOut)
    document.removeEventListener('click', handleAnnotationClick, true)
    removeHighlight()
    hideTooltipEditor()
  }

  sendToSidePanel({
    source: 'vibelens-content',
    type: 'annotation:mode-changed',
    payload: { active: annotationMode },
  })
}

export function removeHighlight(): void {
  if (highlightedElement) {
    restoreInlineStyles(highlightedElement)
    highlightedElement = null
  }
}

/* ─── Internal ─── */

function handleHover(e: MouseEvent): void {
  if (!annotationMode) return
  const target = e.target as HTMLElement
  if (target.closest('#vibelens-pin-container')) return
  if (target.closest('#vibelens-toolbar')) return
  if (target.closest('#vibelens-inspector')) return
  if (target === highlightedElement) return

  removeHighlight()
  highlightedElement = target
  saveInlineStyles(target, ['outline', 'outline-offset'])
  target.style.outline = `2px solid ${T.violet}`
  target.style.outlineOffset = '2px'
}

function handleMouseOut(e: MouseEvent): void {
  if (!annotationMode) return
  const target = e.target as HTMLElement
  if (target === highlightedElement) {
    removeHighlight()
  }
}

function handleAnnotationClick(e: MouseEvent): void {
  if (!annotationMode) return
  const target = e.target as HTMLElement
  if (target.closest('#vibelens-pin-container')) return
  if (target.closest('#vibelens-tooltip-editor')) return
  if (target.closest('#vibelens-toolbar')) return
  if (target.closest('#vibelens-inspector')) return

  // Let native contentEditable handle clicks on the element being text-edited
  const tooltipTarget = getTooltipTarget()
  if (
    tooltipTarget?.isContentEditable
    && (target === tooltipTarget || tooltipTarget.contains(target))
  ) {
    return
  }

  e.preventDefault()
  e.stopPropagation()

  showTooltipEditor(target)
}
