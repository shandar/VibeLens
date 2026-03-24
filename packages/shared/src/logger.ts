/**
 * L1: Conditional Logger
 *
 * Log-level-gated console wrapper. Reduces noise in production while
 * allowing verbose output during development.
 *
 * Levels (in order of severity):
 *   debug < info < warn < error < silent
 *
 * Default level: 'warn' — only warnings and errors are shown.
 * Set via:
 *   - Node.js:    VIBELENS_LOG_LEVEL=debug
 *   - Browser:    localStorage.setItem('vibelens_log_level', 'debug')
 *   - Runtime:    setLogLevel('debug')
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

let currentLevel: LogLevel = detectDefaultLevel()

function detectDefaultLevel(): LogLevel {
  try {
    // Node.js environment
    if (typeof process !== 'undefined' && process.env?.VIBELENS_LOG_LEVEL) {
      const envLevel = process.env.VIBELENS_LOG_LEVEL.toLowerCase() as LogLevel
      if (envLevel in LEVEL_PRIORITY) return envLevel
    }
  } catch {
    // Not in Node — skip
  }

  try {
    // Browser environment with localStorage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vibelens_log_level')
      if (stored && stored.toLowerCase() in LEVEL_PRIORITY) {
        return stored.toLowerCase() as LogLevel
      }
    }
  } catch {
    // No localStorage (service worker, SSR) — skip
  }

  return 'warn'
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel]
}

const PREFIX = '[VibeLens]'

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) console.log(PREFIX, ...args)
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) console.log(PREFIX, ...args)
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) console.warn(PREFIX, ...args)
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) console.error(PREFIX, ...args)
  },
}
