import { DEFAULT_BRIDGE_PORT, WS_PATH } from '@vibelens/shared'

/**
 * VibeLens Service Worker
 *
 * Manages the WebSocket connection to the bridge server
 * and coordinates communication between side panel and content scripts.
 */

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_DELAY_MS = 3000

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
let connectionStatus: ConnectionStatus = 'disconnected'

function getWsUrl(): string {
  return `ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}${WS_PATH}`
}

function connect(): void {
  // Guard: don't create duplicate connections
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
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
    const socket = new WebSocket(getWsUrl())

    socket.onopen = () => {
      connectionStatus = 'connected'
      broadcastStatus()
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string)
        handleBridgeMessage(message)
      } catch {
        console.error('[VibeLens] Failed to parse bridge message')
      }
    }

    socket.onclose = () => {
      connectionStatus = 'disconnected'
      broadcastStatus()
      scheduleReconnect()
    }

    socket.onerror = () => {
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
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
}

function handleBridgeMessage(message: { type: string; payload?: unknown }): void {
  // Forward bridge messages to side panel and content scripts
  chrome.runtime.sendMessage({
    source: 'vibelens-bridge',
    ...message,
  }).catch(() => {
    // Side panel may not be open — ignore
  })

  // For file:changed, notify content scripts to trigger reload
  if (message.type === 'file:changed') {
    console.log('[VibeLens] File changed:', (message.payload as { filePath?: string })?.filePath)
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
              files: ['assets/content-script.ts-CBpwzmNg.js'],
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

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId })
  }
})

// Handle keyboard commands — inject content script on-demand if not present
chrome.commands.onCommand.addListener((command) => {
  console.log('[VibeLens] Command received:', command)

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) {
      console.warn('[VibeLens] No active tab found for command:', command)
      return
    }

    const tabId = tab.id

    try {
      await chrome.tabs.sendMessage(tabId, {
        source: 'vibelens-command',
        command,
      })
      console.log('[VibeLens] Command forwarded to tab', tabId)
    } catch {
      // Content script not injected — inject it on-demand, then retry
      console.log('[VibeLens] Content script not found, injecting into tab', tabId)
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['assets/content-script.ts-CBpwzmNg.js'],
        })
        // Wait a tick for the script to initialize
        await new Promise((r) => setTimeout(r, 100))
        await chrome.tabs.sendMessage(tabId, {
          source: 'vibelens-command',
          command,
        })
        console.log('[VibeLens] Command forwarded after injection')
      } catch (injectErr) {
        console.error('[VibeLens] Failed to inject/send:', injectErr)
      }
    }
  })
})

// Listen for messages from side panel — use sendResponse for reliable request-response
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === 'bridge' && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message.data))
  }

  if (message.type === 'get-status') {
    // Respond directly so the side panel gets the status reliably
    sendResponse({ source: 'vibelens-status', status: connectionStatus })
  }

  // Return false — we respond synchronously
  return false
})

// Start connection once — the lifecycle listeners below handle re-execution
chrome.runtime.onInstalled.addListener(() => {
  connect()
})

chrome.runtime.onStartup.addListener(() => {
  connect()
})

// Initial connection on script evaluation (covers wake-up from suspension)
connect()
