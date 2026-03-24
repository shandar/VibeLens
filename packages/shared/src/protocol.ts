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

export interface AnnotationsPushedPayload {
  filePath: string
  annotationCount: number
  timestamp: string
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
  /** Computed styles of the target element — helps the resolver match CSS rules */
  computedStyles?: Record<string, string>
  /** Page URL where the edit was made — helps the resolver narrow the search */
  url?: string
  sourceFile?: string
  sourceLine?: number
  /** Class list of the selected DOM element — used for accurate CSS rule matching
   *  when the grep resolver returns an ancestor's line instead of the target's */
  elementClasses?: string[]
  /** Tag name of the selected DOM element (lowercase, e.g. 'button') */
  elementTag?: string
}

/** C1/C2: write:confirm payload — user approved the previewed write */
export interface WriteConfirmPayload {
  requestId: string
}

/** C1/C2: write:cancel payload — user rejected the previewed write */
export interface WriteCancelPayload {
  requestId: string
}

/** C7: text:changed payload — sent when inline text is edited in the preview */
export interface TextChangedPayload {
  selector: string
  oldText: string
  newText: string
  pageUrl: string
}

/** C7: annotations:push payload — sent when annotations are exported to the bridge */
export interface AnnotationsPushPayload {
  pageUrl: string
  timestamp: string
  /** H14: reuses the shared Annotation type */
  annotations: Annotation[]
}

// ─── Bridge → Extension message types (union) ──────────────────

export type BridgeMessage =
  | MessageEnvelope<'bridge:status', BridgeStatusPayload>
  | MessageEnvelope<'file:changed', FileChangedPayload>
  | MessageEnvelope<'source:resolved', SourceResolvedPayload>
  | MessageEnvelope<'write:result', WriteResultPayload>
  | MessageEnvelope<'write:preview', WritePreviewPayload>
  | MessageEnvelope<'annotations:pushed', AnnotationsPushedPayload>

// ─── Extension → Bridge message types (union) ──────────────────

export type ExtensionMessage =
  | MessageEnvelope<'source:resolve', SourceResolvePayload>
  | MessageEnvelope<'write:request', WriteRequestPayload>
  | MessageEnvelope<'write:confirm', WriteConfirmPayload>
  | MessageEnvelope<'write:cancel', WriteCancelPayload>
  | MessageEnvelope<'text:changed', TextChangedPayload>
  | MessageEnvelope<'annotations:push', AnnotationsPushPayload>

// ─── Data Models ───────────────────────────────────────────────

import type { ANNOTATION_CATEGORIES, SUPPORTED_FRAMEWORKS } from './constants.js'

export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number]
/** H14: backwards-compatible alias used by extension UI */
export type AnnotationType = AnnotationCategory
export type FrameworkType = (typeof SUPPORTED_FRAMEWORKS)[number]

/** H14: unified Annotation — single source of truth for all packages */
export interface Annotation {
  id: string
  /** CSS selector path for re-anchoring */
  selector: string
  /** Human-readable element description */
  elementDescription: string
  /** Annotation category (aliased as `type` in older code paths) */
  category: AnnotationCategory
  /** User's annotation message */
  message: string
  /** Snapshot of computed styles at time of annotation */
  computedStyles: Record<string, string>
  /** Page URL where annotation was created */
  pageUrl: string
  /** Whether this annotation has been resolved */
  resolved: boolean
  /** ISO 8601 timestamp */
  createdAt: string
  /** ISO 8601 timestamp — last edit */
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
