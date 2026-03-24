/**
 * H13+L2+L3: Annotation form overlay — shown when user clicks an element
 * in annotation mode. Lets user pick a type and write a message.
 */

import type { JSX } from 'preact'
import type { AnnotationType } from '@vibelens/shared'
import type { PendingAnnotation } from '../types.js'
import { ANNOTATION_TYPES, TYPE_META } from '../types.js'
import { S } from '../styles.js'

export interface AnnotationFormProps {
  pendingAnnotation: PendingAnnotation
  formType: AnnotationType
  formMessage: string
  onTypeChange: (t: AnnotationType) => void
  onMessageChange: (msg: string) => void
  onSave: () => void
  onCancel: () => void
}

export function AnnotationForm({
  pendingAnnotation,
  formType,
  formMessage,
  onTypeChange,
  onMessageChange,
  onSave,
  onCancel,
}: AnnotationFormProps): JSX.Element {
  return (
    <div style={S.formOverlay}>
      <div style={S.formCard}>
        <div style={S.formHeader}>
          <span style={S.formTitle}>New Annotation</span>
          <button onClick={onCancel} style={S.formCloseBtn}>×</button>
        </div>

        <div style={S.formElement}>
          <code style={S.formElementCode}>
            {pendingAnnotation.elementDescription.slice(0, 60)}
          </code>
        </div>

        {/* Type picker */}
        <div style={S.formTypeRow}>
          {ANNOTATION_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              style={{
                ...S.typeChip,
                ...(formType === t
                  ? { background: TYPE_META[t].color, color: '#fff', borderColor: TYPE_META[t].color }
                  : {}),
              }}
            >
              {TYPE_META[t].icon} {TYPE_META[t].label}
            </button>
          ))}
        </div>

        {/* Message input */}
        <textarea
          value={formMessage}
          onInput={(e) => onMessageChange((e.target as HTMLTextAreaElement).value)}
          placeholder="Describe the issue or suggestion…"
          style={S.formTextarea}
          rows={3}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        {/* Actions */}
        <div style={S.formActions}>
          <button onClick={onCancel} style={S.formCancelBtn}>
            Cancel
          </button>
          <button
            onClick={onSave}
            style={{
              ...S.formSaveBtn,
              ...(formMessage.trim() ? {} : { opacity: 0.4, cursor: 'not-allowed' }),
            }}
            disabled={!formMessage.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
