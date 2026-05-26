'use client'

import { useEffect, useRef, useMemo } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { SearchIcon, ArrowRightIcon } from '@/components/ui/icons'
import type { Colleague } from '@/lib/demo-data'

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
  onToggle: (uid: string) => void
}

export function SearchOverlay({
  query, setQuery, colleagues, loading = false, comparedUids,
  activeGroupName, onOpenManage, onClose, onToggle,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (
    q
      ? colleagues.filter(u => u.name.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q))
      : [...colleagues].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  ), [q, colleagues])

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
        ) : filtered.length === 0 ? (
          <p className="py-16 px-4 text-center text-callout text-ink-500">
            검색 결과가 없어요. 이름이나 사번을 다시 확인해 주세요.
          </p>
        ) : filtered.map(u => {
          const added = comparedUids.has(u.uid)
          return (
            <button
              key={u.uid}
              onClick={() => onToggle(u.uid)}
              className="w-full flex items-center gap-3 px-2 py-3 rounded-md text-left hover:bg-bg transition-colors"
            >
              <Avatar name={u.name} photo={u.photo} size="lg" color="brand" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-callout text-ink-900">{u.name}</span>
                  <span className="font-en text-caption text-ink-500">{u.employeeId}</span>
                </div>
                <p className="text-caption text-ink-500 mt-px">{u.office}</p>
              </div>
              <span
                className={`text-caption font-semibold px-3.5 py-2 rounded-pill shrink-0 ${
                  added ? 'bg-bg text-ink-500' : 'bg-brand-050 text-brand'
                }`}
              >
                {added ? '✓ 비교 중' : '+ 추가'}
              </span>
            </button>
          )
        })}
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
