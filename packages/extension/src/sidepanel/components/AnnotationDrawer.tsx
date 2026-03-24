/**
 * H13+L2+L3: Annotation drawer — collapsible panel listing all annotations
 * with inline editing, resolve/delete actions, and push-to-IDE button.
 */

import type { JSX } from 'preact'
import type { Annotation } from '@vibelens/shared'
import type { ConnectionStatus, EditingAnnotation } from '../types.js'
import { ANNOTATION_TYPES, TYPE_META } from '../types.js'
import { S } from '../styles.js'

export interface AnnotationDrawerProps {
  annotations: Annotation[]
  activeAnnotations: Annotation[]
  drawerOpen: boolean
  selectedAnnotationId: string | null
  editingAnnotation: EditingAnnotation | null
  pushStatus: 'idle' | 'pushing' | 'done' | 'error'
  status: ConnectionStatus
  onToggleDrawer: () => void
  onSelectAnnotation: (id: string | null) => void
  onStartEdit: (ann: Annotation) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditingChange: (ea: EditingAnnotation) => void
  onToggleResolved: (id: string) => void
  onDelete: (id: string) => void
  onPushToIDE: () => void
}

export function AnnotationDrawer({
  annotations,
  activeAnnotations,
  drawerOpen,
  selectedAnnotationId,
  editingAnnotation,
  pushStatus,
  status,
  onToggleDrawer,
  onSelectAnnotation,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditingChange,
  onToggleResolved,
  onDelete,
  onPushToIDE,
}: AnnotationDrawerProps): JSX.Element | null {
  if (annotations.length === 0) return null

  return (
    <div style={S.drawer}>
      <button
        onClick={onToggleDrawer}
        style={S.drawerToggle}
      >
        <span style={S.drawerToggleText}>
          📌 {activeAnnotations.length} annotation{activeAnnotations.length !== 1 ? 's' : ''}
          {annotations.length !== activeAnnotations.length && (
            <span style={S.resolvedCount}>
              {' '}({annotations.length - activeAnnotations.length} resolved)
            </span>
          )}
        </span>
        <span style={S.drawerArrow}>{drawerOpen ? '▼' : '▲'}</span>
      </button>

      {drawerOpen && (
        <div style={S.drawerContent}>
          {annotations.map((ann, i) => {
            const meta = TYPE_META[ann.category]
            const isSelected = selectedAnnotationId === ann.id
            const isEditing = editingAnnotation?.id === ann.id
            return (
              <div
                key={ann.id}
                style={{
                  ...S.annotationItem,
                  ...(isSelected ? S.annotationItemSelected : {}),
                  ...(ann.resolved ? S.annotationItemResolved : {}),
                }}
                onClick={() => {
                  if (!isEditing) {
                    onSelectAnnotation(ann.id === selectedAnnotationId ? null : ann.id)
                  }
                }}
              >
                <div style={S.annotationHeader}>
                  <span style={S.annotationIndex}>{i + 1}</span>
                  <span
                    style={{
                      ...S.annotationBadge,
                      background: `${meta.color}22`,
                      color: meta.color,
                    }}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  <div style={{ flex: 1 }} />
                  {!isEditing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartEdit(ann)
                      }}
                      style={S.resolveBtn}
                      title="Edit annotation"
                    >
                      ✎
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleResolved(ann.id)
                    }}
                    style={{
                      ...S.resolveBtn,
                      ...(ann.resolved ? { color: '#f59e0b' } : { color: '#22c55e' }),
                    }}
                    title={ann.resolved ? 'Unresolve' : 'Resolve'}
                  >
                    {ann.resolved ? '↩' : '✓'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(ann.id)
                    }}
                    style={S.deleteBtn}
                    title="Delete annotation"
                  >
                    ×
                  </button>
                </div>

                {isEditing ? (
                  /* Inline edit form */
                  <div style={S.editForm} onClick={(e) => e.stopPropagation()}>
                    <div style={S.formTypeRow}>
                      {ANNOTATION_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() =>
                            onEditingChange({ ...editingAnnotation!, category: t })
                          }
                          style={{
                            ...S.typeChip,
                            ...(editingAnnotation!.category === t
                              ? {
                                  background: TYPE_META[t].color,
                                  color: '#fff',
                                  borderColor: TYPE_META[t].color,
                                }
                              : {}),
                          }}
                        >
                          {TYPE_META[t].icon} {TYPE_META[t].label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={editingAnnotation!.message}
                      onInput={(e) =>
                        onEditingChange({
                          ...editingAnnotation!,
                          message: (e.target as HTMLTextAreaElement).value,
                        })
                      }
                      style={{ ...S.formTextarea, minHeight: '36px' }}
                      rows={2}
                    />
                    <div style={S.formActions}>
                      <button onClick={onCancelEdit} style={S.formCancelBtn}>
                        Cancel
                      </button>
                      <button
                        onClick={onSaveEdit}
                        style={{
                          ...S.formSaveBtn,
                          ...(editingAnnotation!.message.trim()
                            ? {}
                            : { opacity: 0.4, cursor: 'not-allowed' }),
                        }}
                        disabled={!editingAnnotation!.message.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        ...S.annotationMessage,
                        ...(ann.resolved
                          ? { textDecoration: 'line-through', color: '#666' }
                          : {}),
                      }}
                    >
                      {ann.message}
                    </div>
                    <div style={S.annotationSelector}>
                      {ann.elementDescription.slice(0, 50)}
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {/* Push to IDE button */}
          {activeAnnotations.length > 0 && (
            <button
              onClick={onPushToIDE}
              disabled={pushStatus === 'pushing' || status !== 'connected'}
              style={{
                ...S.pushButton,
                ...(pushStatus === 'done' ? S.pushButtonDone : {}),
                ...(pushStatus === 'error' ? { background: '#ef4444' } : {}),
                ...(status !== 'connected' ? S.pushButtonDisabled : {}),
              }}
              title={
                status !== 'connected'
                  ? 'Bridge not connected'
                  : `Push ${activeAnnotations.length} annotation(s) to project`
              }
            >
              {pushStatus === 'pushing'
                ? 'Pushing...'
                : pushStatus === 'done'
                  ? 'Pushed to .vibelens/feedback.md'
                  : pushStatus === 'error'
                    ? 'Push failed — retry?'
                    : `Push ${activeAnnotations.length} to IDE`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
