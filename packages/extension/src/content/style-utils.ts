/**
 * H13: Style utility functions for content script.
 *
 * Pure utilities with no dependencies on other content modules:
 * - NON_TEXT_TAGS: tags that can't be text-edited
 * - Save/restore inline styles (M2): prevent VibeLens from clobbering user styles
 * - rgbToHex / channelsToHex (M8): color conversion for <input type="color">
 * - dashToCamel: CSS property name conversion
 */

/**
 * H10: single source of truth for tags that should never be text-edited.
 * Shared between tooltip editor (canEditText check) and edit-mode click handler.
 */
export const NON_TEXT_TAGS = new Set([
  'IMG', 'VIDEO', 'IFRAME', 'CANVAS', 'SVG', 'AUDIO', 'BR', 'HR',
  'INPUT', 'SELECT', 'TEXTAREA',
])

/* ─── M2: Save/restore original inline styles ─── */

/**
 * Stores original inline style values per element so we can restore them
 * exactly after VibeLens removes its visual mutations (outlines, minHeight, etc.).
 * Keys are the CSS property names; values are the original `style.getPropertyValue()`.
 */
const savedStyles = new WeakMap<HTMLElement, Map<string, string>>()

/** Save current inline style values for the given properties before mutating them. */
export function saveInlineStyles(el: HTMLElement, props: string[]): void {
  const map = new Map<string, string>()
  for (const prop of props) {
    map.set(prop, el.style.getPropertyValue(prop))
  }
  savedStyles.set(el, map)
}

/** Restore previously saved inline style values. Removes property if original was empty. */
export function restoreInlineStyles(el: HTMLElement): void {
  const map = savedStyles.get(el)
  if (!map) return
  for (const [prop, value] of map) {
    if (value) {
      el.style.setProperty(prop, value)
    } else {
      el.style.removeProperty(prop)
    }
  }
  savedStyles.delete(el)
}

/* ─── M8: Color conversion ─── */

/**
 * Convert CSS color strings to #rrggbb hex for <input type="color">.
 *
 * Handles:
 *  - rgb(r, g, b) / rgba(r, g, b, a)
 *  - Modern space-separated: rgb(r g b) / rgb(r g b / a)
 *  - Hex passthrough: #rgb, #rrggbb, #rrggbbaa
 *  - Named colors and modern formats (oklch, color(), etc.) use a canvas fallback
 */
export function rgbToHex(color: string): string {
  // Already hex → normalise to 6-digit
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    }
    // #rrggbb or #rrggbbaa — return first 6 chars
    return `#${hex.slice(0, 6)}`
  }

  // Try comma-separated: rgb(r, g, b) or rgba(r, g, b, a)
  const commaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (commaMatch) {
    return channelsToHex(
      parseInt(commaMatch[1]!, 10),
      parseInt(commaMatch[2]!, 10),
      parseInt(commaMatch[3]!, 10),
    )
  }

  // Try space-separated: rgb(r g b) or rgb(r g b / a)
  const spaceMatch = color.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/)
  if (spaceMatch) {
    return channelsToHex(
      parseInt(spaceMatch[1]!, 10),
      parseInt(spaceMatch[2]!, 10),
      parseInt(spaceMatch[3]!, 10),
    )
  }

  // Fallback: use an off-screen canvas to let the browser resolve any CSS color
  // (oklch, color(srgb ...), named colors like "rebeccapurple", etc.)
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.fillStyle = color
      const resolved = ctx.fillStyle // browser normalises to #rrggbb or rgba()
      if (resolved.startsWith('#')) return resolved
      // If canvas returned rgb/rgba, recurse once
      return rgbToHex(resolved)
    }
  } catch {
    // Canvas unavailable — fall through
  }

  return '#000000'
}

export function channelsToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/** Convert dash-case to camelCase */
export function dashToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}
