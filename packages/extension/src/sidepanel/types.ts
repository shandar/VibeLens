/**
 * H13+L2+L3: Shared types, constants, and helpers for the VibeLens side panel.
 *
 * Extracted from App.tsx to reduce its size and provide a single source of truth
 * for type definitions used across side panel components.
 */

import type { AnnotationType } from '@vibelens/shared'

/* ─────────────── Types ─────────────── */

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
export type ViewportMode = 'responsive' | 'mobile' | 'tablet' | 'desktop'

export interface BridgeInfo {
  version?: string
  port?: number
  projectRoot?: string
  framework?: string | null
  devServerUrl?: string | null
  uptime?: number
}

export interface EditingAnnotation {
  id: string
  category: AnnotationType
  message: string
}

export interface PendingAnnotation {
  selector: string
  elementDescription: string
  computedStyles: Record<string, string>
  pageUrl: string
}

/** C1/C2: preview data awaiting user confirmation before file write */
export interface PendingWritePreview {
  requestId: string
  filePath: string
  diff: string
}

/* ─────────────── Constants ─────────────── */

export const VIEWPORTS: Record<ViewportMode, { width: number; height: number; label: string; icon: string }> = {
  responsive: { width: 0, height: 0, label: 'Auto', icon: '↔' },
  mobile: { width: 375, height: 812, label: '375', icon: '📱' },
  tablet: { width: 768, height: 1024, label: '768', icon: '⬜' },
  desktop: { width: 1440, height: 900, label: '1440', icon: '🖥' },
}

export const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  disconnected: '#ef4444',
}

export const TYPE_META: Record<AnnotationType, { icon: string; color: string; label: string }> = {
  comment: { icon: '💬', color: '#3b82f6', label: 'Comment' },
  bug: { icon: '🐛', color: '#ef4444', label: 'Bug' },
  suggestion: { icon: '💡', color: '#f59e0b', label: 'Suggestion' },
  'style-change': { icon: '🎨', color: '#a78bfa', label: 'Style' },
}

export const ANNOTATION_TYPES = Object.keys(TYPE_META) as AnnotationType[]

export const STORAGE_KEY = 'vibelens-annotations'

/** M15: hard limit on stored annotations to prevent quota exhaustion */
export const MAX_ANNOTATIONS = 500

/* ─────────────── Helpers ─────────────── */

/** M17: dynamic bridge port — updated from chrome.storage */
export function getBridgeApiUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/status`
}

export function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
