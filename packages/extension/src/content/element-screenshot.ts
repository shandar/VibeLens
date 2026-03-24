/**
 * Element Screenshot — capture a selected element as a PNG.
 *
 * Uses the native browser captureVisibleTab API (via service worker relay)
 * and crops to the element's bounding rect.
 * Falls back to html2canvas-style approach if the API is unavailable.
 */

/* ─── Public API ─── */

/**
 * Capture a screenshot of a specific element and download it as PNG.
 */
export async function captureElementScreenshot(el: HTMLElement): Promise<void> {
  const rect = el.getBoundingClientRect()

  try {
    // Ask the service worker to capture the visible tab
    const response = await new Promise<{ dataUrl?: string }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'capture-screenshot' }, (res) => {
        resolve(res ?? {})
      })
    })

    if (response.dataUrl) {
      await cropAndDownload(response.dataUrl, rect)
      return
    }
  } catch {
    // Service worker capture failed — try canvas fallback
  }

  // Fallback: use Range + canvas approach
  try {
    await canvasFallback(el, rect)
  } catch (err) {
    console.warn('[VibeLens] Screenshot capture failed:', err)
  }
}

/* ─── Internal ─── */

async function cropAndDownload(dataUrl: string, rect: DOMRect): Promise<void> {
  const img = new Image()
  img.src = dataUrl

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
  })

  // Account for device pixel ratio
  const dpr = window.devicePixelRatio || 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.drawImage(
    img,
    Math.round(rect.left * dpr),
    Math.round(rect.top * dpr),
    Math.round(rect.width * dpr),
    Math.round(rect.height * dpr),
    0, 0,
    canvas.width,
    canvas.height,
  )

  downloadCanvas(canvas)
}

async function canvasFallback(el: HTMLElement, rect: DOMRect): Promise<void> {
  // Simple approach: capture using a canvas with drawImage of the element
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Create an SVG foreignObject to render the element
  const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${rect.width}px;height:${rect.height}px;overflow:hidden;">
          ${el.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `

  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve() // Still try to download even if SVG render fails
  })

  ctx.scale(dpr, dpr)
  ctx.drawImage(img, 0, 0)

  downloadCanvas(canvas)
}

function downloadCanvas(canvas: HTMLCanvasElement): void {
  const link = document.createElement('a')
  link.download = `vibelens-element-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
