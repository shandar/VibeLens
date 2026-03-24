/**
 * CSS Variable Resolution — resolve, display, and edit CSS custom properties.
 *
 * When a computed value uses var(--token), this module:
 *   1. Shows the resolved value alongside the variable name
 *   2. Lets the user edit the variable value (affects all elements using it)
 *   3. Tracks variable definitions for AI prompt export
 */

import { T } from './design-tokens.js'
import { toHex } from './color-utils.js'

/* ─── Types ─── */

export interface ResolvedVariable {
  name: string           // --primary-color
  value: string          // #3B82F6
  definedOn: string      // :root, .dark, etc.
}

/* ─── Public API ─── */

/**
 * Get all CSS variables used by an element's styles.
 * Returns variables found in the element's matched rules.
 */
export function getElementVariables(el: HTMLElement): ResolvedVariable[] {
  const variables: ResolvedVariable[] = []
  const seen = new Set<string>()
  const computed = getComputedStyle(el)

  // Check all stylesheets for rules matching this element that use variables
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue
          try {
            if (!el.matches(rule.selectorText)) continue
          } catch {
            continue
          }

          // Check each property value for var(--...)
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]!
            const rawValue = rule.style.getPropertyValue(prop)
            const varMatches = rawValue.match(/var\(--[\w-]+/g)
            if (!varMatches) continue

            for (const match of varMatches) {
              const varName = match.replace('var(', '')
              if (seen.has(varName)) continue
              seen.add(varName)

              // Resolve the variable value
              const resolved = computed.getPropertyValue(varName).trim()
              if (!resolved) continue

              // Find where it's defined
              const definedOn = findVariableDefinition(varName)

              variables.push({
                name: varName,
                value: resolved,
                definedOn,
              })
            }
          }
        }
      } catch {
        // Cross-origin stylesheet
      }
    }
  } catch {
    // Stylesheet access error
  }

  return variables
}

/**
 * Set a CSS variable value on its definition scope (or :root as fallback).
 */
export function setVariable(name: string, value: string): void {
  // Try to set on the original scope element
  const definedOn = findVariableDefinition(name)
  if (definedOn === ':root' || definedOn === 'html') {
    document.documentElement.style.setProperty(name, value)
  } else {
    // Try to find the scope element
    try {
      const scope = document.querySelector(definedOn)
      if (scope instanceof HTMLElement) {
        scope.style.setProperty(name, value)
      } else {
        document.documentElement.style.setProperty(name, value)
      }
    } catch {
      document.documentElement.style.setProperty(name, value)
    }
  }
}

/**
 * Create a variables section UI for the inspector panel.
 */
export function createVariablesSection(
  el: HTMLElement,
  onChange: (varName: string, oldValue: string, newValue: string) => void,
): HTMLElement | null {
  const variables = getElementVariables(el)
  if (variables.length === 0) return null

  const section = document.createElement('div')
  Object.assign(section.style, {
    borderBottom: `1px solid ${T.border}`,
  })

  // Header
  const header = document.createElement('button')
  Object.assign(header.style, {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: T.text,
    fontFamily: T.font,
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    transition: 'background 0.15s ease',
    outline: 'none',
  })
  header.addEventListener('mouseenter', () => { header.style.background = T.sectionHover })
  header.addEventListener('mouseleave', () => { header.style.background = 'transparent' })

  const chevron = document.createElement('span')
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`
  Object.assign(chevron.style, {
    display: 'flex', transition: 'transform 0.15s ease', color: T.textMuted,
  })

  const icon = document.createElement('span')
  icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="4"/></svg>`
  Object.assign(icon.style, { display: 'flex', color: T.textMuted })

  const label = document.createElement('span')
  label.textContent = `CSS Variables (${variables.length})`

  header.appendChild(chevron)
  header.appendChild(icon)
  header.appendChild(label)

  // Content
  const content = document.createElement('div')
  Object.assign(content.style, {
    padding: '4px 12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  })

  for (const v of variables) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      minHeight: '26px',
    })

    // Variable name
    const nameEl = document.createElement('span')
    nameEl.textContent = v.name
    nameEl.title = `Defined on: ${v.definedOn}`
    Object.assign(nameEl.style, {
      fontSize: '10px',
      fontFamily: T.mono,
      color: T.violet,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '140px',
    })
    row.appendChild(nameEl)

    // Value — show color swatch if it looks like a color
    const isColor = /^#|^rgb|^hsl/.test(v.value)
    if (isColor) {
      const swatch = document.createElement('input')
      swatch.type = 'color'
      swatch.value = toHex(v.value)
      Object.assign(swatch.style, {
        width: '20px', height: '20px', padding: '1px',
        border: `1.5px solid ${T.inputBorder}`, borderRadius: '6px',
        background: 'transparent', cursor: 'pointer', flexShrink: '0',
      })
      swatch.addEventListener('input', () => {
        const oldVal = v.value
        v.value = swatch.value
        setVariable(v.name, swatch.value)
        valueEl.textContent = swatch.value
        onChange(v.name, oldVal, swatch.value)
      })
      row.appendChild(swatch)
    }

    // Editable value
    const valueEl = document.createElement('input')
    valueEl.type = 'text'
    valueEl.value = v.value
    Object.assign(valueEl.style, {
      height: '24px',
      fontSize: '10px',
      fontFamily: T.mono,
      color: T.text,
      background: T.inputBg,
      border: `1px solid ${T.inputBorder}`,
      borderRadius: '5px',
      padding: '0 6px',
      outline: 'none',
      width: '80px',
      textAlign: 'right',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    })
    valueEl.addEventListener('focus', () => {
      valueEl.style.borderColor = T.inputBorderFocus
      valueEl.style.boxShadow = `0 0 0 2px ${T.accentGlow}`
    })
    valueEl.addEventListener('blur', () => {
      valueEl.style.borderColor = T.inputBorder
      valueEl.style.boxShadow = 'none'
    })
    valueEl.addEventListener('change', () => {
      const oldVal = v.value
      v.value = valueEl.value
      setVariable(v.name, valueEl.value)
      onChange(v.name, oldVal, valueEl.value)
    })
    row.appendChild(valueEl)

    content.appendChild(row)
  }

  // Toggle
  header.addEventListener('click', () => {
    const isOpen = content.style.display !== 'none'
    content.style.display = isOpen ? 'none' : 'flex'
    content.style.padding = isOpen ? '0' : '4px 12px 10px'
    chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0)'
  })

  section.appendChild(header)
  section.appendChild(content)
  return section
}

/* ─── Internal ─── */

function findVariableDefinition(varName: string): string {
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue
          if (rule.style.getPropertyValue(varName)) {
            return rule.selectorText
          }
        }
      } catch {
        // Cross-origin
      }
    }
  } catch {
    // Access error
  }
  return ':root'
}

// toHex is imported from color-utils.ts (single source of truth)
