import type { MessageEnvelope } from './protocol.js'

/**
 * Generate a unique ID using the Web Crypto API (works in both Node 19+ and browsers).
 * Falls back to timestamp-based ID if crypto.randomUUID is unavailable.
 */
export function generateId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create a typed message envelope for the WebSocket protocol.
 */
export function createMessage<T extends string, P>(
  type: T,
  payload: P,
  id?: string,
): MessageEnvelope<T, P> {
  return {
    type,
    id: id ?? generateId(),
    timestamp: new Date().toISOString(),
    payload,
  }
}
