import { resolve } from 'path'
import {
  DEFAULT_BRIDGE_PORT,
  createMessage,
  type BridgeMessage,
  type FrameworkType,
} from '@vibelens/shared'
import { VibeLensWSServer } from './server/ws-server.js'
import { VibeLensHttpServer } from './server/http-server.js'
import { FileWatcher } from './watcher/file-watcher.js'
import { detectDevServer, detectFramework } from './server/detect.js'

export interface BridgeOptions {
  /** Port for the bridge server (default: 9119) */
  port?: number
  /** Project root directory (default: cwd) */
  projectRoot?: string
  /** Override framework detection */
  framework?: FrameworkType
  /** Additional file patterns to ignore */
  ignorePatterns?: string[]
  /** Override dev server URL (skip auto-detection) */
  devServerUrl?: string
}

const VERSION = '0.1.0'

export class Bridge {
  private httpServer: VibeLensHttpServer | null = null
  private wsServer: VibeLensWSServer | null = null
  private fileWatcher: FileWatcher | null = null

  private port: number
  private projectRoot: string
  private framework: FrameworkType | null = null
  private devServerUrl: string | null = null
  private running = false

  constructor(private options: BridgeOptions = {}) {
    this.port = options.port ?? DEFAULT_BRIDGE_PORT
    this.projectRoot = resolve(options.projectRoot ?? process.cwd())
  }

  /**
   * Start the bridge server: HTTP + WebSocket + file watcher.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Bridge is already running')
    }

    // Detect framework
    this.framework = this.options.framework ?? detectFramework(this.projectRoot)

    // Detect dev server
    this.devServerUrl = this.options.devServerUrl ?? (await detectDevServer())

    // Start HTTP server
    this.httpServer = new VibeLensHttpServer({
      port: this.port,
      projectRoot: this.projectRoot,
      framework: this.framework,
      devServerUrl: this.devServerUrl,
      version: VERSION,
    })

    const address = await this.httpServer.listen()

    // Attach WebSocket to the HTTP server's underlying Node server
    const rawServer = this.httpServer.instance.server
    this.wsServer = new VibeLensWSServer({ server: rawServer })

    // Start file watcher
    this.fileWatcher = new FileWatcher({
      root: this.projectRoot,
      ignorePatterns: this.options.ignorePatterns,
      onChange: (filePath, changeType) => {
        const msg = createMessage('file:changed', {
          filePath,
          changeType,
          timestamp: new Date().toISOString(),
        })
        this.wsServer?.broadcast(msg as BridgeMessage)
      },
    })
    this.fileWatcher.start()

    this.running = true

    // Send initial status to any connecting clients
    this.wsServer.onMessage(() => {
      // When a client connects and sends any message, respond with status
    })

    return void address
  }

  /**
   * Stop the bridge server and all components.
   */
  async stop(): Promise<void> {
    if (!this.running) return

    await this.fileWatcher?.stop()
    await this.wsServer?.close()
    await this.httpServer?.close()

    this.running = false
  }

  /**
   * Get current bridge info.
   */
  get info() {
    return {
      port: this.port,
      projectRoot: this.projectRoot,
      framework: this.framework,
      devServerUrl: this.devServerUrl,
      running: this.running,
      clients: this.wsServer?.clientCount ?? 0,
    }
  }
}
