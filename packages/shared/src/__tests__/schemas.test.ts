import { describe, it, expect } from 'vitest'
import {
  parseExtensionMessage,
  parseBridgeMessage,
  StyleChangeSchema,
  AnnotationSchema,
  ExtensionMessageSchema,
  BridgeMessageSchema,
} from '../schemas.js'

/**
 * C7+H5: Tests for Zod runtime validation schemas.
 * Ensures valid messages pass, invalid messages are rejected,
 * and error callbacks fire with useful diagnostics.
 */

describe('StyleChangeSchema', () => {
  it('accepts valid style change', () => {
    const result = StyleChangeSchema.safeParse({
      property: 'color',
      originalValue: 'red',
      newValue: 'blue',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty property', () => {
    const result = StyleChangeSchema.safeParse({
      property: '',
      originalValue: 'red',
      newValue: 'blue',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const result = StyleChangeSchema.safeParse({ property: 'color' })
    expect(result.success).toBe(false)
  })
})

describe('AnnotationSchema', () => {
  const validAnnotation = {
    id: 'ann-1',
    selector: '.card',
    elementDescription: 'Card component',
    category: 'bug',
    message: 'Color is wrong',
    computedStyles: { color: 'red' },
    pageUrl: 'http://localhost:3000',
    resolved: false,
    createdAt: '2026-03-12T00:00:00Z',
    updatedAt: '2026-03-12T00:00:00Z',
  }

  it('accepts valid annotation', () => {
    const result = AnnotationSchema.safeParse(validAnnotation)
    expect(result.success).toBe(true)
  })

  it('rejects invalid category', () => {
    const result = AnnotationSchema.safeParse({
      ...validAnnotation,
      category: 'invalid-cat',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-boolean resolved', () => {
    const result = AnnotationSchema.safeParse({
      ...validAnnotation,
      resolved: 'yes',
    })
    expect(result.success).toBe(false)
  })
})

describe('ExtensionMessageSchema', () => {
  const validSourceResolve = {
    type: 'source:resolve',
    id: 'msg-1',
    timestamp: '2026-03-12T00:00:00Z',
    payload: {
      selector: '.btn',
      computedStyles: { padding: '8px' },
      url: 'http://localhost:3000',
    },
  }

  it('accepts valid source:resolve message', () => {
    const result = ExtensionMessageSchema.safeParse(validSourceResolve)
    expect(result.success).toBe(true)
  })

  it('accepts valid write:request message', () => {
    const result = ExtensionMessageSchema.safeParse({
      type: 'write:request',
      id: 'msg-2',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        selector: '.card',
        changes: [{ property: 'color', originalValue: 'red', newValue: 'blue' }],
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid annotations:push message', () => {
    const result = ExtensionMessageSchema.safeParse({
      type: 'annotations:push',
      id: 'msg-3',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        pageUrl: 'http://localhost:3000',
        timestamp: '2026-03-12T00:00:00Z',
        annotations: [],
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown message type', () => {
    const result = ExtensionMessageSchema.safeParse({
      type: 'unknown:type',
      id: 'msg-4',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const result = ExtensionMessageSchema.safeParse({
      type: 'source:resolve',
      timestamp: '2026-03-12T00:00:00Z',
      payload: validSourceResolve.payload,
    })
    expect(result.success).toBe(false)
  })

  it('rejects write:request with empty changes array', () => {
    const result = ExtensionMessageSchema.safeParse({
      type: 'write:request',
      id: 'msg-5',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        selector: '.card',
        changes: [],
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('BridgeMessageSchema', () => {
  it('accepts valid bridge:status message', () => {
    const result = BridgeMessageSchema.safeParse({
      type: 'bridge:status',
      id: 'msg-1',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        version: '0.1.0',
        port: 9119,
        projectRoot: '/home/user/project',
        framework: 'react',
        devServerUrl: 'http://localhost:3000',
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts null framework in bridge:status', () => {
    const result = BridgeMessageSchema.safeParse({
      type: 'bridge:status',
      id: 'msg-2',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        version: '0.1.0',
        port: 9119,
        projectRoot: '/home/user/project',
        framework: null,
        devServerUrl: null,
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid file:changed message', () => {
    const result = BridgeMessageSchema.safeParse({
      type: 'file:changed',
      id: 'msg-3',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        filePath: 'src/App.tsx',
        changeType: 'modify',
        timestamp: '2026-03-12T00:00:00Z',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid changeType', () => {
    const result = BridgeMessageSchema.safeParse({
      type: 'file:changed',
      id: 'msg-4',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        filePath: 'src/App.tsx',
        changeType: 'rename',
        timestamp: '2026-03-12T00:00:00Z',
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid framework name', () => {
    const result = BridgeMessageSchema.safeParse({
      type: 'bridge:status',
      id: 'msg-5',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        version: '0.1.0',
        port: 9119,
        projectRoot: '/home/user/project',
        framework: 'angular',
        devServerUrl: null,
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('parseExtensionMessage', () => {
  it('returns parsed message for valid input', () => {
    const result = parseExtensionMessage({
      type: 'write:confirm',
      id: 'msg-1',
      timestamp: '2026-03-12T00:00:00Z',
      payload: { requestId: 'req-1' },
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('write:confirm')
  })

  it('returns null and calls onError for invalid input', () => {
    let errorCalled = false
    const result = parseExtensionMessage(
      { type: 'bad' },
      () => { errorCalled = true },
    )
    expect(result).toBeNull()
    expect(errorCalled).toBe(true)
  })

  it('returns null for non-object input', () => {
    expect(parseExtensionMessage('not-json')).toBeNull()
    expect(parseExtensionMessage(42)).toBeNull()
    expect(parseExtensionMessage(null)).toBeNull()
  })
})

describe('parseBridgeMessage', () => {
  it('returns parsed message for valid input', () => {
    const result = parseBridgeMessage({
      type: 'write:result',
      id: 'msg-1',
      timestamp: '2026-03-12T00:00:00Z',
      payload: {
        requestId: 'req-1',
        success: true,
        filePath: 'src/App.tsx',
        diff: '--- a\n+++ b',
        error: null,
      },
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('write:result')
  })

  it('returns null for garbled data', () => {
    expect(parseBridgeMessage({ garbage: true })).toBeNull()
  })
})
