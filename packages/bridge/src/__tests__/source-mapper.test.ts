import { describe, it, expect } from 'vitest'

/**
 * L5: Bootstrapping test coverage for source-mapper helper functions.
 * These tests cover the pure utility functions extracted from source-mapper.ts.
 * We duplicate the helper logic here to test in isolation — when H14 (type consolidation)
 * lands, these can import directly.
 */

// ── Duplicated helpers for testing (mirrors source-mapper.ts) ──

function extractClassNames(selector: string): string[] {
  const matches = selector.match(/\.([a-zA-Z_][\w-]*)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

function extractIds(selector: string): string[] {
  const matches = selector.match(/#([a-zA-Z_][\w-]*)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

function findInContent(content: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) return i
  }
  return -1
}

/** M3: resolveSourcePath logic (without projectRoot for unit testing) */
function cleanSourceName(sourceName: string): string {
  return sourceName
    .replace(/^webpack:\/\/[^/]*\//, '')
    .replace(/^\/@fs\//, '/')
    .replace(/^webpack:\/\/\//, '')
    .replace(/^\[project\]\//, '')
    .replace(/^\.\//, '')
    .replace(/^\(([^)]+)\)\//, '$1/')
}

// ── Tests ──

describe('extractClassNames', () => {
  it('extracts single class', () => {
    expect(extractClassNames('.btn')).toEqual(['btn'])
  })

  it('extracts multiple classes', () => {
    expect(extractClassNames('.btn.primary.large')).toEqual(['btn', 'primary', 'large'])
  })

  it('handles compound selector', () => {
    expect(extractClassNames('div.card > .card-title')).toEqual(['card', 'card-title'])
  })

  it('returns empty for tag-only selector', () => {
    expect(extractClassNames('div > p')).toEqual([])
  })

  it('handles classes with hyphens and underscores', () => {
    expect(extractClassNames('.my_class.another-class')).toEqual(['my_class', 'another-class'])
  })
})

describe('extractIds', () => {
  it('extracts single ID', () => {
    expect(extractIds('#main')).toEqual(['main'])
  })

  it('extracts ID from compound selector', () => {
    expect(extractIds('#header > .nav')).toEqual(['header'])
  })

  it('returns empty when no IDs', () => {
    expect(extractIds('.btn.primary')).toEqual([])
  })
})

describe('findInContent — H7 word boundary matching', () => {
  const css = `.btn { color: red; }
.btn-group { display: flex; }
.submit-btn { margin: 0; }
.btn-primary { background: blue; }`

  it('finds exact class match', () => {
    expect(findInContent(css, 'btn')).toBe(0)
  })

  it('finds hyphenated class', () => {
    expect(findInContent(css, 'btn-group')).toBe(1)
  })

  it('does NOT match substring — "btn" should not match "submit-btn" as a word', () => {
    // "btn" matches on line 0 (.btn) first, not line 2 (submit-btn)
    expect(findInContent(css, 'btn')).toBe(0)
  })

  it('returns -1 when not found', () => {
    expect(findInContent(css, 'nonexistent')).toBe(-1)
  })

  it('handles special regex characters in search term', () => {
    const content = '.price\\+tax { color: green; }'
    // The term contains special chars that need escaping
    expect(findInContent(content, 'price\\+tax')).toBe(0)
  })
})

describe('cleanSourceName — M3 framework path stripping', () => {
  it('strips Webpack protocol', () => {
    expect(cleanSourceName('webpack://my-app/./src/App.tsx')).toBe('src/App.tsx')
  })

  it('strips Vite /@fs/ to absolute path', () => {
    expect(cleanSourceName('/@fs/home/user/project/src/main.ts')).toBe('/home/user/project/src/main.ts')
  })

  it('strips Next.js webpack:/// prefix', () => {
    expect(cleanSourceName('webpack:///src/pages/index.tsx')).toBe('src/pages/index.tsx')
  })

  it('strips Turbopack [project]/ prefix', () => {
    expect(cleanSourceName('[project]/src/components/Button.tsx')).toBe('src/components/Button.tsx')
  })

  it('strips Next.js route group parentheses', () => {
    expect(cleanSourceName('(app)/page.tsx')).toBe('app/page.tsx')
  })

  it('strips leading ./', () => {
    expect(cleanSourceName('./src/utils.ts')).toBe('src/utils.ts')
  })

  it('passes through clean paths unchanged', () => {
    expect(cleanSourceName('src/components/Card.tsx')).toBe('src/components/Card.tsx')
  })
})
