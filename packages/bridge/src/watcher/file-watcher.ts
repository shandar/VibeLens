import { watch, type FSWatcher } from 'chokidar'
import { DEFAULT_IGNORE_PATTERNS } from '@vibelens/shared'

export interface FileWatcherOptions {
  /** Root directory to watch */
  root: string
  /** Additional patterns to ignore (merged with defaults) */
  ignorePatterns?: string[]
  /** Callback when a file changes */
  onChange: (filePath: string, changeType: 'create' | 'modify' | 'delete') => void
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
    const ignored = [
      ...DEFAULT_IGNORE_PATTERNS,
      ...(this.options.ignorePatterns ?? []),
    ]

    this.watcher = watch(this.options.root, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher.on('add', (path) => {
      this.options.onChange(path, 'create')
    })

    this.watcher.on('change', (path) => {
      this.options.onChange(path, 'modify')
    })

    this.watcher.on('unlink', (path) => {
      this.options.onChange(path, 'delete')
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
