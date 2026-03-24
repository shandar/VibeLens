/**
 * H13: DOM diff overlay — snapshot capture and visual difference rendering.
 *
 * Captures DOM fingerprints (selector + style/content hashes), computes
 * diffs between snapshots, and renders colored overlay highlights.
 */

import { sendToSidePanel } from './messaging.js'
import { generateSelector } from './selector.js'

/* ─── Types ─── */

interface DOMFingerprintLocal {
  selector: string
  tag: string
  styleHash: string
  contentHash: string
  childCount: number
}

interface LocalDiff {
  added: string[]
  modified: string[]
  removed: string[]
}

/* ─── State ─── */

let diffOverlayVisible = false
let diffContainer: HTMLElement | null = null
let previousSnapshot: DOMFingerprintLocal[] | null = null

/* ─── Public API ─── */

export function isDiffVisible(): boolean {
  return diffOverlayVisible
}

export function toggleDiffOverlay(): void {
  diffOverlayVisible = !diffOverlayVisible

  if (diffOverlayVisible) {
    const currentSnapshot = captureSnapshot()
    if (previousSnapshot) {
      const diff = computeLocalDiff(previousSnapshot, currentSnapshot)
      renderDiffOverlay(diff)
    } else {
      // First toggle — capture baseline, show message
      renderDiffMessage('Baseline captured. Make changes and toggle diff again to see differences.')
    }
    previousSnapshot = currentSnapshot
  } else {
    clearDiffOverlay()
  }

  sendToSidePanel({
    source: 'vibelens-content',
    type: 'diff:mode-changed',
    payload: { active: diffOverlayVisible },
  })
}

/** Capture a DOM snapshot and return element count (used by 'capture-snapshot' command). */
export function captureAndStoreSnapshot(): number {
  previousSnapshot = captureSnapshot()
  return previousSnapshot.length
}

/** Show diff overlay from externally-provided change lists (used by 'show-diff' command). */
export function showDiffFromPayload(diff: { added?: string[]; modified?: string[]; removed?: string[] }): void {
  diffOverlayVisible = true
  renderDiffOverlay({
    added: diff.added ?? [],
    modified: diff.modified ?? [],
    removed: diff.removed ?? [],
  })
}

/* ─── Snapshot & Diff ─── */

/** Capture a fingerprint of all visible elements */
function captureSnapshot(): DOMFingerprintLocal[] {
  const elements: DOMFingerprintLocal[] = []
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node as HTMLElement
        if (el.id === 'vibelens-pin-container' || el.id === 'vibelens-diff-container' || el.id === 'vibelens-toolbar' || el.id === 'vibelens-inspector') {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )

  let node: Node | null = walker.currentNode
  let count = 0
  while (node && count < 500) {
    const el = node as HTMLElement
    if (el.tagName && el !== document.body) {
      const selector = generateSelector(el)
      const computed = window.getComputedStyle(el)
      const styleStr = [
        computed.color, computed.backgroundColor, computed.fontSize,
        computed.fontWeight, computed.padding, computed.margin,
        computed.width, computed.height, computed.display,
        computed.borderRadius, computed.border, computed.opacity,
      ].join('|')

      elements.push({
        selector,
        tag: el.tagName.toLowerCase(),
        styleHash: simpleHash(styleStr),
        contentHash: simpleHash((el.textContent ?? '').trim().slice(0, 100)),
        childCount: el.children.length,
      })
      count++
    }
    node = walker.nextNode()
  }

  return elements
}

/** Simple string hash for fingerprinting */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash.toString(36)
}

function computeLocalDiff(before: DOMFingerprintLocal[], after: DOMFingerprintLocal[]): LocalDiff {
  const beforeMap = new Map(before.map((f) => [f.selector, f]))
  const afterMap = new Map(after.map((f) => [f.selector, f]))

  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []

  for (const [sel, afterFp] of afterMap) {
    const beforeFp = beforeMap.get(sel)
    if (!beforeFp) {
      added.push(sel)
    } else if (
      beforeFp.styleHash !== afterFp.styleHash ||
      beforeFp.contentHash !== afterFp.contentHash ||
      beforeFp.childCount !== afterFp.childCount
    ) {
      modified.push(sel)
    }
  }

  for (const sel of beforeMap.keys()) {
    if (!afterMap.has(sel)) removed.push(sel)
  }

  return { added, modified, removed }
}

/* ─── Rendering ─── */

function ensureDiffContainer(): HTMLElement {
  if (diffContainer && document.body.contains(diffContainer)) return diffContainer
  diffContainer = document.createElement('div')
  diffContainer.id = 'vibelens-diff-container'
  diffContainer.style.cssText =
    'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:999998;'
  document.body.appendChild(diffContainer)
  return diffContainer
}

function renderDiffOverlay(diff: LocalDiff): void {
  clearDiffOverlay()
  const container = ensureDiffContainer()
  const total = diff.added.length + diff.modified.length + diff.removed.length

  if (total === 0) {
    renderDiffMessage('No visual differences detected.')
    return
  }

  // Render diff highlights
  const render = (selectors: string[], color: string, label: string) => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const highlight = document.createElement('div')
        highlight.dataset.diffType = label
        Object.assign(highlight.style, {
          position: 'absolute',
          top: `${rect.top + window.scrollY}px`,
          left: `${rect.left + window.scrollX}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          outline: `2px solid ${color}`,
          outlineOffset: '1px',
          background: `${color}22`,
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease',
          borderRadius: '2px',
        })

        // Label badge
        const badge = document.createElement('span')
        badge.textContent = label
        Object.assign(badge.style, {
          position: 'absolute',
          top: '-16px',
          right: '0',
          fontSize: '9px',
          fontWeight: '600',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          padding: '1px 4px',
          borderRadius: '3px',
          background: color,
          color: '#fff',
          lineHeight: '14px',
        })
        highlight.appendChild(badge)
        container.appendChild(highlight)
      } catch {
        // Invalid selector — skip
      }
    }
  }

  render(diff.added, '#22c55e', 'added')
  render(diff.modified, '#f59e0b', 'changed')
  render(diff.removed, '#ef4444', 'removed')

  // Summary badge
  const summary = document.createElement('div')
  Object.assign(summary.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    padding: '8px 14px',
    borderRadius: '8px',
    background: '#1e1b4b',
    color: '#e0e7ff',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '500',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: '999999',
    pointerEvents: 'auto',
    cursor: 'pointer',
  })
  summary.textContent = `Diff: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}`
  summary.title = 'Click to dismiss'
  summary.addEventListener('click', () => {
    diffOverlayVisible = false
    clearDiffOverlay()
  })
  container.appendChild(summary)
}

function renderDiffMessage(msg: string): void {
  clearDiffOverlay()
  const container = ensureDiffContainer()
  const badge = document.createElement('div')
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    padding: '8px 14px',
    borderRadius: '8px',
    background: '#1e1b4b',
    color: '#e0e7ff',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '500',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: '999999',
    pointerEvents: 'auto',
  })
  badge.textContent = msg
  container.appendChild(badge)
}

function clearDiffOverlay(): void {
  if (diffContainer) diffContainer.innerHTML = ''
}
