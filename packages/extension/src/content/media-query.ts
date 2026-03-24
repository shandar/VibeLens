/**
 * Media Query Awareness — show which breakpoint is active and
 * flag properties that change at other viewport sizes.
 */

import { T } from './design-tokens.js'

/* ─── Types ─── */

interface BreakpointInfo {
  label: string
  query: string
  active: boolean
}

/* ─── Public API ─── */

/**
 * Detect common breakpoints and which ones are currently active.
 */
export function getActiveBreakpoints(): BreakpointInfo[] {
  const breakpoints: BreakpointInfo[] = []
  const seen = new Set<string>()

  // Scan stylesheets for @media rules
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSMediaRule) {
            const query = rule.conditionText
            if (seen.has(query)) continue
            seen.add(query)

            breakpoints.push({
              label: simplifyMediaQuery(query),
              query,
              active: window.matchMedia(query).matches,
            })
          }
        }
      } catch {
        // Cross-origin
      }
    }
  } catch {
    // Stylesheet error
  }

  return breakpoints
}

/**
 * Create a media query indicator bar for the inspector.
 */
export function createMediaQueryBar(): HTMLElement | null {
  const breakpoints = getActiveBreakpoints()
  if (breakpoints.length === 0) return null

  const bar = document.createElement('div')
  Object.assign(bar.style, {
    display: 'flex',
    gap: '4px',
    padding: '5px 12px',
    borderBottom: `1px solid ${T.border}`,
    flexWrap: 'wrap',
    alignItems: 'center',
  })

  // Viewport width label
  const vpLabel = document.createElement('span')
  vpLabel.textContent = `${window.innerWidth}px`
  Object.assign(vpLabel.style, {
    fontSize: '9px',
    fontFamily: T.mono,
    fontWeight: '700',
    color: T.textMuted,
    marginRight: '4px',
  })
  bar.appendChild(vpLabel)

  // Show active breakpoints as pills
  const active = breakpoints.filter(b => b.active)
  const inactive = breakpoints.filter(b => !b.active)

  for (const bp of active.slice(0, 3)) {
    const pill = document.createElement('span')
    pill.textContent = bp.label
    pill.title = bp.query
    Object.assign(pill.style, {
      fontSize: '8px',
      fontFamily: T.mono,
      padding: '2px 6px',
      borderRadius: '3px',
      background: 'rgba(34,197,94,0.12)',
      color: T.green,
      border: `1px solid rgba(34,197,94,0.2)`,
    })
    bar.appendChild(pill)
  }

  for (const bp of inactive.slice(0, 2)) {
    const pill = document.createElement('span')
    pill.textContent = bp.label
    pill.title = bp.query
    Object.assign(pill.style, {
      fontSize: '8px',
      fontFamily: T.mono,
      padding: '2px 6px',
      borderRadius: '3px',
      background: 'transparent',
      color: T.textDim,
      border: `1px solid ${T.border}`,
    })
    bar.appendChild(pill)
  }

  return bar
}

/* ─── Internal ─── */

function simplifyMediaQuery(query: string): string {
  // Extract width values for readability
  const minMatch = query.match(/min-width:\s*([\d.]+)(px|em|rem)/)
  const maxMatch = query.match(/max-width:\s*([\d.]+)(px|em|rem)/)

  if (minMatch && maxMatch) {
    return `${minMatch[1]}-${maxMatch[1]}${maxMatch[2]}`
  }
  if (minMatch) {
    return `\u2265${minMatch[1]}${minMatch[2]}`
  }
  if (maxMatch) {
    return `\u2264${maxMatch[1]}${maxMatch[2]}`
  }

  // Dark/light mode
  if (query.includes('prefers-color-scheme: dark')) return 'dark'
  if (query.includes('prefers-color-scheme: light')) return 'light'

  // Truncate long queries
  return query.length > 20 ? query.slice(0, 18) + '\u2026' : query
}
