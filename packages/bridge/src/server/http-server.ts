import Fastify, { type FastifyInstance } from 'fastify'
import type { StatusResponse, FrameworkType } from '@vibelens/shared'

export interface HttpServerOptions {
  port: number
  projectRoot: string
  framework: FrameworkType | null
  devServerUrl: string | null
  version: string
}

export class VibeLensHttpServer {
  private app: FastifyInstance
  private startTime: number
  private options: HttpServerOptions

  constructor(options: HttpServerOptions) {
    this.options = options
    this.startTime = Date.now()

    this.app = Fastify({
      logger: false,
    })

    this.registerRoutes()
  }

  private registerRoutes(): void {
    this.app.get('/api/status', async () => {
      const response: StatusResponse = {
        status: 'ok',
        version: this.options.version,
        port: this.options.port,
        projectRoot: this.options.projectRoot,
        framework: this.options.framework,
        devServerUrl: this.options.devServerUrl,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      }
      return response
    })

    this.app.get('/api/health', async () => {
      return { ok: true }
    })
  }

  /**
   * Get the underlying Fastify instance for adding routes or accessing the HTTP server.
   */
  get instance(): FastifyInstance {
    return this.app
  }

  /**
   * Start listening on the configured port.
   */
  async listen(): Promise<string> {
    const address = await this.app.listen({
      port: this.options.port,
      host: '127.0.0.1',
    })
    return address
  }

  /**
   * Stop the HTTP server.
   */
  async close(): Promise<void> {
    await this.app.close()
  }
}
