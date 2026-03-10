import { WebSocketServer, type WebSocket } from 'ws'
import type { Server } from 'http'
import { WS_PATH, type BridgeMessage, createMessage } from '@vibelens/shared'

export interface WSServerOptions {
  server: Server
}

export class VibeLensWSServer {
  private wss: WebSocketServer
  private clients: Set<WebSocket> = new Set()

  constructor(options: WSServerOptions) {
    this.wss = new WebSocketServer({
      server: options.server,
      path: WS_PATH,
    })

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)

      ws.on('close', () => {
        this.clients.delete(ws)
      })

      ws.on('error', (err) => {
        console.error('[VibeLens WS] Client error:', err.message)
        this.clients.delete(ws)
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
   * Get the number of connected clients.
   */
  get clientCount(): number {
    return this.clients.size
  }

  /**
   * Register a handler for incoming messages from clients.
   */
  onMessage(handler: (data: unknown, ws: WebSocket) => void): void {
    this.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const data: unknown = JSON.parse(raw.toString())
          handler(data, ws)
        } catch {
          console.error('[VibeLens WS] Failed to parse message')
        }
      })
    })
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
