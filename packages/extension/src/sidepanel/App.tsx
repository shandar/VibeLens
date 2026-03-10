import { useState, useEffect } from 'preact/hooks'
import type { JSX } from 'preact'

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export function App(): JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [previewUrl, setPreviewUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('http://localhost:3000')

  useEffect(() => {
    // Listen for status updates from service worker
    const handler = (message: { source?: string; status?: ConnectionStatus }) => {
      if (message.source === 'vibelens-status' && message.status) {
        setStatus(message.status)
      }
    }

    chrome.runtime.onMessage.addListener(handler)

    // Request current status
    chrome.runtime.sendMessage({ type: 'get-status' }).catch(() => {
      // Service worker may not be ready
    })

    return () => {
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [])

  const handleLoadPreview = () => {
    if (inputUrl.trim()) {
      setPreviewUrl(inputUrl.trim())
    }
  }

  const statusColors: Record<ConnectionStatus, string> = {
    connected: '#22c55e',
    connecting: '#f59e0b',
    disconnected: '#ef4444',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: '1px solid #2a2a2a',
          background: '#1a1a1a',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: '14px',
            letterSpacing: '-0.02em',
          }}
        >
          VibeLens
        </span>

        <div style={{ flex: 1 }} />

        <input
          type="text"
          value={inputUrl}
          onInput={(e) => setInputUrl((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLoadPreview()}
          placeholder="http://localhost:3000"
          style={{
            flex: 2,
            padding: '4px 8px',
            fontSize: '12px',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            background: '#0f0f0f',
            color: '#e0e0e0',
            outline: 'none',
          }}
        />

        <button
          onClick={handleLoadPreview}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            background: '#2a2a2a',
            color: '#e0e0e0',
            cursor: 'pointer',
          }}
        >
          Load
        </button>
      </div>

      {/* Preview Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {previewUrl ? (
          <iframe
            src={previewUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
            }}
            title="Preview"
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '16px',
              color: '#666',
            }}
          >
            <span style={{ fontSize: '32px' }}>&#128065;</span>
            <span style={{ fontSize: '14px' }}>
              Enter your dev server URL and click Load
            </span>
            <span style={{ fontSize: '12px', color: '#444' }}>
              or start the bridge to auto-detect
            </span>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderTop: '1px solid #2a2a2a',
          background: '#1a1a1a',
          fontSize: '11px',
          color: '#888',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColors[status],
          }}
        />
        <span>Bridge: {status}</span>
      </div>
    </div>
  )
}
