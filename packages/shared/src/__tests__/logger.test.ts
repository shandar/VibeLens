import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, setLogLevel, getLogLevel } from '../logger.js'

describe('logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Reset to default level
    setLogLevel('warn')
  })

  it('respects log level — debug suppressed at warn level', () => {
    setLogLevel('warn')
    logger.debug('should not appear')
    expect(consoleSpy.log).not.toHaveBeenCalled()
  })

  it('respects log level — warn passes at warn level', () => {
    setLogLevel('warn')
    logger.warn('should appear')
    expect(consoleSpy.warn).toHaveBeenCalledWith('[VibeLens]', 'should appear')
  })

  it('respects log level — error passes at warn level', () => {
    setLogLevel('warn')
    logger.error('critical')
    expect(consoleSpy.error).toHaveBeenCalledWith('[VibeLens]', 'critical')
  })

  it('debug level enables all output', () => {
    setLogLevel('debug')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(consoleSpy.log).toHaveBeenCalledTimes(2) // debug + info
    expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
    expect(consoleSpy.error).toHaveBeenCalledTimes(1)
  })

  it('silent level suppresses all output', () => {
    setLogLevel('silent')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(consoleSpy.log).not.toHaveBeenCalled()
    expect(consoleSpy.warn).not.toHaveBeenCalled()
    expect(consoleSpy.error).not.toHaveBeenCalled()
  })

  it('getLogLevel returns the current level', () => {
    setLogLevel('error')
    expect(getLogLevel()).toBe('error')
    setLogLevel('debug')
    expect(getLogLevel()).toBe('debug')
  })

  it('passes multiple arguments through', () => {
    setLogLevel('debug')
    logger.debug('msg', 42, { key: 'val' })
    expect(consoleSpy.log).toHaveBeenCalledWith('[VibeLens]', 'msg', 42, { key: 'val' })
  })
})
