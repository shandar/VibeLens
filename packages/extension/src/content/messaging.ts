/**
 * H13: Communication utilities for content script ↔ side panel / service worker.
 *
 * Extracted from content-script.ts to share across all content modules
 * without circular imports.
 */

const isInIframe = window !== window.top

/** Response from the service worker when relaying to bridge */
export interface BridgeRelayResponse {
  ok: boolean
  error?: string
}

/**
 * Send a message to the side panel (or service worker relay).
 * Uses postMessage when in an iframe (side panel preview), otherwise
 * chrome.runtime.sendMessage to reach the service worker.
 *
 * Fire-and-forget — use `sendToBridge()` when you need a response.
 */
export function sendToSidePanel(data: Record<string, unknown>): void {
  if (isInIframe && window.parent) {
    // The parent is the extension side panel (chrome-extension:// origin).
    // The iframe content is http://localhost (different origin).
    // C5 originally scoped to window.location.origin, but that causes a
    // cross-origin mismatch — the browser silently drops the message.
    // Using the extension origin is safe because only our side panel can
    // embed content in its iframe.
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1) // strip trailing /
    window.parent.postMessage(data, extensionOrigin)
    return
  }
  // Tab context: relay through service worker
  console.debug('[VibeLens] sendToSidePanel→service worker:', data.type, data)
  chrome.runtime.sendMessage(data)
    .then((response) => {
      console.debug('[VibeLens] sendMessage response:', response)
    })
    .catch((err) => {
      console.warn('[VibeLens] sendMessage FAILED:', err?.message ?? err)
    })
}

/**
 * Send a message that must reach the bridge and return a response.
 * Unlike `sendToSidePanel` (fire-and-forget), this returns a Promise
 * with the relay result so callers can handle failures.
 */
export async function sendToBridge(data: Record<string, unknown>): Promise<BridgeRelayResponse> {
  if (isInIframe) {
    // Can't get a reliable response from postMessage
    return { ok: false, error: 'Cannot relay from iframe context' }
  }

  console.debug('[VibeLens] sendToBridge→service worker:', data.type, data)

  try {
    const response = await chrome.runtime.sendMessage(data)
    console.debug('[VibeLens] sendToBridge response:', response)
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as BridgeRelayResponse
    }
    // Unexpected response shape — treat as failure
    return { ok: false, error: 'Unexpected response from service worker' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[VibeLens] sendToBridge FAILED:', message)
    return { ok: false, error: message }
  }
}
