/**
 * VibeLens Side Panel — App Orchestrator
 *
 * H13+L2+L3: Decomposed from ~1739 lines into focused modules:
 *   types.ts      — shared types, constants, helpers
 *   styles.ts     — inline CSS-in-JS style definitions
 *   components/   — AnnotationForm, AnnotationDrawer, WriteConfirmation
 *
 * This file retains state management, effects, handlers, and top-level composition.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { JSX } from 'preact'
import {
  DEFAULT_BRIDGE_PORT,
  BRIDGE_PORT_STORAGE_KEY,
  logger,
} from '@vibelens/shared'
import type { Annotation, AnnotationType } from '@vibelens/shared'

import type {
  ConnectionStatus,
  ViewportMode,
  BridgeInfo,
  PendingAnnotation,
  PendingWritePreview,
} from './types.js'
import {
  VIEWPORTS,
  STATUS_COLORS,
  STORAGE_KEY,
  MAX_ANNOTATIONS,
  getBridgeApiUrl,
  generateId,
} from './types.js'
import { S } from './styles.js'
import { AnnotationForm } from './components/AnnotationForm.js'
import { AnnotationDrawer } from './components/AnnotationDrawer.js'
import { WriteConfirmation } from './components/WriteConfirmation.js'

/* ─────────────── App ─────────────── */

export function App(): JSX.Element {
  /* ── Preview state ── */
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [bridgePort, setBridgePort] = useState(DEFAULT_BRIDGE_PORT)
  const [bridgeInfo, setBridgeInfo] = useState<BridgeInfo | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [viewport, setViewport] = useState<ViewportMode>('responsive')
  const [iframeKey, setIframeKey] = useState(0)
  const [lastReload, setLastReload] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 350, height: 600 })
  const autoDetectedRef = useRef(false)

  /* ── Annotation state ── */
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null)
  const [formType, setFormType] = useState<AnnotationType>('comment')
  const [formMessage, setFormMessage] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle')
  const [editingAnnotation, setEditingAnnotation] = useState<import('./types.js').EditingAnnotation | null>(null)
  const [iframeFading, setIframeFading] = useState(false)
  const [writeStatus, setWriteStatus] = useState<'idle' | 'writing' | 'previewing' | 'done' | 'error'>('idle')
  const [writeMessage, setWriteMessage] = useState<string | null>(null)
  const [pendingWrite, setPendingWrite] = useState<PendingWritePreview | null>(null)
  const [editMode, setEditMode] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Refs for stable access in event handlers (avoid stale closures)
  const annotationsRef = useRef<Annotation[]>([])
  const annotationModeRef = useRef(false)
  annotationsRef.current = annotations
  annotationModeRef.current = annotationMode

  /* ── Helpers ── */

  const sendToIframe = useCallback((command: string, payload?: unknown) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(
      { source: 'vibelens-sidepanel', command, payload },
      '*',
    )
  }, [])

  const syncPinsToIframe = useCallback((anns: Annotation[]) => {
    const active = anns.filter((a) => !a.resolved)
    sendToIframe('show-pins', {
      annotations: active.map((a) => ({ id: a.id, selector: a.selector })),
    })
  }, [sendToIframe])

  /** Send a message to the bridge via the service worker relay */
  const sendToBridge = useCallback((data: Record<string, unknown>) => {
    chrome.runtime.sendMessage({ target: 'bridge', data }).catch(() => {
      setWriteStatus('error')
      setWriteMessage('Bridge not connected')
      setTimeout(() => { setWriteStatus('idle'); setWriteMessage(null) }, 3000)
    })
  }, [])

  const saveAnnotations = useCallback((updated: Annotation[]) => {
    // M15: enforce annotation limit — keep newest, drop oldest resolved first
    let capped = updated
    if (capped.length > MAX_ANNOTATIONS) {
      const resolved = capped.filter(a => a.resolved).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      const unresolved = capped.filter(a => !a.resolved)
      const keep = [...unresolved, ...resolved].slice(-MAX_ANNOTATIONS)
      capped = keep
    }

    setAnnotations(capped)
    // M14: handle storage quota errors gracefully
    chrome.storage.local.set({ [STORAGE_KEY]: capped }, () => {
      if (chrome.runtime.lastError) {
        logger.error('Storage quota exceeded:', chrome.runtime.lastError.message)
        const trimmed = capped.filter(a => !a.resolved).slice(-MAX_ANNOTATIONS / 2)
        chrome.storage.local.set({ [STORAGE_KEY]: trimmed })
      }
    })
    syncPinsToIframe(capped)
  }, [syncPinsToIframe])

  /* ── Observe preview container size for viewport scaling ── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setContainerSize({ width, height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* ── Load annotations from storage on mount ── */
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY]
      if (Array.isArray(stored)) {
        setAnnotations(stored as Annotation[])
        annotationsRef.current = stored as Annotation[]
      }
    })
  }, [])

  /* ── Listen for postMessage from iframe (content script) ── */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'vibelens-content') return

      switch (data.type) {
        case 'content:ready':
          if (annotationModeRef.current) {
            sendToIframe('set-annotation-mode', { active: true })
          }
          setTimeout(() => syncPinsToIframe(annotationsRef.current), 300)
          break

        case 'annotation:create':
          setPendingAnnotation(data.payload as PendingAnnotation)
          setFormType('comment')
          setFormMessage('')
          break

        case 'annotation:select':
          setSelectedAnnotationId((data.payload as { id: string }).id)
          setDrawerOpen(true)
          break

        case 'annotation:mode-changed':
          setAnnotationMode((data.payload as { active: boolean }).active)
          break

        case 'edit:mode-changed':
          setEditMode((data.payload as { active: boolean }).active)
          break

        case 'style:apply': {
          const sp = data.payload as {
            selector: string
            changes: Array<{ property: string; originalValue: string; newValue: string }>
            computedStyles: Record<string, string>
          }
          if (sp && sp.changes.length > 0) {
            setWriteStatus('writing')
            sendToBridge({
              type: 'write:request',
              id: generateId(),
              payload: {
                selector: sp.selector,
                changes: sp.changes,
                computedStyles: sp.computedStyles,
                url: previewUrl,
              },
            })
          }
          break
        }

        case 'text:changed': {
          const tp = data.payload as {
            selector: string
            oldText: string
            newText: string
            pageUrl: string
          }
          if (tp) {
            setWriteStatus('writing')
            sendToBridge({
              type: 'text:changed',
              id: generateId(),
              payload: tp,
            })
          }
          break
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
    // M13: include sendToBridge to prevent stale closure warnings
  }, [sendToIframe, syncPinsToIframe, sendToBridge, previewUrl])

  /* ── Listen for service worker messages ── */
  useEffect(() => {
    const handler = (message: Record<string, unknown>) => {
      if (message.source === 'vibelens-status' && typeof message.status === 'string') {
        setStatus(message.status as ConnectionStatus)
      }

      // Handle content-script messages arriving via chrome.runtime (tab context)
      // Mirrors the window.addEventListener('message') handler for iframe context
      if (message.source === 'vibelens-content') {
        switch (message.type) {
          case 'text:changed': {
            const tp = message.payload as {
              selector: string
              oldText: string
              newText: string
              pageUrl: string
            } | undefined
            if (tp) {
              setWriteStatus('writing')
              sendToBridge({
                type: 'text:changed',
                id: generateId(),
                payload: tp,
              })
            }
            break
          }

          case 'style:apply': {
            const sp = message.payload as {
              selector: string
              changes: Array<{ property: string; originalValue: string; newValue: string }>
              computedStyles: Record<string, string>
            } | undefined
            if (sp && sp.changes.length > 0) {
              setWriteStatus('writing')
              sendToBridge({
                type: 'write:request',
                id: generateId(),
                payload: {
                  selector: sp.selector,
                  changes: sp.changes,
                  computedStyles: sp.computedStyles,
                  url: previewUrl,
                },
              })
            }
            break
          }

          case 'content:ready':
            // Tab-based content script ready — sync state
            if (annotationModeRef.current) {
              // Can't use sendToIframe for tab context; relay via service worker
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tabId = tabs[0]?.id
                if (tabId) {
                  chrome.tabs.sendMessage(tabId, {
                    source: 'vibelens-sidepanel',
                    command: 'set-annotation-mode',
                    payload: { active: true },
                  }).catch(() => {})
                }
              })
            }
            break

          case 'annotation:create':
            setPendingAnnotation(message.payload as PendingAnnotation)
            setFormType('comment')
            setFormMessage('')
            break

          case 'annotation:select':
            setSelectedAnnotationId((message.payload as { id: string }).id)
            setDrawerOpen(true)
            break

          case 'annotation:mode-changed':
            setAnnotationMode((message.payload as { active: boolean }).active)
            break

          case 'edit:mode-changed':
            setEditMode((message.payload as { active: boolean }).active)
            break
        }
        return // handled content-script message, skip bridge handlers
      }

      if (message.source === 'vibelens-bridge' && message.type === 'file:changed') {
        const payload = message.payload as { filePath?: string } | undefined
        const name = payload?.filePath?.split('/').pop() ?? 'file'

        setIframeFading(true)
        setTimeout(() => {
          setIframeKey((k) => k + 1)
          setLastReload(name)
          setTimeout(() => setIframeFading(false), 150)
          setTimeout(() => setLastReload(null), 3000)
        }, 200)
      }

      if (message.source === 'vibelens-bridge' && message.type === 'write:result') {
        const wp = message.payload as { success: boolean; file?: string; diff?: string; error?: string }
        if (wp?.success) {
          const fileName = wp.file?.split('/').pop() ?? 'file'
          setWriteStatus('done')
          setWriteMessage(`Updated ${fileName}`)
        } else {
          setWriteStatus('error')
          setWriteMessage(wp?.error ?? 'Write failed')
        }
        setTimeout(() => { setWriteStatus('idle'); setWriteMessage(null) }, 4000)
      }

      if (message.source === 'vibelens-bridge' && message.type === 'write:preview') {
        const pp = message.payload as {
          requestId?: string
          filePath?: string
          diff?: string
        }
        if (pp?.requestId && pp?.diff) {
          setPendingWrite({
            requestId: pp.requestId,
            filePath: pp.filePath ?? '',
            diff: pp.diff,
          })
          setWriteStatus('previewing')
          setWriteMessage('Review changes below')
        } else {
          setWriteStatus('previewing')
          setWriteMessage('No changes detected')
          setTimeout(() => { setWriteStatus('idle'); setWriteMessage(null) }, 3000)
        }
      }
    }

    chrome.runtime.onMessage.addListener(handler)
    chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
      if (response?.source === 'vibelens-status' && response.status) {
        setStatus(response.status as ConnectionStatus)
      }
      if (typeof response?.port === 'number') {
        setBridgePort(response.port)
      }
    })

    // M17: load saved port from storage
    chrome.storage.local.get(BRIDGE_PORT_STORAGE_KEY, (result) => {
      const stored = result[BRIDGE_PORT_STORAGE_KEY]
      if (typeof stored === 'number' && stored > 0 && stored < 65536) {
        setBridgePort(stored)
      }
    })

    return () => chrome.runtime.onMessage.removeListener(handler)
    // sendToBridge + previewUrl needed for content-script text:changed / style:apply relay
  }, [sendToBridge, previewUrl])

  /* ── Fetch bridge info when connected ── */
  useEffect(() => {
    if (status !== 'connected') {
      setBridgeInfo(null)
      return
    }

    let cancelled = false
    let retryDelay = 1500

    const fetchInfo = async () => {
      try {
        const res = await fetch(getBridgeApiUrl(bridgePort))
        if (!res.ok || cancelled) return
        const data = (await res.json()) as BridgeInfo
        if (cancelled) return
        setBridgeInfo(data)
        retryDelay = 1500

        if (data.devServerUrl && !autoDetectedRef.current) {
          autoDetectedRef.current = true
          setInputUrl(data.devServerUrl)
          setPreviewUrl(data.devServerUrl)
        }
      } catch {
        if (!cancelled) {
          setTimeout(fetchInfo, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 30_000)
        }
      }
    }

    fetchInfo()
    return () => { cancelled = true }
  }, [status, bridgePort])

  /* ── Handlers ── */

  const handleLoadPreview = useCallback(() => {
    const url = inputUrl.trim()
    if (url) {
      setPreviewUrl(url)
      setIframeKey((k) => k + 1)
    }
  }, [inputUrl])

  const handleReload = useCallback(() => {
    if (previewUrl) {
      setIframeKey((k) => k + 1)
      setLastReload('manual')
      setTimeout(() => setLastReload(null), 2000)
    }
  }, [previewUrl])

  const handleToggleAnnotation = useCallback(() => {
    const next = !annotationMode
    setAnnotationMode(next)
    sendToIframe('set-annotation-mode', { active: next })
    if (!next) {
      setPendingAnnotation(null)
    }
    if (next && editMode) {
      setEditMode(false)
      sendToIframe('set-edit-mode', { active: false })
    }
  }, [annotationMode, editMode, sendToIframe])

  const handleToggleEditMode = useCallback(() => {
    const next = !editMode
    setEditMode(next)
    sendToIframe('set-edit-mode', { active: next })
    if (next && annotationMode) {
      setAnnotationMode(false)
      sendToIframe('set-annotation-mode', { active: false })
      setPendingAnnotation(null)
    }
  }, [editMode, annotationMode, sendToIframe])

  const handleConfirmWrite = useCallback(() => {
    if (!pendingWrite) return
    sendToBridge({
      type: 'write:confirm',
      id: generateId(),
      payload: { requestId: pendingWrite.requestId },
    })
    setPendingWrite(null)
    setWriteStatus('writing')
    setWriteMessage('Applying changes…')
  }, [pendingWrite, sendToBridge])

  const handleCancelWrite = useCallback(() => {
    if (!pendingWrite) return
    sendToBridge({
      type: 'write:cancel',
      id: generateId(),
      payload: { requestId: pendingWrite.requestId },
    })
    setPendingWrite(null)
    setWriteStatus('idle')
    setWriteMessage(null)
  }, [pendingWrite, sendToBridge])

  const handleSaveAnnotation = useCallback(() => {
    if (!pendingAnnotation || !formMessage.trim()) return

    const now = new Date().toISOString()
    const annotation: Annotation = {
      id: generateId(),
      selector: pendingAnnotation.selector,
      category: formType,
      message: formMessage.trim(),
      pageUrl: pendingAnnotation.pageUrl,
      elementDescription: pendingAnnotation.elementDescription,
      computedStyles: pendingAnnotation.computedStyles,
      createdAt: now,
      updatedAt: now,
      resolved: false,
    }

    saveAnnotations([...annotations, annotation])
    setPendingAnnotation(null)
    setFormMessage('')
    setDrawerOpen(true)
  }, [pendingAnnotation, formType, formMessage, annotations, saveAnnotations])

  const handleCancelAnnotation = useCallback(() => {
    setPendingAnnotation(null)
    setFormMessage('')
  }, [])

  const handleDeleteAnnotation = useCallback((id: string) => {
    saveAnnotations(annotations.filter((a) => a.id !== id))
  }, [annotations, saveAnnotations])

  const handleToggleResolved = useCallback((id: string) => {
    saveAnnotations(
      annotations.map((a) => (a.id === id ? { ...a, resolved: !a.resolved } : a)),
    )
  }, [annotations, saveAnnotations])

  const handleStartEdit = useCallback((ann: Annotation) => {
    setEditingAnnotation({ id: ann.id, category: ann.category, message: ann.message })
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingAnnotation || !editingAnnotation.message.trim()) return
    saveAnnotations(
      annotations.map((a) =>
        a.id === editingAnnotation.id
          ? { ...a, category: editingAnnotation.category, message: editingAnnotation.message.trim(), updatedAt: new Date().toISOString() }
          : a,
      ),
    )
    setEditingAnnotation(null)
  }, [editingAnnotation, annotations, saveAnnotations])

  const handleCancelEdit = useCallback(() => {
    setEditingAnnotation(null)
  }, [])

  const handlePushToIDE = useCallback(() => {
    const activeAnns = annotations.filter((a) => !a.resolved)
    if (activeAnns.length === 0) return

    setPushStatus('pushing')

    const msg = {
      target: 'bridge',
      data: {
        type: 'annotations:push',
        payload: {
          pageUrl: previewUrl,
          annotations: activeAnns,
        },
      },
    }

    logger.debug('Pushing annotations:', activeAnns.length, 'to', previewUrl)

    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        logger.error('Push failed (runtime):', chrome.runtime.lastError.message)
        setPushStatus('error')
        setTimeout(() => setPushStatus('idle'), 2500)
        return
      }
      logger.debug('Push response:', response)
      if (!response?.ok) {
        logger.error('Push failed (bridge):', response?.error ?? 'unknown')
        setPushStatus('error')
        setTimeout(() => setPushStatus('idle'), 2500)
        return
      }
      setPushStatus('done')
      setTimeout(() => setPushStatus('idle'), 2500)
    })
  }, [annotations, previewUrl])

  /* ── Viewport scaling calculations ── */

  const getIframeTransform = (): { width: string; height: string; transform: string } => {
    if (viewport === 'responsive') {
      return { width: '100%', height: '100%', transform: 'none' }
    }

    const preset = VIEWPORTS[viewport]
    const scaleX = containerSize.width / preset.width
    const scaleY = containerSize.height / preset.height
    const scale = Math.min(scaleX, scaleY, 1)

    return {
      width: `${preset.width}px`,
      height: `${preset.height}px`,
      transform: `scale(${scale.toFixed(4)})`,
    }
  }

  const getScaledDimensions = (): { width: number; height: number } => {
    if (viewport === 'responsive') {
      return { width: containerSize.width, height: containerSize.height }
    }
    const preset = VIEWPORTS[viewport]
    const scaleX = containerSize.width / preset.width
    const scaleY = containerSize.height / preset.height
    const scale = Math.min(scaleX, scaleY, 1)
    return {
      width: Math.round(preset.width * scale),
      height: Math.round(preset.height * scale),
    }
  }

  const viewportLabel = viewport === 'responsive'
    ? `${Math.round(containerSize.width)}×${Math.round(containerSize.height)}`
    : `${VIEWPORTS[viewport].width}×${VIEWPORTS[viewport].height}`

  const iframeTransform = getIframeTransform()
  const scaledDims = getScaledDimensions()
  const activeAnnotations = annotations.filter((a) => !a.resolved)

  /* ─────────────── Render ─────────────── */

  const renderIframe = () => (
    <iframe
      key={iframeKey}
      ref={iframeRef}
      src={previewUrl}
      title="Preview"
      style={{
        width: viewport === 'responsive' ? '100%' : iframeTransform.width,
        height: viewport === 'responsive' ? '100%' : iframeTransform.height,
        border: 'none',
        background: '#fff',
        display: 'block',
        opacity: iframeFading ? 0.3 : 1,
        transition: 'opacity 0.2s ease',
        ...(viewport !== 'responsive'
          ? { transform: iframeTransform.transform, transformOrigin: 'top left' }
          : {}),
      }}
    />
  )

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={S.header}>
        {/* Brand row */}
        <div style={S.headerRow}>
          <span style={S.brand}>
            <span style={S.brandIcon}>◉</span>
            VibeLens
          </span>
          <div style={{ flex: 1 }} />
          {previewUrl && (
            <button
              onClick={handleToggleAnnotation}
              style={{
                ...S.iconBtn,
                ...(annotationMode
                  ? { background: '#a78bfa', color: '#fff', borderColor: '#a78bfa' }
                  : {}),
              }}
              title={annotationMode ? 'Exit annotation mode' : 'Annotate elements'}
            >
              ✎
            </button>
          )}
          {previewUrl && (
            <button
              onClick={handleToggleEditMode}
              style={{
                ...S.iconBtn,
                ...(editMode
                  ? { background: '#22d3ee', color: '#000', borderColor: '#22d3ee' }
                  : {}),
              }}
              title={editMode ? 'Exit edit mode' : 'Edit text on page'}
            >
              T
            </button>
          )}
          {previewUrl && (
            <button
              onClick={handleReload}
              style={S.iconBtn}
              title="Reload preview"
            >
              ↻
            </button>
          )}
          <span
            style={{
              ...S.statusDot,
              background: STATUS_COLORS[status],
            }}
            title={`Bridge: ${status}`}
          />
        </div>

        {/* URL bar */}
        <div style={S.urlRow}>
          <input
            type="text"
            value={inputUrl}
            onInput={(e) => setInputUrl((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadPreview()}
            placeholder="http://localhost:3000"
            style={S.urlInput}
          />
          <button onClick={handleLoadPreview} style={S.goBtn}>
            →
          </button>
        </div>

        {/* Viewport controls */}
        <div style={S.viewportRow}>
          {(Object.keys(VIEWPORTS) as ViewportMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewport(mode)}
              style={{
                ...S.viewportBtn,
                ...(viewport === mode ? S.viewportBtnActive : {}),
              }}
              title={`${VIEWPORTS[mode].label} viewport`}
            >
              <span style={S.viewportIcon}>{VIEWPORTS[mode].icon}</span>
              <span style={S.viewportLabel}>{VIEWPORTS[mode].label}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={S.viewportSize}>{viewportLabel}</span>
        </div>
      </div>

      {/* ── Preview Area ── */}
      <div ref={containerRef} style={S.previewContainer}>
        {previewUrl ? (
          <div
            style={{
              ...S.previewWrapper,
              ...(viewport !== 'responsive'
                ? {
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingTop: '4px',
                  }
                : {}),
            }}
          >
            {viewport !== 'responsive' ? (
              <div
                style={{
                  width: `${scaledDims.width}px`,
                  height: `${scaledDims.height}px`,
                  overflow: 'hidden',
                  borderRadius: '4px',
                  border: '1px solid #2a2a2a',
                  background: '#fff',
                }}
              >
                {renderIframe()}
              </div>
            ) : (
              renderIframe()
            )}
          </div>
        ) : (
          /* Empty state */
          <div style={S.emptyState}>
            <div style={S.emptyIcon}>◉</div>
            <div style={S.emptyTitle}>
              {status === 'connected'
                ? 'No dev server detected'
                : 'Waiting for bridge…'}
            </div>
            <div style={S.emptyHint}>
              {status === 'connected'
                ? 'Start your dev server — VibeLens will auto-detect it'
                : (
                    <>
                      Run <code style={S.codeSnippet}>npx vibelens</code> in your project
                    </>
                  )}
            </div>
            {status === 'disconnected' && (
              <div style={S.emptySteps}>
                <div style={S.stepItem}>
                  <span style={S.stepNum}>1</span>
                  <span>Start bridge in terminal</span>
                </div>
                <div style={S.stepItem}>
                  <span style={S.stepNum}>2</span>
                  <span>Start your dev server</span>
                </div>
                <div style={S.stepItem}>
                  <span style={S.stepNum}>3</span>
                  <span>Preview loads automatically</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Annotation form overlay */}
        {pendingAnnotation && (
          <AnnotationForm
            pendingAnnotation={pendingAnnotation}
            formType={formType}
            formMessage={formMessage}
            onTypeChange={setFormType}
            onMessageChange={setFormMessage}
            onSave={handleSaveAnnotation}
            onCancel={handleCancelAnnotation}
          />
        )}

        {/* Annotation mode indicator */}
        {annotationMode && !pendingAnnotation && (
          <div style={S.modeIndicator}>
            ✎ Click an element to annotate
          </div>
        )}

        {/* Reload toast notification */}
        {lastReload && (
          <div style={S.reloadToast}>
            ↻ {lastReload === 'manual' ? 'Reloaded' : `${lastReload} changed`}
          </div>
        )}

        {/* C1/C2: Write confirmation panel */}
        {pendingWrite && (
          <WriteConfirmation
            pendingWrite={pendingWrite}
            onConfirm={handleConfirmWrite}
            onCancel={handleCancelWrite}
          />
        )}

        {/* Write status toast (only shown when NOT in confirmation mode) */}
        {writeMessage && !pendingWrite && (
          <div style={{
            ...S.reloadToast,
            background: writeStatus === 'error' ? '#7f1d1d' : writeStatus === 'done' ? '#064e3b' : '#312e81',
            borderColor: writeStatus === 'error' ? '#ef4444' : writeStatus === 'done' ? '#10b981' : '#7c3aed',
            bottom: lastReload ? '52px' : '12px',
          }}>
            {writeStatus === 'writing' ? '⏳' : writeStatus === 'done' ? '✓' : writeStatus === 'error' ? '✗' : '📋'}{' '}
            {writeMessage}
          </div>
        )}
      </div>

      {/* ── Annotation Drawer ── */}
      <AnnotationDrawer
        annotations={annotations}
        activeAnnotations={activeAnnotations}
        drawerOpen={drawerOpen}
        selectedAnnotationId={selectedAnnotationId}
        editingAnnotation={editingAnnotation}
        pushStatus={pushStatus}
        status={status}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
        onSelectAnnotation={setSelectedAnnotationId}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onEditingChange={setEditingAnnotation}
        onToggleResolved={handleToggleResolved}
        onDelete={handleDeleteAnnotation}
        onPushToIDE={handlePushToIDE}
      />

      {/* ── Status Bar ── */}
      <div style={S.statusBar}>
        <span
          style={{
            ...S.statusDotSmall,
            background: STATUS_COLORS[status],
          }}
        />
        <span style={S.statusLabel}>
          {status === 'connected'
            ? 'Connected'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Disconnected'}
        </span>
        {bridgeInfo?.framework && (
          <span style={S.frameworkBadge}>{bridgeInfo.framework}</span>
        )}
        <div style={{ flex: 1 }} />
        {previewUrl && (
          <span style={S.viewportSizeSmall}>{viewportLabel}</span>
        )}
      </div>
    </div>
  )
}
