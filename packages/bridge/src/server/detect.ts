import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { DEV_SERVER_PORTS, type FrameworkType } from '@vibelens/shared'

/**
 * Probe common dev server ports to find a running server.
 * Returns the first URL that responds, or null.
 */
export async function detectDevServer(ports?: readonly number[]): Promise<string | null> {
  const portsToCheck = ports ?? DEV_SERVER_PORTS

  for (const port of portsToCheck) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 500)

      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok || response.status === 304) {
        return `http://localhost:${port}`
      }
    } catch {
      // Port not responding, try next
    }
  }

  return null
}

/** File signals → framework mapping */
const FRAMEWORK_SIGNALS: Array<{ files: string[]; framework: FrameworkType }> = [
  { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], framework: 'nextjs' },
  { files: ['svelte.config.js', 'svelte.config.ts'], framework: 'svelte' },
  { files: ['nuxt.config.js', 'nuxt.config.ts'], framework: 'vue' },
  { files: ['vue.config.js'], framework: 'vue' },
  { files: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'], framework: 'vite' },
]

/**
 * Detect the frontend framework by checking for config files in the project root.
 */
export function detectFramework(projectRoot: string): FrameworkType | null {
  for (const { files, framework } of FRAMEWORK_SIGNALS) {
    for (const file of files) {
      if (existsSync(join(projectRoot, file))) {
        return framework
      }
    }
  }

  // Check package.json dependencies as fallback
  const pkgPath = join(projectRoot, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8') as string)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }

      if (deps['react'] || deps['react-dom']) return 'react'
      if (deps['vue']) return 'vue'
      if (deps['svelte']) return 'svelte'
    } catch {
      // Ignore parse errors
    }
  }

  // Check for index.html (static site)
  if (existsSync(join(projectRoot, 'index.html'))) {
    return 'static'
  }

  return null
}
