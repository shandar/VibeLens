/**
 * State Forcing — toggle pseudo-class states (:hover, :active, :focus, etc.)
 *
 * Forces an element into a pseudo-state so the inspector can read and edit
 * styles that only appear on interaction. Works by:
 *   1. Scanning all stylesheets for rules matching the element with the pseudo-class
 *   2. Duplicating those rules with a `.vibelens-force-{state}` class selector
 *   3. Adding that class to the element
 *
 * This avoids the chrome.debugger API (which shows a yellow warning bar).
 */

import { T } from './design-tokens.js'

/* ─── Types ─── */

export type PseudoState = ':hover' | ':active' | ':focus' | ':focus-within' | ':visited'

const ALL_STATES: PseudoState[] = [':hover', ':active', ':focus', ':focus-within', ':visited']

/* ─── State ─── */

const activeStates = new Map<HTMLElement, Set<PseudoState>>()
let injectedStyleEl: HTMLStyleElement | null = null

/* ─── Public API ─── */

/**
 * Toggle a pseudo-state on an element.
 * Returns the new set of active states for that element.
 */
export function toggleState(el: HTMLElement, state: PseudoState): Set<PseudoState> {
  let states = activeStates.get(el)
  if (!states) {
    states = new Set()
    activeStates.set(el, states)
  }

  if (states.has(state)) {
    states.delete(state)
    el.classList.remove(stateToClass(state))
  } else {
    states.add(state)
    el.classList.add(stateToClass(state))
  }

  // Rebuild injected styles for this element
  rebuildForcedStyles(el, states)

  // Clean up if no states left
  if (states.size === 0) {
    activeStates.delete(el)
  }

  return states
}

/**
 * Check if a state is active on an element.
 */
export function isStateActive(el: HTMLElement, state: PseudoState): boolean {
  return activeStates.get(el)?.has(state) ?? false
}

/**
 * Get all active states for an element.
 */
export function getActiveStates(el: HTMLElement): Set<PseudoState> {
  return activeStates.get(el) ?? new Set()
}

/**
 * Clear all forced states on an element.
 */
export function clearStates(el: HTMLElement): void {
  const states = activeStates.get(el)
  if (!states) return

  for (const state of states) {
    el.classList.remove(stateToClass(state))
  }
  activeStates.delete(el)
  cleanupInjectedStyles()
}

/**
 * Clear all forced states on all elements.
 */
export function clearAllStates(): void {
  for (const [el, states] of activeStates) {
    for (const state of states) {
      el.classList.remove(stateToClass(state))
    }
  }
  activeStates.clear()
  cleanupInjectedStyles()
}

/**
 * Create the state toggle UI for the inspector panel.
 * Shows human-friendly labels: "Hover", "Pressed", "Focused"
 * with a clear description of what they do.
 */
export function createStateToggles(
  el: HTMLElement,
  onToggle: () => void,
): HTMLElement {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    borderBottom: `1px solid ${T.border}`,
  })

  // Label row
  const labelRow = document.createElement('div')
  Object.assign(labelRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px 2px',
    fontSize: '9px',
    fontFamily: T.mono,
    fontWeight: '600',
    color: T.textDim,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  })
  labelRow.textContent = 'ELEMENT STATE'
  wrapper.appendChild(labelRow)

  // Buttons row
  const bar = document.createElement('div')
  Object.assign(bar.style, {
    display: 'flex',
    gap: '4px',
    padding: '4px 12px 7px',
    flexWrap: 'wrap',
  })

  const stateConfig: { state: PseudoState; label: string }[] = [
    { state: ':hover', label: 'Hover' },
    { state: ':active', label: 'Pressed' },
    { state: ':focus', label: 'Focused' },
    { state: ':focus-within', label: 'Focus Within' },
  ]

  for (const { state, label } of stateConfig) {
    const btn = document.createElement('button')
    btn.textContent = label
    const active = isStateActive(el, state)

    Object.assign(btn.style, {
      padding: '4px 10px',
      borderRadius: '6px',
      fontSize: '10px',
      fontFamily: T.font,
      fontWeight: '500',
      border: active ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
      background: active ? T.accentBg : 'transparent',
      color: active ? T.accentText : T.textMuted,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      outline: 'none',
    })

    btn.addEventListener('mouseenter', () => {
      if (!isStateActive(el, state)) {
        btn.style.borderColor = 'rgba(255,255,255,0.15)'
        btn.style.color = T.text
      }
    })
    btn.addEventListener('mouseleave', () => {
      if (!isStateActive(el, state)) {
        btn.style.borderColor = T.border
        btn.style.color = T.textMuted
      }
    })

    btn.addEventListener('click', () => {
      const newStates = toggleState(el, state)
      const isActive = newStates.has(state)

      btn.style.border = isActive ? `1px solid ${T.accent}` : `1px solid ${T.border}`
      btn.style.background = isActive ? T.accentBg : 'transparent'
      btn.style.color = isActive ? T.accentText : T.textMuted

      // Re-render inspector sections to show the forced state's styles
      onToggle()
    })

    bar.appendChild(btn)
  }

  wrapper.appendChild(bar)
  return wrapper
}

/* ─── Internal ─── */

function stateToClass(state: PseudoState): string {
  return `vibelens-force-${state.replace(':', '')}`
}

/**
 * Scan stylesheets for rules that match the element with the given pseudo-class,
 * and inject duplicated rules using the force class.
 */
function rebuildForcedStyles(el: HTMLElement, states: Set<PseudoState>): void {
  if (states.size === 0) {
    cleanupInjectedStyles()
    return
  }

  const rules: string[] = []

  try {
    for (const sheet of document.styleSheets) {
      try {
        const cssRules = sheet.cssRules
        for (const rule of cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue

          for (const state of states) {
            if (!rule.selectorText.includes(state)) continue

            // Check if the base selector (without pseudo) matches this element
            const baseSelector = rule.selectorText
              .split(',')
              .filter(s => s.includes(state))
              .map(s => s.replace(new RegExp(escapeRegex(state), 'g'), ''))
              .map(s => s.trim())
              .filter(s => {
                try {
                  return el.matches(s) || el.closest(s)
                } catch {
                  return false
                }
              })

            if (baseSelector.length === 0) continue

            // Create a new rule using the force class instead of the pseudo-class
            const forceClass = stateToClass(state)
            const newSelector = rule.selectorText
              .replace(new RegExp(escapeRegex(state), 'g'), `.${forceClass}`)

            rules.push(`${newSelector} { ${rule.style.cssText} }`)
          }
        }
      } catch {
        // Cross-origin stylesheet — can't read rules, skip
      }
    }
  } catch {
    // Stylesheet access error — skip
  }

  // Inject or update the style element
  if (rules.length === 0) {
    cleanupInjectedStyles()
    return
  }

  if (!injectedStyleEl) {
    injectedStyleEl = document.createElement('style')
    injectedStyleEl.id = 'vibelens-forced-states'
    document.head.appendChild(injectedStyleEl)
  }
  injectedStyleEl.textContent = rules.join('\n')
}

function cleanupInjectedStyles(): void {
  if (injectedStyleEl && activeStates.size === 0) {
    injectedStyleEl.remove()
    injectedStyleEl = null
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
