import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeCSSChanges } from '../writer/css-writer.js'
import { writeJSXStyleChanges } from '../writer/jsx-writer.js'
import { writeTailwindChanges } from '../writer/tailwind-writer.js'

/**
 * H12: Writer snapshot tests — verifies that each writer correctly
 * transforms input files into expected output. Uses dryRun=true so
 * we test transformation logic without file system side effects.
 *
 * Strategy: write a temp file with known content, run the writer in
 * dryRun mode, assert modifiedContent matches expected output.
 */

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(tmpdir(), `vibelens-test-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

/** Write a temp file and return its path */
async function writeTmp(name: string, content: string): Promise<string> {
  const p = join(tmpDir, name)
  await writeFile(p, content, 'utf-8')
  return p
}

// ─── CSS Writer ──────────────────────────────────────────────

describe('writeCSSChanges', () => {
  it('replaces an existing property value', async () => {
    const css = `.btn {\n  color: red;\n  padding: 8px;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 2, [
      { property: 'color', originalValue: 'red', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('color: blue;')
    expect(result.modifiedContent).not.toContain('color: red;')
    // Other properties unchanged
    expect(result.modifiedContent).toContain('padding: 8px;')
  })

  it('appends a new property when not found', async () => {
    const css = `.card {\n  margin: 0;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 2, [
      { property: 'borderRadius', originalValue: '', newValue: '8px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('border-radius: 8px;')
    // camelCase converted to dash-case
    expect(result.modifiedContent).not.toContain('borderRadius')
  })

  it('handles multiple changes in one call', async () => {
    const css = `.header {\n  color: black;\n  font-size: 16px;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 2, [
      { property: 'color', originalValue: 'black', newValue: '#333' },
      { property: 'fontSize', originalValue: '16px', newValue: '18px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('color: #333;')
    expect(result.modifiedContent).toContain('font-size: 18px;')
  })

  it('fails gracefully when line is outside any rule block', async () => {
    const css = `/* comment line */\n.btn {\n  color: red;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 1, [
      { property: 'color', originalValue: '', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no css rule block/i)
  })

  it('fails gracefully for missing file', async () => {
    const result = await writeCSSChanges('/nonexistent/path.css', 1, [
      { property: 'color', originalValue: '', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cannot read file/i)
  })

  it('does not write to disk in dryRun mode', async () => {
    const css = `.x {\n  color: red;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 2, [
      { property: 'color', originalValue: 'red', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(true)
    // File on disk should be unchanged
    const { readFile: rf } = await import('fs/promises')
    const ondisk = await rf(file, 'utf-8')
    expect(ondisk).toBe(css)
  })

  it('generates a non-empty diff for modifications', async () => {
    const css = `.box {\n  width: 100px;\n}\n`
    const file = await writeTmp('test.css', css)

    const result = await writeCSSChanges(file, 2, [
      { property: 'width', originalValue: '100px', newValue: '200px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.diff).toBeTruthy()
    expect(result.diff).toContain('---')
    expect(result.diff).toContain('+++')
  })
})

// ─── JSX Writer ──────────────────────────────────────────────

describe('writeJSXStyleChanges', () => {
  it('modifies an existing single-line style prop', async () => {
    const jsx = `export default function App() {\n  return <div style={{ color: 'red', padding: '8px' }}>Hello</div>\n}\n`
    const file = await writeTmp('App.tsx', jsx)

    const result = await writeJSXStyleChanges(file, 2, [
      { property: 'color', originalValue: 'red', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain("color: 'blue'")
    expect(result.modifiedContent).not.toContain("color: 'red'")
    // Other props preserved
    expect(result.modifiedContent).toContain("padding: '8px'")
  })

  it('adds a new property to an existing style', async () => {
    const jsx = `function Comp() {\n  return <div style={{ color: 'red' }}>X</div>\n}\n`
    const file = await writeTmp('Comp.tsx', jsx)

    const result = await writeJSXStyleChanges(file, 2, [
      { property: 'fontSize', originalValue: '', newValue: '16px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain("fontSize: '16px'")
    expect(result.modifiedContent).toContain("color: 'red'")
  })

  it('inserts a new style prop when none exists', async () => {
    const jsx = `function Comp() {\n  return <div className="card">\n    Hello\n  </div>\n}\n`
    const file = await writeTmp('Comp.tsx', jsx)

    const result = await writeJSXStyleChanges(file, 2, [
      { property: 'color', originalValue: '', newValue: 'green' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain("style={{ color: 'green' }}")
  })

  it('handles multi-line style prop', async () => {
    const jsx = [
      'function Comp() {',
      '  return (',
      '    <div',
      '      style={{',
      "        color: 'red',",
      "        margin: '4px',",
      '      }}',
      '    >',
      '      Hello',
      '    </div>',
      '  )',
      '}',
    ].join('\n')
    const file = await writeTmp('Multi.tsx', jsx)

    const result = await writeJSXStyleChanges(file, 5, [
      { property: 'color', originalValue: 'red', newValue: '#333' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain("color: '#333'")
    expect(result.modifiedContent).not.toContain("color: 'red'")
    expect(result.modifiedContent).toContain("margin: '4px'")
  })

  it('fails gracefully for missing file', async () => {
    const result = await writeJSXStyleChanges('/no/such/file.tsx', 1, [
      { property: 'color', originalValue: '', newValue: 'blue' },
    ], true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cannot read file/i)
  })
})

// ─── Tailwind Writer ─────────────────────────────────────────

describe('writeTailwindChanges', () => {
  it('adds a Tailwind class for a CSS property', async () => {
    const jsx = `function Comp() {\n  return <div className="flex items-center">Hello</div>\n}\n`
    const file = await writeTmp('Tw.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'padding', originalValue: '', newValue: '16px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('p-4')
    // Existing classes preserved
    expect(result.modifiedContent).toContain('flex')
    expect(result.modifiedContent).toContain('items-center')
  })

  it('replaces a Tailwind class with same prefix', async () => {
    const jsx = `function Comp() {\n  return <div className="p-2 flex">Hi</div>\n}\n`
    const file = await writeTmp('TwReplace.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'padding', originalValue: '8px', newValue: '16px' },
    ], true)

    expect(result.success).toBe(true)
    // Old p-2 replaced with p-4
    expect(result.modifiedContent).toContain('p-4')
    expect(result.modifiedContent).toContain('flex')
  })

  it('handles class= (Svelte/Vue/HTML)', async () => {
    const svelte = `<div class="text-red-500 p-2">Hello</div>\n`
    const file = await writeTmp('Comp.svelte', svelte)

    const result = await writeTailwindChanges(file, 1, [
      { property: 'backgroundColor', originalValue: '', newValue: 'white' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('bg-white')
    expect(result.modifiedContent).toContain('text-red-500')
  })

  it('handles fontSize mapping', async () => {
    const jsx = `function Comp() {\n  return <div className="font-bold">Title</div>\n}\n`
    const file = await writeTmp('Font.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'fontSize', originalValue: '', newValue: '24px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('text-2xl')
  })

  it('handles display: none → hidden', async () => {
    const jsx = `function Comp() {\n  return <div className="block mt-4">X</div>\n}\n`
    const file = await writeTmp('Display.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'display', originalValue: 'block', newValue: 'none' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('hidden')
    // Old 'block' class removed since we changed display
    expect(result.modifiedContent).not.toMatch(/\bblock\b/)
  })

  it('fails when no className found near target line', async () => {
    const jsx = `function Comp() {\n  return <div>No class here</div>\n}\n`
    const file = await writeTmp('NoClass.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'padding', originalValue: '', newValue: '16px' },
    ], true)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no className/i)
  })

  it('uses arbitrary value for unmapped sizes', async () => {
    const jsx = `function Comp() {\n  return <div className="flex">X</div>\n}\n`
    const file = await writeTmp('Arbitrary.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'width', originalValue: '', newValue: '100%' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('w-full')
  })

  it('handles borderRadius mapping', async () => {
    const jsx = `function Comp() {\n  return <div className="bg-white">X</div>\n}\n`
    const file = await writeTmp('Radius.tsx', jsx)

    const result = await writeTailwindChanges(file, 2, [
      { property: 'borderRadius', originalValue: '', newValue: '8px' },
    ], true)

    expect(result.success).toBe(true)
    expect(result.modifiedContent).toContain('rounded-lg')
  })
})
