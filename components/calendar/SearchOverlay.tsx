'use client'

import { useEffect, useRef, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchIcon, ArrowRightIcon, UserPlusIcon } from '@/components/ui/icons'
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
  /** Open the invite sheet — offered on search misses so a not-found colleague
   *  isn't a dead end. Passes the typed email (if any) to pre-scope the invite. */
  onInvite?: (prefillEmail?: string | null) => void
}

export function SearchOverlay({
  query, setQuery, colleagues, loading = false, comparedUids,
  activeGroupName, onOpenManage, onClose, onToggle,
  shareGated, shareStatus, lookupSabun, lookupEmail, onInvite,
}: SearchOverlayProps) {
  const t = useTranslations('search')
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

  // 결과를 탭하면 곧바로 신청/제거하지 않고 확인을 한 번 받는다 — 실수 탭 방지.
  const [confirmTarget, setConfirmTarget] = useState<Colleague | null>(null)
  const confirmAdding = confirmTarget ? !comparedUids.has(confirmTarget.uid) : false
  // 이미 수락/대기 중인 상대는 그룹에 추가해도 새 요청이 나가지 않는다 —
  // toggleCompare가 status별로 분기하므로 안내 문구도 거기에 맞춘다.
  const confirmStatus = confirmTarget ? shareStatus[confirmTarget.uid] : undefined

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
            placeholder={t('placeholder')}
            className={`w-full h-10 pl-9 pr-3.5 rounded-pill text-callout text-ink-900 font-kr outline-none ${
              query ? 'bg-surface border border-line-2' : 'bg-bg border border-transparent'
            }`}
          />
        </div>
        <button
          onClick={onClose}
          className="h-btn-sm px-3 text-callout font-semibold text-ink-700 rounded-sm"
        >
          {t('close')}
        </button>
      </div>

      {/* Active-group target chip */}
      {activeGroupName && (
        <div className="shrink-0 px-4 pt-2.5 pb-2">
          <button
            onClick={onOpenManage}
            className="inline-flex items-center text-[12px] font-semibold text-brand bg-brand-050 px-2.5 py-1 rounded-xs"
          >
            {t('addToGroup', { name: activeGroupName })}
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
        <p className="px-2 py-2.5 text-caption font-semibold text-ink-500">
          {loading ? (
            t('loadingList')
          ) : q ? (
            t.rich('resultsFor', {
              q,
              quoted: (chunks) => <span className="text-ink-900">{chunks}</span>,
              count: (chunks) => <span className="font-en">{chunks}</span>,
              n: filtered.length,
            })
          ) : t('recommended')}
        </p>

        {loading ? (
          // 정적인 "확인하고 있어요" 한 줄 대신 동료 행 스켈레톤 — 행마다 살짝
          // 지연을 줘서 시머가 위→아래로 물결치게 한다(첫 진입이 덜 멈춰 보이게).
          <div>
            {SKEL_ROWS.map((w, i) => (
              <SearchRowSkeleton key={i} nameW={w.name} officeW={w.office} delayMs={i * 110} />
            ))}
          </div>
        ) : colleagues.length === 0 && !showSabun && !showEmail ? (
          // Directory 자체가 비어있음 — 다른 가입자가 없거나, 가입은 했지만 모두
          // 공개 범위 = 비공개라 RLS가 가린 경우. (옛 share_schedule=false 사용자가
          // 마이그레이션으로 자동 private이 된 케이스가 흔함.)
          <div className="py-12 px-4 text-center text-callout text-ink-500 leading-relaxed">
            <p>{t('emptyDir.title')}</p>
            <p className="mt-2 text-caption text-ink-300">
              {t.rich('emptyDir.body', {
                br: () => <br />,
                path: (chunks) => <span className="text-ink-500">{chunks}</span>,
                em: (chunks) => <span className="text-ink-500 font-semibold">{chunks}</span>,
              })}
            </p>
            <InviteMissButton onInvite={onInvite} label={t('inviteColleague')} />
          </div>
        ) : filtered.length === 0 && !showSabun && !showEmail ? (
          <p className="py-16 px-4 text-center text-callout text-ink-500">
            {t('noResults')}
          </p>
        ) : (
          filtered.map(u => (
            <ResultRow
              key={u.uid}
              u={u}
              added={comparedUids.has(u.uid)}
              pending={pendingOf(u.uid)}
              onPick={setConfirmTarget}
            />
          ))
        )}

        {/* 사번으로 찾음 — private accounts found by exact 사번 */}
        {showSabun && (
          <>
            <p className="px-2 pt-3 pb-1.5 text-caption font-semibold text-ink-500 border-t border-line mt-2">
              {t('foundBySabun')}
            </p>
            {sabunLoading ? (
              <p className="py-6 px-4 text-center text-caption text-ink-500">{t('searchingSabun')}</p>
            ) : sabunResult && !sabunDup ? (
              <ResultRow
                u={sabunResult}
                visibility={sabunResult.visibility}
                added={comparedUids.has(sabunResult.uid)}
                pending={pendingOf(sabunResult.uid)}
                onPick={setConfirmTarget}
              />
            ) : sabunResult ? null : (
              <div className="py-6 px-4 text-center text-caption text-ink-500 leading-relaxed">
                <p>{t('noSabunMatch')}</p>
                <p className="mt-1.5 text-[11px] text-ink-300">
                  {t('maybeNotSignedUp')}
                </p>
                <InviteMissButton onInvite={onInvite} />
              </div>
            )}
          </>
        )}

        {/* 이메일로 찾음 — exact email match (KTX or personal, public or private) */}
        {showEmail && (
          <>
            <p className="px-2 pt-3 pb-1.5 text-caption font-semibold text-ink-500 border-t border-line mt-2">
              {t('foundByEmail')}
            </p>
            {emailLoading ? (
              <p className="py-6 px-4 text-center text-caption text-ink-500">{t('searchingEmail')}</p>
            ) : emailResult && !emailDup ? (
              <ResultRow
                u={emailResult}
                visibility={emailResult.visibility}
                added={comparedUids.has(emailResult.uid)}
                pending={pendingOf(emailResult.uid)}
                onPick={setConfirmTarget}
              />
            ) : emailResult ? null : (
              <div className="py-6 px-4 text-center text-caption text-ink-500 leading-relaxed">
                <p>{t('noEmailMatch')}</p>
                <p className="mt-1.5 text-[11px] text-ink-300">
                  {t('maybeNotSignedUp')}
                </p>
                <InviteMissButton onInvite={onInvite} prefillEmail={raw} />
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
            {t.rich('footerAdded', { count, n: (chunks) => <span className="font-en">{chunks}</span> })}
            <ArrowRightIcon size={14} />
          </button>
        ) : (
          <div className="flex items-center justify-between text-caption text-ink-500">
            <span>
              {t.rich('footerCount', { count, max: 10, n: (chunks) => <span className="font-en">{chunks}</span>, muted: (chunks) => <span className="text-ink-300">{chunks}</span> })}
            </span>
            <span className="font-en px-1.5 py-0.5 rounded-xs bg-surface border border-line-2">esc</span>
          </div>
        )}
      </div>

      {/* 추가/제거 확인 — 실수 탭으로 공유 신청·제거가 바로 일어나지 않도록 */}
      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmAdding
              ? t('confirm.addTitle', { name: confirmTarget.name })
              : t('confirm.removeTitle', { name: confirmTarget.name })
          }
          body={
            confirmAdding
              ? shareGated
                ? confirmStatus === 'accepted'
                  ? t('confirm.bodyAccepted')
                  : confirmStatus === 'pending'
                    ? t('confirm.bodyPending')
                    : t('confirm.bodyShareRequest')
                : t('confirm.bodyAddLocal')
              : t('confirm.bodyRemove')
          }
          confirmLabel={confirmAdding ? t('confirm.add') : t('confirm.remove')}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => { onToggle(confirmTarget.uid, confirmTarget); setConfirmTarget(null) }}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  title, body, confirmLabel, onCancel, onConfirm,
}: {
  title: string
  body?: ReactNode
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('search')
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
      <button
        aria-label={t('closeBackdrop')}
        onClick={onCancel}
        className="absolute inset-0"
        style={{ background: 'rgba(13,30,55,0.55)' }}
      />
      <div className="relative w-full max-w-[340px] bg-surface rounded-lg shadow-sh4 px-5 pt-[18px] pb-4">
        <h3 className="text-center text-[16px] font-bold tracking-tight text-ink-900">{title}</h3>
        {body && <p className="mt-1.5 text-center text-caption text-ink-500 leading-relaxed">{body}</p>}
        <div className="flex gap-2.5 mt-4">
          <Button variant="outline" className="flex-1" onClick={onCancel}>{t('confirm.cancel')}</Button>
          <Button variant="brand" className="flex-1" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

const pillCls = (tone: 'brand' | 'muted') =>
  `text-caption font-semibold px-3.5 py-2 rounded-pill shrink-0 ${
    tone === 'brand' ? 'bg-brand-050 text-brand' : 'bg-bg text-ink-500'
  }`

// 로딩 스켈레톤 행 너비 — 실제 동료 목록처럼 들쭉날쭉하게(균일하면 더 인위적).
const SKEL_ROWS = [
  { name: 'w-24', office: 'w-16' },
  { name: 'w-20', office: 'w-20' },
  { name: 'w-28', office: 'w-14' },
  { name: 'w-16', office: 'w-20' },
  { name: 'w-24', office: 'w-12' },
  { name: 'w-20', office: 'w-16' },
]

/** ResultRow와 같은 레이아웃의 시머 행. delayMs로 행별 물결 지연. */
function SearchRowSkeleton({ nameW, officeW, delayMs }: { nameW: string; officeW: string; delayMs: number }) {
  const d = { animationDelay: `${delayMs}ms` }
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <Skeleton className="w-avatar-lg h-avatar-lg rounded-full shrink-0" style={d} />
      <div className="flex-1 min-w-0">
        <Skeleton className={`h-3.5 rounded ${nameW}`} style={d} />
        <Skeleton className={`h-2.5 rounded mt-1.5 ${officeW}`} style={d} />
      </div>
      <Skeleton className="w-14 h-8 rounded-pill shrink-0" style={d} />
    </div>
  )
}

function ResultRow({
  u, visibility, added, pending, onPick,
}: {
  u: Colleague
  visibility?: Visibility
  added: boolean
  pending: boolean
  onPick: (u: Colleague) => void
}) {
  const t = useTranslations('search')
  const isPrivate = visibility === 'private'
  // KTX 식별 배지. personal은 칩·사번 없이 이름만 — 위계 어휘는 쓰지 않는다.
  const isKtx = u.profileType !== 'personal'
  const label = added ? t('row.comparing') : t('row.add')
  const tone: 'brand' | 'muted' = added ? 'muted' : 'brand'
  return (
    <button
      onClick={() => onPick(u)}
      className="w-full flex items-center gap-3 px-2 py-3 rounded-md text-left hover:bg-bg transition-colors"
    >
      <Avatar name={u.name} photo={u.photo} size="lg" color="brand" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-callout text-ink-900 truncate">{u.name}</span>
          {isPrivate && <LockIcon className="text-ink-300 shrink-0" />}
          {isKtx && u.employeeId ? (
            <span className="font-en text-caption text-ink-500">{u.employeeId}</span>
          ) : null}
        </div>
        {isPrivate ? (
          <p className="text-[11px] text-ink-500 mt-0.5">{t('row.privateNote')}</p>
        ) : pending ? (
          <p className="text-[11px] text-ink-500 mt-px">
            <span className="font-semibold">{t('row.pending')}</span>
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

/* Search-miss escape hatch — turns a "not found" dead end into an invite.
 * Renders nothing when no handler is wired (e.g. a context without invites). */
function InviteMissButton({
  onInvite, prefillEmail, label,
}: { onInvite?: (prefillEmail?: string | null) => void; prefillEmail?: string | null; label?: string }) {
  const t = useTranslations('search')
  if (!onInvite) return null
  return (
    <button
      onClick={() => onInvite(prefillEmail ?? null)}
      className="mt-3.5 inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-brand-050 text-brand text-caption font-bold"
    >
      <UserPlusIcon size={15} /> {label ?? t('inviteMessage')}
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
