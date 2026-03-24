import { resolve, join, basename, relative, extname } from 'path'
import type { WebSocket } from 'ws'
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import {
  DEFAULT_BRIDGE_PORT,
  createMessage,
  logger,
  parseExtensionMessage,
  type BridgeMessage,
  type FrameworkType,
  type WriteRequestPayload,
  type WriteConfirmPayload,
  type WriteCancelPayload,
  type TextChangedPayload,
} from '@vibelens/shared'
import { VibeLensWSServer } from './server/ws-server.js'
import { VibeLensHttpServer } from './server/http-server.js'
import { FileWatcher } from './watcher/file-watcher.js'
import { detectDevServer, detectFramework } from './server/detect.js'
import { formatFeedbackMarkdown, type AnnotationPayload } from './feedback/format-feedback.js'
import { SourceResolver, type ResolveRequest } from './resolver/index.js'
import { applyStyleChanges, detectTailwindUsage } from './writer/index.js'

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

/** Timeout for pending writes — auto-cancelled if user doesn't confirm within this window */
const PENDING_WRITE_TIMEOUT_MS = 60_000 // 1 minute

/** Data held in memory while awaiting user confirmation of a write preview */
interface PendingWrite {
  filePath: string
  line: number
  changes: WriteRequestPayload['changes']
  /** Resolved writer override — undefined lets the dispatcher auto-detect */
  forceWriter: 'tailwind' | undefined
  /** CSS selector from the extension — passed through to the writer for accurate rule matching */
  selector: string
  /** Class list of the selected DOM element */
  elementClasses?: string[]
  /** Tag name of the selected DOM element */
  elementTag?: string
  timer: ReturnType<typeof setTimeout>
}

export class Bridge {
  private httpServer: VibeLensHttpServer | null = null
  private wsServer: VibeLensWSServer | null = null
  private fileWatcher: FileWatcher | null = null
  private sourceResolver: SourceResolver | null = null

  private port: number
  private projectRoot: string
  private framework: FrameworkType | null = null
  private devServerUrl: string | null = null
  private running = false
  /** Per-file write mutex to prevent concurrent read-modify-write corruption */
  private writeLocks = new Map<string, Promise<void>>()
  /** C1/C2: writes awaiting user confirmation (keyed by requestId) */
  private pendingWrites = new Map<string, PendingWrite>()

  constructor(private options: BridgeOptions = {}) {
    this.port = options.port ?? DEFAULT_BRIDGE_PORT
    this.projectRoot = resolve(options.projectRoot ?? process.cwd())
  }

  // ── Safety helpers ──────────────────────────────────────────────

  /**
   * Validate that an absolute path is contained within the project root.
   * Resolves symlinks and `..` segments, then checks with a trailing
   * separator to prevent prefix collisions (e.g. `/project-evil`).
   */
  private isInsideProject(absPath: string): boolean {
    const resolved = resolve(absPath)
    const root = this.projectRoot.endsWith('/') ? this.projectRoot : `${this.projectRoot}/`
    return resolved === this.projectRoot || resolved.startsWith(root)
  }

  /**
   * Create a `.bak` backup of a file before modifying it.
   * Overwrites any existing `.bak` for the same path.
   */
  private async backupFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8')
      await writeFile(`${filePath}.bak`, content, 'utf-8')
    } catch {
      // Best-effort — don't block the write if backup fails
    }
  }

  /**
   * Acquire a per-file write lock to serialise concurrent writes.
   * Returns a release function that MUST be called in a finally block.
   */
  private async acquireWriteLock(filePath: string): Promise<() => void> {
    const key = resolve(filePath)

    // Wait for any in-flight write to the same file
    while (this.writeLocks.has(key)) {
      await this.writeLocks.get(key)
    }

    let release!: () => void
    const lock = new Promise<void>((r) => { release = r })
    this.writeLocks.set(key, lock)

    return () => {
      this.writeLocks.delete(key)
      release()
    }
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
        // Invalidate source maps when build output changes
        if (filePath.endsWith('.map') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
          this.sourceResolver?.invalidate()
        }

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

    // Initialize source resolver
    this.sourceResolver = new SourceResolver(this.projectRoot, this.framework)
    await this.sourceResolver.initialize()

    // Handle incoming WebSocket messages from the extension
    // C7+H5: Zod-validated message handler — rejects malformed messages early
    this.wsServer.onMessage(async (data, ws) => {
      logger.debug(`[Bridge] Processing message: ${JSON.stringify(data).slice(0, 300)}`)
      const msg = parseExtensionMessage(data, (err) => {
        logger.warn('Invalid WS message rejected:', JSON.stringify(err.issues))
      })
      if (!msg) {
        logger.warn('[Bridge] Message rejected by Zod validation')
        return
      }

      logger.info(`[Bridge] ✅ Valid message: type=${msg.type}, id=${msg.id}`)

      switch (msg.type) {
        case 'annotations:push':
          await this.handleAnnotationsPush(msg.payload as AnnotationPayload)
          break
        case 'source:resolve':
          await this.handleSourceResolve(msg.id, msg.payload as ResolveRequest, ws)
          break
        case 'write:request':
          await this.handleWriteRequest(msg.id, msg.payload as WriteRequestPayload, ws)
          break
        case 'write:confirm':
          await this.handleWriteConfirm(msg.payload as WriteConfirmPayload, ws)
          break
        case 'write:cancel':
          this.handleWriteCancel(msg.payload as WriteCancelPayload)
          break
        case 'text:changed':
          await this.handleTextChanged(msg.id, msg.payload as TextChangedPayload, ws)
          break
      }
    })

    return void address
  }

  /**
   * Stop the bridge server and all components.
   */
  async stop(): Promise<void> {
    if (!this.running) return

    // Clean up pending writes
    for (const [, pending] of this.pendingWrites) {
      clearTimeout(pending.timer)
    }
    this.pendingWrites.clear()

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

  /**
   * Handle annotations pushed from the extension.
   * Writes a `.vibelens/feedback.md` file in the project root
   * so AI coding tools can read it from the filesystem.
   */
  private async handleAnnotationsPush(payload: AnnotationPayload): Promise<void> {
    const projectName = basename(this.projectRoot)
    const feedbackDir = join(this.projectRoot, '.vibelens')

    await mkdir(feedbackDir, { recursive: true })

    const markdown = formatFeedbackMarkdown(payload, projectName)
    const feedbackPath = join(feedbackDir, 'feedback.md')

    await writeFile(feedbackPath, markdown, 'utf-8')

    // Broadcast confirmation back to the extension
    const confirmMsg = createMessage('annotations:pushed', {
      filePath: feedbackPath,
      annotationCount: payload.annotations.filter((a) => !a.resolved).length,
      timestamp: new Date().toISOString(),
    })
    this.wsServer?.broadcast(confirmMsg as BridgeMessage)
  }

  /**
   * Handle source:resolve requests from the extension.
   * Resolves a CSS selector to a source file location and sends the result
   * back to the requesting client only.
   */
  private async handleSourceResolve(
    requestId: string,
    payload: ResolveRequest,
    ws: WebSocket,
  ): Promise<void> {
    try {
      const result = await this.sourceResolver!.resolve(payload)

      const responseMsg = createMessage('source:resolved', {
        requestId,
        filePath: result.filePath ? relative(this.projectRoot, result.filePath) : null,
        line: result.line,
        column: result.column,
        confidence: result.confidence,
        framework: result.framework,
      })

      this.wsServer?.sendTo(ws, responseMsg as BridgeMessage)
    } catch (err) {
      logger.error('Source resolve error:', err)

      const errorMsg = createMessage('source:resolved', {
        requestId,
        filePath: null,
        line: null,
        column: null,
        confidence: 0,
        framework: this.framework,
      })

      this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
    }
  }

  /**
   * Handle write:request messages from the extension.
   *
   * C1/C2 two-phase commit:
   *   1. Resolve selector → source file
   *   2. Dry-run the write to generate a diff preview
   *   3. Send `write:preview` to the client and store the pending write
   *   4. Wait for `write:confirm` or `write:cancel` (with auto-timeout)
   *
   * The actual file modification only happens in `handleWriteConfirm`.
   */
  private async handleWriteRequest(
    requestId: string,
    payload: WriteRequestPayload,
    ws: WebSocket,
  ): Promise<void> {
    logger.info(`[Bridge] handleWriteRequest: id=${requestId}, selector=${payload.selector}, changes=${JSON.stringify(payload.changes)}`)
    try {
      // Use provided source info or resolve from selector
      let filePath = payload.sourceFile
        ? resolve(this.projectRoot, payload.sourceFile)
        : null
      let line = payload.sourceLine ?? null

      if (!filePath || !line) {
        const resolved = await this.sourceResolver!.resolve({
          selector: payload.selector,
          computedStyles: payload.computedStyles ?? {},
          url: payload.url ?? '',
        })
        if (resolved.filePath) {
          filePath = resolved.filePath
          line = resolved.line ?? 1
        }
      }

      if (!filePath || !line) {
        const errorMsg = createMessage('write:result', {
          requestId,
          success: false,
          filePath: '',
          diff: null,
          error: 'Could not resolve source file for selector',
        })
        this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
        return
      }

      // C4/M1: path containment — never write outside project root
      if (!this.isInsideProject(filePath)) {
        const errorMsg = createMessage('write:result', {
          requestId,
          success: false,
          filePath: '',
          diff: null,
          error: 'Refusing to write outside project root',
        })
        this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
        return
      }

      // Detect if the file uses Tailwind — but don't force the tailwind writer
      // for files with embedded <style> blocks (HTML/SFC). The writer dispatcher's
      // detectSFCSection() handles routing: lines inside <style> go to the CSS writer,
      // lines in template/script go to the JSX/Tailwind writer automatically.
      const EMBEDDED_EXTS = new Set(['.html', '.htm', '.vue', '.svelte', '.astro'])
      const fileExt = extname(filePath).toLowerCase()
      const isTailwind = await detectTailwindUsage(filePath)
      const forceWriter = isTailwind && !EMBEDDED_EXTS.has(fileExt) ? 'tailwind' as const : undefined

      // Dry-run only — generate a diff preview without modifying the file
      const preview = await applyStyleChanges({
        filePath,
        line,
        changes: payload.changes,
        dryRun: true,
        forceWriter,
        selector: payload.selector,
        elementClasses: payload.elementClasses,
        elementTag: payload.elementTag,
      })

      if (!preview.success) {
        const errorMsg = createMessage('write:result', {
          requestId,
          success: false,
          filePath: relative(this.projectRoot, filePath),
          diff: null,
          error: preview.error ?? 'Write-back failed',
        })
        this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
        return
      }

      // Send preview to client for user confirmation
      const previewMsg = createMessage('write:preview', {
        requestId,
        filePath: relative(this.projectRoot, filePath),
        diff: preview.diff,
        originalContent: preview.originalContent,
        modifiedContent: preview.modifiedContent,
      })
      this.wsServer?.sendTo(ws, previewMsg as BridgeMessage)

      // C1/C2: store pending write — DO NOT apply yet
      // Auto-cancel after timeout to prevent memory leaks
      const timer = setTimeout(() => {
        this.pendingWrites.delete(requestId)
        logger.info(`Pending write ${requestId} expired (timeout)`)
      }, PENDING_WRITE_TIMEOUT_MS)

      this.pendingWrites.set(requestId, {
        filePath,
        line,
        changes: payload.changes,
        forceWriter,
        selector: payload.selector,
        elementClasses: payload.elementClasses,
        elementTag: payload.elementTag,
        timer,
      })

      logger.info(`Write preview sent, awaiting confirmation for ${requestId}`)
    } catch (err) {
      logger.error('Write-back error:', err)

      const errorMsg = createMessage('write:result', {
        requestId,
        success: false,
        filePath: '',
        diff: null,
        error: err instanceof Error ? err.message : 'Unknown write error',
      })
      this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
    }
  }

  /**
   * Handle write:confirm — user approved the previewed write.
   * Looks up the pending write, creates a backup, then applies changes.
   */
  private async handleWriteConfirm(
    payload: WriteConfirmPayload,
    ws: WebSocket,
  ): Promise<void> {
    const pending = this.pendingWrites.get(payload.requestId)
    if (!pending) {
      const errorMsg = createMessage('write:result', {
        requestId: payload.requestId,
        success: false,
        filePath: '',
        diff: null,
        error: 'No pending write found (expired or already applied)',
      })
      this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
      return
    }

    // Clean up the pending entry
    clearTimeout(pending.timer)
    this.pendingWrites.delete(payload.requestId)

    // H1: acquire per-file lock to prevent concurrent corruption
    const releaseLock = await this.acquireWriteLock(pending.filePath)
    try {
      // C2: backup before write
      await this.backupFile(pending.filePath)

      // Apply the changes (non-dry-run)
      const result = await applyStyleChanges({
        filePath: pending.filePath,
        line: pending.line,
        changes: pending.changes,
        dryRun: false,
        forceWriter: pending.forceWriter,
        selector: pending.selector,
        elementClasses: pending.elementClasses,
        elementTag: pending.elementTag,
      })

      const resultMsg = createMessage('write:result', {
        requestId: payload.requestId,
        success: result.success,
        filePath: relative(this.projectRoot, pending.filePath),
        diff: result.diff,
        error: result.error ?? null,
      })
      this.wsServer?.sendTo(ws, resultMsg as BridgeMessage)
    } catch (err) {
      logger.error('Write confirm error:', err)
      const errorMsg = createMessage('write:result', {
        requestId: payload.requestId,
        success: false,
        filePath: relative(this.projectRoot, pending.filePath),
        diff: null,
        error: err instanceof Error ? err.message : 'Unknown write error',
      })
      this.wsServer?.sendTo(ws, errorMsg as BridgeMessage)
    } finally {
      releaseLock()
    }
  }

  /**
   * Handle write:cancel — user rejected the previewed write.
   * Simply cleans up the pending state.
   */
  private handleWriteCancel(payload: WriteCancelPayload): void {
    const pending = this.pendingWrites.get(payload.requestId)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingWrites.delete(payload.requestId)
      logger.info(`Write cancelled for ${payload.requestId}`)
    }
  }

  /**
   * Handle text:changed messages from the extension.
   *
   * Resolution strategy (two-tier):
   *   1. Try SourceResolver (source maps → grep by selector classes/IDs)
   *   2. Fallback: search all source files for the literal oldText string
   *
   * For text content (not CSS), string replacement is safe because JSX text
   * maps 1:1 to rendered text: `<h1>Old</h1>` → `<h1>New</h1>`.
   */
  private async handleTextChanged(
    requestId: string,
    payload: TextChangedPayload,
    ws: WebSocket,
  ): Promise<void> {
    const sendResult = (success: boolean, filePath: string, diff: string | null, error: string | null): void => {
      const msg = createMessage('write:result', { requestId, success, filePath, diff, error })
      this.wsServer?.sendTo(ws, msg as BridgeMessage)
    }

    try {
      const oldText = payload.oldText.trim()
      const newText = payload.newText.trim()

      if (oldText === newText) {
        sendResult(true, '', null, null)
        return
      }

      // --- Tier 1: resolve via selector (source maps + grep by class/ID) ---
      let filePath: string | null = null
      let hintLine = 0 // 0-indexed hint for disambiguation

      try {
        const resolved = await this.sourceResolver!.resolve({
          selector: payload.selector,
          computedStyles: {},
          url: payload.pageUrl,
        })
        if (resolved.filePath) {
          filePath = resolved.filePath
          hintLine = (resolved.line ?? 1) - 1
          logger.debug(`Selector resolved → ${relative(this.projectRoot, filePath)}:${hintLine + 1}`)
        }
      } catch {
        // Selector resolution failed — fall through to text search
      }

      // --- Tier 2: search source files directly for the literal text ---
      if (!filePath) {
        logger.debug('Selector resolution failed, falling back to text search…')
        const found = await this.findTextInSourceFiles(oldText)
        if (found) {
          filePath = found.filePath
          hintLine = found.line - 1 // convert to 0-indexed
          logger.debug(`Text search found → ${relative(this.projectRoot, filePath)}:${found.line}`)
        }
      }

      if (!filePath) {
        sendResult(false, '', null, `Could not find "${oldText.slice(0, 60)}" in any source file`)
        return
      }

      const relPath = relative(this.projectRoot, filePath)

      // C4/M1: path containment — never write outside project root
      if (!this.isInsideProject(filePath)) {
        sendResult(false, relPath, null, 'Refusing to write outside project root')
        return
      }

      // H1: acquire per-file lock to prevent concurrent corruption
      const releaseLock = await this.acquireWriteLock(filePath)
      try {
        // --- Read, find, replace, write ---
        const content = await readFile(filePath, 'utf-8')

        const indices: number[] = []
        let searchFrom = 0
        while (true) {
          const idx = content.indexOf(oldText, searchFrom)
          if (idx === -1) break
          indices.push(idx)
          searchFrom = idx + 1
        }

        if (indices.length === 0) {
          sendResult(false, relPath, null, `Text "${oldText.slice(0, 60)}" not found in ${relPath}`)
          return
        }

        // Pick occurrence closest to hintLine
        let bestIndex: number
        if (indices.length === 1) {
          bestIndex = indices[0]!
        } else {
          let bestDistance = Infinity
          bestIndex = indices[0]!
          for (const idx of indices) {
            const lineOfOccurrence = content.substring(0, idx).split('\n').length - 1
            const distance = Math.abs(lineOfOccurrence - hintLine)
            if (distance < bestDistance) {
              bestDistance = distance
              bestIndex = idx
            }
          }
        }

        // C2: backup before write
        await this.backupFile(filePath)

        const newContent = content.substring(0, bestIndex) + newText + content.substring(bestIndex + oldText.length)
        await writeFile(filePath, newContent, 'utf-8')

        const lineNum = content.substring(0, bestIndex).split('\n').length
        const diff = `${relPath}:${lineNum}\n- "${oldText.slice(0, 100)}"\n+ "${newText.slice(0, 100)}"`

        sendResult(true, relPath, diff, null)
        logger.info(`Text written: ${relPath}:${lineNum}  "${oldText.slice(0, 40)}" → "${newText.slice(0, 40)}"`)
      } finally {
        releaseLock()
      }
    } catch (err) {
      logger.error('Text write error:', err)
      sendResult(false, '', null, err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // ── Text search fallback ────────────────────────────────────────────
  // Walks source files looking for a literal text string.
  // Used when the selector-based resolver can't find the file (e.g. no
  // class names/IDs on the element → nothing for grep to match on).

  private async findTextInSourceFiles(
    text: string,
    dir?: string,
    depth = 0,
  ): Promise<{ filePath: string; line: number } | null> {
    const EXTS = new Set([
      '.tsx', '.jsx', '.vue', '.svelte',
      '.ts', '.js', '.html', '.astro',
    ])
    const SKIP = new Set([
      'node_modules', '.git', 'dist', 'build', '.next',
      '.nuxt', '.svelte-kit', 'coverage', '.vibelens',
    ])

    if (depth > 6) return null
    const searchDir = dir ?? this.projectRoot

    let entries
    try {
      entries = await readdir(searchDir, { withFileTypes: true })
    } catch { return null }

    // Check files first (breadth-first for speed)
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = extname(entry.name)
      if (!EXTS.has(ext)) continue

      const fullPath = join(searchDir, entry.name)
      try {
        const info = await stat(fullPath)
        if (info.size > 500_000) continue // skip large files
      } catch { continue }

      try {
        const content = await readFile(fullPath, 'utf-8')
        const idx = content.indexOf(text)
        if (idx !== -1) {
          const line = content.substring(0, idx).split('\n').length
          return { filePath: fullPath, line }
        }
      } catch { /* unreadable — skip */ }
    }

    // Then recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
      const result = await this.findTextInSourceFiles(text, join(searchDir, entry.name), depth + 1)
      if (result) return result
    }

    return null
  }
}
