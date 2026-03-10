import { defineCommand, runMain } from 'citty'
import consola from 'consola'
import { Bridge } from '@vibelens/bridge'
import { DEFAULT_BRIDGE_PORT } from '@vibelens/shared'

const main = defineCommand({
  meta: {
    name: 'vibelens',
    version: '0.1.0',
    description: 'VibeLens — visual co-pilot for vibe coding',
  },
  args: {
    port: {
      type: 'string',
      description: `Bridge server port (default: ${DEFAULT_BRIDGE_PORT})`,
      alias: 'p',
    },
    root: {
      type: 'string',
      description: 'Project root directory (default: current directory)',
      alias: 'r',
    },
    framework: {
      type: 'string',
      description: 'Override framework detection (react, vue, svelte, nextjs, vite, static)',
      alias: 'f',
    },
    'dev-url': {
      type: 'string',
      description: 'Override dev server URL (skip auto-detection)',
      alias: 'u',
    },
  },
  async run({ args }) {
    const port = args.port ? parseInt(args.port, 10) : undefined

    consola.box('VibeLens v0.1.0')

    const bridge = new Bridge({
      port,
      projectRoot: args.root,
      framework: args.framework as 'react' | 'vue' | 'svelte' | 'nextjs' | 'vite' | 'static' | undefined,
      devServerUrl: args['dev-url'],
    })

    // Handle graceful shutdown
    const shutdown = async () => {
      consola.info('Shutting down...')
      await bridge.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    try {
      await bridge.start()

      const info = bridge.info
      consola.success(`Bridge running on http://127.0.0.1:${info.port}`)
      consola.info(`Project: ${info.projectRoot}`)

      if (info.framework) {
        consola.info(`Framework: ${info.framework}`)
      }

      if (info.devServerUrl) {
        consola.info(`Dev server: ${info.devServerUrl}`)
      } else {
        consola.warn('No dev server detected. Start your dev server and VibeLens will auto-detect it.')
      }

      consola.info('Waiting for VibeLens extension to connect...')
    } catch (err) {
      consola.error('Failed to start bridge:', err)
      process.exit(1)
    }
  },
})

runMain(main)
