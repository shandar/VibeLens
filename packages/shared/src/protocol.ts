/**
 * VibeLens WebSocket Protocol
 *
 * All messages use a typed envelope: { type, id, timestamp, payload }
 * Message types are namespaced: `domain:action`
 */

// ─── Message Envelope ──────────────────────────────────────────

export interface MessageEnvelope<T extends string = string, P = unknown> {
  /** Namespaced message type, e.g. 'file:changed' */
  type: T
  /** Unique message ID for request/response correlation */
  id: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Type-specific payload */
  payload: P
}

// ─── Bridge → Extension Messages ───────────────────────────────

export interface BridgeStatusPayload {
  version: string
  port: number
  projectRoot: string
  framework: FrameworkType | null
  devServerUrl: string | null
}

export interface FileChangedPayload {
  filePath: string
  changeType: 'create' | 'modify' | 'delete'
  timestamp: string
}

export interface SourceResolvedPayload {
  requestId: string
  filePath: string | null
  line: number | null
  column: number | null
  confidence: number
  framework: FrameworkType | null
}

export interface WriteResultPayload {
  requestId: string
  success: boolean
  filePath: string
  diff: string | null
  error: string | null
}

export interface WritePreviewPayload {
  requestId: string
  filePath: string
  diff: string
  originalContent: string
  modifiedContent: string
}

// ─── Extension → Bridge Messages ───────────────────────────────

export interface SourceResolvePayload {
  selector: string
  computedStyles: Record<string, string>
  url: string
}

export interface WriteRequestPayload {
  selector: string
  changes: StyleChange[]
  sourceFile?: string
  sourceLine?: number
}

// ─── Bridge → Extension message types (union) ──────────────────

export type BridgeMessage =
  | MessageEnvelope<'bridge:status', BridgeStatusPayload>
  | MessageEnvelope<'file:changed', FileChangedPayload>
  | MessageEnvelope<'source:resolved', SourceResolvedPayload>
  | MessageEnvelope<'write:result', WriteResultPayload>
  | MessageEnvelope<'write:preview', WritePreviewPayload>

// ─── Extension → Bridge message types (union) ──────────────────

export type ExtensionMessage =
  | MessageEnvelope<'source:resolve', SourceResolvePayload>
  | MessageEnvelope<'write:request', WriteRequestPayload>

// ─── Data Models ───────────────────────────────────────────────

import type { ANNOTATION_CATEGORIES, SUPPORTED_FRAMEWORKS } from './constants.js'

export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number]
export type FrameworkType = (typeof SUPPORTED_FRAMEWORKS)[number]

export interface Annotation {
  id: string
  /** CSS selector path for re-anchoring */
  selector: string
  /** Human-readable element description */
  elementDescription: string
  /** Annotation category */
  category: AnnotationCategory
  /** User's annotation message */
  message: string
  /** Snapshot of computed styles at time of annotation */
  computedStyles: Record<string, string>
  /** Page URL where annotation was created */
  pageUrl: string
  /** ISO 8601 timestamp */
  createdAt: string
  /** ISO 8601 timestamp */
  updatedAt: string
}

export interface StyleChange {
  /** CSS property name (camelCase) */
  property: string
  /** Original value */
  originalValue: string
  /** New value */
  newValue: string
}

export interface DOMFingerprint {
  /** CSS selector */
  selector: string
  /** Tag name */
  tag: string
  /** Style-relevant property hash */
  styleHash: string
  /** Text content hash (truncated) */
  contentHash: string
  /** Child count */
  childCount: number
}

export interface DOMSnapshot {
  /** Page URL */
  url: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Fingerprints of observed elements */
  elements: DOMFingerprint[]
}

export interface DiffResult {
  /** Newly added elements */
  added: string[]
  /** Modified elements (style or content changed) */
  modified: string[]
  /** Removed elements */
  removed: string[]
}

export interface ViewportSize {
  width: number
  height: number
  label?: string
}

// ─── Export Formats ────────────────────────────────────────────

export interface AnnotationExport {
  version: string
  projectName: string
  pageUrl: string
  exportedAt: string
  annotations: Annotation[]
}

// ─── HTTP API Types ────────────────────────────────────────────

export interface StatusResponse {
  status: 'ok'
  version: string
  port: number
  projectRoot: string
  framework: FrameworkType | null
  devServerUrl: string | null
  uptime: number
}
