/**
 * Source Resolver — Orchestrator
 *
 * Resolves CSS selectors to source file locations using multiple strategies:
 * 1. Source maps (fast, high confidence)
 * 2. Grep-based search (fallback, lower confidence)
 *
 * Results include file path, line number, and confidence score.
 */

import { SourceMapper } from './source-mapper.js'
import { GrepResolver } from './grep-resolver.js'
import type { FrameworkType } from '@vibelens/shared'

export interface ResolveRequest {
  selector: string
  computedStyles: Record<string, string>
  url: string
}

export interface ResolveResult {
  filePath: string | null
  line: number | null
  column: number | null
  confidence: number
  framework: FrameworkType | null
}

export class SourceResolver {
  private sourceMapper: SourceMapper
  private grepResolver: GrepResolver
  private initialized = false

  constructor(
    projectRoot: string,
    private framework: FrameworkType | null = null,
  ) {
    this.sourceMapper = new SourceMapper(projectRoot)
    this.grepResolver = new GrepResolver(projectRoot)
  }

  /**
   * Initialize source maps (call once on bridge start).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.sourceMapper.initialize()
    this.initialized = true
  }

  /**
   * Resolve a selector to its source file.
   */
  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    // Ensure source maps are loaded
    await this.initialize()

    const empty: ResolveResult = {
      filePath: null,
      line: null,
      column: null,
      confidence: 0,
      framework: this.framework,
    }

    // Strategy 1: Source maps
    const mapResult = this.sourceMapper.resolveSelector(request.selector)
    if (mapResult && mapResult.confidence >= 0.5) {
      return {
        filePath: mapResult.filePath,
        line: mapResult.line,
        column: mapResult.column,
        confidence: mapResult.confidence,
        framework: this.framework,
      }
    }

    // Strategy 2: Grep fallback
    const grepResult = await this.grepResolver.resolve(
      request.selector,
      request.computedStyles,
    )
    if (grepResult) {
      return {
        filePath: grepResult.filePath,
        line: grepResult.line,
        column: grepResult.column,
        confidence: grepResult.confidence,
        framework: this.framework,
      }
    }

    return empty
  }

  /**
   * Invalidate cached source maps (call when build output changes).
   */
  invalidate(): void {
    this.sourceMapper.invalidate()
    this.initialized = false
  }
}

export { SourceMapper } from './source-mapper.js'
export { GrepResolver } from './grep-resolver.js'
export type { SourceLocation } from './source-mapper.js'
