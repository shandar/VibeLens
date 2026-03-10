import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'

export interface FileWatcherOptions {
  /** Root directory to watch */
  root: string
  /** Additional patterns to ignore (merged with defaults) */
  ignorePatterns?: string[]
  /** Callback when a file changes */
  onChange: (filePath: string, changeType: 'create' | 'modify' | 'delete') => void
}

/**
 * Directory names to skip entirely — prevents chokidar from traversing into them.
 * Using a function-based filter instead of glob patterns avoids EMFILE errors
 * on large monorepos (chokidar opens directories before applying glob matches).
 */
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
])

const IGNORED_EXTENSIONS = new Set(['.map'])

/**
 * Build a function-based ignore filter that prevents directory traversal.
 * Chokidar calls `ignored(path)` — returning true for a directory
 * skips the entire subtree, preventing EMFILE on large repos.
 */
function buildIgnoreFilter(extraPatterns: string[]) {
  const extraDirNames = new Set<string>()

  for (const pattern of extraPatterns) {
    const match = pattern.match(/^\*\*\/([^*/]+)\/\*\*$/)
    if (match?.[1]) {
      extraDirNames.add(match[1])
    } else if (!pattern.includes('/') && !pattern.includes('*')) {
      extraDirNames.add(pattern)
    }
  }

  return (filePath: string) => {
    const basename = path.basename(filePath)

    if (IGNORED_DIR_NAMES.has(basename) || extraDirNames.has(basename)) {
      return true
    }

    const ext = path.extname(filePath)
    if (ext && IGNORED_EXTENSIONS.has(ext)) {
      return true
    }

    return false
  }
}

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private options: FileWatcherOptions

  constructor(options: FileWatcherOptions) {
    this.options = options
  }

  /**
   * Start watching for file changes.
   */
  start(): void {
    const ignored = buildIgnoreFilter(this.options.ignorePatterns ?? [])

    this.watcher = watch(this.options.root, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher.on('add', (filePath) => {
      this.options.onChange(filePath, 'create')
    })

    this.watcher.on('change', (filePath) => {
      this.options.onChange(filePath, 'modify')
    })

    this.watcher.on('unlink', (filePath) => {
      this.options.onChange(filePath, 'delete')
    })

    this.watcher.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[VibeLens Watcher] Error:', message)
    })
  }

  /**
   * Stop watching.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
