/**
 * H13+L2+L3: Write confirmation panel — C1/C2 two-phase commit UI.
 *
 * Displays a diff preview of pending file writes and lets the user
 * confirm (Apply) or cancel the operation.
 */

import type { JSX } from 'preact'
import type { PendingWritePreview } from '../types.js'
import { S } from '../styles.js'

export interface WriteConfirmationProps {
  pendingWrite: PendingWritePreview
  onConfirm: () => void
  onCancel: () => void
}

export function WriteConfirmation({
  pendingWrite,
  onConfirm,
  onCancel,
}: WriteConfirmationProps): JSX.Element {
  return (
    <div style={S.writeConfirmOverlay}>
      <div style={S.writeConfirmPanel}>
        <div style={S.writeConfirmHeader}>
          <span style={{ fontWeight: 600 }}>📋 Confirm Write</span>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>{pendingWrite.filePath}</span>
        </div>
        <pre style={S.writeConfirmDiff}>{pendingWrite.diff}</pre>
        <div style={S.writeConfirmActions}>
          <button onClick={onCancel} style={S.writeConfirmCancel}>
            Cancel
          </button>
          <button onClick={onConfirm} style={S.writeConfirmApply}>
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}
