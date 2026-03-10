import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { detectFramework } from '../server/detect.js'

// We test detectFramework with a mock filesystem
vi.mock('fs', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

const { existsSync, readFileSync } = await import('fs')

describe('detectFramework', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('{}')
  })

  it('detects Next.js from next.config.js', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path) === join('/project', 'next.config.js')
    })

    expect(detectFramework('/project')).toBe('nextjs')
  })

  it('detects Svelte from svelte.config.js', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path) === join('/project', 'svelte.config.js')
    })

    expect(detectFramework('/project')).toBe('svelte')
  })

  it('detects Vite from vite.config.ts', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path) === join('/project', 'vite.config.ts')
    })

    expect(detectFramework('/project')).toBe('vite')
  })

  it('detects React from package.json dependencies', () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path) === join('/project', 'package.json')
    })
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } }),
    )

    expect(detectFramework('/project')).toBe('react')
  })

  it('returns null when no framework detected', () => {
    expect(detectFramework('/empty-project')).toBeNull()
  })
})
