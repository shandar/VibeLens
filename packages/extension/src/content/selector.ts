/**
 * H13: CSS selector generation and DOM introspection utilities.
 *
 * Pure DOM utilities with no dependencies on other content modules.
 * Used by diff-overlay (captureSnapshot), tooltip-editor, edit-mode,
 * and annotation-mode to identify and describe target elements.
 */

/**
 * M9: Check if an ID looks like a framework-generated unstable identifier.
 * React (`:r0:`), Radix (`radix-:r1:`), Headless UI (`:r2:`) etc. produce
 * IDs that change on every render and should NOT be used for selectors.
 */
function isUnstableId(id: string): boolean {
  return /^:r\d+:/.test(id) || /^radix-/.test(id) || /^headlessui-/.test(id)
}

/**
 * M9: stable data-attribute selectors, checked in priority order.
 * These are commonly used for testing/automation and survive re-renders.
 */
const STABLE_ATTRIBUTES = ['data-testid', 'data-cy', 'data-test', 'data-id'] as const

/**
 * Generate a unique CSS selector for an element.
 * Prefers: id > data attributes > ARIA > nth-of-type path.
 * M9: skips unstable framework IDs, respects shadow DOM boundaries.
 */
export function generateSelector(el: HTMLElement): string {
  // Prefer stable ID (but skip framework-generated unstable IDs)
  if (el.id && !isUnstableId(el.id)) return `#${CSS.escape(el.id)}`

  // Check stable data attributes
  for (const attr of STABLE_ATTRIBUTES) {
    const val = el.getAttribute(attr)
    if (val) return `[${attr}="${CSS.escape(val)}"]`
  }

  // ARIA-based fallback for unique landmark elements
  const role = el.getAttribute('role')
  const ariaLabel = el.getAttribute('aria-label')
  if (role && ariaLabel) {
    const candidate = `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(ariaLabel)}"]`
    if (document.querySelectorAll(candidate).length === 1) return candidate
  }

  const parts: string[] = []
  let current: HTMLElement | null = el

  // M9: walk up through shadow DOM boundaries if needed
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    if (current.id && !isUnstableId(current.id)) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }

    // Check stable attributes on ancestors too
    let foundStable = false
    for (const attr of STABLE_ATTRIBUTES) {
      const val = current.getAttribute(attr)
      if (val) {
        parts.unshift(`[${attr}="${CSS.escape(val)}"]`)
        foundStable = true
        break
      }
    }

    if (!foundStable) {
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current!.tagName,
        )
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1
          selector += `:nth-of-type(${index})`
        }
      }
      parts.unshift(selector)
    }

    // M9: if parent is a shadow root host, cross the boundary
    const parentNode = current.parentNode
    if (parentNode instanceof ShadowRoot) {
      const hostTag = (parentNode.host as HTMLElement).tagName.toLowerCase()
      parts.unshift(hostTag)
      current = parentNode.host as HTMLElement
      // Continue walking from the host element's parent
      current = current.parentElement
      continue
    }

    current = current.parentElement
  }

  return parts.join(' > ')
}

/**
 * Generate a human-readable description of an element.
 */
export function describeElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  // el.className may be SVGAnimatedString for SVG elements
  const classStr = typeof el.className === 'string' ? el.className : ''
  const classes = classStr ? `.${classStr.split(' ').filter(Boolean).join('.')}` : ''
  const text = el.textContent?.trim().slice(0, 50) ?? ''
  return `<${tag}${classes}>${text ? ` "${text}"` : ''}`
}

/**
 * Get style properties relevant for annotation context.
 */
export function getRelevantStyles(el: HTMLElement): Record<string, string> {
  const computed = window.getComputedStyle(el)
  const properties = [
    'color',
    'background-color',
    'font-size',
    'font-weight',
    'padding',
    'margin',
    'border-radius',
    'border',
    'width',
    'height',
    'display',
    'position',
    'gap',
    'opacity',
  ]

  const styles: Record<string, string> = {}
  for (const prop of properties) {
    styles[prop] = computed.getPropertyValue(prop)
  }
  return styles
}
