'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { SearchIcon, ArrowRightIcon } from '@/components/ui/icons'
import type { Colleague } from '@/lib/demo-data'
import type { ProfileLookup } from '@/lib/store/colleagues'
import type { ShareStatus, Visibility } from '@/lib/types/schedule'

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
  /** Add/remove a colleague. For real accounts, add also fires a share request.
   *  `meta` carries the profile so private (사번-only) accounts — which aren't in
   *  the directory list — can still be added. */
  onToggle: (uid: string, meta?: Colleague) => void
  /** False on demo: skip the pending indicator entirely (no shares in demo). */
  shareGated: boolean
  /** My viewer-side share status per owner uid — used only for the "수락 대기 중" hint. */
  shareStatus: Record<string, ShareStatus>
  /** Exact-사번 lookup (real accounts only). */
  lookupSabun: (employeeId: string) => Promise<ProfileLookup | null>
  /** Exact-email lookup (real accounts only). */
  lookupEmail: (email: string) => Promise<ProfileLookup | null>
}

export function SearchOverlay({
  query, setQuery, colleagues, loading = false, comparedUids,
  activeGroupName, onOpenManage, onClose, onToggle,
  shareGated, shareStatus, lookupSabun, lookupEmail,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const raw = query.trim()
  const q = raw.toLowerCase()
  // Auto-detect the lookup mode: @ → email, all-digits → 사번, else → 이름.
  const isEmail = raw.includes('@')
  const isSabun = !isEmail && /^\d{4,8}$/.test(raw)

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

  // Exact-email lookup → "이메일로 찾음" group. Same shape/policy as 사번.
  const showEmail = shareGated && isEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
  const [emailState, setEmailState] = useState<{ q: string; result: ProfileLookup | null } | null>(null)
  useEffect(() => {
    if (!showEmail) return
    let alive = true
    const t = setTimeout(async () => {
      const result = await lookupEmail(raw)
      if (alive) setEmailState({ q: raw, result })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [showEmail, raw, lookupEmail])

  const emailReady = showEmail && emailState?.q === raw
  const emailResult = emailReady ? emailState!.result : null
  const emailLoading = showEmail && !emailReady
  const emailDup = emailResult != null && filtered.some(u => u.uid === emailResult.uid)

  const count = comparedUids.size
  const pendingOf = (uid: string) => shareGated && shareStatus[uid] === 'pending'

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
            placeholder="사번·이메일, 또는 이름"
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
        ) : colleagues.length === 0 && !showSabun && !showEmail ? (
          // Directory 자체가 비어있음 — 다른 가입자가 없거나, 가입은 했지만 모두
          // 공개 범위 = 비공개라 RLS가 가린 경우. (옛 share_schedule=false 사용자가
          // 마이그레이션으로 자동 private이 된 케이스가 흔함.)
          <div className="py-12 px-4 text-center text-callout text-ink-500 leading-relaxed">
            <p>아직 검색할 수 있는 동료가 없어요.</p>
            <p className="mt-2 text-caption text-ink-300">
              동료가 RaiLink에 가입한 뒤<br />
              <span className="text-ink-500">내 메뉴 → 내 정보 → 공개 범위</span>에서<br />
              <span className="text-ink-500 font-semibold">‘공개’</span>로 설정해야 검색에 나타나요.
            </p>
          </div>
        ) : filtered.length === 0 && !showSabun && !showEmail ? (
          <p className="py-16 px-4 text-center text-callout text-ink-500">
            검색 결과가 없어요. 사번·이메일·이름을 다시 확인해 주세요.
          </p>
        ) : (
          filtered.map(u => (
            <ResultRow
              key={u.uid}
              u={u}
              added={comparedUids.has(u.uid)}
              pending={pendingOf(u.uid)}
              onToggle={onToggle}
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
                pending={pendingOf(sabunResult.uid)}
                onToggle={onToggle}
              />
            ) : sabunResult ? null : (
              <div className="py-6 px-4 text-center text-caption text-ink-500 leading-relaxed">
                <p>그 사번으로 등록된 동료가 없어요.</p>
                <p className="mt-1.5 text-[11px] text-ink-300">
                  사번이 정확한지, 그 동료가 RaiLink에 가입했는지 확인해 주세요.
                </p>
              </div>
            )}
          </>
        )}

        {/* 이메일로 찾음 — exact email match (KTX or personal, public or private) */}
        {showEmail && (
          <>
            <p className="px-2 pt-3 pb-1.5 text-caption font-semibold text-ink-500 border-t border-line mt-2">
              이메일로 찾음
            </p>
            {emailLoading ? (
              <p className="py-6 px-4 text-center text-caption text-ink-500">이메일로 찾는 중…</p>
            ) : emailResult && !emailDup ? (
              <ResultRow
                u={emailResult}
                visibility={emailResult.visibility}
                added={comparedUids.has(emailResult.uid)}
                pending={pendingOf(emailResult.uid)}
                onToggle={onToggle}
              />
            ) : emailResult ? null : (
              <div className="py-6 px-4 text-center text-caption text-ink-500 leading-relaxed">
                <p>그 이메일로 등록된 사람이 없어요.</p>
                <p className="mt-1.5 text-[11px] text-ink-300">
                  이메일이 정확한지, 그 사람이 RaiLink에 가입했는지 확인해 주세요.
                </p>
              </div>
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

const pillCls = (tone: 'brand' | 'muted') =>
  `text-caption font-semibold px-3.5 py-2 rounded-pill shrink-0 ${
    tone === 'brand' ? 'bg-brand-050 text-brand' : 'bg-bg text-ink-500'
  }`

function ResultRow({
  u, visibility, added, pending, onToggle,
}: {
  u: Colleague
  visibility?: Visibility
  added: boolean
  pending: boolean
  onToggle: (uid: string, meta?: Colleague) => void
}) {
  const isPrivate = visibility === 'private'
  // KTX 식별 배지. personal은 칩·사번 없이 이름만 — 위계 어휘는 쓰지 않는다.
  const isKtx = u.profileType !== 'personal'
  const label = added ? '✓ 비교 중' : '+ 추가'
  const tone: 'brand' | 'muted' = added ? 'muted' : 'brand'
  return (
    <button
      onClick={() => onToggle(u.uid, u)}
      className="w-full flex items-center gap-3 px-2 py-3 rounded-md text-left hover:bg-bg transition-colors"
    >
      <Avatar name={u.name} photo={u.photo} size="lg" color="brand" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-callout text-ink-900 truncate">{u.name}</span>
          {isPrivate && <LockIcon className="text-ink-300 shrink-0" />}
          {isKtx ? (
            <>
              {u.employeeId && <span className="font-en text-caption text-ink-500">{u.employeeId}</span>}
              <span className="shrink-0 text-[10px] font-bold text-brand bg-brand-050 px-1.5 py-0.5 rounded-xs">KTX 승무원</span>
            </>
          ) : null}
        </div>
        {isPrivate ? (
          <p className="text-[11px] text-ink-500 mt-0.5">비공개 계정 · 사번이 정확히 일치해야 추가할 수 있어요</p>
        ) : pending ? (
          <p className="text-[11px] text-ink-500 mt-px">
            <span className="font-semibold">수락 대기 중</span>
            {u.office ? <span className="text-ink-300"> · {u.office}</span> : null}
          </p>
        ) : (
          <p className="text-caption text-ink-500 mt-px">{u.office}</p>
        )}
      </div>
      <span className={pillCls(tone)}>{label}</span>
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
