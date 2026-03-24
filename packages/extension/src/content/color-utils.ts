/**
 * Color Utilities — format toggling (hex/rgb/hsl) and WCAG contrast checking.
 */

/* ─── Color Format Cycling ─── */

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

const formatOrder: ColorFormat[] = ['hex', 'rgb', 'hsl']

export function nextFormat(current: ColorFormat): ColorFormat {
  const idx = formatOrder.indexOf(current)
  return formatOrder[(idx + 1) % formatOrder.length]!
}

export function formatColor(color: string, format: ColorFormat): string {
  const rgb = parseToRGB(color)
  if (!rgb) return color

  switch (format) {
    case 'hex': return rgbToHex(rgb.r, rgb.g, rgb.b)
    case 'rgb': return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    case 'hsl': {
      const hsl = rgbToHSL(rgb.r, rgb.g, rgb.b)
      return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
    }
  }
}

/* ─── WCAG Contrast Ratio ─── */

export interface ContrastResult {
  ratio: number
  aa: boolean       // >= 4.5:1 for normal text
  aaLarge: boolean   // >= 3:1 for large text (18px+ or 14px bold)
  aaa: boolean       // >= 7:1
}

/**
 * Calculate WCAG contrast ratio between foreground and background colors.
 */
export function getContrastRatio(fg: string, bg: string): ContrastResult {
  const fgRgb = parseToRGB(fg)
  const bgRgb = parseToRGB(bg)
  if (!fgRgb || !bgRgb) return { ratio: 0, aa: false, aaLarge: false, aaa: false }

  const fgLum = relativeLuminance(fgRgb.r, fgRgb.g, fgRgb.b)
  const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)
  const ratio = (lighter + 0.05) / (darker + 0.05)

  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
  }
}

/**
 * Suggest the nearest accessible color that meets AA contrast.
 */
export function suggestAccessibleColor(fg: string, bg: string): string | null {
  const fgRgb = parseToRGB(fg)
  const bgRgb = parseToRGB(bg)
  if (!fgRgb || !bgRgb) return null

  const hsl = rgbToHSL(fgRgb.r, fgRgb.g, fgRgb.b)
  const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)

  // Try adjusting lightness to meet 4.5:1 ratio
  for (let delta = 0; delta <= 100; delta++) {
    // Try darker
    const darkL = Math.max(0, hsl.l - delta)
    const darkRgb = hslToRGB(hsl.h, hsl.s, darkL)
    const darkLum = relativeLuminance(darkRgb.r, darkRgb.g, darkRgb.b)
    const darkRatio = (Math.max(darkLum, bgLum) + 0.05) / (Math.min(darkLum, bgLum) + 0.05)
    if (darkRatio >= 4.5) {
      return rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b)
    }

    // Try lighter
    const lightL = Math.min(100, hsl.l + delta)
    const lightRgb = hslToRGB(hsl.h, hsl.s, lightL)
    const lightLum = relativeLuminance(lightRgb.r, lightRgb.g, lightRgb.b)
    const lightRatio = (Math.max(lightLum, bgLum) + 0.05) / (Math.min(lightLum, bgLum) + 0.05)
    if (lightRatio >= 4.5) {
      return rgbToHex(lightRgb.r, lightRgb.g, lightRgb.b)
    }
  }

  return null
}

/**
 * Convert any CSS color string to hex. Single source of truth for color→hex.
 * Handles hex, rgb(), hsl(), named colors via canvas.
 */
export function toHex(color: string): string {
  if (color.startsWith('#')) {
    return color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color
  }
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = color
  return ctx.fillStyle
}

/* ─── Color Conversion Helpers ─── */

interface RGB { r: number; g: number; b: number }
interface HSL { h: number; s: number; l: number }

function parseToRGB(color: string): RGB | null {
  // Use canvas to resolve any CSS color to rgb
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = color
  const hex = ctx.fillStyle
  if (hex.startsWith('#')) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    }
  }
  // Might return rgb() format
  const match = hex.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    return { r: +match[1]!, g: +match[2]!, b: +match[3]! }
  }
  return null
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function rgbToHSL(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

function hslToRGB(h: number, s: number, l: number): RGB {
  h /= 360; s /= 100; l /= 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}
