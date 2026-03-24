/**
 * C3: AST-based JSX/TSX Style Writer
 *
 * Modifies inline `style={{ }}` props in JSX/TSX files using Babel parser
 * for reliable, syntax-aware edits. Replaces the previous regex-based
 * approach which broke on:
 *   - Ternary expressions inside style values
 *   - Template literals in values
 *   - Multi-line objects with nested expressions
 *   - Comments within the style prop
 *
 * Strategy: Parse with @babel/parser to get AST with source locations,
 * traverse to find the style JSXAttribute near the target line, then
 * use source positions for surgical string replacement (preserving all
 * formatting outside the edited properties).
 */

import { readFile, writeFile } from 'fs/promises'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { StyleChange } from '@vibelens/shared'
import { generateUnifiedDiff } from './css-writer.js'

// Handle ESM/CJS interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default) as typeof _traverse

export interface JSXWriteResult {
  success: boolean
  originalContent: string
  modifiedContent: string
  diff: string
  error?: string
}

/**
 * Apply style changes to a JSX/TSX file at a specific line.
 * Uses Babel to parse the file, finds the `style={{ }}` JSX attribute
 * nearest to the target line, then modifies/adds properties.
 * If no style prop exists, inserts one on the target element.
 */
export async function writeJSXStyleChanges(
  filePath: string,
  line: number,
  changes: StyleChange[],
  dryRun = false,
): Promise<JSXWriteResult> {
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

  const originalContent = content

  // Parse with Babel supporting JSX + TypeScript
  let ast: ReturnType<typeof parse>
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      // Ensure we get source locations
      ranges: true,
    })
  } catch {
    return {
      success: false,
      originalContent,
      modifiedContent: originalContent,
      diff: '',
      error: `Failed to parse JSX/TSX: ${filePath}`,
    }
  }

  // Find the style attribute and element nearest to the target line
  const found = findStyleAttribute(ast, line)

  let modifiedContent: string

  if (found?.styleAttr) {
    // Modify the existing style prop using AST source locations
    modifiedContent = modifyStyleViaAST(content, found.styleAttr, changes)
  } else if (found?.element) {
    // No style prop exists — insert one on the target element
    modifiedContent = insertStyleViaAST(content, found.element, changes)
  } else {
    // Fallback: insert on the target line (no JSX element found near line)
    modifiedContent = insertStyleFallback(content, line, changes)
  }

  const diff = generateUnifiedDiff(filePath, originalContent, modifiedContent)

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

/* ─── AST Helpers ─── */

interface StyleSearchResult {
  /** The JSXAttribute node for `style`, if found */
  styleAttr?: t.JSXAttribute
  /** The JSXOpeningElement containing (or that should contain) the style */
  element?: t.JSXOpeningElement
}

/**
 * Traverse the AST to find a `style` JSX attribute near the target line.
 * Returns the style attribute and/or the nearest JSX element.
 */
function findStyleAttribute(
  ast: ReturnType<typeof parse>,
  targetLine: number,
): StyleSearchResult | null {
  let bestStyleAttr: t.JSXAttribute | undefined
  let bestElement: t.JSXOpeningElement | undefined
  let bestDistance = Infinity

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node
      const startLine = node.loc?.start.line ?? 0
      const endLine = node.loc?.end.line ?? 0

      // Check distance from target line (element must be within ±5 lines)
      const distance = Math.min(
        Math.abs(startLine - targetLine),
        Math.abs(endLine - targetLine),
      )
      if (distance > 5) return

      // Check if this element has a style attribute
      const styleAttr = node.attributes.find(
        (attr): attr is t.JSXAttribute =>
          t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === 'style',
      )

      // Prefer elements with style attributes; among those, prefer closest
      if (styleAttr && distance < bestDistance) {
        bestStyleAttr = styleAttr
        bestElement = node
        bestDistance = distance
      } else if (!bestStyleAttr && distance < bestDistance) {
        bestElement = node
        bestDistance = distance
      }
    },
  })

  if (!bestStyleAttr && !bestElement) return null
  return { styleAttr: bestStyleAttr, element: bestElement }
}

/**
 * Modify an existing `style={{ ... }}` attribute using AST source positions.
 *
 * For each change:
 * 1. Find the Property node in the ObjectExpression matching the property name
 * 2. If found, replace its value using source positions
 * 3. If not found, insert before the closing `}}`
 */
function modifyStyleViaAST(
  content: string,
  styleAttr: t.JSXAttribute,
  changes: StyleChange[],
): string {
  // The style attribute value should be: JSXExpressionContainer > ObjectExpression
  const value = styleAttr.value
  if (!t.isJSXExpressionContainer(value)) return content

  const expr = value.expression
  if (!t.isObjectExpression(expr)) return content

  let result = content

  // Process changes in reverse order of position to maintain correct offsets
  const edits: Array<{ start: number; end: number; replacement: string }> = []

  for (const change of changes) {
    // Find existing property in the ObjectExpression
    const existingProp = expr.properties.find(
      (prop): prop is t.ObjectProperty =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === change.property,
    )

    if (existingProp && existingProp.value.start != null && existingProp.value.end != null) {
      // Replace the value portion only (preserves key and formatting)
      edits.push({
        start: existingProp.value.start,
        end: existingProp.value.end,
        replacement: `'${change.newValue}'`,
      })
    } else if (expr.end != null) {
      // Property not found — insert before closing brace of ObjectExpression
      // The ObjectExpression ends at `}` (inner brace of `}}`)
      const insertPos = expr.end - 1 // before the closing `}`

      // Check if there are existing properties to determine comma needs
      const hasProps = expr.properties.length > 0
      const prefix = hasProps ? ', ' : ' '
      edits.push({
        start: insertPos,
        end: insertPos,
        replacement: `${prefix}${change.property}: '${change.newValue}' `,
      })
    }
  }

  // Apply edits in reverse position order to maintain offsets
  edits.sort((a, b) => b.start - a.start)
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }

  return result
}

/**
 * Insert a new `style={{ ... }}` attribute on a JSX element.
 * Uses the AST's source positions to find where to insert.
 */
function insertStyleViaAST(
  content: string,
  element: t.JSXOpeningElement,
  changes: StyleChange[],
): string {
  const styleProps = changes
    .map((c) => `${c.property}: '${c.newValue}'`)
    .join(', ')
  const styleAttr = ` style={{ ${styleProps} }}`

  // Find the position just before the element's closing > or />
  const endPos = element.end
  if (endPos == null) return content

  // The element ends at `>` or `/>`. Insert style before that.
  const selfClosing = element.selfClosing
  const closingLen = selfClosing ? 2 : 1 // '/>' vs '>'
  const insertPos = endPos - closingLen

  return content.slice(0, insertPos) + styleAttr + content.slice(insertPos)
}

/**
 * Fallback: insert style prop using line-based logic when no AST element found.
 */
function insertStyleFallback(
  content: string,
  line: number,
  changes: StyleChange[],
): string {
  const lines = content.split('\n')
  const lineIdx = line - 1
  if (lineIdx < 0 || lineIdx >= lines.length) return content

  const targetLine = lines[lineIdx]!
  const styleProps = changes
    .map((c) => `${c.property}: '${c.newValue}'`)
    .join(', ')

  // Try to insert before closing > or />
  const closingMatch = targetLine.match(/(\/?>)\s*$/)
  if (closingMatch) {
    lines[lineIdx] = targetLine.replace(
      /(\/?>)\s*$/,
      ` style={{ ${styleProps} }}$1`,
    )
  } else {
    const indent = targetLine.match(/^(\s*)/)?.[1] ?? '  '
    lines.splice(lineIdx + 1, 0, `${indent}  style={{ ${styleProps} }}`)
  }

  return lines.join('\n')
}
