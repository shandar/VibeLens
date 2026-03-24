/**
 * Tailwind CSS Class Writer
 *
 * Maps CSS property changes to Tailwind utility classes.
 * Finds the element's className in JSX/TSX and swaps or adds classes.
 */

import { readFile, writeFile } from 'fs/promises'
import type { StyleChange } from '@vibelens/shared'

export interface TailwindWriteResult {
  success: boolean
  originalContent: string
  modifiedContent: string
  diff: string
  error?: string
}

/**
 * Apply style changes as Tailwind class modifications.
 * Finds the className attribute near the target line and updates it.
 */
export async function writeTailwindChanges(
  filePath: string,
  line: number,
  changes: StyleChange[],
  dryRun = false,
): Promise<TailwindWriteResult> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return {
      success: false,
      originalContent: '',
      modifiedContent: '',
      diff: '',
      error: `Cannot read file: ${filePath}`,
    }
  }

  const lines = content.split('\n')
  const originalContent = content

  // Find className near the target line
  const classLine = findClassNameLine(lines, line - 1)
  if (classLine < 0) {
    return {
      success: false,
      originalContent,
      modifiedContent: originalContent,
      diff: '',
      error: 'No className attribute found near the target line',
    }
  }

  const modifiedLines = [...lines]

  for (const change of changes) {
    const tailwindClass = cssToTailwind(change.property, change.newValue)
    if (!tailwindClass) continue

    const oldClass = cssToTailwind(change.property, change.originalValue)

    // Get current class-related value from the line
    const currentLine = modifiedLines[classLine]!
    const parsed = parseClassAttribute(currentLine)
    if (!parsed) continue

    let classes = parsed.classes

    // Remove old class if it exists
    if (oldClass) {
      classes = classes
        .split(/\s+/)
        .filter((c) => c !== oldClass)
        .join(' ')
    }

    // Remove any existing class with the same prefix (e.g. text-red-500 → text-blue-500)
    const prefix = getTailwindPrefix(tailwindClass)
    if (prefix) {
      classes = classes
        .split(/\s+/)
        .filter((c) => !c.startsWith(prefix) || c === tailwindClass)
        .join(' ')
    }

    // Add new class if not already present
    if (!classes.split(/\s+/).includes(tailwindClass)) {
      classes = classes ? `${classes} ${tailwindClass}` : tailwindClass
    }

    // Replace in line, preserving the original attribute style
    modifiedLines[classLine] = currentLine.replace(
      parsed.fullMatch,
      parsed.rebuild(classes),
    )
  }

  const modifiedContent = modifiedLines.join('\n')
  const diff = originalContent !== modifiedContent
    ? `--- a/${filePath}\n+++ b/${filePath}\n@@ -${classLine + 1} +${classLine + 1} @@\n-${lines[classLine]}\n+${modifiedLines[classLine]}`
    : ''

  if (!dryRun && modifiedContent !== originalContent) {
    await writeFile(filePath, modifiedContent, 'utf-8')
  }

  return {
    success: true,
    originalContent,
    modifiedContent,
    diff,
  }
}

/* ─── Helpers ─── */

/**
 * M5: find the line containing class-related attributes near the target.
 * Supports className= (React/Preact), class= (Svelte/Vue/HTML), and
 * class: directive (Svelte conditional classes).
 */
function findClassNameLine(lines: string[], targetIdx: number): number {
  const searchStart = Math.max(0, targetIdx - 3)
  const searchEnd = Math.min(lines.length, targetIdx + 4)

  // Prefer className= (JSX), fall back to class= (SFC/HTML)
  for (let i = searchStart; i < searchEnd; i++) {
    if (/className=/.test(lines[i]!)) return i
  }
  for (let i = searchStart; i < searchEnd; i++) {
    if (/\bclass=/.test(lines[i]!)) return i
  }
  return -1
}

/**
 * M5: Parse class-related attributes from various patterns:
 * - className="classes"             (standard JSX)
 * - className={'classes'}           (JSX expression string)
 * - className={cn("a", "b")}       (clsx/cn/cva wrapper)
 * - className={`static ${dynamic}`} (template literal)
 * - class="classes"                 (Svelte/Vue/HTML)
 *
 * Returns the extracted static classes, the full matched substring,
 * and a rebuild function that produces the replacement string.
 */
interface ParsedClassAttribute {
  classes: string
  fullMatch: string
  rebuild: (newClasses: string) => string
}

function parseClassAttribute(line: string): ParsedClassAttribute | null {
  // 1. className={cn("...", "...")} or className={clsx("...", ...)}
  //    We only modify the first string argument for safety
  const cnMatch = line.match(/(className|class)=\{(?:cn|clsx|cva|twMerge)\(["']([^"']*)["']/)
  if (cnMatch) {
    const [fullMatch, , classes] = cnMatch
    const attr = cnMatch[1]!
    const quote = fullMatch!.includes("'") ? "'" : '"'
    return {
      classes: classes!,
      fullMatch: fullMatch!,
      rebuild: (c) => {
        // Preserve the wrapper function call, only replace the first string arg
        return fullMatch!.replace(
          new RegExp(`(${attr}=\\{(?:cn|clsx|cva|twMerge)\\()${quote}[^${quote}]*${quote}`),
          `$1${quote}${c}${quote}`,
        )
      },
    }
  }

  // 2. className={`static classes ${dynamic}`}
  //    Only modify the static leading portion before ${
  const tmplMatch = line.match(/(className|class)=\{`([^$`]*)/)
  if (tmplMatch && line.includes('${')) {
    const [fullMatch, attr, classes] = tmplMatch
    return {
      classes: classes!.trim(),
      fullMatch: fullMatch!,
      rebuild: (c) => `${attr}={\`${c} `,
    }
  }

  // 3. className="classes" or class="classes" (standard)
  const stdMatch = line.match(/(className|class)=(["'])([^"']*)\2/)
  if (stdMatch) {
    const [fullMatch, attr, quote, classes] = stdMatch
    return {
      classes: classes!,
      fullMatch: fullMatch!,
      rebuild: (c) => `${attr}=${quote}${c}${quote}`,
    }
  }

  // 4. className={'classes'} (JSX expression with plain string)
  const exprMatch = line.match(/(className|class)=\{(["'])([^"']*)\2\}/)
  if (exprMatch) {
    const [fullMatch, attr, quote, classes] = exprMatch
    return {
      classes: classes!,
      fullMatch: fullMatch!,
      rebuild: (c) => `${attr}={${quote}${c}${quote}}`,
    }
  }

  return null
}

/** Get the Tailwind prefix for deduplication (e.g. "text-" from "text-red-500") */
function getTailwindPrefix(cls: string): string | null {
  const match = cls.match(/^([a-z]+-(?:[a-z]+-)?)\d/)
  if (match) return match[1]!
  // Simple prefixes like p-, m-, w-, h-, etc.
  const simpleMatch = cls.match(/^([a-z]+-)/)
  return simpleMatch ? simpleMatch[1]! : null
}

/**
 * Map a CSS property + value to a Tailwind utility class.
 * Covers the most common properties. Returns null for unmapped ones.
 */
function cssToTailwind(property: string, value: string): string | null {
  const clean = value.trim().toLowerCase()

  switch (property) {
    // Spacing
    case 'padding':
      return spacingClass('p', clean)
    case 'paddingTop':
      return spacingClass('pt', clean)
    case 'paddingRight':
      return spacingClass('pr', clean)
    case 'paddingBottom':
      return spacingClass('pb', clean)
    case 'paddingLeft':
      return spacingClass('pl', clean)
    case 'margin':
      return spacingClass('m', clean)
    case 'marginTop':
      return spacingClass('mt', clean)
    case 'marginRight':
      return spacingClass('mr', clean)
    case 'marginBottom':
      return spacingClass('mb', clean)
    case 'marginLeft':
      return spacingClass('ml', clean)
    case 'gap':
      return spacingClass('gap', clean)

    // Sizing
    case 'width':
      return sizeClass('w', clean)
    case 'height':
      return sizeClass('h', clean)

    // Typography
    case 'fontSize':
      return fontSizeClass(clean)
    case 'fontWeight':
      return fontWeightClass(clean)
    case 'textAlign':
      return `text-${clean}`

    // Colors
    case 'color':
      return colorClass('text', clean)
    case 'backgroundColor':
      return colorClass('bg', clean)

    // Border
    case 'borderRadius':
      return borderRadiusClass(clean)

    // Display
    case 'display':
      return displayClass(clean)

    // Opacity
    case 'opacity':
      return opacityClass(clean)

    default:
      return null
  }
}

/* ─── Value Mappers ─── */

function spacingClass(prefix: string, value: string): string | null {
  const px = parsePx(value)
  if (px === null) return `${prefix}-[${value}]`
  const twValue = pxToTailwindSpacing(px)
  return `${prefix}-${twValue}`
}

function sizeClass(prefix: string, value: string): string | null {
  if (value === '100%') return `${prefix}-full`
  if (value === '100vw') return `${prefix}-screen`
  if (value === 'auto') return `${prefix}-auto`
  if (value === 'fit-content') return `${prefix}-fit`
  if (value === 'min-content') return `${prefix}-min`
  if (value === 'max-content') return `${prefix}-max`
  const px = parsePx(value)
  if (px === null) return `${prefix}-[${value}]`
  return `${prefix}-${pxToTailwindSpacing(px)}`
}

function fontSizeClass(value: string): string {
  const sizeMap: Record<string, string> = {
    '12px': 'text-xs', '14px': 'text-sm', '16px': 'text-base',
    '18px': 'text-lg', '20px': 'text-xl', '24px': 'text-2xl',
    '30px': 'text-3xl', '36px': 'text-4xl', '48px': 'text-5xl',
    '60px': 'text-6xl', '72px': 'text-7xl', '96px': 'text-8xl',
    '128px': 'text-9xl',
  }
  return sizeMap[value] ?? `text-[${value}]`
}

function fontWeightClass(value: string): string {
  const weightMap: Record<string, string> = {
    '100': 'font-thin', '200': 'font-extralight', '300': 'font-light',
    '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold',
    '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
    'normal': 'font-normal', 'bold': 'font-bold',
  }
  return weightMap[value] ?? `font-[${value}]`
}

function colorClass(prefix: string, value: string): string {
  // Common named colors
  const namedColors: Record<string, string> = {
    'transparent': 'transparent', 'white': 'white', 'black': 'black',
    '#fff': 'white', '#ffffff': 'white', '#000': 'black', '#000000': 'black',
  }
  if (namedColors[value]) return `${prefix}-${namedColors[value]}`
  // Arbitrary value for custom colors
  return `${prefix}-[${value}]`
}

function borderRadiusClass(value: string): string {
  const radiusMap: Record<string, string> = {
    '0': 'rounded-none', '0px': 'rounded-none',
    '2px': 'rounded-sm', '4px': 'rounded',
    '6px': 'rounded-md', '8px': 'rounded-lg',
    '12px': 'rounded-xl', '16px': 'rounded-2xl',
    '24px': 'rounded-3xl', '9999px': 'rounded-full',
    '50%': 'rounded-full',
  }
  return radiusMap[value] ?? `rounded-[${value}]`
}

function displayClass(value: string): string {
  const displayMap: Record<string, string> = {
    'block': 'block', 'inline': 'inline', 'inline-block': 'inline-block',
    'flex': 'flex', 'inline-flex': 'inline-flex', 'grid': 'grid',
    'inline-grid': 'inline-grid', 'none': 'hidden',
    'table': 'table', 'contents': 'contents',
  }
  return displayMap[value] ?? `[display:${value}]`
}

function opacityClass(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return `opacity-[${value}]`
  const percent = Math.round(num * 100)
  const opacityMap: Record<number, string> = {
    0: 'opacity-0', 5: 'opacity-5', 10: 'opacity-10',
    15: 'opacity-15', 20: 'opacity-20', 25: 'opacity-25',
    30: 'opacity-30', 35: 'opacity-35', 40: 'opacity-40',
    45: 'opacity-45', 50: 'opacity-50', 55: 'opacity-55',
    60: 'opacity-60', 65: 'opacity-65', 70: 'opacity-70',
    75: 'opacity-75', 80: 'opacity-80', 85: 'opacity-85',
    90: 'opacity-90', 95: 'opacity-95', 100: 'opacity-100',
  }
  return opacityMap[percent] ?? `opacity-[${value}]`
}

function parsePx(value: string): number | null {
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/)
  return match ? parseFloat(match[1]!) : null
}

function pxToTailwindSpacing(px: number): string {
  // Tailwind spacing scale: 1 unit = 4px
  if (px === 0) return '0'
  if (px % 4 === 0) {
    const units = px / 4
    if (units <= 96) return String(units)
  }
  if (px === 1) return 'px'
  if (px === 2) return '0.5'
  if (px === 6) return '1.5'
  if (px === 10) return '2.5'
  if (px === 14) return '3.5'
  return `[${px}px]`
}
