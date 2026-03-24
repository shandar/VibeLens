/**
 * DOM Snapshot & Diff Engine
 *
 * Compares two DOM fingerprint snapshots to identify
 * added, modified, and removed elements.
 * This runs server-side for persistent storage of snapshots.
 */

import type { DOMFingerprint, DOMSnapshot, DiffResult } from '@vibelens/shared'

/**
 * Compare two snapshots to produce a diff result.
 */
export function computeDiff(before: DOMSnapshot, after: DOMSnapshot): DiffResult {
  const beforeMap = new Map<string, DOMFingerprint>()
  for (const el of before.elements) {
    beforeMap.set(el.selector, el)
  }

  const afterMap = new Map<string, DOMFingerprint>()
  for (const el of after.elements) {
    afterMap.set(el.selector, el)
  }

  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []

  // Check for added and modified elements
  for (const [selector, afterEl] of afterMap) {
    const beforeEl = beforeMap.get(selector)
    if (!beforeEl) {
      added.push(selector)
    } else if (
      beforeEl.styleHash !== afterEl.styleHash ||
      beforeEl.contentHash !== afterEl.contentHash ||
      beforeEl.childCount !== afterEl.childCount
    ) {
      modified.push(selector)
    }
  }

  // Check for removed elements
  for (const selector of beforeMap.keys()) {
    if (!afterMap.has(selector)) {
      removed.push(selector)
    }
  }

  return { added, modified, removed }
}

/**
 * Store for managing snapshot pairs per page URL.
 */
export class SnapshotStore {
  private snapshots = new Map<string, DOMSnapshot[]>()

  /**
   * Store a snapshot for a given URL.
   * Keeps the last two snapshots for diffing.
   */
  addSnapshot(snapshot: DOMSnapshot): void {
    const url = snapshot.url
    const existing = this.snapshots.get(url) ?? []
    existing.push(snapshot)
    // Keep only the last 2 snapshots per URL
    if (existing.length > 2) {
      existing.shift()
    }
    this.snapshots.set(url, existing)
  }

  /**
   * Get the diff between the last two snapshots for a URL.
   */
  getDiff(url: string): DiffResult | null {
    const snaps = this.snapshots.get(url)
    if (!snaps || snaps.length < 2) return null
    return computeDiff(snaps[0]!, snaps[1]!)
  }

  /**
   * Get the latest snapshot for a URL.
   */
  getLatest(url: string): DOMSnapshot | null {
    const snaps = this.snapshots.get(url)
    if (!snaps || snaps.length === 0) return null
    return snaps[snaps.length - 1]!
  }

  /**
   * Clear all snapshots.
   */
  clear(): void {
    this.snapshots.clear()
  }
}
