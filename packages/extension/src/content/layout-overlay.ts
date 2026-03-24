/**
 * Layout Overlay — Grid and Flexbox visual helpers.
 *
 * Draws colored overlay lines showing grid tracks, flex direction,
 * gap visualization, and alignment guides on the selected element.
 */

import { T } from './design-tokens.js'

/* ─── State ─── */

let overlayEl: HTMLElement | null = null

/* ─── Public API ─── */

export function showLayoutOverlay(el: HTMLElement): void {
  removeLayoutOverlay()

  const computed = getComputedStyle(el)
  const display = computed.display

  if (display.includes('grid')) {
    overlayEl = createGridOverlay(el, computed)
  } else if (display.includes('flex')) {
    overlayEl = createFlexOverlay(el, computed)
  }

  if (overlayEl) {
    document.body.appendChild(overlayEl)
  }
}

export function removeLayoutOverlay(): void {
  overlayEl?.remove()
  overlayEl = null
}

export function isLayoutVisible(): boolean {
  return overlayEl !== null
}

/**
 * Create a layout info badge for the inspector.
 * Shows "flex row" or "grid 3×2" etc.
 */
export function getLayoutInfo(el: HTMLElement): string | null {
  const computed = getComputedStyle(el)
  const display = computed.display

  if (display.includes('grid')) {
    const cols = computed.gridTemplateColumns.split(' ').length
    const rows = computed.gridTemplateRows.split(' ').filter(v => v !== 'none').length || 'auto'
    return `grid ${cols}\u00d7${rows}`
  }
  if (display.includes('flex')) {
    const dir = computed.flexDirection
    const wrap = computed.flexWrap !== 'nowrap' ? ' wrap' : ''
    return `flex ${dir}${wrap}`
  }
  return null
}

/* ─── Grid Overlay ─── */

function createGridOverlay(el: HTMLElement, computed: CSSStyleDeclaration): HTMLElement {
  const rect = el.getBoundingClientRect()
  const container = createOverlayContainer(rect)

  // Draw column lines
  const cols = computed.gridTemplateColumns.split(' ')
  let xOffset = 0
  for (let i = 0; i < cols.length; i++) {
    const width = parseFloat(cols[i]!) || 0
    if (i > 0) {
      const line = document.createElement('div')
      Object.assign(line.style, {
        position: 'absolute',
        left: `${xOffset}px`,
        top: '0',
        width: '1px',
        height: '100%',
        background: 'rgba(168,85,247,0.4)',
        pointerEvents: 'none',
      })
      container.appendChild(line)

      // Column label
      const label = document.createElement('div')
      label.textContent = `${Math.round(width)}px`
      Object.assign(label.style, {
        position: 'absolute',
        left: `${xOffset + 4}px`,
        top: '2px',
        fontSize: '9px',
        fontFamily: T.mono,
        color: 'rgba(168,85,247,0.8)',
        pointerEvents: 'none',
      })
      container.appendChild(label)
    }
    xOffset += width
  }

  // Draw row lines
  const rows = computed.gridTemplateRows.split(' ')
  let yOffset = 0
  for (let i = 0; i < rows.length; i++) {
    const height = parseFloat(rows[i]!) || 0
    if (i > 0) {
      const line = document.createElement('div')
      Object.assign(line.style, {
        position: 'absolute',
        top: `${yOffset}px`,
        left: '0',
        height: '1px',
        width: '100%',
        background: 'rgba(168,85,247,0.4)',
        pointerEvents: 'none',
      })
      container.appendChild(line)
    }
    yOffset += height
  }

  // Gap indicator
  const gap = computed.gap
  if (gap && gap !== 'normal' && gap !== '0px') {
    const gapLabel = document.createElement('div')
    gapLabel.textContent = `gap: ${gap}`
    Object.assign(gapLabel.style, {
      position: 'absolute',
      bottom: '-18px',
      left: '0',
      fontSize: '9px',
      fontFamily: T.mono,
      color: T.violet,
      background: 'rgba(0,0,0,0.7)',
      padding: '1px 6px',
      borderRadius: '3px',
      pointerEvents: 'none',
    })
    container.appendChild(gapLabel)
  }

  return container
}

/* ─── Flex Overlay ─── */

function createFlexOverlay(el: HTMLElement, computed: CSSStyleDeclaration): HTMLElement {
  const rect = el.getBoundingClientRect()
  const container = createOverlayContainer(rect)

  const direction = computed.flexDirection
  const isRow = direction === 'row' || direction === 'row-reverse'
  const isReverse = direction.includes('reverse')

  // Direction arrow
  const arrow = document.createElement('div')
  Object.assign(arrow.style, {
    position: 'absolute',
    [isRow ? 'top' : 'left']: '50%',
    [isRow ? 'left' : 'top']: isReverse ? 'auto' : '8px',
    [isRow ? 'right' : 'bottom']: isReverse ? '8px' : 'auto',
    transform: isRow ? 'translateY(-50%)' : 'translateX(-50%)',
    fontSize: '16px',
    color: 'rgba(96,165,250,0.7)',
    pointerEvents: 'none',
  })
  arrow.textContent = isRow
    ? (isReverse ? '\u2190' : '\u2192')
    : (isReverse ? '\u2191' : '\u2193')
  container.appendChild(arrow)

  // Outline children with flex item borders
  const children = el.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    const childRect = child.getBoundingClientRect()
    const itemOutline = document.createElement('div')
    Object.assign(itemOutline.style, {
      position: 'absolute',
      left: `${childRect.left - rect.left}px`,
      top: `${childRect.top - rect.top}px`,
      width: `${childRect.width}px`,
      height: `${childRect.height}px`,
      border: '1px dashed rgba(96,165,250,0.3)',
      borderRadius: '2px',
      pointerEvents: 'none',
    })
    container.appendChild(itemOutline)
  }

  // Info label
  const gap = computed.gap
  const justify = computed.justifyContent
  const align = computed.alignItems
  const infoText = [`flex-${direction}`, gap !== 'normal' ? `gap:${gap}` : '', `${justify}/${align}`].filter(Boolean).join(' ')
  const info = document.createElement('div')
  info.textContent = infoText
  Object.assign(info.style, {
    position: 'absolute',
    bottom: '-18px',
    left: '0',
    fontSize: '9px',
    fontFamily: T.mono,
    color: 'rgba(96,165,250,0.8)',
    background: 'rgba(0,0,0,0.7)',
    padding: '1px 6px',
    borderRadius: '3px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  })
  container.appendChild(info)

  return container
}

/* ─── Shared ─── */

function createOverlayContainer(rect: DOMRect): HTMLElement {
  const container = document.createElement('div')
  container.id = 'vibelens-layout-overlay'
  Object.assign(container.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: '1px solid rgba(168,85,247,0.3)',
    borderRadius: '2px',
    pointerEvents: 'none',
    zIndex: '2147483644',
    overflow: 'visible',
  })
  return container
}
