'use client'

import { useEffect, useRef, useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { SearchIcon, ArrowRightIcon } from '@/components/ui/icons'
import type { Colleague } from '@/lib/demo-data'
import type { ProfileLookup } from '@/lib/store/colleagues'
import type { ShareStatus, Visibility } from '@/lib/types/schedule'

type RowStatus = ShareStatus | 'none'

interface SearchOverlayProps {
  query: string
  setQuery: (q: string) => void
  colleagues: Colleague[]
  loading?: boolean
  comparedUids: Set<string>
  /** Active group name — when set, a "{name} 그룹에 추가" chip explains where adds land. */
  activeGroupName?: string | null
  onOpenManage?: () => void
  onClose: () => void
  /** Add/remove an accepted colleague to/from the active compare group. */
  onToggle: (uid: string) => void
  /** False on demo: skip the share flow entirely — every row shows "추가". */
  shareGated: boolean
  /** My viewer-side share status per owner uid. */
  shareStatus: Record<string, ShareStatus>
  /** Send / re-send a share request. Resolves false on failure (row rolls back). */
  onRequest: (uid: string) => Promise<boolean>
  /** Cancel my pending request. Resolves false on failure (row rolls back). */
  onCancelRequest: (uid: string) => Promise<boolean>
  /** Exact-사번 lookup (real accounts only). */
  lookupSabun: (employeeId: string) => Promise<ProfileLookup | null>
}

export function SearchOverlay({
  query, setQuery, colleagues, loading = false, comparedUids,
  activeGroupName, onOpenManage, onClose, onToggle,
  shareGated, shareStatus, onRequest, onCancelRequest, lookupSabun,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Optimistic per-row status overrides (request/cancel flip instantly, roll back on failure).
  const [override, setOverride] = useState<Record<string, RowStatus>>({})
  const statusOf = (uid: string): RowStatus => override[uid] ?? shareStatus[uid] ?? 'none'

  async function doRequest(uid: string) {
    const prev = statusOf(uid)
    setOverride(o => ({ ...o, [uid]: 'pending' }))
    if (!(await onRequest(uid))) setOverride(o => ({ ...o, [uid]: prev }))
  }
  async function doCancel(uid: string) {
    const prev = statusOf(uid)
    setOverride(o => ({ ...o, [uid]: 'none' }))
    if (!(await onCancelRequest(uid))) setOverride(o => ({ ...o, [uid]: prev }))
  }

  const raw = query.trim()
  const q = raw.toLowerCase()
  const isSabun = /^\d{4,8}$/.test(raw)

  const filtered = useMemo(() => (
    q
      ? colleagues.filter(u => u.name.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q))
      : [...colleagues].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  ), [q, colleagues])

  // Exact-사번 lookup → "사번으로 찾음" group (private accounts the directory hides),
  // only when the sabun isn't already an exact match in the directory list.
  const exactInList = filtered.some(u => u.employeeId === raw)
  const showSabun = shareGated && isSabun && !exactInList

  // Result is stored tagged with the query it was fetched for, so a stale fetch
  // never renders and we avoid synchronous setState in the effect body.
  const [sabunState, setSabunState] = useState<{ q: string; result: ProfileLookup | null } | null>(null)
  useEffect(() => {
    if (!showSabun) return
    let alive = true
    const t = setTimeout(async () => {
      const result = await lookupSabun(raw)
      if (alive) setSabunState({ q: raw, result })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [showSabun, raw, lookupSabun])

  const sabunReady = showSabun && sabunState?.q === raw
  const sabunResult = sabunReady ? sabunState!.result : null
  const sabunLoading = showSabun && !sabunReady
  const sabunDup = sabunResult != null && filtered.some(u => u.uid === sabunResult.uid)

  const count = comparedUids.size

  return (
    <div
      className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-app-frame bg-surface z-[55] flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Search bar */}
      <div className="border-b border-line shrink-0 flex items-center gap-2 px-3 h-topbar">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름 또는 사번을 입력해 주세요"
            className={`w-full h-10 pl-9 pr-3.5 rounded-pill text-callout text-ink-900 font-kr outline-none ${
              query ? 'bg-surface border border-line-2' : 'bg-bg border border-transparent'
            }`}
          />
        </div>
        <button
          onClick={onClose}
          className="h-btn-sm px-3 text-callout font-semibold text-ink-700 rounded-sm"
        >
          닫기
        </button>
      </div>

      {/* Active-group target chip */}
      {activeGroupName && (
        <div className="shrink-0 px-4 pt-2.5">
          <button
            onClick={onOpenManage}
            className="inline-flex items-center text-[12px] font-semibold text-brand bg-brand-050 px-2.5 py-1 rounded-xs"
          >
            {activeGroupName} 그룹에 추가
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
        <p className="px-2 py-2.5 text-caption font-semibold text-ink-500">
          {loading ? (
            '동료 목록 불러오는 중'
          ) : q ? (
            <>‘<span className="text-ink-900">{q}</span>’ 검색 결과 <span className="font-en">{filtered.length}</span>건</>
          ) : '추천 동료 · 이름 가나다순'}
        </p>

        {loading ? (
          <p className="py-16 px-4 text-center text-callout text-ink-500">
            검색 가능한 동료를 확인하고 있어요.
          </p>
        ) : filtered.length === 0 && !showSabun ? (
          <p className="py-16 px-4 text-center text-callout text-ink-500">
            검색 결과가 없어요. 이름이나 사번을 다시 확인해 주세요.
          </p>
        ) : (
          filtered.map(u => (
            <ResultRow
              key={u.uid}
              u={u}
              added={comparedUids.has(u.uid)}
              status={statusOf(u.uid)}
              shareGated={shareGated}
              onToggle={onToggle}
              onRequest={doRequest}
              onCancel={doCancel}
            />
          ))
        )}

        {/* 사번으로 찾음 — private accounts found by exact 사번 */}
        {showSabun && (
          <>
            <p className="px-2 pt-3 pb-1.5 text-caption font-semibold text-ink-500 border-t border-line mt-2">
              사번으로 찾음
            </p>
            {sabunLoading ? (
              <p className="py-6 px-4 text-center text-caption text-ink-500">사번으로 찾는 중…</p>
            ) : sabunResult && !sabunDup ? (
              <ResultRow
                u={sabunResult}
                visibility={sabunResult.visibility}
                added={comparedUids.has(sabunResult.uid)}
                status={statusOf(sabunResult.uid)}
                shareGated={shareGated}
                onToggle={onToggle}
                onRequest={doRequest}
                onCancel={doCancel}
              />
            ) : sabunResult ? null : (
              <p className="py-6 px-4 text-center text-caption text-ink-500">그 사번으로 등록된 동료가 없어요</p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        className={`px-4 pt-2.5 pb-9 border-t border-line shrink-0 ${
          count > 0 ? 'bg-brand-050' : 'bg-surface-2'
        }`}
      >
        {count > 0 ? (
          <button
            onClick={onClose}
            className="w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout inline-flex items-center justify-center gap-1.5"
          >
            비교 <span className="font-en">{count}</span>명 추가됨 · 캘린더에서 보기
            <ArrowRightIcon size={14} />
          </button>
        ) : (
          <div className="flex items-center justify-between text-caption text-ink-500">
            <span>
              추가된 동료 <span className="font-en">{count}</span>명{' '}
              <span className="text-ink-300">(최대 10명)</span>
            </span>
            <span className="font-en px-1.5 py-0.5 rounded-xs bg-surface border border-line-2">esc</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultRow({
  u, visibility, added, status, shareGated, onToggle, onRequest, onCancel,
}: {
  u: Colleague
  visibility?: Visibility
  added: boolean
  status: RowStatus
  shareGated: boolean
  onToggle: (uid: string) => void
  onRequest: (uid: string) => void
  onCancel: (uid: string) => void
}) {
  const isPrivate = visibility === 'private'
  return (
    <div className="w-full flex items-center gap-3 px-2 py-3 rounded-md">
      <Avatar name={u.name} photo={u.photo} size="lg" color="brand" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-callout text-ink-900 truncate">{u.name}</span>
          {isPrivate && <LockIcon className="text-ink-400 shrink-0" />}
          <span className="font-en text-caption text-ink-500">{u.employeeId}</span>
        </div>
        {isPrivate ? (
          <p className="text-[11px] text-ink-500 mt-0.5">비공개 계정 · 사번이 일치할 때만 요청할 수 있어요</p>
        ) : (
          <p className="text-caption text-ink-500 mt-px">{u.office}</p>
        )}
      </div>
      <RowAction
        uid={u.uid} added={added} status={status} shareGated={shareGated}
        onToggle={onToggle} onRequest={onRequest} onCancel={onCancel}
      />
    </div>
  )
}

function RowAction({
  uid, added, status, shareGated, onToggle, onRequest, onCancel,
}: {
  uid: string
  added: boolean
  status: RowStatus
  shareGated: boolean
  onToggle: (uid: string) => void
  onRequest: (uid: string) => void
  onCancel: (uid: string) => void
}) {
  const compareLabel = added ? '✓ 비교 중' : '+ 추가'
  if (!shareGated || status === 'accepted') {
    return <Pill tone={added ? 'muted' : 'brand'} onClick={() => onToggle(uid)}>{compareLabel}</Pill>
  }
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <Pill tone="muted" disabled>요청 중</Pill>
        <button onClick={() => onCancel(uid)} className="text-[11px] font-semibold text-ink-500 underline">취소</button>
      </div>
    )
  }
  return (
    <Pill tone="brand" onClick={() => onRequest(uid)}>
      {status === 'revoked' ? '다시 요청' : '요청'}
    </Pill>
  )
}

function Pill({
  children, onClick, disabled, tone,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone: 'brand' | 'muted' }) {
  const toneCls = tone === 'brand' ? 'bg-brand-050 text-brand' : 'bg-bg text-ink-500'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-caption font-semibold px-3.5 py-2 rounded-pill shrink-0 ${toneCls} ${disabled ? 'opacity-70' : ''}`}
    >
      {children}
    </button>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
