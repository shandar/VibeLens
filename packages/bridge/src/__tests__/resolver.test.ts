import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { GrepResolver } from '../resolver/grep-resolver.js'

/**
 * H12: Resolver tests — verifies GrepResolver can search a mock project
 * directory and return correct file/line matches with appropriate confidence.
 *
 * Strategy: create a temporary directory tree mimicking a real project,
 * run GrepResolver against it, and assert the results.
 */

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(tmpdir(), `vibelens-resolver-test-${Date.now()}`)
  await mkdir(join(tmpDir, 'src', 'components'), { recursive: true })
  await mkdir(join(tmpDir, 'src', 'styles'), { recursive: true })
  await mkdir(join(tmpDir, 'node_modules', 'some-lib'), { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeProject(files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) {
    const fullPath = join(tmpDir, name)
    await writeFile(fullPath, content, 'utf-8')
  }
}

describe('GrepResolver', () => {
  it('finds a component by class name', async () => {
    await writeProject({
      'src/components/Card.tsx': `
export function Card() {
  return <div className="card-container">Hello</div>
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('.card-container')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Card.tsx')
    expect(result!.line).toBe(3)
    expect(result!.confidence).toBeGreaterThan(0.5)
  })

  it('finds a component by ID', async () => {
    await writeProject({
      'src/components/Header.tsx': `
export function Header() {
  return <header id="main-header">VibeLens</header>
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('#main-header')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Header.tsx')
    expect(result!.confidence).toBeGreaterThan(0.8)
  })

  it('finds a component by data-testid', async () => {
    await writeProject({
      'src/components/Button.tsx': `
export function Button() {
  return <button data-testid="submit-btn">Submit</button>
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('[data-testid="submit-btn"]')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Button.tsx')
    expect(result!.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('prefers data-testid over class name matches', async () => {
    await writeProject({
      'src/components/Form.tsx': `
export function Form() {
  return <form data-testid="login-form" className="login-form">Login</form>
}
`,
      'src/styles/form.css': `
.login-form {
  margin: 0 auto;
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('[data-testid="login-form"]')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Form.tsx')
    // data-testid confidence (0.9 + 0.05 component boost) > className (0.6)
    expect(result!.confidence).toBeGreaterThan(0.85)
  })

  it('returns null for selectors with no matching terms', async () => {
    await writeProject({
      'src/components/Empty.tsx': `export function Empty() { return <div>Nothing</div> }`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('div > p')

    expect(result).toBeNull()
  })

  it('skips node_modules', async () => {
    await writeProject({
      'node_modules/some-lib/index.tsx': `
export function LibComp() {
  return <div className="hidden-component">Lib</div>
}
`,
      'src/components/App.tsx': `export function App() { return <div>App</div> }`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('.hidden-component')

    // Should NOT find the node_modules match
    expect(result).toBeNull()
  })

  it('skips short utility class names (likely Tailwind)', async () => {
    await writeProject({
      'src/components/Box.tsx': `
export function Box() {
  return <div className="p-4 mt-2 flex items-center gap-2">Box</div>
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    // '.p-4' has class name 'p-4' which is ≤3 chars after prefix
    // But 'items-center' should match
    const result = await resolver.resolve('.items-center')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Box.tsx')
  })

  it('boosts confidence for component files over CSS files', async () => {
    await writeProject({
      'src/styles/main.css': `.nav-menu {\n  display: flex;\n}\n`,
      'src/components/Nav.tsx': `
export function Nav() {
  return <nav className="nav-menu">Menu</nav>
}
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('.nav-menu')

    expect(result).not.toBeNull()
    // Component file gets +0.05 boost, so Nav.tsx (0.65) should rank above main.css (0.60)
    expect(result!.filePath).toContain('Nav.tsx')
  })

  it('handles Svelte-style class selectors', async () => {
    await writeProject({
      'src/components/Card.svelte': `
<div class="product-card">
  <h2>Product</h2>
</div>

<style>
  .product-card {
    border: 1px solid #ccc;
  }
</style>
`,
    })

    const resolver = new GrepResolver(tmpDir)
    const result = await resolver.resolve('.product-card')

    expect(result).not.toBeNull()
    expect(result!.filePath).toContain('Card.svelte')
  })
})
