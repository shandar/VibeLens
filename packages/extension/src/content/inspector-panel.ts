/**
 * Inspector Panel — collapsible side panel for CSS property inspection & editing.
 *
 * Replaces the floating toolbar + tooltip editor with a unified right-side panel
 * that shows all CSS properties for the selected element, organized by category.
 *
 * Features:
 *  - Element selection via hover+click (reuses annotation-mode logic)
 *  - Element breadcrumb navigation (html > body > div > button)
 *  - Collapsible sections: Box Model, Position, Background, Typography, Border, Effects
 *  - Inline text editing (same contentEditable pipeline as edit-mode)
 *  - Pending changes tracked and sent via `style:apply` to bridge
 *  - Bridge status dot + mode buttons carried over from toolbar
 */

import { sendToSidePanel, sendToBridge } from './messaging.js'
import { generateSelector, describeElement, getRelevantStyles } from './selector.js'
import { NON_TEXT_TAGS, saveInlineStyles, restoreInlineStyles, dashToCamel } from './style-utils.js'
import { toggleDiffOverlay, isDiffVisible, captureAndStoreSnapshot } from './diff-overlay.js'
import { saveChanges, changesToCleanCSS, changesToPrompt, type StoredChange } from './change-store.js'
import { T } from './design-tokens.js'
import {
  connectFolder, disconnectFolder, isConnected, getProjectName,
  writeChangesToSource,
} from './fs-writer.js'
import { createStateToggles, clearStates } from './state-forcing.js'
import { createVariablesSection } from './css-variables.js'
import { getContrastRatio, suggestAccessibleColor } from './color-utils.js'
import { showLayoutOverlay, removeLayoutOverlay, getLayoutInfo } from './layout-overlay.js'
import { captureElementScreenshot } from './element-screenshot.js'
import { createMediaQueryBar } from './media-query.js'
import {
  renderBoxModelSection,
  renderPositionSection,
  renderBackgroundSection,
  renderTypographySection,
  renderBorderSection,
  renderEffectsSection,
  type ChangeHandler,
} from './inspector-sections.js'

/* ─── Constants ─── */

const PANEL_ID = 'vibelens-inspector'
const PANEL_WIDTH = T.panelWidth
const FONT = T.font
const MONO = T.mono

/* ─── State ─── */

let panel: HTMLElement | null = null
let visible = false
let inspectMode = false
let selectedElement: HTMLElement | null = null
let highlightedElement: HTMLElement | null = null
let pendingChanges: Record<string, { original: string; value: string }> = {}

// Text editing state
let isEditingText = false
let originalTextContent: string | null = null

// Bridge connection state (for adaptive button labels)
let bridgeStatus: string = 'disconnected'

/* ─── Public API ─── */

export function isInspectorVisible(): boolean {
  return visible
}

export function toggleInspector(): void {
  if (visible) hideInspector()
  else showInspector()
}

export function showInspector(): void {
  if (panel && document.body.contains(panel)) {
    visible = true
    return
  }
  panel = createPanel()
  document.body.appendChild(panel)

  // Slide in
  requestAnimationFrame(() => {
    if (!panel) return
    panel.style.transform = 'translateX(0)'
    panel.style.opacity = '1'
  })

  visible = true
  enableInspectMode()
  queryBridgeStatus()
}

export function hideInspector(): void {
  disableInspectMode()
  deselectElement()

  // Deactivate diff if active
  if (isDiffVisible()) toggleDiffOverlay()

  if (panel) {
    // Clean up dropdown listener to prevent leaks
    const overflowBtn = panel.querySelector<HTMLElement>('[data-vl-cleanup]')
    if (overflowBtn) {
      const handler = (overflowBtn as unknown as { _closeDropdown?: () => void })._closeDropdown
      if (handler) document.removeEventListener('click', handler)
    }

    panel.style.transform = `translateX(${PANEL_WIDTH + 20}px)`
    panel.style.opacity = '0'
    const el = panel
    setTimeout(() => el.remove(), 300)
    panel = null
  }
  visible = false
}

/* ─── Minimize ─── */

let minimized = false

function toggleMinimize(): void {
  if (!panel) return
  minimized = !minimized

  const sections = panel.querySelector('#vibelens-sections') as HTMLElement | null
  const footer = panel.querySelector('#vibelens-inspector-footer') as HTMLElement | null
  const breadcrumb = panel.querySelector('#vibelens-breadcrumb') as HTMLElement | null
  const modeBar = panel.querySelector('#vibelens-mode-bar') as HTMLElement | null

  if (minimized) {
    if (sections) sections.style.display = 'none'
    if (footer) footer.style.display = 'none'
    if (breadcrumb) breadcrumb.style.display = 'none'
    if (modeBar) modeBar.style.display = 'none'
    panel.style.height = 'auto'
    panel.style.maxHeight = 'auto'
  } else {
    if (sections) sections.style.display = 'flex'
    if (footer) footer.style.display = 'flex'
    if (breadcrumb) breadcrumb.style.display = 'flex'
    if (modeBar) modeBar.style.display = 'flex'
    panel.style.height = `calc(100vh - ${T.panelMargin * 2}px)`
    panel.style.maxHeight = `calc(100vh - ${T.panelMargin * 2}px)`
  }
}

/* ─── Help Overlay ─── */

function toggleHelpOverlay(): void {
  if (!panel) return
  const existing = panel.querySelector('#vibelens-help-overlay')
  if (existing) {
    existing.remove()
    return
  }

  const overlay = document.createElement('div')
  overlay.id = 'vibelens-help-overlay'
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
    zIndex: '10',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 20px',
    gap: '16px',
    overflowY: 'auto',
    borderRadius: `${T.panelRadius}px`,
  })

  const closeOverlay = () => {
    overlay.remove()
    document.removeEventListener('keydown', handleEsc)
  }

  // ── Close button (top-right) ──
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '\u2715'
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '14px', right: '14px',
    width: '28px', height: '28px', borderRadius: '8px',
    border: `1px solid rgba(255,255,255,0.1)`,
    background: 'rgba(255,255,255,0.06)',
    color: '#ccc', fontSize: '14px',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.15s ease',
    outline: 'none', zIndex: '1',
    fontFamily: FONT,
  })
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.12)'
    closeBtn.style.color = '#fff'
  })
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.06)'
    closeBtn.style.color = '#ccc'
  })
  closeBtn.addEventListener('click', closeOverlay)
  overlay.appendChild(closeBtn)

  // ── Header ──
  const title = document.createElement('div')
  title.textContent = 'VibeLens'
  Object.assign(title.style, {
    fontSize: '20px', fontWeight: '700', color: '#fff', letterSpacing: '-0.3px',
  })
  overlay.appendChild(title)

  const version = document.createElement('div')
  version.textContent = 'v0.1.0 — Visual CSS Inspector'
  Object.assign(version.style, {
    fontSize: '12px', color: T.textMuted, marginTop: '-10px',
  })
  overlay.appendChild(version)

  // ── Helper to create section titles ──
  const addSectionLabel = (text: string) => {
    const el = document.createElement('div')
    el.textContent = text
    Object.assign(el.style, {
      fontSize: '10px', fontWeight: '700', color: T.textDim,
      letterSpacing: '1.2px', fontFamily: MONO, marginTop: '6px',
      paddingBottom: '4px', borderBottom: `1px solid rgba(255,255,255,0.06)`,
    })
    overlay.appendChild(el)
  }

  // ── Keyboard Shortcuts ──
  const isMac = navigator.platform?.includes('Mac') ?? true
  const mod = isMac ? '\u2318\u21e7' : 'Ctrl+Shift+'

  addSectionLabel('SHORTCUTS')

  const shortcuts = [
    { key: 'Click element', desc: 'Inspect & edit CSS' },
    { key: `${mod}L`, desc: 'Toggle annotations' },
    { key: `${mod}D`, desc: 'Toggle visual diff' },
    { key: 'Esc', desc: 'Deselect / close' },
  ]
  for (const s of shortcuts) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 0',
    })
    const desc = document.createElement('span')
    desc.textContent = s.desc
    Object.assign(desc.style, { color: '#ddd', fontSize: '13px' })
    const key = document.createElement('span')
    key.textContent = s.key
    Object.assign(key.style, {
      fontFamily: MONO, fontSize: '11px', color: T.accentText,
      background: T.accentBg, padding: '3px 10px', borderRadius: '5px',
      border: '1px solid rgba(99,102,241,0.15)',
    })
    row.appendChild(desc)
    row.appendChild(key)
    overlay.appendChild(row)
  }

  // ── Window Controls ──
  addSectionLabel('WINDOW CONTROLS')

  const dotLegend = [
    { color: T.dotClose, label: 'Close panel' },
    { color: T.dotMinimize, label: 'Minimize / expand' },
    { color: T.dotMaximize, label: 'Help & shortcuts' },
  ]
  for (const d of dotLegend) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0',
    })
    const dot = document.createElement('div')
    Object.assign(dot.style, {
      width: '10px', height: '10px', borderRadius: '50%',
      background: d.color, flexShrink: '0',
    })
    const label = document.createElement('span')
    label.textContent = d.label
    Object.assign(label.style, { color: '#ddd', fontSize: '13px' })
    row.appendChild(dot)
    row.appendChild(label)
    overlay.appendChild(row)
  }

  // ── How It Works ──
  addSectionLabel('HOW IT WORKS')

  const steps = [
    'Click any element to inspect its CSS',
    'Edit values — changes apply instantly',
    'Save to persist changes across refreshes',
    'Copy CSS or AI Prompt to export',
  ]
  for (const [i, text] of steps.entries()) {
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex', gap: '10px', padding: '3px 0',
    })
    const num = document.createElement('span')
    num.textContent = `${i + 1}`
    Object.assign(num.style, {
      color: T.accentText, fontFamily: MONO, fontWeight: '700', fontSize: '12px',
      width: '20px', height: '20px', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: T.accentBg, borderRadius: '5px',
      flexShrink: '0',
    })
    row.appendChild(num)
    const t = document.createElement('span')
    t.textContent = text
    Object.assign(t.style, { color: '#ddd', fontSize: '13px', lineHeight: '20px' })
    row.appendChild(t)
    overlay.appendChild(row)
  }

  // ── Credits ──
  const credits = document.createElement('div')
  Object.assign(credits.style, {
    marginTop: 'auto', paddingTop: '16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '8px', textAlign: 'center',
  })

  // "Built with ❤ in [Claude icon]" — imperative DOM (no innerHTML)
  const builtWith = document.createElement('div')
  Object.assign(builtWith.style, {
    display: 'flex', alignItems: 'center', gap: '5px',
    fontSize: '12px', color: T.textMuted,
  })
  const bwText1 = document.createElement('span')
  bwText1.textContent = 'Built with'
  builtWith.appendChild(bwText1)
  const bwHeart = document.createElement('span')
  bwHeart.textContent = '\u2764'
  Object.assign(bwHeart.style, { color: '#ef4444', fontSize: '14px' })
  builtWith.appendChild(bwHeart)
  const bwText2 = document.createElement('span')
  bwText2.textContent = 'in'
  builtWith.appendChild(bwText2)
  const claudeLink = document.createElement('a')
  claudeLink.href = 'https://claude.ai/claude-code'
  claudeLink.target = '_blank'
  claudeLink.rel = 'noopener'
  Object.assign(claudeLink.style, { display: 'inline-flex', alignItems: 'center' })
  const claudeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  claudeSvg.setAttribute('height', '16')
  claudeSvg.setAttribute('width', '16')
  claudeSvg.setAttribute('viewBox', '0 0 24 24')
  Object.assign(claudeSvg.style, { verticalAlign: 'middle', cursor: 'pointer' })
  const claudePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  claudePath.setAttribute('d', 'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z')
  claudePath.setAttribute('fill', '#D97757')
  claudePath.setAttribute('fill-rule', 'nonzero')
  claudeSvg.appendChild(claudePath)
  claudeLink.appendChild(claudeSvg)
  builtWith.appendChild(claudeLink)
  credits.appendChild(builtWith)

  // "by" line with links — imperative DOM
  const byLine = document.createElement('div')
  Object.assign(byLine.style, { fontSize: '11px', color: T.textDim, lineHeight: '1.5' })
  const byText1 = document.createElement('span')
  byText1.textContent = 'by '
  byLine.appendChild(byText1)
  const adsLink = document.createElement('a')
  adsLink.href = 'https://affordance.design'
  adsLink.target = '_blank'
  adsLink.rel = 'noopener'
  adsLink.textContent = 'Affordance Design Studio'
  Object.assign(adsLink.style, { color: T.accentText, textDecoration: 'none' })
  byLine.appendChild(adsLink)
  const byText2 = document.createElement('span')
  byText2.textContent = ' & '
  byLine.appendChild(byText2)
  const sjLink = document.createElement('a')
  sjLink.href = 'https://shandarjunaid.com'
  sjLink.target = '_blank'
  sjLink.rel = 'noopener'
  sjLink.textContent = 'Shandar Junaid'
  Object.assign(sjLink.style, { color: T.accentText, textDecoration: 'none' })
  byLine.appendChild(sjLink)
  credits.appendChild(byLine)

  overlay.appendChild(credits)

  // ── Close hint ──
  const closeHint = document.createElement('div')
  closeHint.textContent = 'Press Esc or click green dot to close'
  Object.assign(closeHint.style, {
    fontSize: '10px', color: T.textDim, textAlign: 'center', marginTop: '8px',
  })
  overlay.appendChild(closeHint)

  // Close on Esc
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeOverlay()
  }
  document.addEventListener('keydown', handleEsc)

  // Close on click on overlay background
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay()
  })

  panel.appendChild(overlay)
}

/** Re-render the panel for the currently selected element (e.g. after external changes). */
export function refreshInspector(): void {
  if (!panel || !selectedElement) return
  renderSectionsFor(selectedElement)
}

/* ─── Panel Shell ─── */

function createPanel(): HTMLElement {
  const root = document.createElement('div')
  root.id = PANEL_ID

  Object.assign(root.style, {
    position: 'fixed',
    top: `${T.panelMargin}px`,
    right: `${T.panelMargin}px`,
    width: `${PANEL_WIDTH}px`,
    maxWidth: 'calc(100vw - 24px)',
    height: `calc(100vh - ${T.panelMargin * 2}px)`,
    maxHeight: `calc(100vh - ${T.panelMargin * 2}px)`,
    background: T.panelBg,
    border: `1px solid ${T.border}`,
    borderRadius: `${T.panelRadius}px`,
    boxShadow: T.panelShadow,
    zIndex: '2147483646',
    fontFamily: FONT,
    fontSize: '12px',
    color: T.text,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transform: `translateX(${PANEL_WIDTH + 20}px)`,
    opacity: '0',
    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
    userSelect: 'none',
  })

  // ── Header ──
  root.appendChild(createHeader())

  // ── Mode tab bar ──
  root.appendChild(createModeTabBar())

  // ── Element breadcrumb (initially empty) ──
  const breadcrumb = document.createElement('div')
  breadcrumb.id = 'vibelens-breadcrumb'
  Object.assign(breadcrumb.style, {
    padding: '6px 12px',
    background: T.titleBarBg,
    borderBottom: `1px solid ${T.border}`,
    fontSize: '10px',
    fontFamily: MONO,
    color: T.textDim,
    overflowX: 'auto',
    overflowY: 'hidden',
    whiteSpace: 'nowrap',
    minHeight: '28px',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    scrollbarWidth: 'none',           // Firefox
    msOverflowStyle: 'none',          // IE/Edge
  } as Record<string, string>)
  // WebKit scrollbar hide
  const bcStyle = document.createElement('style')
  bcStyle.textContent = '#vibelens-breadcrumb::-webkit-scrollbar { display: none; }'
  breadcrumb.appendChild(bcStyle)
  breadcrumb.textContent = 'Click an element to inspect'
  root.appendChild(breadcrumb)

  // ── Sections container (scrollable) ──
  const sections = document.createElement('div')
  sections.id = 'vibelens-sections'
  Object.assign(sections.style, {
    flex: '1',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
    scrollbarColor: `${T.scrollThumb} ${T.scrollTrack}`,
  } as Record<string, string>)

  // Show onboarding card by default
  sections.appendChild(createOnboardingCard())
  root.appendChild(sections)

  // ── Themed scrollbar styles (injected once) ──
  const scrollStyle = document.createElement('style')
  scrollStyle.textContent = `
    #${PANEL_ID} ::-webkit-scrollbar { width: 5px; height: 5px; }
    #${PANEL_ID} ::-webkit-scrollbar-track { background: ${T.scrollTrack}; }
    #${PANEL_ID} ::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 3px; }
    #${PANEL_ID} ::-webkit-scrollbar-thumb:hover { background: ${T.scrollThumbHover}; }
  `
  root.appendChild(scrollStyle)

  // ── Footer (apply button) ──
  root.appendChild(createFooter())

  return root
}

/* ─── Header ─── */

function createHeader(): HTMLElement {
  const header = document.createElement('div')
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    background: `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%), ${T.titleBarBg}`,
    borderBottom: `1px solid ${T.border}`,
    borderRadius: `${T.panelRadius}px ${T.panelRadius}px 0 0`,
    gap: '8px',
    flexShrink: '0',
  })

  // Traffic light dots — functional
  const dots = document.createElement('div')
  Object.assign(dots.style, { display: 'flex', gap: '6px', flexShrink: '0' })

  const dotConfig = [
    { color: T.dotClose, title: 'Close', action: () => hideInspector() },
    { color: T.dotMinimize, title: 'Minimize', action: () => toggleMinimize() },
    { color: T.dotMaximize, title: 'Help & Shortcuts', action: () => toggleHelpOverlay() },
  ]
  for (const cfg of dotConfig) {
    const d = document.createElement('div')
    d.title = cfg.title
    Object.assign(d.style, {
      width: '12px', height: '12px', borderRadius: '50%', background: cfg.color,
      transition: 'all 0.15s ease', cursor: 'pointer',
    })
    d.addEventListener('mouseenter', () => { d.style.filter = 'brightness(1.3)'; d.style.transform = 'scale(1.1)' })
    d.addEventListener('mouseleave', () => { d.style.filter = 'none'; d.style.transform = 'scale(1)' })
    d.addEventListener('click', cfg.action)
    dots.appendChild(d)
  }
  header.appendChild(dots)

  // Centered title
  const title = document.createElement('span')
  title.textContent = 'VibeLens Inspector'
  Object.assign(title.style, {
    flex: '1',
    textAlign: 'center',
    fontFamily: MONO,
    fontSize: '11px',
    fontWeight: '600',
    color: T.textMuted,
    letterSpacing: '0.3px',
  })
  header.appendChild(title)

  // Connection status indicator (adapts to folder/bridge/standalone)
  const statusGroup = document.createElement('div')
  Object.assign(statusGroup.style, {
    display: 'flex', alignItems: 'center', gap: '5px', flexShrink: '0',
  })
  const statusDot = document.createElement('div')
  statusDot.id = 'vibelens-inspector-status'
  Object.assign(statusDot.style, {
    width: '6px', height: '6px', borderRadius: '50%',
    background: isConnected() ? T.green : '#6b7280',
    transition: 'background 0.3s ease',
  })
  statusGroup.appendChild(statusDot)
  const statusLabel = document.createElement('span')
  statusLabel.id = 'vibelens-status-label'
  statusLabel.textContent = isConnected() ? (getProjectName() ?? 'Connected') : ''
  Object.assign(statusLabel.style, {
    fontSize: '10px', fontFamily: MONO, color: T.textDim,
    maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })
  statusGroup.appendChild(statusLabel)
  header.appendChild(statusGroup)

  return header
}

/* ─── Mode Tab Bar ─── */

function createModeTabBar(): HTMLElement {
  const bar = document.createElement('div')
  bar.id = 'vibelens-mode-bar'
  Object.assign(bar.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.02)',
    borderBottom: `1px solid ${T.border}`,
    flexShrink: '0',
  })

  // Tab: Inspect
  bar.appendChild(createModeTab(
    'Inspect', 'inspect',
    () => {
      if (inspectMode) disableInspectMode()
      else enableInspectMode()
      refreshHeaderButtons()
    },
  ))

  // Tab: Annotate (placeholder)
  const annotateTab = createModeTab('Annotate', 'annotate', () => {})
  annotateTab.style.opacity = '0.4'
  annotateTab.style.cursor = 'default'
  bar.appendChild(annotateTab)

  // Tab: Diff
  bar.appendChild(createModeTab(
    'Diff', 'diff',
    () => { toggleDiffOverlay(); refreshHeaderButtons() },
  ))

  // Spacer
  const spacer = document.createElement('div')
  spacer.style.flex = '1'
  bar.appendChild(spacer)

  // Snapshot button (icon only)
  const snapBtn = createHeaderButton(
    'Snapshot', ICON_SNAPSHOT,
    () => {
      const count = captureAndStoreSnapshot()
      console.debug(`[VibeLens] Snapshot: ${count} elements`)
      flashButton('snapshot', T.green)
    },
    'snapshot',
  )
  Object.assign(snapBtn.style, { width: '26px', height: '26px' })
  bar.appendChild(snapBtn)

  return bar
}

function createModeTab(label: string, name: string, handler: () => void): HTMLElement {
  const tab = document.createElement('button')
  tab.dataset.vlBtn = name
  tab.textContent = label.toUpperCase()
  Object.assign(tab.style, {
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: MONO,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: T.textMuted,
    background: 'transparent',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  })
  tab.addEventListener('mouseenter', () => {
    if (tab.dataset.vlActive !== 'true') {
      tab.style.background = T.white08
      tab.style.color = T.text
    }
  })
  tab.addEventListener('mouseleave', () => {
    if (tab.dataset.vlActive !== 'true') {
      tab.style.background = 'transparent'
      tab.style.color = T.textMuted
    }
  })
  tab.addEventListener('click', handler)
  return tab
}

/* ─── Onboarding Card ─── */

function createOnboardingCard(): HTMLElement {
  const card = document.createElement('div')
  Object.assign(card.style, {
    padding: '32px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    textAlign: 'center',
  })

  // Icon
  const iconWrap = document.createElement('div')
  Object.assign(iconWrap.style, {
    width: '48px', height: '48px', borderRadius: '14px',
    background: T.accentBg, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: T.accentText,
  })
  iconWrap.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`
  card.appendChild(iconWrap)

  // Title
  const title = document.createElement('div')
  title.textContent = 'Click any element'
  Object.assign(title.style, {
    fontSize: '15px', fontWeight: '600', color: T.text,
  })
  card.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.textContent = 'to inspect & edit its CSS'
  Object.assign(subtitle.style, {
    fontSize: '12px', color: T.textMuted, marginTop: '-14px',
  })
  card.appendChild(subtitle)

  // Steps
  const steps = document.createElement('div')
  Object.assign(steps.style, {
    display: 'flex', flexDirection: 'column', gap: '8px',
    width: '100%', padding: '0 8px', textAlign: 'left',
  })

  const stepItems = [
    { num: '1', text: 'Click any element on the page' },
    { num: '2', text: 'Tweak colors, spacing, fonts' },
    { num: '3', text: 'Changes apply instantly' },
  ]
  for (const s of stepItems) {
    const step = document.createElement('div')
    Object.assign(step.style, {
      display: 'flex', alignItems: 'center', gap: '10px',
      fontSize: '11px', color: T.textMuted,
    })
    const num = document.createElement('span')
    num.textContent = s.num
    Object.assign(num.style, {
      width: '20px', height: '20px', borderRadius: '6px',
      background: T.accentBg, color: T.accentText,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '10px', fontWeight: '700', fontFamily: MONO, flexShrink: '0',
    })
    step.appendChild(num)
    const text = document.createElement('span')
    text.textContent = s.text
    step.appendChild(text)
    steps.appendChild(step)
  }
  card.appendChild(steps)

  // Save options
  const saveSection = document.createElement('div')
  Object.assign(saveSection.style, {
    width: '100%', padding: '12px', borderTop: `1px solid ${T.border}`,
    marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px',
    textAlign: 'left',
  })

  const saveTitle = document.createElement('div')
  saveTitle.textContent = 'SAVE YOUR WORK'
  Object.assign(saveTitle.style, {
    fontSize: '9px', fontWeight: '700', color: T.textDim,
    letterSpacing: '0.8px', fontFamily: MONO,
  })
  saveSection.appendChild(saveTitle)

  const saveItems = [
    'Copy CSS \u2192 paste into your code',
    'Copy as Prompt \u2192 feed to AI tool',
  ]
  for (const text of saveItems) {
    const item = document.createElement('div')
    item.textContent = text
    Object.assign(item.style, {
      fontSize: '10px', color: T.textMuted, paddingLeft: '4px',
    })
    saveSection.appendChild(item)
  }
  card.appendChild(saveSection)

  // Shortcuts
  const shortcuts = document.createElement('div')
  Object.assign(shortcuts.style, {
    display: 'flex', gap: '16px', justifyContent: 'center',
    fontSize: '9px', color: T.textDim, fontFamily: MONO,
  })
  const isMac = navigator.platform?.includes('Mac') ?? true
  const mod = isMac ? '\u2318\u21e7' : 'Ctrl+Shift+'
  shortcuts.innerHTML = `<span>${mod}L Annotations</span><span>${mod}D Diff</span>`
  card.appendChild(shortcuts)

  return card
}

function createHeaderButton(
  title: string, svgContent: string,
  handler: () => void, name: string,
): HTMLElement {
  const btn = document.createElement('button')
  btn.title = title
  btn.dataset.vlBtn = name
  btn.innerHTML = svgContent

  Object.assign(btn.style, {
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: 'transparent',
    color: '#9399b2',
    transition: 'all 0.12s ease',
    flexShrink: '0',
    padding: '0',
    outline: 'none',
  })

  btn.addEventListener('mouseenter', () => {
    if (btn.dataset.vlActive !== 'true') {
      btn.style.background = T.white08
      btn.style.color = T.text
    }
  })
  btn.addEventListener('mouseleave', () => {
    if (btn.dataset.vlActive !== 'true') {
      btn.style.background = 'transparent'
      btn.style.color = '#9399b2'
    }
  })
  btn.addEventListener('click', handler)
  return btn
}

function refreshHeaderButtons(): void {
  if (!panel) return
  const btns = panel.querySelectorAll<HTMLElement>('[data-vl-btn]')
  btns.forEach((btn) => {
    const name = btn.dataset.vlBtn
    let active = false
    if (name === 'inspect') active = inspectMode
    else if (name === 'diff') active = isDiffVisible()

    btn.dataset.vlActive = String(active)
    if (active) {
      btn.style.background = T.accentBg
      btn.style.color = T.accentText
      btn.style.borderColor = 'rgba(99,102,241,0.2)'
    } else {
      btn.style.background = 'transparent'
      btn.style.color = T.textMuted
      btn.style.borderColor = 'transparent'
    }
  })
}

function flashButton(name: string, color: string): void {
  const btn = panel?.querySelector<HTMLElement>(`[data-vl-btn="${name}"]`)
  if (!btn) return
  btn.style.background = `${color}30`
  btn.style.color = color
  setTimeout(() => {
    btn.style.background = 'transparent'
    btn.style.color = T.textMuted
  }, 600)
}

/* ─── Footer ─── */

function createFooter(): HTMLElement {
  const footer = document.createElement('div')
  footer.id = 'vibelens-inspector-footer'
  Object.assign(footer.style, {
    padding: '10px 12px',
    borderTop: `1px solid ${T.border}`,
    background: T.titleBarBg,
    borderRadius: `0 0 ${T.panelRadius}px ${T.panelRadius}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: '0',
  })

  // Top row: folder connect + overflow menu
  const topRow = document.createElement('div')
  Object.assign(topRow.style, {
    display: 'flex', gap: '6px', width: '100%', alignItems: 'center',
  })

  // Project folder connection
  const folderRow = document.createElement('div')
  folderRow.id = 'vibelens-folder-row'
  Object.assign(folderRow.style, {
    display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
  })

  const folderBtn = document.createElement('button')
  folderBtn.id = 'vibelens-folder-btn'
  Object.assign(folderBtn.style, {
    ...footerBtnStyle(),
    height: '30px',
    flex: '1',
    background: 'rgba(255,255,255,0.03)',
    color: '#ddd',
    border: `1px dashed rgba(255,255,255,0.2)`,
    fontSize: '11px',
  })
  // Set initial text directly (panel not in DOM yet, so querySelector won't work)
  if (isConnected()) {
    const name = getProjectName() ?? 'Project'
    folderBtn.textContent = `\u2713 ${name}/`
    folderBtn.style.color = T.green
    folderBtn.style.borderColor = T.green
    folderBtn.style.borderStyle = 'solid'
    folderBtn.style.background = 'rgba(34,197,94,0.06)'
  } else {
    folderBtn.textContent = 'Connect Project Folder'
    folderBtn.style.color = '#e0e0e0'
  }
  folderBtn.addEventListener('click', handleFolderConnect)
  topRow.appendChild(folderBtn)

  // Overflow menu button (···)
  const overflowBtn = document.createElement('button')
  overflowBtn.textContent = '\u22EF'
  Object.assign(overflowBtn.style, {
    ...footerBtnStyle(),
    width: '30px', height: '30px', flexShrink: '0',
    background: 'transparent', color: T.textMuted,
    border: `1px solid ${T.border}`, fontSize: '16px',
    padding: '0', position: 'relative',
  })

  // Overflow dropdown
  const dropdown = document.createElement('div')
  dropdown.id = 'vibelens-overflow-menu'
  Object.assign(dropdown.style, {
    display: 'none', position: 'absolute', bottom: '36px', right: '0',
    background: T.panelBg, border: `1px solid ${T.border}`,
    borderRadius: '8px', padding: '4px', minWidth: '150px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: '20',
  })

  const menuItems = [
    { label: 'Copy CSS', id: 'vibelens-copy-css-btn', handler: handleCopyCSS },
    { label: 'Copy as AI Prompt', id: 'vibelens-copy-prompt-btn', handler: handleCopyPrompt },
  ]
  for (const item of menuItems) {
    const menuBtn = document.createElement('button')
    menuBtn.id = item.id
    menuBtn.textContent = item.label
    Object.assign(menuBtn.style, {
      width: '100%', padding: '7px 12px', border: 'none', borderRadius: '5px',
      background: 'transparent', color: T.text, fontSize: '11px',
      fontFamily: FONT, textAlign: 'left', cursor: 'pointer',
      transition: 'background 0.1s', outline: 'none',
    })
    menuBtn.addEventListener('mouseenter', () => { menuBtn.style.background = T.sectionHover })
    menuBtn.addEventListener('mouseleave', () => { menuBtn.style.background = 'transparent' })
    menuBtn.addEventListener('click', () => {
      item.handler()
      dropdown.style.display = 'none'
    })
    dropdown.appendChild(menuBtn)
  }

  overflowBtn.appendChild(dropdown)
  overflowBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'
  })
  // Close on outside click (use capture + named handler for cleanup)
  const closeDropdown = () => { dropdown.style.display = 'none' }
  document.addEventListener('click', closeDropdown)
  // Store for cleanup in hideInspector
  overflowBtn.dataset.vlCleanup = 'true'
  ;(overflowBtn as unknown as { _closeDropdown: () => void })._closeDropdown = closeDropdown

  topRow.appendChild(overflowBtn)
  footer.appendChild(topRow)

  // Save / Apply button
  const applyBtn = document.createElement('button')
  applyBtn.id = 'vibelens-apply-btn'
  applyBtn.textContent = 'Save Changes'
  Object.assign(applyBtn.style, {
    ...footerBtnStyle(),
    height: '36px',
    width: '100%',
    background: T.accent,
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '12px',
    border: 'none',
    borderRadius: '8px',
    boxShadow: T.buttonShadow,
    opacity: '0.4',
    cursor: 'default',
  })
  applyBtn.addEventListener('click', handleApply)
  footer.appendChild(applyBtn)

  return footer
}

function footerBtnStyle(): Record<string, string> {
  return {
    height: '32px',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: FONT,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    outline: 'none',
  }
}

function updateApplyButton(): void {
  const btn = panel?.querySelector<HTMLElement>('#vibelens-apply-btn')
  if (!btn) return
  const count = Object.keys(pendingChanges).length
  const hasChanges = count > 0
  btn.style.opacity = hasChanges ? '1' : '0.4'
  btn.style.cursor = hasChanges ? 'pointer' : 'default'

  const canWriteToSource = bridgeStatus === 'connected' || isConnected()
  if (hasChanges) {
    btn.textContent = canWriteToSource
      ? `Apply ${count} Change${count > 1 ? 's' : ''} to Source`
      : `Save ${count} Change${count > 1 ? 's' : ''}`
  } else {
    btn.textContent = canWriteToSource ? 'Apply to Source' : 'Save Changes'
  }

  // Update export button states too
  const cssBtn = panel?.querySelector<HTMLElement>('#vibelens-copy-css-btn')
  const promptBtn = panel?.querySelector<HTMLElement>('#vibelens-copy-prompt-btn')
  if (cssBtn) { cssBtn.style.opacity = hasChanges ? '1' : '0.4'; cssBtn.style.cursor = hasChanges ? 'pointer' : 'default' }
  if (promptBtn) { promptBtn.style.opacity = hasChanges ? '1' : '0.4'; promptBtn.style.cursor = hasChanges ? 'pointer' : 'default' }
}

function updateTextEditButton(): void {
  const btn = panel?.querySelector<HTMLElement>('#vibelens-text-edit-btn')
  if (!btn) return
  const canEdit = selectedElement && !NON_TEXT_TAGS.has(selectedElement.tagName)
  btn.style.opacity = canEdit ? '1' : '0.3'
  btn.style.cursor = canEdit ? 'pointer' : 'default'

  if (isEditingText) {
    btn.textContent = '✓ Done Editing'
    btn.style.background = `${T.cyan}20`
    btn.style.color = T.cyan
    btn.style.borderColor = `${T.cyan}40`
  } else {
    btn.textContent = '✎ Edit Text'
    btn.style.background = 'transparent'
    btn.style.color = T.textMuted
    btn.style.borderColor = T.border
  }
}

/* ─── Element Selection (inspect mode) ─── */

function enableInspectMode(): void {
  if (inspectMode) return
  inspectMode = true
  document.addEventListener('mouseover', handleInspectHover)
  document.addEventListener('mouseout', handleInspectOut)
  document.addEventListener('click', handleInspectClick, true)
  document.addEventListener('dblclick', handleInspectDblClick, true)
  refreshHeaderButtons()
}

function disableInspectMode(): void {
  if (!inspectMode) return
  inspectMode = false
  removeInspectHighlight()
  document.removeEventListener('mouseover', handleInspectHover)
  document.removeEventListener('mouseout', handleInspectOut)
  document.removeEventListener('click', handleInspectClick, true)
  document.removeEventListener('dblclick', handleInspectDblClick, true)
  refreshHeaderButtons()
}

function handleInspectHover(e: MouseEvent): void {
  if (!inspectMode) return
  const target = e.target as HTMLElement
  if (target.closest(`#${PANEL_ID}`)) return
  if (target.closest('#vibelens-diff-container')) return
  if (target.closest('#vibelens-pin-container')) return
  if (target === highlightedElement) return

  removeInspectHighlight()
  highlightedElement = target
  saveInlineStyles(target, ['outline', 'outline-offset'])
  target.style.outline = `2px solid ${T.violet}`
  target.style.outlineOffset = '2px'
}

function handleInspectOut(e: MouseEvent): void {
  if (!inspectMode) return
  const target = e.target as HTMLElement
  if (target === highlightedElement) {
    removeInspectHighlight()
  }
}

function handleInspectClick(e: MouseEvent): void {
  if (!inspectMode) return
  const target = e.target as HTMLElement
  if (target.closest(`#${PANEL_ID}`)) return
  if (target.closest('#vibelens-diff-container')) return
  if (target.closest('#vibelens-pin-container')) return

  e.preventDefault()
  e.stopPropagation()

  selectElement(target)
}

function handleInspectDblClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target.closest(`#${PANEL_ID}`)) return
  if (target.closest('#vibelens-diff-container')) return
  if (target.closest('#vibelens-pin-container')) return

  e.preventDefault()
  e.stopPropagation()

  // Select the element if not already selected
  if (selectedElement !== target) {
    selectElement(target)
  }

  // Start text editing if the element supports it
  if (selectedElement && !NON_TEXT_TAGS.has(selectedElement.tagName)) {
    if (!isEditingText) startTextEdit()
  }
}

function removeInspectHighlight(): void {
  if (highlightedElement) {
    restoreInlineStyles(highlightedElement)
    highlightedElement = null
  }
}

/* ─── Element Selection ─── */

function selectElement(el: HTMLElement): void {
  // Finalize any text edit first
  if (isEditingText) finishTextEdit()

  // Clear previous selection outline
  if (selectedElement) {
    restoreInlineStyles(selectedElement)
  }

  // Reset pending changes
  pendingChanges = {}

  selectedElement = el

  // Show selection outline
  saveInlineStyles(el, ['outline', 'outline-offset'])
  el.style.outline = `2px solid ${T.accent}`
  el.style.outlineOffset = '2px'

  // Update breadcrumb
  renderBreadcrumb(el)

  // Render property sections
  renderSectionsFor(el)

  // Update footer buttons
  updateApplyButton()
  updateTextEditButton()
}

function deselectElement(): void {
  if (isEditingText) finishTextEdit()

  if (selectedElement) {
    clearStates(selectedElement)
    restoreInlineStyles(selectedElement)
    selectedElement = null
  }
  removeLayoutOverlay()
  pendingChanges = {}

  // Clear sections
  const sections = panel?.querySelector('#vibelens-sections')
  if (sections) sections.innerHTML = ''

  // Reset breadcrumb
  const breadcrumb = panel?.querySelector('#vibelens-breadcrumb')
  if (breadcrumb) breadcrumb.textContent = 'Click an element to inspect'
}

/* ─── Breadcrumb ─── */

function renderBreadcrumb(el: HTMLElement): void {
  const breadcrumb = panel?.querySelector('#vibelens-breadcrumb')
  if (!breadcrumb) return
  breadcrumb.innerHTML = ''

  // Walk ancestors to build path
  const path: HTMLElement[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.documentElement) {
    path.unshift(current)
    current = current.parentElement
  }

  // Limit to last 5 for space
  const displayed = path.slice(-5)
  if (path.length > 5) {
    const ellipsis = document.createElement('span')
    ellipsis.textContent = '… ›'
    Object.assign(ellipsis.style, { color: T.textDim, fontSize: '10px' })
    breadcrumb.appendChild(ellipsis)
  }

  displayed.forEach((ancestor, i) => {
    const crumb = document.createElement('span')
    const isActive = ancestor === el
    const tag = ancestor.tagName.toLowerCase()
    const id = ancestor.id ? `#${ancestor.id}` : ''
    // Show first class only for brevity
    const cls = typeof ancestor.className === 'string' && ancestor.className
      ? `.${ancestor.className.split(' ')[0]}`
      : ''
    crumb.textContent = `${tag}${id}${cls}`

    Object.assign(crumb.style, {
      fontSize: '10px',
      fontFamily: MONO,
      color: isActive ? T.accentText : T.textDim,
      fontWeight: isActive ? '600' : '400',
      cursor: 'pointer',
      padding: isActive ? '2px 8px' : '2px 4px',
      borderRadius: isActive ? '10px' : '3px',
      background: isActive ? T.accentBg : 'transparent',
      transition: 'all 0.15s ease',
    })

    // Click breadcrumb segment to select that ancestor
    crumb.addEventListener('click', () => selectElement(ancestor))
    crumb.addEventListener('mouseenter', () => { crumb.style.background = T.white08 })
    crumb.addEventListener('mouseleave', () => { crumb.style.background = 'transparent' })

    breadcrumb.appendChild(crumb)

    // Separator
    if (i < displayed.length - 1) {
      const sep = document.createElement('span')
      sep.textContent = '›'
      Object.assign(sep.style, { color: T.textDim, fontSize: '10px', margin: '0 1px' })
      breadcrumb.appendChild(sep)
    }
  })
}

/* ─── Sections Rendering ─── */

function renderSectionsFor(el: HTMLElement): void {
  const sections = panel?.querySelector('#vibelens-sections')
  if (!sections) return
  sections.innerHTML = ''

  const computed = window.getComputedStyle(el)

  // Element info bar
  const info = document.createElement('div')
  Object.assign(info.style, {
    padding: '8px 12px',
    borderBottom: `1px solid ${T.border}`,
    fontSize: '10px',
    fontFamily: MONO,
    color: T.textDim,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  })
  const tagLine = document.createElement('div')
  tagLine.textContent = describeElement(el)
  Object.assign(tagLine.style, { color: T.text, fontSize: '11px', fontWeight: '500' })
  info.appendChild(tagLine)

  const selectorLine = document.createElement('div')
  selectorLine.textContent = generateSelector(el)
  selectorLine.title = 'CSS selector'
  Object.assign(selectorLine.style, {
    fontSize: '10px', color: T.textDim,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    maxWidth: `${PANEL_WIDTH - 24}px`,
  })
  info.appendChild(selectorLine)

  // Hint for text editing
  if (!NON_TEXT_TAGS.has(el.tagName)) {
    const hint = document.createElement('div')
    hint.textContent = 'Double-click element to edit its text'
    Object.assign(hint.style, {
      fontSize: '9px', color: T.textDim, fontStyle: 'italic',
      marginTop: '2px',
    })
    info.appendChild(hint)
  }

  // Layout info badge + screenshot button
  const layoutInfo = getLayoutInfo(el)
  if (layoutInfo) {
    const badge = document.createElement('span')
    badge.textContent = layoutInfo
    Object.assign(badge.style, {
      fontSize: '9px', fontFamily: MONO, color: T.violet,
      background: 'rgba(168,85,247,0.1)', padding: '1px 6px',
      borderRadius: '3px', marginTop: '2px', display: 'inline-block',
      cursor: 'pointer',
    })
    badge.title = 'Click to show layout overlay'
    badge.addEventListener('click', () => showLayoutOverlay(el))
    info.appendChild(badge)
  }

  // Screenshot button inline
  const screenshotBtn = document.createElement('span')
  screenshotBtn.textContent = '\uD83D\uDCF7 Screenshot'
  Object.assign(screenshotBtn.style, {
    fontSize: '9px', fontFamily: MONO, color: T.textDim,
    cursor: 'pointer', marginTop: '2px', display: 'inline-block',
    transition: 'color 0.15s',
  })
  screenshotBtn.addEventListener('mouseenter', () => { screenshotBtn.style.color = T.text })
  screenshotBtn.addEventListener('mouseleave', () => { screenshotBtn.style.color = T.textDim })
  screenshotBtn.addEventListener('click', () => {
    captureElementScreenshot(el)
    screenshotBtn.textContent = '\u2713 Captured!'
    setTimeout(() => { screenshotBtn.textContent = '\uD83D\uDCF7 Screenshot' }, 1500)
  })
  info.appendChild(screenshotBtn)

  sections.appendChild(info)

  // State forcing toggles (:hover, :active, :focus, etc.)
  sections.appendChild(createStateToggles(el, () => renderSectionsFor(el)))

  // Media query bar
  const mqBar = createMediaQueryBar()
  if (mqBar) sections.appendChild(mqBar)

  // Accessibility: contrast ratio for text elements
  if (!NON_TEXT_TAGS.has(el.tagName)) {
    const fgColor = computed.color
    const bgColor = getEffectiveBackground(el)
    if (fgColor && bgColor) {
      const contrast = getContrastRatio(fgColor, bgColor)
      const contrastBar = document.createElement('div')
      Object.assign(contrastBar.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 12px', borderBottom: `1px solid ${T.border}`,
        fontSize: '10px', fontFamily: MONO,
      })

      const ratioText = document.createElement('span')
      ratioText.textContent = `${contrast.ratio}:1`
      Object.assign(ratioText.style, {
        color: contrast.aa ? T.green : T.red,
        fontWeight: '600',
      })
      contrastBar.appendChild(ratioText)

      const wcagLabel = document.createElement('span')
      wcagLabel.textContent = contrast.aaa ? 'AAA' : contrast.aa ? 'AA' : contrast.aaLarge ? 'AA Large' : 'Fail'
      Object.assign(wcagLabel.style, {
        fontSize: '9px',
        padding: '1px 5px',
        borderRadius: '3px',
        background: contrast.aa ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: contrast.aa ? T.green : T.red,
        fontWeight: '600',
      })
      contrastBar.appendChild(wcagLabel)

      // Suggest fix if failing
      if (!contrast.aa) {
        const suggestion = suggestAccessibleColor(fgColor, bgColor)
        if (suggestion) {
          const fixBtn = document.createElement('span')
          fixBtn.textContent = `Fix → ${suggestion}`
          Object.assign(fixBtn.style, {
            fontSize: '9px', color: T.accentText, cursor: 'pointer',
            marginLeft: 'auto',
          })
          fixBtn.addEventListener('click', () => {
            el.style.color = suggestion
            pendingChanges['color'] = { original: fgColor, value: suggestion }
            updateApplyButton()
            renderSectionsFor(el)
          })
          contrastBar.appendChild(fixBtn)
        }
      }

      sections.appendChild(contrastBar)
    }
  }

  // Shared change handler — accumulates changes for Apply
  const onChange: ChangeHandler = (property, original, newValue) => {
    pendingChanges[property] = { original, value: newValue }
    updateApplyButton()
  }

  // Render each section
  sections.appendChild(renderBoxModelSection(el, computed, onChange))
  sections.appendChild(renderBackgroundSection(el, computed, onChange))
  sections.appendChild(renderTypographySection(el, computed, onChange))

  // CSS Variables section (only if the element uses any)
  const varsSection = createVariablesSection(el, (varName, oldVal, newVal) => {
    pendingChanges[varName] = { original: oldVal, value: newVal }
    updateApplyButton()
  })
  if (varsSection) sections.appendChild(varsSection)

  sections.appendChild(renderPositionSection(el, computed, onChange))
  sections.appendChild(renderBorderSection(el, computed, onChange))
  sections.appendChild(renderEffectsSection(el, computed, onChange))
}

/** Walk up the DOM to find the effective background color (skipping transparent). */
function getEffectiveBackground(el: HTMLElement): string {
  let current: HTMLElement | null = el
  while (current) {
    const bg = getComputedStyle(current).backgroundColor
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg
    }
    current = current.parentElement
  }
  return '#ffffff' // default to white
}

/* ─── Text Editing ─── */

function startTextEdit(): void {
  if (!selectedElement) return
  isEditingText = true
  originalTextContent = selectedElement.textContent ?? ''
  saveInlineStyles(selectedElement, ['outline', 'outline-offset'])
  selectedElement.contentEditable = 'true'
  selectedElement.style.outline = `2px solid ${T.cyan}`
  selectedElement.style.outlineOffset = '2px'
  selectedElement.focus()
  selectedElement.addEventListener('keydown', handleTextKeydown)
  updateTextEditButton()
}

function finishTextEdit(): void {
  if (!isEditingText || !selectedElement) return
  isEditingText = false

  const newText = selectedElement.textContent ?? ''
  const oldText = originalTextContent ?? ''
  selectedElement.contentEditable = 'false'
  selectedElement.style.outline = `2px solid ${T.accent}`
  selectedElement.style.outlineOffset = '2px'
  selectedElement.removeEventListener('keydown', handleTextKeydown)

  if (newText !== oldText) {
    const selector = generateSelector(selectedElement)

    // Track as a pending change so Save button activates
    pendingChanges['textContent'] = { original: oldText, value: newText }
    updateApplyButton()

    // Save text change to storage for persistence across refreshes
    saveChanges(window.location.href, selector, {
      textContent: { original: oldText, value: newText },
    }).catch(() => {})

    // Also notify sidepanel/bridge if available
    sendToSidePanel({
      source: 'vibelens-content',
      type: 'text:changed',
      payload: { selector, oldText, newText, pageUrl: window.location.href },
    })
  }

  originalTextContent = null
  updateTextEditButton()
}

function handleTextKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (selectedElement && originalTextContent !== null) {
      selectedElement.textContent = originalTextContent
    }
    finishTextEdit()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    finishTextEdit()
  }
}

/* ─── Apply Changes ─── */

/**
 * Track whether we're waiting for a write:result from the bridge.
 * This is separate from the relay response — the relay succeeds when the
 * WS message is sent, but write:result arrives later with the actual outcome.
 */
let awaitingWriteResult = false

/* ─── Export Handlers ─── */

function collectChangesForExport(): StoredChange[] {
  if (!selectedElement) return []
  const selector = generateSelector(selectedElement)

  // If there are pending changes, export those
  if (Object.keys(pendingChanges).length > 0) {
    return Object.entries(pendingChanges).map(([prop, { original, value }]) => ({
      selector,
      property: prop,
      value,
      original,
      timestamp: Date.now(),
    }))
  }

  // Otherwise export the element's key computed styles
  const computed = window.getComputedStyle(selectedElement)
  const keyProps = [
    'color', 'background-color', 'font-size', 'font-weight', 'font-family',
    'padding', 'margin', 'border-radius', 'border', 'width', 'height',
    'display', 'opacity', 'box-shadow',
  ]
  return keyProps
    .map(prop => {
      const value = computed.getPropertyValue(prop)
      if (!value || value === 'none' || value === 'normal' || value === 'auto') return null
      return { selector, property: prop, value, original: value, timestamp: Date.now() }
    })
    .filter((c): c is StoredChange => c !== null)
}

async function handleCopyCSS(): Promise<void> {
  const changes = collectChangesForExport()
  if (!changes.length) {
    flashExportButton('vibelens-copy-css-btn', 'No element selected')
    return
  }
  try {
    const css = changesToCleanCSS(changes)
    await navigator.clipboard.writeText(css)
    flashExportButton('vibelens-copy-css-btn', 'Copied!')
  } catch {
    flashExportButton('vibelens-copy-css-btn', 'Copy failed')
  }
}

async function handleCopyPrompt(): Promise<void> {
  const changes = collectChangesForExport()
  if (!changes.length) {
    flashExportButton('vibelens-copy-prompt-btn', 'No element selected')
    return
  }
  try {
    const prompt = changesToPrompt(changes)
    await navigator.clipboard.writeText(prompt)
    flashExportButton('vibelens-copy-prompt-btn', 'Copied!')
  } catch {
    flashExportButton('vibelens-copy-prompt-btn', 'Copy failed')
  }
}

/* ─── Folder Connection ─── */

async function handleFolderConnect(): Promise<void> {
  if (isConnected()) {
    // Already connected — disconnect
    await disconnectFolder()
    updateFolderButton()
    updateApplyButton()
    updateStatusDot(bridgeStatus)
    return
  }

  const result = await connectFolder()
  if (result.success) {
    updateFolderButton()
    updateApplyButton()
    updateStatusDot('connected') // green dot — can write to files
  }
}

function updateFolderButton(): void {
  const btn = panel?.querySelector<HTMLElement>('#vibelens-folder-btn')
  if (!btn) return

  if (isConnected()) {
    const name = getProjectName() ?? 'Project'
    btn.textContent = `\u2713 ${name}/`
    btn.style.color = T.green
    btn.style.borderColor = T.green
    btn.style.borderStyle = 'solid'
    btn.style.background = 'rgba(34,197,94,0.06)'
    btn.title = 'Click to disconnect project folder'
  } else {
    btn.textContent = 'Connect Project Folder'
    btn.style.color = '#e0e0e0'
    btn.style.borderColor = 'rgba(255,255,255,0.2)'
    btn.style.borderStyle = 'dashed'
    btn.style.background = 'rgba(255,255,255,0.04)'
    btn.title = 'Select your project folder for auto write-back'
  }
}

function flashExportButton(_id: string, text: string): void {
  // Show a prominent toast at the bottom of the panel
  if (!panel) return
  const existing = panel.querySelector('#vibelens-toast')
  if (existing) existing.remove()

  const isSuccess = text === 'Copied!'
  const toast = document.createElement('div')
  toast.id = 'vibelens-toast'
  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '80px',
    left: '12px',
    right: '12px',
    padding: '10px 16px',
    borderRadius: '8px',
    background: isSuccess ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
    border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
    color: isSuccess ? '#4ade80' : '#fbbf24',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: FONT,
    textAlign: 'center',
    zIndex: '20',
    animation: 'vibelens-toast-in 0.2s ease',
    pointerEvents: 'none',
  })
  toast.textContent = isSuccess ? '\u2713 ' + text : text

  // Inject animation if not already present
  if (!panel.querySelector('#vibelens-toast-style')) {
    const style = document.createElement('style')
    style.id = 'vibelens-toast-style'
    style.textContent = `
      @keyframes vibelens-toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes vibelens-toast-out { from { opacity:1; } to { opacity:0; transform:translateY(4px); } }
    `
    panel.appendChild(style)
  }

  panel.appendChild(toast)

  setTimeout(() => {
    toast.style.animation = 'vibelens-toast-out 0.3s ease forwards'
    setTimeout(() => toast.remove(), 300)
  }, 1800)
}

/* ─── Apply / Save Changes ─── */

function handleApply(): void {
  if (!selectedElement || Object.keys(pendingChanges).length === 0) {
    console.debug('[VibeLens] handleApply: no element or no pending changes')
    return
  }

  // Finalize text edit if active
  if (isEditingText) finishTextEdit()

  const selector = generateSelector(selectedElement)

  // Always save to chrome.storage for persistence across refreshes
  saveChanges(window.location.href, selector, pendingChanges).catch(() => {})

  const btn = panel?.querySelector<HTMLElement>('#vibelens-apply-btn')

  // If bridge is not connected, try FS writer (Tier 2) or save locally (Tier 1)
  if (bridgeStatus !== 'connected') {
    if (isConnected()) {
      // Tier 2: write to source files via File System Access API
      if (btn) {
        btn.style.background = T.amber
        btn.style.opacity = '0.7'
        btn.textContent = 'Writing to source…'
        btn.style.pointerEvents = 'none'
      }

      const fsChanges = Object.entries(pendingChanges).map(([prop, { original, value }]) => ({
        property: prop, value, original,
      }))

      writeChangesToSource(selector, fsChanges).then((result) => {
        pendingChanges = {}
        updateApplyButton()
        if (btn) {
          btn.style.pointerEvents = 'auto'
          if (result.success) {
            btn.style.background = T.green
            btn.style.opacity = '1'
            btn.textContent = `✓ Saved → ${result.filePath}`
          } else {
            btn.style.background = T.red
            btn.style.opacity = '1'
            btn.textContent = `✗ ${result.error}`
          }
          setTimeout(() => {
            btn.style.background = T.accent
            updateApplyButton()
          }, 2500)
        }
      })
      return
    }

    // Tier 1: save to storage only
    pendingChanges = {}
    updateApplyButton()
    if (btn) {
      btn.style.background = T.green
      btn.style.opacity = '1'
      btn.textContent = '✓ Saved'
      setTimeout(() => {
        btn.style.background = T.accent
        updateApplyButton()
      }, 1500)
    }
    return
  }

  // Bridge is connected — also write to source files
  const changes = Object.entries(pendingChanges).map(([prop, { original, value }]) => ({
    property: dashToCamel(prop),
    originalValue: original,
    newValue: value,
  }))

  const payload = {
    selector,
    changes,
    computedStyles: getRelevantStyles(selectedElement),
    pageUrl: window.location.href,
    elementClasses: Array.from(selectedElement.classList),
    elementTag: selectedElement.tagName.toLowerCase(),
  }

  console.debug('[VibeLens] handleApply: sending style:apply', {
    selector,
    changeCount: changes.length,
    changes: changes.map(c => `${c.property}: ${c.originalValue} → ${c.newValue}`),
  })

  // Show "Sending…" state while awaiting bridge response
  if (btn) {
    btn.style.background = T.amber
    btn.textContent = 'Writing to source…'
    btn.style.opacity = '0.7'
    btn.style.pointerEvents = 'none'
  }

  // Use sendToBridge for response-aware relay
  sendToBridge({
    source: 'vibelens-content',
    type: 'style:apply',
    payload,
  }).then((response) => {
    if (response.ok) {
      // Relay succeeded — now wait for the actual write:result from bridge.
      // Show an intermediate "Writing…" state while we wait.
      awaitingWriteResult = true
      if (btn) {
        btn.style.background = T.amber
        btn.style.opacity = '0.8'
        btn.style.pointerEvents = 'none'
        btn.textContent = '⏳ Writing to file…'
      }

      // Safety timeout: if no write:result arrives within 10s, show warning
      setTimeout(() => {
        if (awaitingWriteResult) {
          awaitingWriteResult = false
          console.warn('[VibeLens] write:result timeout — no response from bridge after 10s')
          if (btn) {
            btn.style.background = T.amber
            btn.style.opacity = '1'
            btn.style.pointerEvents = 'auto'
            btn.textContent = '⚠ No write response'
            setTimeout(() => {
              btn.style.background = T.accent
              pendingChanges = {}
              updateApplyButton()
            }, 3000)
          }
        }
      }, 10_000)
    } else {
      // Relay itself failed — bridge not connected
      console.warn('[VibeLens] handleApply: bridge relay failed:', response.error)

      if (btn) {
        btn.style.background = T.red
        btn.style.opacity = '1'
        btn.style.pointerEvents = 'auto'
        btn.textContent = '✗ Bridge not connected'
        setTimeout(() => {
          btn.style.background = T.accent
          updateApplyButton()
        }, 3000)
      }
    }
  })
}

/**
 * Handle write:result messages broadcast by the service worker.
 * These arrive after the bridge completes (or fails) the actual file write.
 */
function handleWriteResult(message: {
  type?: string
  source?: string
  payload?: { success?: boolean; error?: string; filePath?: string; diff?: string | null }
}): void {
  if (message.type !== 'write:result' || message.source !== 'vibelens-bridge') return

  const { success, error, filePath } = message.payload ?? {}
  const btn = panel?.querySelector<HTMLElement>('#vibelens-apply-btn')

  console.log('[VibeLens] write:result received:', { success, error, filePath })

  awaitingWriteResult = false

  if (success) {
    // Write succeeded — file was modified on disk
    pendingChanges = {}
    updateApplyButton()

    if (btn) {
      btn.style.background = T.green
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'
      btn.textContent = `✓ Saved${filePath ? ` → ${filePath}` : ''}`
      setTimeout(() => {
        btn.style.background = T.accent
        updateApplyButton()
      }, 2500)
    }
  } else {
    // Write failed — show the error and keep pending changes for retry
    console.error('[VibeLens] Write failed:', error)

    if (btn) {
      btn.style.background = T.red
      btn.style.opacity = '1'
      btn.style.pointerEvents = 'auto'
      btn.textContent = `✗ ${error ?? 'Write failed'}`
      setTimeout(() => {
        btn.style.background = T.accent
        updateApplyButton()
      }, 4000)
    }
  }
}

/* ─── Bridge Status ─── */

function queryBridgeStatus(): void {
  try {
    chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
      if (chrome.runtime.lastError) return
      updateStatusDot(response?.status ?? 'disconnected')
    })
  } catch {
    // Extension context may be invalid
  }

  chrome.runtime.onMessage.addListener(statusListener)
}

function statusListener(message: Record<string, unknown>): void {
  if (message.source === 'vibelens-status' && typeof message.status === 'string') {
    updateStatusDot(message.status)
  }
  // Also handle write:result messages from the bridge
  if (message.source === 'vibelens-bridge' && message.type === 'write:result') {
    handleWriteResult(message as {
      type: string
      source: string
      payload?: { success?: boolean; error?: string; filePath?: string; diff?: string | null }
    })
  }
}

function updateStatusDot(status: string): void {
  bridgeStatus = status

  const dot = panel?.querySelector<HTMLElement>('#vibelens-inspector-status')
  const label = panel?.querySelector<HTMLElement>('#vibelens-status-label')

  const folderConnected = isConnected()
  const canWrite = folderConnected || status === 'connected'

  if (dot) {
    if (canWrite) {
      dot.style.background = T.green
    } else if (status === 'connecting') {
      dot.style.background = T.amber
    } else {
      dot.style.background = '#6b7280'
    }
  }

  if (label) {
    if (folderConnected) {
      label.textContent = getProjectName() ?? 'Connected'
      label.style.color = T.green
    } else if (status === 'connected') {
      label.textContent = 'Bridge'
      label.style.color = T.green
    } else {
      label.textContent = ''
      label.style.color = T.textDim
    }
  }

  // Update button label to reflect write capability
  updateApplyButton()
}

/* ─── Outside Click: deselect ─── */

document.addEventListener('mousedown', (e) => {
  if (!panel || !visible) return
  const target = e.target as HTMLElement
  // Click inside panel — let panel handle it
  if (target.closest(`#${PANEL_ID}`)) return
  // If inspect mode is active, let handleInspectClick handle it
  if (inspectMode) return
  // Click outside with no inspect mode — deselect
  deselectElement()
})

/* ─── SVG Icons (16×16, stroke) ─── */

const sv = (inner: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const ICON_SNAPSHOT = sv('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
