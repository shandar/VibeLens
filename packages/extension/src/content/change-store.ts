/**
 * Change Store — persists CSS changes in chrome.storage.local.
 *
 * Changes are keyed by normalized page URL (hostname:port/path, no query/hash).
 * On page load the content script calls `loadChanges()` and re-injects saved
 * styles so edits survive refreshes without needing a bridge.
 */

/* ─── Types ─── */

export interface StoredChange {
  selector: string
  property: string
  value: string
  original: string
  timestamp: number
}

/* ─── URL Normalization ─── */

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    // vibelens:localhost:5173/dashboard
    return `vibelens:${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}`
  } catch {
    return `vibelens:${raw}`
  }
}

/* ─── Public API ─── */

/**
 * Save (merge) CSS changes for a given page URL + selector.
 * Overwrites existing entries for the same selector+property combo.
 */
export async function saveChanges(
  pageUrl: string,
  selector: string,
  changes: Record<string, { original: string; value: string }>,
): Promise<void> {
  const key = normalizeUrl(pageUrl)
  const existing = await loadChangesRaw(key)

  for (const [property, { original, value }] of Object.entries(changes)) {
    // Find existing entry for this selector+property
    const idx = existing.findIndex(
      (c) => c.selector === selector && c.property === property,
    )
    const entry: StoredChange = {
      selector,
      property,
      value,
      original,
      timestamp: Date.now(),
    }
    if (idx >= 0) {
      existing[idx] = entry
    } else {
      existing.push(entry)
    }
  }

  await chrome.storage.local.set({ [key]: existing })
}

/**
 * Load all stored changes for a page URL.
 */
export async function loadChanges(pageUrl: string): Promise<StoredChange[]> {
  return loadChangesRaw(normalizeUrl(pageUrl))
}

/**
 * Clear all stored changes for a page URL.
 */
export async function clearChanges(pageUrl: string): Promise<void> {
  const key = normalizeUrl(pageUrl)
  await chrome.storage.local.remove(key)
}

/**
 * Clear all VibeLens stored changes across all URLs.
 */
export async function clearAllChanges(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter((k) => k.startsWith('vibelens:'))
  if (keys.length) await chrome.storage.local.remove(keys)
}

/**
 * Get count of stored changes for a page URL (for badge display).
 */
export async function getChangeCount(pageUrl: string): Promise<number> {
  const changes = await loadChanges(pageUrl)
  return changes.length
}

/* ─── Internal ─── */

async function loadChangesRaw(key: string): Promise<StoredChange[]> {
  const result = await chrome.storage.local.get(key)
  const stored = result[key]
  if (Array.isArray(stored)) return stored as StoredChange[]
  return []
}

/* ─── CSS Generation ─── */

/**
 * Generate a CSS string from stored changes, grouped by selector.
 * Used for both re-injection (<style> tag) and clipboard export.
 */
export function changesToCSS(changes: StoredChange[]): string {
  if (!changes.length) return ''

  // Group by selector
  const grouped = new Map<string, { property: string; value: string }[]>()
  for (const c of changes) {
    const list = grouped.get(c.selector) ?? []
    list.push({ property: c.property, value: c.value })
    grouped.set(c.selector, list)
  }

  const rules: string[] = []
  for (const [selector, props] of grouped) {
    const declarations = props
      .map((p) => `  ${p.property}: ${p.value} !important;`)
      .join('\n')
    rules.push(`${selector} {\n${declarations}\n}`)
  }
  return rules.join('\n\n')
}

/**
 * Generate clean CSS (without !important) for export/clipboard.
 */
export function changesToCleanCSS(changes: StoredChange[]): string {
  if (!changes.length) return ''

  const grouped = new Map<string, { property: string; value: string }[]>()
  for (const c of changes) {
    const list = grouped.get(c.selector) ?? []
    list.push({ property: c.property, value: c.value })
    grouped.set(c.selector, list)
  }

  const rules: string[] = []
  for (const [selector, props] of grouped) {
    const declarations = props
      .map((p) => `  ${p.property}: ${p.value};`)
      .join('\n')
    rules.push(`${selector} {\n${declarations}\n}`)
  }
  return `/* VibeLens changes */\n${rules.join('\n\n')}`
}

/**
 * Generate an AI-ready prompt describing the changes.
 */
export function changesToPrompt(changes: StoredChange[]): string {
  if (!changes.length) return ''

  const lines = changes.map(
    (c) =>
      `- \`${c.selector}\`: change \`${c.property}\` from \`${c.original}\` to \`${c.value}\``,
  )
  return `Make these CSS changes:\n\n${lines.join('\n')}`
}
