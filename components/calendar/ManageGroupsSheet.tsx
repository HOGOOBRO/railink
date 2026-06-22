'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon, EditIcon, CheckIcon, PlusIcon } from '@/components/ui/icons'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { MAX_GROUPS } from '@/lib/store/groups'
import type { Group } from '@/lib/types/schedule'

interface Props {
  groups: Group[]
  /** When opened via the "+ 그룹" pill, immediately append a new row in edit mode. */
  startCreate?: boolean
  onClose: () => void
  /** Commit a rename. Returns 'duplicate' to keep the row in edit mode with a toast. */
  onRename: (groupId: string, name: string) => 'duplicate' | null
  onDelete: (groupId: string) => void
  /** Append a new empty group; returns its id (null when already at MAX_GROUPS). */
  onCreate: () => string | null
  showToast: (msg: string, kind?: 'default' | 'success' | 'danger') => void
}

const colorTag = (i: number) => (i === 0 ? 'var(--brand)' : `var(--c${((i - 1) % 10) + 1})`)

export function ManageGroupsSheet({
  groups, startCreate, onClose, onRename, onDelete, onCreate, showToast,
}: Props) {
  const t = useTranslations('calendarUi.manageGroups')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)

  function beginEdit(g: Group) {
    setEditingId(g.id)
    setDraft(g.name)
    setInvalid(false)
  }

  // Commit the in-progress rename. Keeps the row in edit mode on validation fail.
  function commit() {
    if (!editingId) return
    const name = draft.trim()
    if (!name) { setInvalid(true); return }
    const err = onRename(editingId, name)
    if (err === 'duplicate') {
      showToast(t('toastDuplicate'), 'danger')
      return
    }
    setEditingId(null)
    setInvalid(false)
  }

  function handleCreate() {
    const id = onCreate()
    if (!id) { showToast(t('toastMaxGroups', { max: MAX_GROUPS }), 'danger'); return }
    setEditingId(id)
    setDraft(t('newGroupName'))
    setInvalid(false)
  }

  // "+ 그룹" pill entry: open straight into a fresh row in edit mode (once).
  useEffect(() => {
    if (startCreate && !startedRef.current) {
      startedRef.current = true
      handleCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCreate])

  // Autofocus + select-all whenever a row enters edit mode.
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const atMax = groups.length >= MAX_GROUPS

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] pb-3 pt-1">
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('title')}</h3>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Group rows */}
      <div className="px-3">
        {groups.map((g, i) => {
          const editing = editingId === g.id
          const isDefault = i === 0
          return (
            <div
              key={g.id}
              className="flex items-center gap-2.5 py-2.5 border-b border-line last:border-b-0"
            >
              {/* color tag */}
              <span
                className="w-2 h-9 rounded-xs shrink-0"
                style={{ background: colorTag(i) }}
              />
              {/* name + count */}
              <div className="flex-1 min-w-0">
                {editing ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    maxLength={12}
                    onChange={e => { setDraft(e.target.value); setInvalid(false) }}
                    onBlur={commit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commit() }
                      if (e.key === 'Escape') { setEditingId(null); setInvalid(false) }
                    }}
                    className={`w-full h-8 px-2.5 rounded-xs bg-bg border-2 text-[15px] font-semibold text-ink-900 font-kr outline-none ${
                      invalid ? 'border-danger' : 'border-brand'
                    }`}
                  />
                ) : (
                  <div className="text-[15px] font-semibold text-ink-900 tracking-tight truncate">
                    {g.name}
                  </div>
                )}
                <div className="font-en text-[11px] text-ink-500 mt-0.5">{t('memberCount', { count: g.members.length })}</div>
              </div>
              {/* edit / commit */}
              <button
                onClick={() => (editing ? commit() : beginEdit(g))}
                aria-label={editing ? t('saveNameAria') : t('editNameAria')}
                className={`w-8 h-8 rounded-xs grid place-items-center ${editing ? 'text-brand' : 'text-ink-500'}`}
              >
                {editing ? <CheckIcon size={18} /> : <EditIcon size={15} />}
              </button>
              {/* delete */}
              <button
                onClick={() => {
                  if (isDefault) { showToast(t('toastDefaultUndeletable')); return }
                  setPendingDelete(g)
                }}
                aria-label={t('deleteGroupAria', { name: g.name })}
                className={`w-8 h-8 rounded-xs grid place-items-center text-danger ${
                  isDefault ? 'opacity-35 cursor-not-allowed' : ''
                }`}
              >
                <TrashIcon size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add group */}
      <div className="px-3 pt-2">
        <button
          onClick={handleCreate}
          disabled={atMax}
          className={`w-full py-3.5 rounded-md bg-brand-050 border border-dashed border-brand-100 text-brand font-bold text-[14px] inline-flex items-center justify-center gap-1.5 ${
            atMax ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <PlusIcon size={16} /> {t('addGroup')}
        </button>
      </div>

      {/* Footer hint */}
      <p className="px-[18px] pt-3.5 text-[11px] text-ink-500 leading-relaxed">
        {t('footerHint', { max: MAX_GROUPS })}
      </p>

      {pendingDelete && (
        <DangerConfirm
          title={t('deleteConfirmTitle', { name: pendingDelete.name })}
          body={t('deleteConfirmBody', { count: pendingDelete.members.length })}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { onDelete(pendingDelete.id); setPendingDelete(null) }}
        />
      )}
    </div>
  )
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}
