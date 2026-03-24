/**
 * FS Writer — File System Access API for direct source file write-back.
 *
 * Tier 2 feature: user picks their project folder once, then CSS changes
 * write directly to source files without needing a bridge CLI.
 *
 * The File System Access API works on localhost pages (secure context)
 * when triggered by a user gesture. Directory handles persist via IndexedDB
 * so the user doesn't re-pick on every session.
 *
 * Flow:
 *   1. User clicks "Connect Project Folder"
 *   2. showDirectoryPicker() opens native OS folder picker
 *   3. Handle stored in IndexedDB for persistence
 *   4. On "Apply to Source", we walk the directory to find matching CSS files
 *   5. Read file → find selector/property → modify → write back
 */

/* ─── Types ─── */

interface WriteChange {
  property: string
  value: string
  original: string
}

interface WriteResult {
  success: boolean
  filePath?: string
  error?: string
}

/* ─── State ─── */

let directoryHandle: FileSystemDirectoryHandle | null = null
let projectName: string | null = null

/* ─── IndexedDB Persistence ─── */

const DB_NAME = 'vibelens-fs'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'project-dir'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function clearHandle(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // ignore
  }
}

/* ─── Public API ─── */

/**
 * Check if a project folder is already connected (from a previous session).
 * Verifies the stored handle still has permission.
 */
export async function restoreConnection(): Promise<boolean> {
  const handle = await loadHandle()
  if (!handle) return false

  // Verify we still have read/write permission
  const perm = await handle.queryPermission({ mode: 'readwrite' })
  if (perm === 'granted') {
    directoryHandle = handle
    projectName = handle.name
    return true
  }

  // Permission was revoked — try to re-request silently
  // (This will fail without a user gesture, which is fine — we'll prompt later)
  return false
}

/**
 * Prompt the user to select a project folder.
 * Must be called from a user gesture (button click).
 */
export async function connectFolder(): Promise<{ success: boolean; name?: string; error?: string }> {
  try {
    // @ts-expect-error — showDirectoryPicker is not in all TS libs
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
    })

    directoryHandle = handle
    projectName = handle.name

    // Persist for future sessions
    await saveHandle(handle)

    return { success: true, name: handle.name }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User cancelled the picker
      return { success: false, error: 'cancelled' }
    }
    return { success: false, error: String(err) }
  }
}

/**
 * Disconnect the project folder.
 */
export async function disconnectFolder(): Promise<void> {
  directoryHandle = null
  projectName = null
  await clearHandle()
}

/**
 * Check if a project folder is connected.
 */
export function isConnected(): boolean {
  return directoryHandle !== null
}

/**
 * Get the connected project folder name.
 */
export function getProjectName(): string | null {
  return projectName
}

/**
 * Write CSS changes to the matching source file.
 * Walks the project tree, finds the file containing the selector,
 * and applies the property changes.
 */
export async function writeChangesToSource(
  selector: string,
  changes: WriteChange[],
): Promise<WriteResult> {
  if (!directoryHandle) {
    return { success: false, error: 'No project folder connected' }
  }

  try {
    // Find files that contain the selector or class name
    const className = extractClassName(selector)
    const matchingFiles = await findFilesContaining(directoryHandle, className ?? selector)

    if (matchingFiles.length === 0) {
      return { success: false, error: `No source file found for "${className ?? selector}"` }
    }

    // Use the first match (most likely the right file)
    const { handle: fileHandle, path } = matchingFiles[0]!

    // Read the file
    const file = await fileHandle.getFile()
    const content = await file.text()

    // Apply changes
    const modified = applyChangesToCSS(content, className ?? selector, changes)

    if (modified === content) {
      return { success: false, error: 'No matching rule found to modify' }
    }

    // Write back
    const writable = await fileHandle.createWritable()
    await writable.write(modified)
    await writable.close()

    return { success: true, filePath: path }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/* ─── File Search ─── */

const SOURCE_EXTENSIONS = new Set([
  'css', 'scss', 'less', 'sass',
  'jsx', 'tsx', 'vue', 'svelte',
  'html', 'htm',
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.svelte-kit', '__pycache__', '.venv', 'coverage',
])

interface FileMatch {
  handle: FileSystemFileHandle
  path: string
}

async function findFilesContaining(
  dirHandle: FileSystemDirectoryHandle,
  searchTerm: string,
  basePath = '',
): Promise<FileMatch[]> {
  const results: FileMatch[] = []

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue
      const subResults = await findFilesContaining(
        handle as FileSystemDirectoryHandle,
        searchTerm,
        `${basePath}${name}/`,
      )
      results.push(...subResults)
      // Stop early if we found matches
      if (results.length >= 5) break
    } else if (handle.kind === 'file') {
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!SOURCE_EXTENSIONS.has(ext)) continue

      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        // Skip large files (>500KB)
        if (file.size > 500_000) continue
        const content = await file.text()
        if (content.includes(searchTerm)) {
          results.push({
            handle: handle as FileSystemFileHandle,
            path: `${basePath}${name}`,
          })
        }
      } catch {
        // Can't read file — skip
      }
    }
  }

  return results
}

/* ─── CSS Modification ─── */

/**
 * Extract a class name from a CSS selector.
 * ".btn-primary" → "btn-primary"
 * "div.hero > .btn-primary" → "btn-primary"
 */
function extractClassName(selector: string): string | null {
  // Get the last class in the selector
  const matches = selector.match(/\.([a-zA-Z_-][\w-]*)/g)
  if (!matches || matches.length === 0) return null
  // Return the last class without the dot
  return matches[matches.length - 1]!.slice(1)
}

/**
 * Apply property changes to CSS content.
 * Finds the rule containing the class name and modifies matching properties.
 * Works with plain CSS and SCSS.
 */
function applyChangesToCSS(
  content: string,
  className: string,
  changes: WriteChange[],
): string {
  // Build a regex that finds a CSS rule block containing the class name
  // Handles: .btn-primary { ... }, .hero .btn-primary { ... }, etc.
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ruleRegex = new RegExp(
    `([^{}]*\\.${escapedClass}[^{]*)\\{([^}]*)\\}`,
    'g',
  )

  let modified = content
  let matched = false

  modified = content.replace(ruleRegex, (fullMatch, selectorPart: string, body: string) => {
    let newBody = body
    for (const change of changes) {
      // camelCase to kebab-case
      const kebabProp = change.property.replace(/([A-Z])/g, '-$1').toLowerCase()

      // Find and replace the property value
      const propRegex = new RegExp(
        `(${kebabProp}\\s*:\\s*)([^;!}]+)(\\s*(?:!important)?\\s*[;}])`,
        'i',
      )

      if (propRegex.test(newBody)) {
        newBody = newBody.replace(propRegex, `$1${change.value}$3`)
        matched = true
      } else {
        // Property doesn't exist in the rule — add it
        const indent = newBody.match(/^(\s+)/m)?.[1] ?? '  '
        newBody = newBody.trimEnd() + `\n${indent}${kebabProp}: ${change.value};\n`
        matched = true
      }
    }

    return `${selectorPart}{${newBody}}`
  })

  return matched ? modified : content
}
