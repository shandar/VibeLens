/**
 * Grep-based Source Resolver (Fallback)
 *
 * When source maps are unavailable, searches project files
 * for class names, IDs, and element patterns from CSS selectors.
 * Assigns confidence scores based on match quality.
 */

import { readFile, readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import type { SourceLocation } from './source-mapper.js'

/**
 * File extensions we search through for CSS selector definitions / usage.
 *
 * Excludes plain `.ts` and `.js` files — they rarely define CSS selectors and
 * frequently contain selector strings in comments or test fixtures, causing
 * false-positive matches that override the correct HTML/CSS source file.
 *
 * `.tsx` and `.jsx` ARE included because they contain JSX templates where
 * class names and ids are applied to elements (e.g., `<div id="cta-button">`).
 */
const SEARCHABLE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte',
  '.css', '.scss', '.less',
  '.html', '.htm', '.astro',
])

/** Directories to skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '.nuxt', '.svelte-kit', 'coverage', '.vibelens',
])

interface FileMatch {
  filePath: string
  line: number
  matchType: 'className' | 'id' | 'dataTestId' | 'tagPattern'
  confidence: number
}

export class GrepResolver {
  constructor(private projectRoot: string) {}

  /**
   * Search the project for files that likely define the given selector.
   */
  async resolve(
    selector: string,
    _computedStyles?: Record<string, string>,
  ): Promise<SourceLocation | null> {
    const searchTerms = this.extractSearchTerms(selector)
    if (searchTerms.length === 0) return null

    const matches: FileMatch[] = []
    await this.searchDir(this.projectRoot, searchTerms, matches)

    if (matches.length === 0) return null

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence)

    const best = matches[0]!
    return {
      filePath: best.filePath,
      line: best.line,
      column: 0,
      confidence: best.confidence,
    }
  }

  private extractSearchTerms(
    selector: string,
  ): Array<{ term: string; type: FileMatch['matchType']; baseConfidence: number }> {
    const terms: Array<{ term: string; type: FileMatch['matchType']; baseConfidence: number }> = []

    // data-testid (highest confidence)
    const testIdMatch = selector.match(/\[data-testid="([^"]+)"\]/)
    if (testIdMatch) {
      terms.push({ term: testIdMatch[1]!, type: 'dataTestId', baseConfidence: 0.9 })
    }

    // IDs
    const idMatches = selector.match(/#([a-zA-Z_][\w-]*)/g)
    if (idMatches) {
      for (const m of idMatches) {
        terms.push({ term: m.slice(1), type: 'id', baseConfidence: 0.85 })
      }
    }

    // Class names (filter out common utility classes)
    const classMatches = selector.match(/\.([a-zA-Z_][\w-]*)/g)
    if (classMatches) {
      for (const m of classMatches) {
        const name = m.slice(1)
        // Skip short utility classes (likely Tailwind)
        if (name.length <= 3) continue
        // Skip common framework-generated hashes
        if (/^[a-z]+_[a-f0-9]+$/i.test(name)) continue
        terms.push({ term: name, type: 'className', baseConfidence: 0.6 })
      }
    }

    return terms
  }

  private async searchDir(
    dir: string,
    terms: Array<{ term: string; type: FileMatch['matchType']; baseConfidence: number }>,
    results: FileMatch[],
    depth = 0,
  ): Promise<void> {
    // H8: increased match limit from 10 to 20 for better disambiguation
    if (depth > 6 || results.length >= 20) return

    try {
      // H8: sort entries lexicographically for deterministic traversal across OSes
      const entries = (await readdir(dir, { withFileTypes: true }))
        .sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        if (results.length >= 20) break

        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
          await this.searchDir(fullPath, terms, results, depth + 1)
          continue
        }

        if (!entry.isFile()) continue

        const ext = extname(entry.name)
        if (!SEARCHABLE_EXTENSIONS.has(ext)) continue

        // Skip very large files
        try {
          const info = await stat(fullPath)
          if (info.size > 500_000) continue // 500KB limit
        } catch {
          continue
        }

        try {
          const content = await readFile(fullPath, 'utf-8')
          const lines = content.split('\n')

          for (const { term, type, baseConfidence } of terms) {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i]!.includes(term)) {
                // Boost confidence for JSX/template files
                const isComponent = /\.(tsx|jsx|vue|svelte|astro)$/.test(ext)
                const boost = isComponent ? 0.05 : 0

                results.push({
                  filePath: fullPath,
                  line: i + 1,
                  matchType: type,
                  confidence: Math.min(baseConfidence + boost, 0.95),
                })
                break // Only first match per file per term
              }
            }
          }
        } catch {
          // Can't read file — skip
        }
      }
    } catch {
      // Permission or access error
    }
  }
}
