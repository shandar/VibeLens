/**
 * Source Map Resolver
 *
 * Parses `.map` files from the dev server build output to trace
 * CSS selectors back to their original source files.
 */

import { readFile, readdir } from 'fs/promises'
import { join, extname } from 'path'
import { SourceMapConsumer } from 'source-map-js'

export interface SourceLocation {
  filePath: string
  line: number
  column: number
  confidence: number
}

interface MapEntry {
  /** Absolute path to the .map file */
  mapPath: string
  /** The parsed source map consumer */
  consumer: SourceMapConsumer
  /** Generated file name (e.g. index-abc123.css) */
  generatedFile: string
}

/**
 * M4: max number of cached source maps before LRU eviction kicks in.
 * Each consumer can hold significant memory for large bundles.
 */
const MAX_CACHED_MAPS = 50

/**
 * Scans the project's build output for .map files and caches parsed consumers.
 */
export class SourceMapper {
  private maps: MapEntry[] = []
  private initialized = false

  constructor(private projectRoot: string) {}

  /**
   * Scan common build output dirs for source maps.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const buildDirs = [
      'dist', 'build', '.next/static', '.nuxt/dist',
      'node_modules/.vite/deps', '.svelte-kit/output',
    ]

    for (const dir of buildDirs) {
      const fullDir = join(this.projectRoot, dir)
      try {
        await this.scanDir(fullDir)
      } catch {
        // Directory doesn't exist — skip
      }
    }

    this.initialized = true
  }

  private async scanDir(dir: string, depth = 0): Promise<void> {
    if (depth > 4) return // Don't recurse too deep

    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.scanDir(fullPath, depth + 1)
          continue
        }

        if (entry.isFile() && extname(entry.name) === '.map') {
          await this.loadMap(fullPath)
        }
      }
    } catch {
      // Permission denied or doesn't exist
    }
  }

  private async loadMap(mapPath: string): Promise<void> {
    try {
      const raw = await readFile(mapPath, 'utf-8')
      const rawMap = JSON.parse(raw)
      const consumer = new SourceMapConsumer(rawMap)

      // M4: LRU eviction — drop oldest entries when cache is full
      while (this.maps.length >= MAX_CACHED_MAPS) {
        this.maps.shift() // remove least-recently-added
      }

      this.maps.push({
        mapPath,
        consumer,
        generatedFile: rawMap.file ?? mapPath.replace(/\.map$/, ''),
      })
    } catch {
      // Invalid map file — skip
    }
  }

  /**
   * Try to resolve a CSS class name or selector fragment to a source location.
   * Returns null if no match found.
   */
  resolveSelector(selector: string): SourceLocation | null {
    // Extract class names and IDs from the selector
    const classNames = extractClassNames(selector)
    const ids = extractIds(selector)

    for (let mi = 0; mi < this.maps.length; mi++) {
      const map = this.maps[mi]!
      // Search source content for class name references
      const sources = (map.consumer as unknown as { sources: string[] }).sources ?? []

      for (const sourceName of sources) {
        const content = map.consumer.sourceContentFor(sourceName, true)
        if (!content) continue

        // Look for class names in source content
        for (const className of classNames) {
          const lineIndex = findInContent(content, className)
          if (lineIndex >= 0) {
            // M4: promote to end for LRU freshness
            this.maps.splice(mi, 1)
            this.maps.push(map)
            return {
              filePath: this.resolveSourcePath(sourceName),
              line: lineIndex + 1,
              column: 0,
              confidence: 0.7,
            }
          }
        }

        // Look for IDs
        for (const id of ids) {
          const lineIndex = findInContent(content, id)
          if (lineIndex >= 0) {
            // M4: promote to end for LRU freshness
            this.maps.splice(mi, 1)
            this.maps.push(map)
            return {
              filePath: this.resolveSourcePath(sourceName),
              line: lineIndex + 1,
              column: 0,
              confidence: 0.8,
            }
          }
        }
      }
    }

    return null
  }

  private resolveSourcePath(sourceName: string): string {
    // M3: Source names in maps use framework-specific protocols.
    // Strip all known prefixes to recover the relative project path.
    const cleaned = sourceName
      // Webpack: webpack://app-name/./src/file.tsx
      .replace(/^webpack:\/\/[^/]*\//, '')
      // Vite: /@fs/absolute/path  →  use absolute as-is if starts with /
      .replace(/^\/@fs\//, '/')
      // Next.js (Webpack): webpack:///(app)/page.tsx
      .replace(/^webpack:\/\/\//, '')
      // Turbopack: [project]/src/file.tsx
      .replace(/^\[project\]\//, '')
      // Clean leading ./ or bare relative
      .replace(/^\.\/?/, '')
      // Next.js route groups: (app)/ → app/
      .replace(/^\(([^)]+)\)\//, '$1/')

    // If Vite /@fs/ produced an absolute path, return it directly
    if (cleaned.startsWith('/')) {
      return cleaned
    }

    return join(this.projectRoot, cleaned)
  }

  /**
   * Clear cached maps (call when build output changes).
   */
  invalidate(): void {
    this.maps = []
    this.initialized = false
  }
}

/* ─── Helpers ─── */

function extractClassNames(selector: string): string[] {
  const matches = selector.match(/\.([a-zA-Z_][\w-]*)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

function extractIds(selector: string): string[] {
  const matches = selector.match(/#([a-zA-Z_][\w-]*)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

/**
 * H7: word-boundary matching to prevent substring false positives.
 * e.g. searching for "btn" should NOT match "submit-btn-group" as a class definition.
 * We escape the term for regex safety and use \b word boundaries.
 */
function findInContent(content: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) return i
  }
  return -1
}
