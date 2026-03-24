/**
 * C7+H5: Zod runtime validation schemas for all WS + postMessage boundaries.
 *
 * These schemas mirror the TypeScript interfaces in protocol.ts.
 * They validate incoming data at runtime before it reaches handler logic.
 *
 * Usage:
 *   const result = ExtensionMessageSchema.safeParse(data)
 *   if (!result.success) { log error; return }
 *   // result.data is fully typed and validated
 */

import { z } from 'zod'
import { ANNOTATION_CATEGORIES, SUPPORTED_FRAMEWORKS } from './constants.js'

// ─── Primitive Reusables ────────────────────────────────────────

const isoTimestamp = z.string().min(1)
const messageId = z.string().min(1)

/** Annotation category enum — derived from the constants array */
const annotationCategorySchema = z.enum(
  ANNOTATION_CATEGORIES as unknown as [string, ...string[]],
)

/** Framework type enum — derived from the constants array */
const frameworkTypeSchema = z.enum(
  SUPPORTED_FRAMEWORKS as unknown as [string, ...string[]],
)

// ─── Data Model Schemas ─────────────────────────────────────────

export const StyleChangeSchema = z.object({
  property: z.string().min(1),
  originalValue: z.string(),
  newValue: z.string(),
})

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  selector: z.string(),
  elementDescription: z.string(),
  category: annotationCategorySchema,
  message: z.string(),
  computedStyles: z.record(z.string(), z.string()),
  pageUrl: z.string(),
  resolved: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ─── Extension → Bridge Payload Schemas ─────────────────────────

export const SourceResolvePayloadSchema = z.object({
  selector: z.string().min(1),
  computedStyles: z.record(z.string(), z.string()),
  url: z.string(),
})

export const WriteRequestPayloadSchema = z.object({
  selector: z.string().min(1),
  changes: z.array(StyleChangeSchema).min(1),
  computedStyles: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().int().positive().optional(),
  /** Class list of the selected DOM element — used for accurate CSS rule matching */
  elementClasses: z.array(z.string()).optional(),
  /** Tag name of the selected DOM element (lowercase, e.g. 'button') */
  elementTag: z.string().optional(),
})

export const WriteConfirmPayloadSchema = z.object({
  requestId: z.string().min(1),
})

export const WriteCancelPayloadSchema = z.object({
  requestId: z.string().min(1),
})

export const TextChangedPayloadSchema = z.object({
  selector: z.string().min(1),
  oldText: z.string(),
  newText: z.string(),
  pageUrl: z.string(),
})

export const AnnotationsPushPayloadSchema = z.object({
  pageUrl: z.string(),
  timestamp: z.string(),
  annotations: z.array(AnnotationSchema),
})

// ─── Bridge → Extension Payload Schemas ─────────────────────────

export const BridgeStatusPayloadSchema = z.object({
  version: z.string(),
  port: z.number().int().positive(),
  projectRoot: z.string(),
  framework: frameworkTypeSchema.nullable(),
  devServerUrl: z.string().nullable(),
})

export const FileChangedPayloadSchema = z.object({
  filePath: z.string().min(1),
  changeType: z.enum(['create', 'modify', 'delete']),
  timestamp: z.string(),
})

export const SourceResolvedPayloadSchema = z.object({
  requestId: z.string().min(1),
  filePath: z.string().nullable(),
  line: z.number().nullable(),
  column: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  framework: frameworkTypeSchema.nullable(),
})

export const WriteResultPayloadSchema = z.object({
  requestId: z.string().min(1),
  success: z.boolean(),
  filePath: z.string(),
  diff: z.string().nullable(),
  error: z.string().nullable(),
})

export const WritePreviewPayloadSchema = z.object({
  requestId: z.string().min(1),
  filePath: z.string(),
  diff: z.string(),
  originalContent: z.string(),
  modifiedContent: z.string(),
})

export const AnnotationsPushedPayloadSchema = z.object({
  filePath: z.string(),
  annotationCount: z.number().int().nonnegative(),
  timestamp: z.string(),
})

// ─── Message Envelope Schemas ───────────────────────────────────

/**
 * Schema for messages sent from the extension to the bridge.
 * Uses discriminated union on the `type` field.
 */
export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('source:resolve'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: SourceResolvePayloadSchema,
  }),
  z.object({
    type: z.literal('write:request'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: WriteRequestPayloadSchema,
  }),
  z.object({
    type: z.literal('write:confirm'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: WriteConfirmPayloadSchema,
  }),
  z.object({
    type: z.literal('write:cancel'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: WriteCancelPayloadSchema,
  }),
  z.object({
    type: z.literal('text:changed'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: TextChangedPayloadSchema,
  }),
  z.object({
    type: z.literal('annotations:push'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: AnnotationsPushPayloadSchema,
  }),
])

/**
 * Schema for messages sent from the bridge to the extension.
 * Uses discriminated union on the `type` field.
 */
export const BridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bridge:status'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: BridgeStatusPayloadSchema,
  }),
  z.object({
    type: z.literal('file:changed'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: FileChangedPayloadSchema,
  }),
  z.object({
    type: z.literal('source:resolved'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: SourceResolvedPayloadSchema,
  }),
  z.object({
    type: z.literal('write:result'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: WriteResultPayloadSchema,
  }),
  z.object({
    type: z.literal('write:preview'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: WritePreviewPayloadSchema,
  }),
  z.object({
    type: z.literal('annotations:pushed'),
    id: messageId,
    timestamp: isoTimestamp,
    payload: AnnotationsPushedPayloadSchema,
  }),
])

// ─── Convenience Validators ─────────────────────────────────────

/**
 * Validate an incoming extension→bridge message.
 * Returns the typed message or null (with error details logged via callback).
 */
export function parseExtensionMessage(
  data: unknown,
  onError?: (error: z.ZodError) => void,
): z.infer<typeof ExtensionMessageSchema> | null {
  const result = ExtensionMessageSchema.safeParse(data)
  if (result.success) return result.data
  onError?.(result.error)
  return null
}

/**
 * Validate an incoming bridge→extension message.
 * Returns the typed message or null (with error details logged via callback).
 */
export function parseBridgeMessage(
  data: unknown,
  onError?: (error: z.ZodError) => void,
): z.infer<typeof BridgeMessageSchema> | null {
  const result = BridgeMessageSchema.safeParse(data)
  if (result.success) return result.data
  onError?.(result.error)
  return null
}
