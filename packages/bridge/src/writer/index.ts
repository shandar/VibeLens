/**
 * Write-back Engine — Orchestrator
 *
 * Routes style changes to the appropriate writer based on the target file type:
 * - .css / .scss / .less  → CSS Writer (property-level edits)
 * - .tsx / .jsx            → JSX Writer (inline style prop)
 * - .tsx / .jsx (Tailwind) → Tailwind Writer (class manipulation)
 *
 * Supports dry-run mode for generating previews before applying changes.
 */

import { extname, dirname, join } from 'path'
import { readFile, access } from 'fs/promises'
import type { StyleChange } from '@vibelens/shared'
import { writeCSSChanges, type CSSWriteResult } from './css-writer.js'
import { writeJSXStyleChanges, type JSXWriteResult } from './jsx-writer.js'
import { writeTailwindChanges, type TailwindWriteResult } from './tailwind-writer.js'

export type WriteResult = CSSWriteResult | JSXWriteResult | TailwindWriteResult

export interface WriteRequest {
  filePath: string
  line: number
  changes: StyleChange[]
  /** If true, returns diff without writing */
  dryRun?: boolean
  /** Force a specific writer strategy */
  forceWriter?: 'css' | 'jsx' | 'tailwind'
  /** CSS selector from the extension — used for accurate rule matching in HTML files */
  selector?: string
  /** Class list of the selected DOM element — used for CSS rule scoring */
  elementClasses?: string[]
  /** Tag name of the selected DOM element (lowercase) */
  elementTag?: string
}

/**
 * Apply style changes to a source file using the appropriate writer.
 */
export async function applyStyleChanges(request: WriteRequest): Promise<WriteResult> {
  let writer = request.forceWriter ?? detectWriter(request.filePath)

  // M6: For SFC files (.vue/.svelte/.astro), refine writer based on which
  // section (style vs template/script) the target line is in.
  // NOTE: .html/.htm are excluded — they never have JSX inline styles, so
  // the CSS writer (with embedded <style> block support) is always correct.
  const ext = extname(request.filePath).toLowerCase()
  if (!request.forceWriter && (ext === '.vue' || ext === '.svelte' || ext === '.astro')) {
    writer = await detectSFCSection(request.filePath, request.line)
  }

  switch (writer) {
    case 'css':
      return writeCSSChanges(
        request.filePath,
        request.line,
        request.changes,
        request.dryRun,
        request.selector,
        request.elementClasses,
        request.elementTag,
      )
    case 'tailwind':
      return writeTailwindChanges(
        request.filePath,
        request.line,
        request.changes,
        request.dryRun,
      )
    case 'jsx':
      return writeJSXStyleChanges(
        request.filePath,
        request.line,
        request.changes,
        request.dryRun,
      )
    default:
      return {
        success: false,
        originalContent: '',
        modifiedContent: '',
        diff: '',
        error: `Unsupported file type: ${extname(request.filePath)}`,
      }
  }
}

/**
 * Auto-detect the writer strategy based on file extension and content.
 */
function detectWriter(filePath: string): 'css' | 'jsx' | 'tailwind' | null {
  const ext = extname(filePath).toLowerCase()

  switch (ext) {
    case '.css':
    case '.scss':
    case '.less':
      return 'css'

    case '.tsx':
    case '.jsx':
      // Could be JSX inline styles or Tailwind — default to JSX
      // (user can force 'tailwind' if needed)
      return 'jsx'

    case '.vue':
    case '.svelte':
    case '.astro':
      // M6: SFC files have both <style> and <script>/<template> blocks.
      // Default to 'css' — the line-aware detection in detectSFCSection()
      // is used by applyStyleChanges to pick the right writer at runtime.
      return 'css'

    case '.html':
    case '.htm':
      // HTML files with inline <style> blocks — treat like SFC.
      // detectSFCSection() determines if the target line is in <style>.
      return 'css'

    default:
      return null
  }
}

/**
 * M6: Detect whether a given line in an SFC file falls within a <style> block
 * or the template/script section. Returns 'css' for <style>, 'jsx' for
 * template/script (where class attributes live).
 */
async function detectSFCSection(
  filePath: string,
  line: number,
): Promise<'css' | 'jsx'> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    // Track whether we're inside a <style> block at the target line
    let inStyle = false
    for (let i = 0; i < Math.min(line, lines.length); i++) {
      const trimmed = lines[i]!.trim()
      if (/^<style[\s>]/.test(trimmed)) {
        inStyle = true
      } else if (trimmed === '</style>') {
        inStyle = false
      }
    }

    return inStyle ? 'css' : 'jsx'
  } catch {
    return 'css'
  }
}

/**
 * M7: Detect if a project uses Tailwind by checking for config files first,
 * then falling back to content heuristics.
 *
 * Config-file detection is definitive — only Tailwind projects have
 * `tailwind.config.*`. Content heuristics are a fallback for CDN-based setups.
 */
export async function detectTailwindUsage(filePath: string): Promise<boolean> {
  // M7: Check for tailwind.config.* in the file's directory and ancestors
  if (await hasTailwindConfig(filePath)) {
    return true
  }

  // Fallback: content-based heuristic — looks for Tailwind utility class patterns.
  // Uses word-boundary-aware patterns to avoid false positives on class names
  // like "text-black" (descriptive) vs "text-red-500" (Tailwind utility).
  // Requires Tailwind-specific value suffixes (e.g., p-4, m-auto, text-sm, bg-blue-500).
  try {
    const content = await readFile(filePath, 'utf-8')
    const tailwindPatterns = [
      // Spacing utilities with numeric values: p-4, m-2, px-3, mt-auto, etc.
      /class(?:Name)?="[^"]*\b(?:p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr)-(?:\d|auto|px)/,
      // Tailwind color utilities: text-red-500, bg-blue-500, border-gray-300, etc.
      /class(?:Name)?="[^"]*\b(?:text|bg|border)-[a-z]+-\d{2,3}\b/,
      // Layout utilities: flex, grid, hidden, block (as standalone words)
      /class(?:Name)?="[^"]*\b(?:flex|grid|hidden|block|inline-flex|inline-block)\b[^"]*\b(?:items-|justify-|gap-|col-span|row-span)/,
      // Tailwind explicit keyword
      /tailwind/i,
    ]
    return tailwindPatterns.some((p) => p.test(content))
  } catch {
    return false
  }
}

/**
 * M7: Walk up from the file's directory looking for tailwind.config.{js,ts,mjs,cjs}.
 * Stops after 10 levels to avoid scanning the entire filesystem.
 */
const TAILWIND_CONFIG_NAMES = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
]

async function hasTailwindConfig(filePath: string): Promise<boolean> {
  let dir = dirname(filePath)
  for (let depth = 0; depth < 10; depth++) {
    for (const configName of TAILWIND_CONFIG_NAMES) {
      try {
        await access(join(dir, configName))
        return true
      } catch {
        // File doesn't exist — continue
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break // Reached filesystem root
    dir = parent
  }
  return false
}

export { writeCSSChanges } from './css-writer.js'
export { writeJSXStyleChanges } from './jsx-writer.js'
export { writeTailwindChanges } from './tailwind-writer.js'
