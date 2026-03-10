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
  if (ws?.readyState === WebSocket.OPEN) return

  connectionStatus = 'connecting'
  broadcastStatus()

  try {
    ws = new WebSocket(getWsUrl())

    ws.onopen = () => {
      connectionStatus = 'connected'
      broadcastStatus()
      // Connection established — no logging needed in production
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string)
        handleBridgeMessage(message)
      } catch {
        console.error('[VibeLens] Failed to parse bridge message')
      }
    }

    ws.onclose = () => {
      connectionStatus = 'disconnected'
      broadcastStatus()
      scheduleReconnect()
    }

    ws.onerror = () => {
      connectionStatus = 'disconnected'
      broadcastStatus()
    }
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

  // For file:changed, also notify content scripts to trigger reload
  if (message.type === 'file:changed') {
    chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            source: 'vibelens-bridge',
            ...message,
          }).catch(() => {
            // Content script may not be injected — ignore
          })
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

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        source: 'vibelens-command',
        command,
      }).catch(() => {
        // Content script not available
      })
    }
  })
})

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'bridge' && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message.data))
  }

  if (message.type === 'get-status') {
    broadcastStatus()
  }
})

// Start connection on install/startup
chrome.runtime.onInstalled.addListener(() => {
  connect()
})

chrome.runtime.onStartup.addListener(() => {
  connect()
})

// Initial connection attempt
connect()
