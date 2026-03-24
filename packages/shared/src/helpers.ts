import type { MessageEnvelope } from './protocol.js'

/**
 * Generate a unique ID using the Web Crypto API (works in both Node 19+ and browsers).
 * Falls back to a longer random string if crypto.randomUUID is unavailable.
 *
 * L6: strengthened fallback — 128 bits of entropy via getRandomValues,
 * or 3× random segments (~93 bits) as last resort.
 */
export function generateId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID()
  }

  // Fallback 1: use getRandomValues for 128-bit hex ID
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback 2: timestamp + triple random segment (~93 bits of entropy)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${Math.random().toString(36).slice(2, 9)}${Math.random().toString(36).slice(2, 9)}`
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
