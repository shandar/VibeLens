import { describe, it, expect } from 'vitest'
import { createMessage, generateId } from '../helpers.js'

describe('createMessage', () => {
  it('creates a message with correct envelope shape', () => {
    const msg = createMessage('file:changed', {
      filePath: '/src/App.tsx',
      changeType: 'modify' as const,
      timestamp: new Date().toISOString(),
    })

    expect(msg.type).toBe('file:changed')
    expect(msg.id).toBeTruthy()
    expect(msg.timestamp).toBeTruthy()
    expect(msg.payload.filePath).toBe('/src/App.tsx')
    expect(msg.payload.changeType).toBe('modify')
  })

  it('uses provided id when given', () => {
    const msg = createMessage('bridge:status', { version: '0.1.0' }, 'custom-id')
    expect(msg.id).toBe('custom-id')
  })

  it('generates unique ids when not provided', () => {
    const msg1 = createMessage('bridge:status', {})
    const msg2 = createMessage('bridge:status', {})
    expect(msg1.id).not.toBe(msg2.id)
  })
})

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})
