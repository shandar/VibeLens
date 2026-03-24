/**
 * H13: Smart tooltip editor — floating toolbar for inline style editing.
 *
 * Renders a Figma-style floating toolbar near the selected DOM element
 * with color pickers, typography controls, spacing fields, and action buttons.
 * Also handles inline text editing (contentEditable) within the tooltip context.
 *
 * This is the largest content module (~430 lines). It was extracted as a unit
 * because showTooltipEditor() is a single cohesive builder function that
 * creates the entire toolbar DOM tree with closures over local state.
 */

import { sendToSidePanel } from './messaging.js'
import { generateSelector, describeElement, getRelevantStyles } from './selector.js'
import { NON_TEXT_TAGS, saveInlineStyles, restoreInlineStyles, rgbToHex, dashToCamel } from './style-utils.js'

/* ─── State ─── */

let tooltipEditor: HTMLElement | null = null
let tooltipTarget: HTMLElement | null = null
let tooltipOriginalText: string | null = null

/* ─── Public API ─── */

/** Read-only access to the current tooltip target (used by annotation-mode). */
export function getTooltipTarget(): HTMLElement | null {
  return tooltipTarget
}

/* ─── Field Definitions ─── */

interface TooltipField {
  label: string
  property: string
  type: 'text' | 'color' | 'select' | 'number'
  options?: string[]
  suffix?: string
}

const TOOLTIP_FIELDS: TooltipField[] = [
  { label: 'Color', property: 'color', type: 'color' },
  { label: 'BG', property: 'background-color', type: 'color' },
  { label: 'Size', property: 'font-size', type: 'number', suffix: 'px' },
  {
    label: 'Weight', property: 'font-weight', type: 'select',
    options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  },
  { label: 'Padding', property: 'padding', type: 'text' },
  { label: 'Margin', property: 'margin', type: 'text' },
  { label: 'Radius', property: 'border-radius', type: 'text' },
  { label: 'Opacity', property: 'opacity', type: 'text' },
]

/* ─── Show / Hide ─── */

export function showTooltipEditor(target: HTMLElement): void {
  hideTooltipEditor()
  tooltipTarget = target
  const computed = window.getComputedStyle(target)
  const pendingChanges: Record<string, { original: string; value: string }> = {}

  // ── Position constants ──
  const rect = target.getBoundingClientRect()
  const TOOLBAR_H = 40
  const CARET_H = 6
  const GAP = 4
  const VIEWPORT_PAD = 8
  const spaceBelow = window.innerHeight - rect.bottom
  const placeAbove = spaceBelow < TOOLBAR_H + CARET_H + GAP + VIEWPORT_PAD

  const topPos = placeAbove
    ? rect.top - TOOLBAR_H - CARET_H - GAP
    : rect.bottom + CARET_H + GAP

  // ── Toolbar container (initially invisible for measurement) ──
  tooltipEditor = document.createElement('div')
  tooltipEditor.id = 'vibelens-tooltip-editor'
  Object.assign(tooltipEditor.style, {
    position: 'fixed',
    top: `${Math.max(VIEWPORT_PAD, topPos)}px`,
    left: '0px',
    height: `${TOOLBAR_H}px`,
    background: '#1e1e2e',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    boxShadow: '0 4px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
    zIndex: '2147483647',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: '11px',
    color: '#cdd6f4',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    gap: '2px',
    opacity: '0',
    transform: placeAbove ? 'translateY(6px)' : 'translateY(-6px)',
    transition: 'opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
    pointerEvents: 'auto',
    whiteSpace: 'nowrap',
    visibility: 'hidden',
  })

  // ── Caret (positioned after layout measurement) ──
  const caret = document.createElement('div')
  caret.dataset.vlCaret = '1'
  Object.assign(caret.style, {
    position: 'absolute',
    [placeAbove ? 'bottom' : 'top']: `-${CARET_H}px`,
    left: '20px', // placeholder — repositioned after measurement
    width: '0',
    height: '0',
    borderLeft: `${CARET_H}px solid transparent`,
    borderRight: `${CARET_H}px solid transparent`,
    [placeAbove ? 'borderTop' : 'borderBottom']: `${CARET_H}px solid #1e1e2e`,
  })
  tooltipEditor.appendChild(caret)

  // ── Helper: vertical divider ──
  const sep = (): HTMLElement => {
    const d = document.createElement('div')
    Object.assign(d.style, {
      width: '1px', height: '20px',
      background: 'rgba(255,255,255,0.06)',
      margin: '0 4px', flexShrink: '0',
    })
    return d
  }

  // ── Helper: icon button (square, ghost) ──
  const iconBtn = (
    svgPath: string, title: string,
    opts?: { active?: boolean; size?: number },
  ): HTMLButtonElement => {
    const s = opts?.size ?? 16
    const btn = document.createElement('button')
    btn.title = title
    btn.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`
    Object.assign(btn.style, {
      width: '30px', height: '30px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', borderRadius: '6px', cursor: 'pointer',
      background: opts?.active ? 'rgba(99,102,241,0.2)' : 'transparent',
      color: opts?.active ? '#a5b4fc' : '#9399b2',
      transition: 'all 0.12s ease', flexShrink: '0',
    })
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.08)'
      btn.style.color = '#cdd6f4'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = opts?.active ? 'rgba(99,102,241,0.2)' : 'transparent'
      btn.style.color = opts?.active ? '#a5b4fc' : '#9399b2'
    })
    return btn
  }

  // ── Helper: compact input ──
  const makeInput = (field: TooltipField): HTMLElement => {
    const currentValue = computed.getPropertyValue(field.property)
    const wrap = document.createElement('div')
    Object.assign(wrap.style, {
      display: 'flex', alignItems: 'center', gap: '3px', flexShrink: '0',
    })

    const lbl = document.createElement('span')
    lbl.textContent = field.label
    Object.assign(lbl.style, {
      fontSize: '9px', fontWeight: '600', color: '#6c7086',
      textTransform: 'uppercase', letterSpacing: '0.4px',
    })

    let input: HTMLInputElement | HTMLSelectElement

    const inputBase = {
      height: '24px', fontSize: '11px', color: '#cdd6f4', outline: 'none',
      border: '1px solid transparent', borderRadius: '5px',
      background: 'rgba(255,255,255,0.05)', padding: '0 5px',
      transition: 'border-color 0.12s, background 0.12s',
    }

    if (field.type === 'color') {
      input = document.createElement('input')
      input.type = 'color'
      input.value = rgbToHex(currentValue)
      Object.assign(input.style, {
        width: '24px', height: '24px', padding: '2px', cursor: 'pointer',
        border: '2px solid rgba(255,255,255,0.08)', borderRadius: '6px',
        background: 'transparent', flexShrink: '0',
      })
    } else if (field.type === 'select') {
      input = document.createElement('select')
      for (const opt of field.options ?? []) {
        const o = document.createElement('option')
        o.value = opt; o.textContent = opt
        if (currentValue.includes(opt)) o.selected = true
        input.appendChild(o)
      }
      Object.assign(input.style, { ...inputBase, width: '52px', cursor: 'pointer' })
    } else if (field.type === 'number') {
      input = document.createElement('input')
      input.type = 'number'
      input.value = parseFloat(currentValue).toString()
      Object.assign(input.style, { ...inputBase, width: '44px' })
    } else {
      input = document.createElement('input')
      input.type = 'text'
      input.value = currentValue
      Object.assign(input.style, { ...inputBase, width: '56px' })
    }

    input.addEventListener('focus', () => {
      input.style.borderColor = '#6366f1'
      input.style.background = 'rgba(99,102,241,0.08)'
    })
    input.addEventListener('blur', () => {
      input.style.borderColor = 'transparent'
      input.style.background = 'rgba(255,255,255,0.05)'
    })
    input.addEventListener('input', () => {
      let v = input.value
      if (field.type === 'number' && field.suffix) v = `${input.value}${field.suffix}`
      target.style.setProperty(field.property, v)
      pendingChanges[field.property] = { original: currentValue, value: v }
    })

    wrap.appendChild(lbl)
    wrap.appendChild(input)
    return wrap
  }

  // ── Tag badge ──
  const tag = document.createElement('span')
  tag.textContent = target.tagName.toLowerCase()
  Object.assign(tag.style, {
    fontSize: '10px', fontWeight: '600', color: '#a6adc8',
    background: 'rgba(255,255,255,0.06)', padding: '2px 7px',
    borderRadius: '5px', fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
    flexShrink: '0', letterSpacing: '0.3px',
  })
  tooltipEditor.appendChild(tag)
  tooltipEditor.appendChild(sep())

  // ── Color fields ──
  for (const f of TOOLTIP_FIELDS.filter(f => f.type === 'color')) {
    tooltipEditor.appendChild(makeInput(f))
  }
  tooltipEditor.appendChild(sep())

  // ── Typography fields ──
  for (const f of TOOLTIP_FIELDS.filter(
    f => f.property === 'font-size' || f.property === 'font-weight',
  )) {
    tooltipEditor.appendChild(makeInput(f))
  }
  tooltipEditor.appendChild(sep())

  // ── Spacing fields ──
  for (const f of TOOLTIP_FIELDS.filter(
    f => ['padding', 'margin', 'border-radius', 'opacity'].includes(f.property),
  )) {
    tooltipEditor.appendChild(makeInput(f))
  }
  tooltipEditor.appendChild(sep())

  // ── Text edit (inline contentEditable) ──
  const EDIT_SVG = '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>'
  const DONE_SVG = '<polyline points="20 6 9 17 4 12"/>'
  // H10: uses file-level NON_TEXT_TAGS constant
  const canEditText = !NON_TEXT_TAGS.has(target.tagName)
  let isEditingText = false

  const editTextBtn = iconBtn(EDIT_SVG, 'Edit text')
  if (!canEditText) {
    editTextBtn.style.opacity = '0.25'
    editTextBtn.style.pointerEvents = 'none'
    editTextBtn.style.cursor = 'default'
  }

  const textKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // Revert text and finish
      if (tooltipOriginalText !== null) target.textContent = tooltipOriginalText
      finishTextEdit()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      finishTextEdit()
    }
  }

  function startTextEdit(): void {
    isEditingText = true
    tooltipOriginalText = target.textContent ?? ''
    saveInlineStyles(target, ['outline', 'outline-offset'])
    target.contentEditable = 'true'
    target.style.outline = '2px solid #22d3ee'
    target.style.outlineOffset = '2px'
    target.focus()
    target.addEventListener('keydown', textKeydown)

    // Update button to "done" state
    editTextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DONE_SVG}</svg>`
    editTextBtn.title = 'Done editing (Enter)'
    editTextBtn.style.background = 'rgba(34,211,238,0.15)'
    editTextBtn.style.color = '#22d3ee'
  }

  function finishTextEdit(): void {
    if (!isEditingText) return
    isEditingText = false

    const newText = target.textContent ?? ''
    const oldText = tooltipOriginalText ?? ''
    target.contentEditable = 'false'
    target.style.outline = '2px solid #a78bfa'
    target.style.outlineOffset = '2px'
    target.removeEventListener('keydown', textKeydown)

    // Reset button back to edit state
    editTextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${EDIT_SVG}</svg>`
    editTextBtn.title = 'Edit text'
    editTextBtn.style.background = 'transparent'
    editTextBtn.style.color = '#9399b2'

    // Send text change to bridge pipeline
    if (newText !== oldText) {
      sendToSidePanel({
        source: 'vibelens-content',
        type: 'text:changed',
        payload: {
          selector: generateSelector(target),
          oldText,
          newText,
          pageUrl: window.location.href,
        },
      })
    }
    tooltipOriginalText = null
  }

  editTextBtn.addEventListener('click', () => {
    if (isEditingText) finishTextEdit()
    else startTextEdit()
  })

  // ── Action icons ──
  // Apply
  const applyBtn = iconBtn(
    '<polyline points="20 6 9 17 4 12"/>',
    'Apply style changes',
    { active: true },
  )
  applyBtn.addEventListener('click', () => {
    if (isEditingText) finishTextEdit()
    const changes = Object.entries(pendingChanges).map(([prop, { original, value }]) => ({
      property: dashToCamel(prop), originalValue: original, newValue: value,
    }))
    if (changes.length > 0) {
      sendToSidePanel({
        source: 'vibelens-content',
        type: 'style:apply',
        payload: {
          selector: generateSelector(target),
          changes,
          computedStyles: getRelevantStyles(target),
          pageUrl: window.location.href,
        },
      })
    }
    hideTooltipEditor()
  })

  // Reset
  const resetBtn = iconBtn(
    '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    'Reset changes',
  )
  resetBtn.addEventListener('click', () => {
    if (isEditingText) {
      if (tooltipOriginalText !== null) target.textContent = tooltipOriginalText
      finishTextEdit()
    }
    for (const [prop, { original }] of Object.entries(pendingChanges)) {
      target.style.setProperty(prop, original)
    }
    hideTooltipEditor()
  })

  // Annotate (sends annotation:create to side panel)
  const annotateBtn = iconBtn(
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'Add annotation',
  )
  annotateBtn.addEventListener('click', () => {
    if (isEditingText) finishTextEdit()
    const r = target.getBoundingClientRect()
    sendToSidePanel({
      source: 'vibelens-content',
      type: 'annotation:create',
      payload: {
        selector: generateSelector(target),
        elementDescription: describeElement(target),
        computedStyles: getRelevantStyles(target),
        pageUrl: window.location.href,
        elementRect: { top: r.top, left: r.left, width: r.width, height: r.height },
      },
    })
    hideTooltipEditor()
  })

  // Close
  const closeBtn = iconBtn('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 'Close')
  closeBtn.addEventListener('click', () => {
    if (isEditingText) finishTextEdit()
    hideTooltipEditor()
  })

  tooltipEditor.appendChild(editTextBtn)
  tooltipEditor.appendChild(applyBtn)
  tooltipEditor.appendChild(annotateBtn)
  tooltipEditor.appendChild(resetBtn)
  tooltipEditor.appendChild(closeBtn)

  // Phase 1: append invisible to measure rendered width
  document.body.appendChild(tooltipEditor)

  // Phase 2: measure and clamp to viewport, then reveal
  requestAnimationFrame(() => {
    if (!tooltipEditor) return
    const tw = tooltipEditor.offsetWidth
    const vw = window.innerWidth

    // Clamp horizontal: prefer aligning left edge to element, but don't overflow
    const idealLeft = rect.left
    const maxLeft = vw - tw - VIEWPORT_PAD
    const clampedLeft = Math.max(VIEWPORT_PAD, Math.min(idealLeft, maxLeft))
    tooltipEditor.style.left = `${clampedLeft}px`

    // Clamp vertical: if placed above and goes off top, push down
    const clampedTop = Math.max(VIEWPORT_PAD, parseFloat(tooltipEditor.style.top))
    tooltipEditor.style.top = `${clampedTop}px`

    // Reposition caret to point at element center relative to toolbar left
    const elemCenterX = rect.left + rect.width / 2
    const caretLeft = Math.max(12, Math.min(elemCenterX - clampedLeft, tw - 12))
    caret.style.left = `${caretLeft}px`

    // Reveal
    tooltipEditor.style.visibility = 'visible'
    tooltipEditor.style.opacity = '1'
    tooltipEditor.style.transform = 'translateY(0)'
  })
}

export function hideTooltipEditor(): void {
  // Safely finalize any active text editing before tearing down
  if (tooltipTarget?.isContentEditable && tooltipOriginalText !== null) {
    const newText = tooltipTarget.textContent ?? ''
    tooltipTarget.contentEditable = 'false'
    restoreInlineStyles(tooltipTarget)
    if (newText !== tooltipOriginalText) {
      sendToSidePanel({
        source: 'vibelens-content',
        type: 'text:changed',
        payload: {
          selector: generateSelector(tooltipTarget),
          oldText: tooltipOriginalText,
          newText,
          pageUrl: window.location.href,
        },
      })
    }
    tooltipOriginalText = null
  }
  if (tooltipEditor) {
    tooltipEditor.remove()
    tooltipEditor = null
  }
  tooltipTarget = null
}

/* ─── Global listener: close tooltip on outside click ─── */

document.addEventListener('mousedown', (e) => {
  if (!tooltipEditor) return
  const target = e.target as HTMLElement
  if (target.closest('#vibelens-tooltip-editor')) return
  hideTooltipEditor()
})
