/** Default WebSocket/HTTP port for the bridge server */
export const DEFAULT_BRIDGE_PORT = 9119

/** WebSocket path */
export const WS_PATH = '/ws'

/** HTTP API base path */
export const API_BASE = '/api'

/** Common dev server ports to probe */
export const DEV_SERVER_PORTS = [3000, 3001, 4321, 5173, 5174, 8080, 8888] as const

/** Maximum annotations per page */
export const MAX_ANNOTATIONS_PER_PAGE = 50

/** Annotation categories */
export const ANNOTATION_CATEGORIES = ['comment', 'bug', 'suggestion', 'style-change'] as const

/** Default file patterns to ignore when watching */
export const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/coverage/**',
  '**/*.map',
] as const

/** Supported frameworks for auto-detection */
export const SUPPORTED_FRAMEWORKS = ['react', 'vue', 'svelte', 'nextjs', 'vite', 'static'] as const

/** Viewport presets */
export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 812, label: 'Mobile' },
  tablet: { width: 768, height: 1024, label: 'Tablet' },
  desktop: { width: 1440, height: 900, label: 'Desktop' },
} as const
