import { WebSocketServer, type WebSocket } from 'ws'
import type { Server, IncomingMessage } from 'http'
import { WS_PATH, logger, type BridgeMessage, createMessage } from '@vibelens/shared'

export interface WSServerOptions {
  server: Server
}

export class VibeLensWSServer {
  private wss: WebSocketServer
  private clients: Set<WebSocket> = new Set()
  /** H9: single message handler, set once via onMessage() */
  private messageHandler: ((data: unknown, ws: WebSocket) => void) | null = null

  constructor(options: WSServerOptions) {
    this.wss = new WebSocketServer({
      server: options.server,
      path: WS_PATH,
      // H6: only accept connections from localhost or chrome-extension origins
      verifyClient: ({ req }: { req: IncomingMessage }) => {
        const origin = req.headers.origin ?? ''
        // Allow connections with no origin (CLI, bridge-internal)
        if (!origin) return true
        // Allow chrome-extension:// origins (extension service worker)
        // This is safe: extension origins are browser-enforced and bridge binds to 127.0.0.1
        if (origin.startsWith('chrome-extension://')) return true
        // Allow localhost variants only
        try {
          const url = new URL(origin)
          const host = url.hostname
          return host === 'localhost' || host === '127.0.0.1' || host === '::1'
        } catch {
          return false
        }
      },
    })

    this.wss.on('connection', (ws, req) => {
      logger.info(`[Bridge WS] ✅ Client connected (origin=${req.headers.origin ?? 'none'}, total=${this.clients.size + 1})`)
      this.clients.add(ws)

      ws.on('close', (code, reason) => {
        this.clients.delete(ws)
        logger.info(`[Bridge WS] Client disconnected (code=${code}, reason=${reason?.toString() || 'none'}, remaining=${this.clients.size})`)
      })

      ws.on('error', (err) => {
        logger.error('[Bridge WS] Client error:', err.message)
        this.clients.delete(ws)
      })

      // H9: attach message parsing in the single connection handler
      ws.on('message', (raw) => {
        if (!this.messageHandler) return
        try {
          const str = raw.toString()
          logger.debug(`[Bridge WS] Message received (${str.length} bytes): ${str.slice(0, 200)}`)
          const data: unknown = JSON.parse(str)
          this.messageHandler(data, ws)
        } catch {
          logger.error('[Bridge WS] Failed to parse message')
        }
      })
    })
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message: BridgeMessage): void {
    const data = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data)
      }
    }
  }

  /**
   * Send a bridge status message to all clients.
   */
  sendStatus(payload: BridgeMessage extends { type: 'bridge:status'; payload: infer P }
    ? P
    : never): void {
    const msg = createMessage('bridge:status', payload)
    this.broadcast(msg as BridgeMessage)
  }

  /**
   * Send a message to a specific client.
   */
  sendTo(ws: WebSocket, message: BridgeMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Get the number of connected clients.
   */
  get clientCount(): number {
    return this.clients.size
  }

  /**
   * Register a handler for incoming messages from clients.
   * H9: stores the handler and delegates to the single connection listener
   * in the constructor — prevents stacking duplicate `connection` handlers.
   */
  onMessage(handler: (data: unknown, ws: WebSocket) => void): void {
    this.messageHandler = handler
  }

  /**
   * Close the WebSocket server.
   */
  async close(): Promise<void> {
    for (const client of this.clients) {
      client.close()
    }
    this.clients.clear()

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
