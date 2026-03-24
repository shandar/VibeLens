/**
 * H13: Annotation pin rendering and repositioning.
 *
 * Manages the visual pin markers that appear on annotated DOM elements.
 * Handles scroll/resize repositioning via requestAnimationFrame batching.
 */

import { sendToSidePanel } from './messaging.js'
import { T } from './design-tokens.js'

/* ─── State ─── */

let pinContainer: HTMLElement | null = null
let repositionRaf = 0

/* ─── Public API ─── */

export function renderPins(annotations: Array<{ id: string; selector: string }>): void {
  clearPins()
  if (annotations.length === 0) return

  const container = ensurePinContainer()

  annotations.forEach((ann, i) => {
    try {
      const el = document.querySelector(ann.selector)
      if (!el) return

      const rect = el.getBoundingClientRect()
      const pin = document.createElement('div')
      pin.dataset.annotationId = ann.id
      pin.dataset.selector = ann.selector
      pin.textContent = String(i + 1)
      Object.assign(pin.style, {
        position: 'absolute',
        top: `${rect.top + window.scrollY - 10}px`,
        left: `${rect.left + window.scrollX + rect.width - 10}px`,
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: T.violet,
        color: '#fff',
        fontSize: '10px',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, opacity 0.25s ease',
        opacity: '0',
      })

      // Fade pins in after a brief delay (smooth reload feel)
      requestAnimationFrame(() => {
        pin.style.opacity = '1'
      })

      pin.addEventListener('mouseenter', () => {
        pin.style.transform = 'scale(1.2)'
      })
      pin.addEventListener('mouseleave', () => {
        pin.style.transform = 'scale(1)'
      })
      pin.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        sendToSidePanel({
          source: 'vibelens-content',
          type: 'annotation:select',
          payload: { id: ann.id },
        })
      })

      container.appendChild(pin)
    } catch {
      // Selector may not match — skip
    }
  })
}

export function clearPins(): void {
  if (pinContainer) pinContainer.innerHTML = ''
}

/* ─── Internal ─── */

function ensurePinContainer(): HTMLElement {
  if (pinContainer && document.body.contains(pinContainer)) return pinContainer
  pinContainer = document.createElement('div')
  pinContainer.id = 'vibelens-pin-container'
  pinContainer.style.cssText =
    'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:999999;'
  document.body.appendChild(pinContainer)
  return pinContainer
}

function repositionPins(): void {
  if (!pinContainer) return
  const pins = pinContainer.querySelectorAll<HTMLElement>('[data-annotation-id]')
  pins.forEach((pin) => {
    const selector = pin.dataset.selector
    if (!selector) return
    try {
      const el = document.querySelector(selector)
      if (!el) return
      const rect = el.getBoundingClientRect()
      pin.style.top = `${rect.top + window.scrollY - 10}px`
      pin.style.left = `${rect.left + window.scrollX + rect.width - 10}px`
    } catch {
      // Invalid selector — skip
    }
  })
}

function scheduleRepositionPins(): void {
  if (repositionRaf) return
  repositionRaf = requestAnimationFrame(() => {
    repositionRaf = 0
    repositionPins()
  })
}

/* ─── Event listeners (self-contained) ─── */

window.addEventListener('scroll', scheduleRepositionPins, { passive: true })
window.addEventListener('resize', scheduleRepositionPins)
