import { DEFAULT_BRIDGE_PORT, WS_PATH, BRIDGE_PORT_STORAGE_KEY, logger, parseBridgeMessage, generateId, type BridgeMessage } from '@vibelens/shared'

/**
 * VibeLens Service Worker
 *
 * Manages the WebSocket connection to the bridge server
 * and coordinates communication between side panel and content scripts.
 *
 * MV3 lifecycle: This script is terminated after ~30s of inactivity and
 * re-evaluated from the top on each wake-up (message, event, alarm).
 * All module-level state (ws, connectionStatus, etc.) resets on each wake.
 * The `connectReady` promise ensures message handlers wait for the initial
 * connection attempt before trying to relay.
 */

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

/** H3: exponential backoff for reconnect — starts at 1s, doubles up to 30s, resets on success */
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30_000
let reconnectDelay = RECONNECT_MIN_MS

/** M17: runtime-configurable bridge port — updated from chrome.storage */
let bridgePort = DEFAULT_BRIDGE_PORT

/**
 * Promise that resolves once the initial loadPort() + connect() cycle completes.
 * Message handlers await this before checking ws state, preventing the race
 * condition where a message arrives before connect() has been called.
 */
let connectReady: Promise<void>
let resolveConnectReady: () => void
connectReady = new Promise<void>((r) => { resolveConnectReady = r })

/** Resolve the content script path from the manifest (hash changes each build). */
function getContentScriptPath(): string {
  const manifest = chrome.runtime.getManifest()
  const cs = manifest.content_scripts?.[0]?.js?.[0]
  return cs ?? 'assets/content-script.js'
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
let connectionStatus: ConnectionStatus = 'disconnected'

function getWsUrl(): string {
  return `ws://127.0.0.1:${bridgePort}${WS_PATH}`
}

/** M17: load saved port from storage (called once on startup) */
function loadPort(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(BRIDGE_PORT_STORAGE_KEY, (result) => {
      const stored = result[BRIDGE_PORT_STORAGE_KEY]
      if (typeof stored === 'number' && stored > 0 && stored < 65536) {
        bridgePort = stored
      }
      resolve()
    })
  })
}

function connect(): void {
  const wsUrl = getWsUrl()
  console.log(`[VibeLens SW] connect() called, url=${wsUrl}, current ws state=${ws?.readyState ?? 'null'}`)

  // Guard: don't create duplicate connections
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      console.log('[VibeLens SW] connect() skipped — already open/connecting')
      return
    }
    // Previous socket is CLOSING or CLOSED — clean up before reconnecting
    ws.onopen = null
    ws.onclose = null
    ws.onerror = null
    ws.onmessage = null
    ws = null
  }

  connectionStatus = 'connecting'
  broadcastStatus()

  try {
    console.log('[VibeLens SW] Creating new WebSocket...')
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log('[VibeLens SW] ✅ WebSocket CONNECTED')
      connectionStatus = 'connected'
      reconnectDelay = RECONNECT_MIN_MS // H3: reset backoff on successful connect
      broadcastStatus()
    }

    // C7+H5: Zod-validated message handler — rejects malformed bridge messages
    socket.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data as string)
        const message = parseBridgeMessage(raw, (err) => {
          logger.warn('Invalid bridge message rejected:', err.issues[0]?.message ?? 'unknown')
        })
        // Zod validates runtime shape; cast to protocol type is safe post-validation
        if (message) handleBridgeMessage(message as unknown as BridgeMessage)
      } catch {
        logger.error('Failed to parse bridge message')
      }
    }

    socket.onclose = (event) => {
      console.log(`[VibeLens SW] WebSocket CLOSED (code=${event.code}, reason=${event.reason || 'none'})`)
      connectionStatus = 'disconnected'
      broadcastStatus()
      scheduleReconnect()
    }

    socket.onerror = (err) => {
      console.log('[VibeLens SW] WebSocket ERROR:', err)
      // onclose will fire after onerror — let onclose handle status + reconnect
    }

    ws = socket
  } catch {
    connectionStatus = 'disconnected'
    broadcastStatus()
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, reconnectDelay)
  // H3: exponential backoff — double each attempt, cap at max
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
}

/**
 * Wait for the WebSocket to reach OPEN state, with a timeout.
 * Handles all WS states: null, CONNECTING, CLOSED, CLOSING, OPEN.
 * Returns true if WS is OPEN after waiting, false otherwise.
 */
async function waitForOpenWs(_timeoutMs = 3000): Promise<boolean> {
  // Wait for initial port load to finish
  await connectReady

  // If already open, great
  if (ws?.readyState === WebSocket.OPEN) return true

  // If already connecting, wait briefly
  if (ws?.readyState === WebSocket.CONNECTING) {
    return new Promise<boolean>((resolve) => {
      const onOpen = () => { clearTimeout(timer); resolve(true) }
      const timer = setTimeout(() => {
        ws?.removeEventListener('open', onOpen)
        resolve(ws?.readyState === WebSocket.OPEN)
      }, _timeoutMs)
      ws!.addEventListener('open', onOpen, { once: true })
    })
  }

  // Don't auto-connect — bridge is optional.
  // Return false so the caller handles "bridge not connected" gracefully.
  return false
}

function handleBridgeMessage(message: BridgeMessage): void {
  // Forward bridge messages to side panel and content scripts
  chrome.runtime.sendMessage({
    source: 'vibelens-bridge',
    ...message,
  }).catch(() => {
    // Side panel may not be open — ignore
  })

  // Auto-confirm write previews: the bridge uses a two-phase commit
  // (write:request → write:preview → write:confirm → write:result).
  // Without the side panel, there is no UI to display the diff preview
  // and collect manual confirmation, so we auto-confirm immediately.
  if (message.type === 'write:preview') {
    const payload = message.payload as { requestId?: string }
    if (payload?.requestId && ws?.readyState === WebSocket.OPEN) {
      const confirm = JSON.stringify({
        type: 'write:confirm',
        id: generateId(),
        timestamp: new Date().toISOString(),
        payload: { requestId: payload.requestId },
      })
      console.log('[VibeLens SW] Auto-confirming write:', payload.requestId)
      ws.send(confirm)
    }
  }

  // Forward write:result (and write:preview) to content scripts.
  // chrome.runtime.sendMessage() above only reaches extension pages (side panel, popup).
  // Content scripts require chrome.tabs.sendMessage() — send to the active tab where
  // the user triggered the write from the inspector panel.
  if (message.type === 'write:result' || message.type === 'write:preview') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) return
      try {
        await chrome.tabs.sendMessage(tab.id, {
          source: 'vibelens-bridge',
          ...message,
        })
      } catch {
        // Content script not present on active tab — ignore
        // (write:result is only meaningful if the inspector panel is open)
      }
    })
  }

  // For file:changed, notify ALL localhost content scripts to trigger reload
  if (message.type === 'file:changed') {
    logger.debug('File changed:', (message.payload as { filePath?: string })?.filePath)
    chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*'] }, async (tabs) => {
      for (const tab of tabs) {
        if (!tab.id) continue
        try {
          await chrome.tabs.sendMessage(tab.id, {
            source: 'vibelens-bridge',
            ...message,
          })
        } catch {
          // Content script not present — inject it, then send reload
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [getContentScriptPath()],
            })
            await new Promise((r) => setTimeout(r, 100))
            await chrome.tabs.sendMessage(tab.id, {
              source: 'vibelens-bridge',
              ...message,
            })
          } catch {
            // Tab may not match host_permissions — skip
          }
        }
      }
    })
  }
}

function broadcastStatus(): void {
  chrome.runtime.sendMessage({
    source: 'vibelens-status',
    status: connectionStatus,
  }).catch(() => {
    // No listeners — ignore
  })
}

// Activate VibeLens on the current tab when extension icon is clicked.
// Injects the content script (if not already present) and toggles edit mode
// directly on the page — no side panel required.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return

  const tabId = tab.id
  const tabUrl = tab.url ?? ''

  // Check if the page is localhost — VibeLens only works on local dev servers
  const isLocalhost = tabUrl.startsWith('http://localhost') || tabUrl.startsWith('http://127.0.0.1')

  if (!isLocalhost) {
    // Show a helpful message on non-localhost pages
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Don't show duplicate
          if (document.getElementById('vibelens-notice')) return
          const notice = document.createElement('div')
          notice.id = 'vibelens-notice'
          Object.assign(notice.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '2147483647',
            background: '#111111', color: '#ffffff', padding: '20px 24px',
            borderRadius: '14px', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            fontSize: '14px', lineHeight: '1.6', maxWidth: '340px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            animation: 'vibelens-slide-in 0.3s cubic-bezier(0.16,1,0.3,1)',
          })
          notice.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="font-weight:700;font-size:16px;letter-spacing:-0.3px;">VibeLens</div>
              <div id="vibelens-notice-close" style="width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#999;font-size:14px;transition:all 0.15s;">\u2715</div>
            </div>
            <div style="color:#ccc;font-size:14px;margin-bottom:14px;">VibeLens works on <strong style="color:#fff;">local dev servers</strong>. Start your project and open:</div>
            <div style="padding:10px 14px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;font-family:ui-monospace,'SF Mono',monospace;font-size:13px;color:#a5b4fc;letter-spacing:0.3px;">
              http://localhost:&lt;port&gt;
            </div>
            <div style="margin-top:12px;color:#888;font-size:12px;">Then click the VibeLens icon again to start inspecting.</div>
          `
          const style = document.createElement('style')
          style.textContent = '@keyframes vibelens-slide-in { from { opacity:0; transform:translateY(-12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }'
          notice.appendChild(style)
          document.body.appendChild(notice)
          // Close button
          const closeEl = document.getElementById('vibelens-notice-close')
          if (closeEl) {
            closeEl.addEventListener('mouseenter', () => { closeEl.style.background = 'rgba(255,255,255,0.15)'; closeEl.style.color = '#fff' })
            closeEl.addEventListener('mouseleave', () => { closeEl.style.background = 'rgba(255,255,255,0.08)'; closeEl.style.color = '#999' })
            closeEl.addEventListener('click', () => notice.remove())
          }
          // Auto-dismiss after 8s
          setTimeout(() => { if (document.body.contains(notice)) { notice.style.opacity = '0'; notice.style.transition = 'opacity 0.3s'; setTimeout(() => notice.remove(), 300) } }, 8000)
        },
      })
    } catch {
      // Can't inject into chrome:// or other restricted pages — ignore
    }
    return
  }

  const command = 'toggle-inspector'

  try {
    await chrome.tabs.sendMessage(tabId, {
      source: 'vibelens-command',
      command,
    })
  } catch {
    // Content script not injected yet — inject, wait, then send
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [getContentScriptPath()],
      })
      await new Promise((r) => setTimeout(r, 100))
      await chrome.tabs.sendMessage(tabId, {
        source: 'vibelens-command',
        command,
      })
    } catch (err) {
      logger.error('Failed to activate on tab:', err)
    }
  }
})

// Handle keyboard commands — inject content script on-demand if not present
chrome.commands.onCommand.addListener((command) => {
  logger.debug('Command received:', command)

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) {
      logger.warn('No active tab found for command:', command)
      return
    }

    const tabId = tab.id

    try {
      await chrome.tabs.sendMessage(tabId, {
        source: 'vibelens-command',
        command,
      })
      logger.debug('Command forwarded to tab', tabId)
    } catch {
      // Content script not injected — inject it on-demand, then retry
      logger.debug('Content script not found, injecting into tab', tabId)
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [getContentScriptPath()],
        })
        // Wait a tick for the script to initialize
        await new Promise((r) => setTimeout(r, 100))
        await chrome.tabs.sendMessage(tabId, {
          source: 'vibelens-command',
          command,
        })
        logger.debug('Command forwarded after injection')
      } catch (injectErr) {
        logger.error('Failed to inject/send:', injectErr)
      }
    }
  })
})

/**
 * Relay messages to the bridge WebSocket.
 *
 * Uses `waitForOpenWs()` which properly handles all WS states including
 * the MV3 wake-up race (ws === null before loadPort+connect finishes).
 *
 * Returns true to keep the chrome.runtime message channel open for async sendResponse.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === 'bridge') {
    // Async relay: wait for WS to be ready, then send
    waitForOpenWs().then((ready) => {
      if (ready && ws?.readyState === WebSocket.OPEN) {
        console.log('[VibeLens SW] Relaying to bridge:', JSON.stringify(message.data).slice(0, 200))
        ws.send(JSON.stringify(message.data))
        sendResponse({ ok: true })
      } else {
        console.warn('[VibeLens SW] Bridge WS not open for relay, state:', ws?.readyState)
        sendResponse({ ok: false, error: 'Bridge not connected' })
      }
    })
    return true // keep message channel open for async sendResponse
  }

  // Content script messages — relay directly to bridge, no side panel required.
  // This is the primary path for text edits and style changes to reach the bridge.
  else if (message.source === 'vibelens-content') {
    console.log(`[VibeLens SW] Received content message: type=${message.type}, ws=${ws?.readyState ?? 'null'}`)

    // Build the bridge protocol envelope { type, id, timestamp, payload }
    let envelope: Record<string, unknown> | null = null

    if (message.type === 'text:changed' && message.payload) {
      envelope = {
        type: 'text:changed',
        id: generateId(),
        timestamp: new Date().toISOString(),
        payload: message.payload,
      }
    } else if (message.type === 'style:apply' && message.payload) {
      const sp = message.payload as {
        selector: string
        changes: unknown[]
        computedStyles: Record<string, string>
        pageUrl?: string
        elementClasses?: string[]
        elementTag?: string
      }
      envelope = {
        type: 'write:request',
        id: generateId(),
        timestamp: new Date().toISOString(),
        payload: {
          selector: sp.selector,
          changes: sp.changes,
          computedStyles: sp.computedStyles,
          url: sp.pageUrl ?? '',
          elementClasses: sp.elementClasses,
          elementTag: sp.elementTag,
        },
      }
    }

    if (envelope) {
      // Async relay: wait for WS, then send envelope
      const envelopeToSend = envelope
      waitForOpenWs().then((ready) => {
        if (ready && ws?.readyState === WebSocket.OPEN) {
          console.log('[VibeLens SW] Relaying content→bridge:', JSON.stringify(envelopeToSend).slice(0, 200))
          ws.send(JSON.stringify(envelopeToSend))
          sendResponse({ ok: true })
        } else {
          console.warn('[VibeLens SW] Bridge WS not open for content relay, state:', ws?.readyState)
          sendResponse({ ok: false, error: 'Bridge not connected' })
        }
      })
      return true // keep message channel open for async sendResponse
    }

    // Other content messages (edit:mode-changed, annotation:*, content:ready) are
    // UI-only — the side panel handles them if open. No bridge relay needed.
    return false
  }

  // H4: `else if` prevents double sendResponse when message matches both conditions
  else if (message.type === 'get-status') {
    sendResponse({ source: 'vibelens-status', status: connectionStatus, port: bridgePort })
    return false
  }

  // Element screenshot capture
  else if (message.type === 'capture-screenshot') {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl ?? null })
    })
    return true // async
  }

  return false
})

// M17: reconnect with new port when user changes the setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && BRIDGE_PORT_STORAGE_KEY in changes) {
    const newPort = changes[BRIDGE_PORT_STORAGE_KEY]?.newValue
    if (typeof newPort === 'number' && newPort > 0 && newPort < 65536 && newPort !== bridgePort) {
      logger.info('Bridge port changed to', newPort)
      bridgePort = newPort
      // Force reconnect with new port
      if (ws) {
        ws.onclose = null // prevent scheduleReconnect from firing with old URL
        ws.close()
        ws = null
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      reconnectDelay = RECONNECT_MIN_MS
      connectionStatus = 'disconnected'
      broadcastStatus()
      connect()
    }
  }
})

// Don't auto-connect on startup — the bridge is optional.
// Only connect when a message handler needs to relay to the bridge.
// This prevents ERR_CONNECTION_REFUSED errors in chrome://extensions.
chrome.runtime.onInstalled.addListener(() => {
  loadPort().then(resolveConnectReady)
})

chrome.runtime.onStartup.addListener(() => {
  loadPort().then(resolveConnectReady)
})

// Initial port load on script evaluation (covers wake-up from suspension).
loadPort().then(() => {
  resolveConnectReady()
})
