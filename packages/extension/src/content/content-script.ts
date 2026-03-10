/**
 * VibeLens Content Script
 *
 * Injected into localhost pages to provide:
 * - Element highlighting on hover
 * - Annotation pin placement
 * - DOM snapshot capture for diff
 * - Visual diff overlay rendering
 */

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.source === 'vibelens-bridge' && message.type === 'file:changed') {
    // Auto-reload the page when files change
    window.location.reload()
  }

  if (message.source === 'vibelens-command') {
    switch (message.command) {
      case 'toggle-annotations':
        toggleAnnotationMode()
        break
      case 'toggle-diff':
        toggleDiffOverlay()
        break
    }
  }
})

let annotationMode = false
let diffOverlayVisible = false

function toggleAnnotationMode(): void {
  annotationMode = !annotationMode
  document.body.style.cursor = annotationMode ? 'crosshair' : ''

  if (annotationMode) {
    document.addEventListener('mouseover', handleHover)
    document.addEventListener('click', handleAnnotationClick, true)
  } else {
    document.removeEventListener('mouseover', handleHover)
    document.removeEventListener('click', handleAnnotationClick, true)
    removeHighlight()
  }
}

function toggleDiffOverlay(): void {
  diffOverlayVisible = !diffOverlayVisible
  // Phase 1 M1.5: will render diff overlay elements
}

let highlightedElement: HTMLElement | null = null

function handleHover(e: MouseEvent): void {
  if (!annotationMode) return

  const target = e.target as HTMLElement
  if (target === highlightedElement) return

  removeHighlight()

  highlightedElement = target
  target.style.outline = '2px solid #3b82f6'
  target.style.outlineOffset = '2px'
}

function handleAnnotationClick(e: MouseEvent): void {
  if (!annotationMode) return

  e.preventDefault()
  e.stopPropagation()

  const target = e.target as HTMLElement
  const selector = generateSelector(target)

  // Send annotation request to side panel via service worker
  chrome.runtime.sendMessage({
    source: 'vibelens-content',
    type: 'annotation:create',
    payload: {
      selector,
      elementDescription: describeElement(target),
      computedStyles: getRelevantStyles(target),
      pageUrl: window.location.href,
    },
  }).catch(() => {
    // Side panel may not be listening
  })
}

function removeHighlight(): void {
  if (highlightedElement) {
    highlightedElement.style.outline = ''
    highlightedElement.style.outlineOffset = ''
    highlightedElement = null
  }
}

/**
 * Generate a unique CSS selector for an element.
 * Prefers: id > data attributes > nth-child path
 */
function generateSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`

  // Try data-testid or data-vibelens-src
  const testId = el.getAttribute('data-testid')
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`

  // Build path from root
  const parts: string[] = []
  let current: HTMLElement | null = el

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }

    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName,
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    parts.unshift(selector)
    current = current.parentElement
  }

  return parts.join(' > ')
}

/**
 * Generate a human-readable description of an element.
 */
function describeElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const classes = el.className ? `.${el.className.split(' ').join('.')}` : ''
  const text = el.textContent?.trim().slice(0, 50) ?? ''
  return `<${tag}${classes}>${text ? ` "${text}"` : ''}`
}

/**
 * Get style properties relevant for annotation context.
 */
function getRelevantStyles(el: HTMLElement): Record<string, string> {
  const computed = window.getComputedStyle(el)
  const properties = [
    'color',
    'background-color',
    'font-size',
    'font-weight',
    'padding',
    'margin',
    'border-radius',
    'border',
    'width',
    'height',
    'display',
    'position',
    'gap',
    'opacity',
  ]

  const styles: Record<string, string> = {}
  for (const prop of properties) {
    styles[prop] = computed.getPropertyValue(prop)
  }
  return styles
}

// Announce content script is ready
chrome.runtime.sendMessage({
  source: 'vibelens-content',
  type: 'content:ready',
  payload: { url: window.location.href },
}).catch(() => {
  // Service worker may not be ready
})
