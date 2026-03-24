/**
 * C3: AST-based CSS Writer
 *
 * Modifies CSS files using PostCSS AST parsing for reliable, syntax-aware
 * edits. Replaces the previous line/brace regex approach which broke on
 * nested rules (@media, @supports), comments containing braces, and
 * string values with special characters.
 *
 * PostCSS handles all edge cases: nested rules, at-rules, multi-line
 * values, comments, and SCSS/Less syntax via its tolerant parser.
 *
 * For HTML/SFC files with embedded <style> blocks, the writer extracts
 * just the CSS content, parses it with PostCSS (adjusting line offsets),
 * then splices the modified CSS back into the full document.
 */

import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import postcss, { type Rule, type AtRule, type Container, type ChildNode } from 'postcss'
import { logger, type StyleChange } from '@vibelens/shared'

/** File extensions that embed CSS inside <style> blocks (not pure CSS files) */
const EMBEDDED_STYLE_EXTENSIONS = new Set(['.html', '.htm', '.vue', '.svelte', '.astro'])

/**
 * Represents an extracted <style> block from an HTML/SFC file.
 * Tracks the original position so we can splice modified CSS back.
 */
interface StyleBlock {
  /** The CSS content inside the <style> tag (excluding the tags themselves) */
  css: string
  /** 1-based line number of the <style> opening tag */
  startLine: number
  /** Character index where the CSS content begins (after the <style...> tag) */
  contentStart: number
  /** Character index where the CSS content ends (before </style>) */
  contentEnd: number
}

export interface CSSWriteResult {
  success: boolean
  originalContent: string
  modifiedContent: string
  diff: string
  error?: string
}

/**
 * Apply style changes to a CSS file at a specific line.
 * Uses PostCSS to parse the file into an AST, finds the rule containing
 * the target line, then modifies/adds declarations within that rule.
 *
 * For HTML/SFC files with embedded <style> blocks, extracts just the CSS
 * content, parses it with PostCSS (with adjusted line offsets), then
 * splices the modified CSS back into the full document.
 */
export async function writeCSSChanges(
  filePath: string,
  line: number,
  changes: StyleChange[],
  dryRun = false,
  selector?: string,
  elementClasses?: string[],
  elementTag?: string,
): Promise<CSSWriteResult> {
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
  const ext = extname(filePath).toLowerCase()
  const isEmbedded = EMBEDDED_STYLE_EXTENSIONS.has(ext)

  // For HTML/SFC files, extract the <style> block containing the target line
  let styleBlock: StyleBlock | null = null
  let cssContent: string
  let adjustedLine: number

  /** Whether the target line is in the HTML body (not inside a <style> block) */
  let lineInBody = false

  if (isEmbedded) {
    styleBlock = extractStyleBlock(content, line)
    if (!styleBlock) {
      return {
        success: false,
        originalContent,
        modifiedContent: originalContent,
        diff: '',
        error: `No <style> block found containing line ${line} in: ${filePath}`,
      }
    }
    cssContent = styleBlock.css
    // Check if the target line is actually inside this <style> block
    const blockEndLine = styleBlock.startLine + styleBlock.css.split('\n').length
    if (line >= styleBlock.startLine && line <= blockEndLine) {
      // Target line is inside the <style> block — use line-based matching.
      // The leading newline after <style> is stripped in extractStyleBlock(),
      // so PostCSS line 1 = first CSS line = file line (startLine + 1).
      // Therefore: postcssLine = fileLine - startLine
      adjustedLine = line - styleBlock.startLine
    } else {
      // Target line is in the HTML body — will use selector-based matching.
      // adjustedLine is unused in this path; set to 0 as a sentinel.
      adjustedLine = 0
      lineInBody = true
    }
  } else {
    cssContent = content
    adjustedLine = line
  }

  // Parse CSS into AST
  let root: postcss.Root
  try {
    root = postcss.parse(cssContent, { from: filePath })
  } catch {
    return {
      success: false,
      originalContent,
      modifiedContent: originalContent,
      diff: '',
      error: `Failed to parse CSS in: ${filePath}`,
    }
  }

  // Find the rule node — either by line (when target is in <style>) or by
  // selector matching (when target is in the HTML body).
  let targetRule: Rule | AtRule | null = null

  if (lineInBody) {
    // Extract class/id from the HTML element at the target line and search
    // the CSS AST for a matching rule. If the extension provided a selector
    // (e.g., ".btn-primary"), use it for direct matching first.
    // Pass change property names so the scorer can prefer rules that already
    // declare the property being modified (e.g., `.btn-primary` has `background`
    // → wins over `.btn` when the user is changing background-color).
    const lines = content.split('\n')
    const htmlLine = lines[line - 1] ?? '' // line is 1-based
    const changeProps = changes.map(c => camelToDash(c.property))
    logger.debug(`[css-writer] lineInBody=true, line=${line}, htmlLine="${htmlLine.trim()}"`)
    logger.debug(`[css-writer] selector="${selector}", changeProps=${JSON.stringify(changeProps)}`)
    logger.debug(`[css-writer] elementClasses=${JSON.stringify(elementClasses)}, elementTag=${elementTag}`)
    targetRule = findRuleBySelectorFromHTML(root, htmlLine, selector, changeProps, elementClasses, elementTag)
    if (targetRule && 'selector' in targetRule) {
      logger.debug(`[css-writer] → matched rule: "${(targetRule as Rule).selector}"`)
    }
  } else {
    logger.debug(`[css-writer] lineInBody=false, adjustedLine=${adjustedLine}`)
    targetRule = findRuleAtLine(root, adjustedLine)
    if (targetRule && 'selector' in targetRule) {
      logger.debug(`[css-writer] → matched rule: "${(targetRule as Rule).selector}"`)
    }
  }

  if (!targetRule) {
    const hint = lineInBody
      ? ` (target line ${line} is in the HTML body — no matching CSS selector found in <style>)`
      : ` (adjusted: ${adjustedLine})`
    return {
      success: false,
      originalContent,
      modifiedContent: originalContent,
      diff: '',
      error: `No CSS rule block found at line ${line}${hint}`,
    }
  }

  // Apply each change to the rule
  for (const change of changes) {
    const cssProperty = camelToDash(change.property)
    let found = false

    // Search for existing declaration with this property
    targetRule.walkDecls(cssProperty, (decl) => {
      if (!found) {
        decl.value = change.newValue
        found = true
      }
    })

    if (!found) {
      // Property not found — append a new declaration
      targetRule.append({ prop: cssProperty, value: change.newValue })
    }
  }

  const modifiedCSS = root.toString()
  let modifiedContent: string

  if (isEmbedded && styleBlock) {
    // Splice the modified CSS back into the full document
    modifiedContent =
      content.slice(0, styleBlock.contentStart) +
      modifiedCSS +
      content.slice(styleBlock.contentEnd)
  } else {
    modifiedContent = modifiedCSS
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

/* ─── Style Block Extraction (HTML/SFC) ─── */

/**
 * Extract the <style> block that contains the given line number from an
 * HTML/SFC file. Returns the CSS content, its position in the file, and
 * the 1-based line number of the opening <style> tag.
 *
 * Handles multiple <style> blocks — returns the one containing `targetLine`.
 * If the target line is not inside any <style> block, finds the first block
 * (since the grep resolver may report a line number from the class definition
 * in the HTML body rather than the style block itself).
 */
function extractStyleBlock(content: string, targetLine: number): StyleBlock | null {
  const blocks: StyleBlock[] = []

  // Find all <style...>...</style> blocks with their positions
  // Uses a simple state machine rather than regex to handle edge cases
  const lines = content.split('\n')
  let inStyle = false
  let currentBlockStartLine = 0
  let currentBlockContentStart = 0
  let charOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!
    const trimmed = lineText.trim()
    const lineStart = charOffset

    if (!inStyle && /^<style[\s>]/i.test(trimmed)) {
      inStyle = true
      currentBlockStartLine = i + 1 // 1-based line number of the <style> tag
      // Content starts after the closing '>' of the <style> tag.
      // Skip the trailing newline so PostCSS line 1 = first actual CSS line.
      const tagEndIdx = content.indexOf('>', lineStart)
      const afterTag = tagEndIdx !== -1 ? tagEndIdx + 1 : lineStart + lineText.length
      // If the character after '>' is a newline, skip it
      currentBlockContentStart = (content[afterTag] === '\n') ? afterTag + 1 : afterTag
    } else if (inStyle && /<\/style>/i.test(trimmed)) {
      // Content ends at the start of </style> tag (handles indented tags)
      const closeTagPos = lineText.indexOf('</style>')
      const contentEnd = lineStart + (closeTagPos !== -1 ? closeTagPos : 0)
      blocks.push({
        css: content.slice(currentBlockContentStart, contentEnd),
        startLine: currentBlockStartLine,
        contentStart: currentBlockContentStart,
        contentEnd: contentEnd,
      })
      inStyle = false
    }

    charOffset += lineText.length + 1 // +1 for the newline
  }

  if (blocks.length === 0) return null

  // Find the block that contains the target line
  for (const block of blocks) {
    const blockEndLine = block.startLine + block.css.split('\n').length
    if (targetLine >= block.startLine && targetLine <= blockEndLine) {
      return block
    }
  }

  // Target line not inside any <style> block — return the first block.
  // This handles the case where the grep resolver reports a line from the
  // HTML body (e.g., a class usage) rather than the <style> definition.
  return blocks[0]!
}

/* ─── AST Helpers ─── */

/**
 * Find the innermost CSS rule (Rule or AtRule with declarations)
 * whose source range contains the given line number.
 *
 * Walks the AST depth-first, preferring the most deeply nested match.
 * This correctly handles @media { .foo { ... } } — if `line` points
 * inside `.foo`, we return `.foo` not the outer `@media`.
 */
function findRuleAtLine(root: postcss.Root, line: number): Rule | AtRule | null {
  let bestMatch: Rule | AtRule | null = null

  root.walk((node: ChildNode) => {
    // Only consider Rules and AtRules (containers with declarations)
    if (node.type !== 'rule' && node.type !== 'atrule') return

    const start = node.source?.start?.line
    const end = node.source?.end?.line
    if (start == null || end == null) return

    if (line >= start && line <= end) {
      // For AtRules, only match if they contain declarations directly
      // (not just nested rules). Check if this container has declaration children.
      if (node.type === 'atrule') {
        const container = node as Container
        const hasDecls = container.some?.((child) => child.type === 'decl')
        const hasRules = container.some?.((child) => child.type === 'rule' || child.type === 'atrule')

        // If the AtRule has nested rules, prefer those (they'll match in a later iteration).
        // Only use the AtRule directly if it has declarations but no nested rules.
        if (hasRules && !hasDecls) return
      }

      // Prefer the most deeply nested match (later walk = deeper node)
      bestMatch = node as Rule | AtRule
    }
  })

  return bestMatch
}

/**
 * Find a CSS rule whose selector matches classes or id extracted from an HTML
 * element line. Used when the source resolver reports a line in the HTML body
 * rather than inside a <style> block.
 *
 * Three-tier strategy:
 * 1. Direct selector match — if the extension provided a CSS selector (e.g.,
 *    ".btn-primary"), try to match it directly against CSS rule selectors.
 * 2. HTML class/id extraction — parse class="..." and id="..." from the HTML
 *    line, score CSS rules by how many tokens match (word-boundary aware).
 * 3. Tag name fallback — 1 point for matching the HTML tag name.
 *
 * Word-boundary matching prevents `.btn` from falsely matching `.btn-primary`,
 * `.btn-secondary`, etc. Uses a negative lookahead for CSS identifier
 * continuation characters: [a-zA-Z0-9_-].
 */
function findRuleBySelectorFromHTML(
  root: postcss.Root,
  htmlLine: string,
  providedSelector?: string,
  changeProperties?: string[],
  elementClasses?: string[],
  elementTag?: string,
): Rule | AtRule | null {
  // --- Strategy 1: Direct selector match (most reliable) ---
  // If the extension provided a CSS selector, try to find a CSS rule that
  // matches it directly. This avoids all heuristics and is the most accurate.
  if (providedSelector) {
    const directMatch = findRuleByDirectSelector(root, providedSelector)
    if (directMatch) return directMatch
  }

  // --- Strategy 2: Extract class/id from HTML and score CSS rules ---
  // Prefer elementClasses from the extension (the actual selected element's classes)
  // over extracting from htmlLine (which may be an ancestor's line due to grep
  // resolver returning the ancestor that matched the selector's data-testid/id).
  let classes: string[]
  let id: string

  if (elementClasses && elementClasses.length > 0) {
    // Use the actual selected element's classes — most reliable
    classes = elementClasses
    // Extract id from the provided selector if available
    const selectorIdMatch = providedSelector?.match(/#([a-zA-Z_][\w-]*)/)
    id = selectorIdMatch ? selectorIdMatch[1]! : ''
    logger.debug(`[css-writer] Using elementClasses for scoring: ${JSON.stringify(classes)}`)
  } else {
    // Fallback: extract from HTML line (legacy behavior)
    const classMatch = htmlLine.match(/class\s*=\s*"([^"]*)"/)
    classes = classMatch
      ? classMatch[1]!.split(/\s+/).filter(Boolean)
      : []
    const idMatch = htmlLine.match(/id\s*=\s*"([^"]*)"/)
    id = idMatch ? idMatch[1]! : ''
  }

  if (classes.length === 0 && !id) return null

  // Pre-compute the CSS property base names being changed — used for
  // tie-breaking. E.g. ['background-color'] → base prefixes ['background'].
  const changeBases = (changeProperties ?? []).map(p => p.split('-')[0]!)

  let bestRule: Rule | null = null
  let bestScore = 0

  root.walk((node: ChildNode) => {
    if (node.type !== 'rule') return
    const rule = node as Rule
    const sel = rule.selector

    let score = 0

    // Check id match — worth 100 points (word-boundary aware)
    if (id && selectorContainsId(sel, id)) {
      score += 100
    }

    // Check class matches — 10 points each (word-boundary aware)
    // Uses negative lookahead to prevent `.btn` matching inside `.btn-primary`
    for (const cls of classes) {
      if (selectorContainsClass(sel, cls)) {
        score += 10
      }
    }

    // Check tag name match (e.g., "button" in the selector) — 1 point
    // Prefer elementTag from extension over parsing the HTML line (which may be wrong)
    const tag = elementTag || htmlLine.match(/^\s*<(\w+)/)?.[1]
    if (tag && new RegExp(`(?:^|[\\s,>+~])${tag}(?:[.#:\\[\\s,{]|$)`).test(sel)) {
      score += 1
    }

    // --- Tie-breaking bonuses (only applied when base score > 0) ---
    if (score > 0) {
      // Property match bonus (+5): prefer rules that already declare the
      // property being changed (or a shorthand covering it).
      // E.g., `.btn-primary { background: ... }` gets +5 when changing
      // `background-color`, because `background` is a shorthand for it.
      if (changeBases.length > 0) {
        let hasPropertyMatch = false
        rule.walkDecls((decl) => {
          if (hasPropertyMatch) return
          const declBase = decl.prop.split('-')[0]!
          for (const base of changeBases) {
            if (decl.prop === base || declBase === base) {
              hasPropertyMatch = true
              return
            }
          }
          // Also check exact long-form match
          for (const prop of changeProperties!) {
            if (decl.prop === prop) {
              hasPropertyMatch = true
              return
            }
          }
        })
        if (hasPropertyMatch) score += 5
      }

      // Pseudo-selector penalty (-2): prefer base selectors over pseudo-
      // class/element variants (e.g., `.btn-primary` over `.btn-primary:hover`).
      if (/:[a-zA-Z]/.test(sel)) {
        score -= 2
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestRule = rule
    }
  })

  return bestRule
}

/**
 * Try to find a CSS rule by directly matching a provided selector string.
 * Extracts class and id tokens from the selector and matches them against
 * CSS rules in the AST. Prefers exact selector match, then scored matching.
 */
function findRuleByDirectSelector(root: postcss.Root, selector: string): Rule | null {
  // Extract class tokens: ".btn-primary" → ['btn-primary']
  const selectorClasses = [...selector.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g)].map(m => m[1]!)
  // Extract id tokens: "#cta-button" → ['cta-button']
  const selectorIds = [...selector.matchAll(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/g)].map(m => m[1]!)

  if (selectorClasses.length === 0 && selectorIds.length === 0) return null

  let bestRule: Rule | null = null
  let bestScore = 0

  root.walk((node: ChildNode) => {
    if (node.type !== 'rule') return
    const rule = node as Rule
    const ruleSelector = rule.selector

    // Exact selector match (e.g., provided ".btn-primary" === rule ".btn-primary")
    if (ruleSelector.trim() === selector.trim()) {
      bestRule = rule
      bestScore = Infinity
      return
    }

    let score = 0
    for (const id of selectorIds) {
      if (selectorContainsId(ruleSelector, id)) score += 100
    }
    for (const cls of selectorClasses) {
      if (selectorContainsClass(ruleSelector, cls)) score += 10
    }

    if (score > bestScore) {
      bestScore = score
      bestRule = rule
    }
  })

  return bestRule
}

/** Escape regex special characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if a CSS selector contains a class token with word-boundary awareness.
 * `.btn` should NOT match inside `.btn-primary` — the hyphen is a valid CSS
 * identifier character that continues the token.
 */
function selectorContainsClass(selector: string, className: string): boolean {
  return new RegExp(`\\.${escapeRegex(className)}(?![a-zA-Z0-9_-])`).test(selector)
}

/**
 * Check if a CSS selector contains an id token with word-boundary awareness.
 * `#cta` should NOT match inside `#cta-button`.
 */
function selectorContainsId(selector: string, idName: string): boolean {
  return new RegExp(`#${escapeRegex(idName)}(?![a-zA-Z0-9_-])`).test(selector)
}

/** Convert camelCase to dash-case (e.g. backgroundColor → background-color) */
function camelToDash(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * Generate a minimal unified diff for preview.
 *
 * Uses a patience-style LCS (Longest Common Subsequence) diff to correctly
 * handle insertions, deletions, and modifications. The previous naive
 * implementation advanced both file pointers in lockstep, so inserting a
 * single line caused every subsequent line to appear "changed" (cascading
 * line-shift artifact).
 *
 * Algorithm:
 *  1. Compute an edit script via LCS of the two line arrays.
 *  2. Walk the edit script and group consecutive changes into hunks.
 *  3. Output unified diff format with 3 lines of context per hunk.
 */
export function generateUnifiedDiff(
  filePath: string,
  original: string,
  modified: string,
): string {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')

  // ── Step 1: Compute LCS-based edit script ──
  // Each entry is 'equal', 'delete' (from original), or 'insert' (into modified).
  const edits = computeEditScript(origLines, modLines)
  if (edits.every(e => e.type === 'equal')) return '' // no changes

  // ── Step 2: Group edits into hunks with context ──
  const CONTEXT = 3
  const hunks = groupIntoHunks(edits, CONTEXT)
  if (hunks.length === 0) return ''

  // ── Step 3: Format as unified diff ──
  const diffLines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`]

  for (const hunk of hunks) {
    const origStart = hunk.origStart + 1 // 1-based
    const modStart = hunk.modStart + 1
    diffLines.push(`@@ -${origStart},${hunk.origCount} +${modStart},${hunk.modCount} @@`)
    for (const line of hunk.lines) {
      diffLines.push(line)
    }
  }

  return diffLines.join('\n')
}

/* ─── LCS-based Edit Script ─── */

interface EditEntry {
  type: 'equal' | 'delete' | 'insert'
  /** Line content */
  text: string
  /** 0-based index in original (for 'equal' and 'delete') */
  origIdx: number
  /** 0-based index in modified (for 'equal' and 'insert') */
  modIdx: number
}

/**
 * Compute an edit script between two line arrays using an optimised LCS.
 * For large files, uses a bounded search window to keep it O(N·D) where D
 * is the number of differences — typically very small for CSS edits.
 */
function computeEditScript(a: string[], b: string[]): EditEntry[] {
  const n = a.length
  const m = b.length

  // Shortcut: if one side is empty
  if (n === 0) {
    return b.map((text, idx) => ({ type: 'insert' as const, text, origIdx: 0, modIdx: idx }))
  }
  if (m === 0) {
    return a.map((text, idx) => ({ type: 'delete' as const, text, origIdx: idx, modIdx: 0 }))
  }

  // Compute LCS table — use a space-optimised approach for typical CSS files.
  // For very large files (>5000 lines), fall back to a line-map heuristic.
  const lcs = computeLCS(a, b)

  // Build edit script from LCS
  const edits: EditEntry[] = []
  let ai = 0
  let bi = 0
  let li = 0

  while (ai < n || bi < m) {
    if (li < lcs.length && ai === lcs[li]![0] && bi === lcs[li]![1]) {
      edits.push({ type: 'equal', text: a[ai]!, origIdx: ai, modIdx: bi })
      ai++
      bi++
      li++
    } else if (li < lcs.length) {
      // Emit deletes/inserts until we reach the next LCS pair
      while (ai < lcs[li]![0]) {
        edits.push({ type: 'delete', text: a[ai]!, origIdx: ai, modIdx: bi })
        ai++
      }
      while (bi < lcs[li]![1]) {
        edits.push({ type: 'insert', text: b[bi]!, origIdx: ai, modIdx: bi })
        bi++
      }
    } else {
      // Past the end of LCS — remaining lines are deletes/inserts
      while (ai < n) {
        edits.push({ type: 'delete', text: a[ai]!, origIdx: ai, modIdx: bi })
        ai++
      }
      while (bi < m) {
        edits.push({ type: 'insert', text: b[bi]!, origIdx: ai, modIdx: bi })
        bi++
      }
    }
  }

  return edits
}

/**
 * Compute LCS pairs as [origIdx, modIdx] tuples.
 * Uses standard DP for files up to ~2000 lines; for larger files uses
 * a hash-bucketed O(N·D) approach via line equality maps.
 */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length

  // For files that would create a huge DP table (> ~4M cells),
  // use a hash-map approach to find common line positions.
  if (n * m > 4_000_000) {
    return computeLCSHashed(a, b)
  }

  // Standard DP
  // dp[i][j] = length of LCS of a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // Backtrack to find the actual LCS pairs
  const pairs: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--
    } else {
      j--
    }
  }

  return pairs.reverse()
}

/**
 * Hash-bucketed LCS for large files. Groups lines by content hash,
 * then greedily matches common lines in order. Not optimal LCS but
 * produces clean diffs for typical CSS modifications.
 */
function computeLCSHashed(a: string[], b: string[]): [number, number][] {
  // Build a map of line content → list of indices in b
  const bMap = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const line = b[j]!
    let indices = bMap.get(line)
    if (!indices) {
      indices = []
      bMap.set(line, indices)
    }
    indices.push(j)
  }

  // For each line in a, find the earliest unused match in b
  const pairs: [number, number][] = []
  let lastJ = -1

  for (let i = 0; i < a.length; i++) {
    const candidates = bMap.get(a[i]!)
    if (!candidates) continue

    // Find the smallest j in candidates that is > lastJ (binary search)
    let lo = 0
    let hi = candidates.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (candidates[mid]! <= lastJ) lo = mid + 1
      else hi = mid
    }

    if (lo < candidates.length) {
      lastJ = candidates[lo]!
      pairs.push([i, lastJ])
    }
  }

  return pairs
}

/* ─── Hunk Grouping ─── */

interface DiffHunk {
  origStart: number
  origCount: number
  modStart: number
  modCount: number
  lines: string[]
}

/**
 * Group an edit script into unified diff hunks with `context` lines
 * of surrounding equal lines. Adjacent hunks closer than `context * 2`
 * lines are merged into one.
 */
function groupIntoHunks(edits: EditEntry[], context: number): DiffHunk[] {
  // Find ranges of non-equal edits
  const changeRanges: { start: number; end: number }[] = []
  let inChange = false
  let rangeStart = 0

  for (let i = 0; i < edits.length; i++) {
    if (edits[i]!.type !== 'equal') {
      if (!inChange) {
        rangeStart = i
        inChange = true
      }
    } else if (inChange) {
      changeRanges.push({ start: rangeStart, end: i })
      inChange = false
    }
  }
  if (inChange) {
    changeRanges.push({ start: rangeStart, end: edits.length })
  }

  if (changeRanges.length === 0) return []

  // Merge nearby ranges (within 2*context of each other)
  const merged: { start: number; end: number }[] = [changeRanges[0]!]
  for (let i = 1; i < changeRanges.length; i++) {
    const prev = merged[merged.length - 1]!
    const curr = changeRanges[i]!
    if (curr.start - prev.end <= context * 2) {
      prev.end = curr.end
    } else {
      merged.push({ ...curr })
    }
  }

  // Build hunks with context
  const hunks: DiffHunk[] = []

  for (const range of merged) {
    const hunkStart = Math.max(0, range.start - context)
    const hunkEnd = Math.min(edits.length, range.end + context)
    const lines: string[] = []

    let origCount = 0
    let modCount = 0
    let origStart = -1
    let modStart = -1

    for (let i = hunkStart; i < hunkEnd; i++) {
      const edit = edits[i]!
      if (origStart === -1 && (edit.type === 'equal' || edit.type === 'delete')) {
        origStart = edit.origIdx
      }
      if (modStart === -1 && (edit.type === 'equal' || edit.type === 'insert')) {
        modStart = edit.modIdx
      }

      switch (edit.type) {
        case 'equal':
          lines.push(` ${edit.text}`)
          origCount++
          modCount++
          break
        case 'delete':
          lines.push(`-${edit.text}`)
          origCount++
          break
        case 'insert':
          lines.push(`+${edit.text}`)
          modCount++
          break
      }
    }

    // Fallback for origStart/modStart if hunk starts with insert or delete only
    if (origStart === -1) origStart = 0
    if (modStart === -1) modStart = 0

    hunks.push({ origStart, origCount, modStart, modCount, lines })
  }

  return hunks
}
