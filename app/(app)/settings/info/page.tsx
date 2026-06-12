'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  ChevronLeftIcon, ChevronRightIcon, EditIcon, KeyIcon, UploadIcon,
} from '@/components/ui/icons'
import { getCurrentSession, logout, updateProfile, setVisibility as saveVisibility, setMarketingConsent, type Session } from '@/lib/auth'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { getMonthSchedules, getRemoteMonthSchedules } from '@/lib/store/schedules'
import { COMPARE_KEY } from '@/lib/store/compare'
import { getGroupsState, allMemberUids, GROUPS_KEY } from '@/lib/store/groups'
import { COLLEAGUE_DIRECTORY_KEY, SAMPLE_DIRECTORY_SEEDED_KEY } from '@/lib/store/colleagues'
import {
  listSharesWithProfile, respondShare,
  type ShareListsWithProfile, type ShareWithProfile,
} from '@/lib/store/shares'
import { getMyBirthday, setMyBirthday as saveMyBirthday } from '@/lib/store/birthdays'
import { getPushStatus, enablePush, disablePush, pushNeedsIosInstall, type PushStatus } from '@/lib/push'
import { Switch } from '@/components/ui/Switch'
import { Skeleton } from '@/components/ui/Skeleton'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { RadioGroup, type RadioOption } from '@/components/ui/RadioGroup'
import type { Visibility } from '@/lib/types/schedule'

const VIS_OPTIONS: RadioOption<Visibility>[] = [
  { value: 'public', title: '공개', desc: '이름·사진이 동료 검색에 떠요. 일정은 따로 수락이 필요해요.' },
  { value: 'private', title: '비공개', desc: '검색에는 안 떠요. 사번을 정확히 아는 동료만 공유를 요청할 수 있어요.' },
]

const EMPTY_SHARES: ShareListsWithProfile = { incoming: [], outgoing: [], sharing: [], viewing: [] }

const SCHEDULES_KEY = 'railink_schedules_v3'
const DEMO_SESSION_KEY = 'railink_demo_session_v3'

export default function SettingsInfoPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [session, setSession] = useState<Session | null>(null)
  const [compareCount, setCompareCount] = useState(0)
  const [workDays, setWorkDays] = useState(0)
  const [offDays, setOffDays] = useState(0)

  const [name, setName] = useState('')
  const [part, setPart] = useState('')
  const [email, setEmail] = useState('')
  // Birthday ('' = unset). initialBirthday tracks the saved value for dirty-check.
  const [birthday, setBirthday] = useState('')
  const [initialBirthday, setInitialBirthday] = useState('')

  const [vis, setVis] = useState<Visibility>('public')
  const [pendingPrivate, setPendingPrivate] = useState(false)
  // 업데이트·이벤트 알림 수신 동의 (profiles.marketing_consent)
  const [mktConsent, setMktConsent] = useState(false)
  const [mktBusy, setMktBusy] = useState(false)
  const [shares, setShares] = useState<ShareListsWithProfile>(EMPTY_SHARES)
  // True until the remote shares/birthday fetch settles — gates the share-list
  // empty state and the birthday field so "loading" never reads as "none".
  const [remoteLoading, setRemoteLoading] = useState(true)
  const [shareBusy, setShareBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const sharesRef = useRef<HTMLDivElement>(null)
  const birthdayRef = useRef<HTMLDivElement>(null)

  // 약속 초대 푸시 — 이 기기의 상태. 'loading' 동안은 토글을 잠그고 "확인 중"
  // 문구를 보여, SW 준비를 기다리는 시간이 "꺼짐"으로 읽히지 않게 한다.
  // unsupported(iOS 미설치 브라우저 포함)면 섹션 숨김.
  const [push, setPush] = useState<PushStatus | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  // iOS 사파리 탭: 푸시 미지원이지만 홈 화면에 추가하면 가능 — 안내를 노출한다.
  const [iosInstall, setIosInstall] = useState(false)
  useEffect(() => {
    // setIosInstall도 .then 안에서 — effect 내 동기 setState 캐스케이드 회피.
    getPushStatus().then(st => { setPush(st); setIosInstall(pushNeedsIosInstall()) }).catch(() => {})
  }, [])

  async function onTogglePush() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (push === 'enabled') {
        try {
          await disablePush()
          setPush('disabled')
          showToast('약속 초대 알림을 껐어요.', 'default')
        } catch (e) {
          showToast(e instanceof Error ? e.message : '알림 해제에 실패했어요.', 'danger')
        }
      } else {
        const res = await enablePush()
        setPush(res.status)
        if (res.status === 'enabled') showToast('약속 초대 알림을 켰어요.', 'success')
        else if (res.message) showToast(res.message, 'danger')
      }
    } finally {
      setPushBusy(false)
    }
  }

  // Inbox banner / badge deep-link (§5): /settings/info?focus=shares scrolls to
  // the 공유 중인 동료 section. Reads location directly (no useSearchParams) so
  // the page stays statically prerendered.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const focus = new URLSearchParams(window.location.search).get('focus')
    const target = focus === 'shares' ? sharesRef : focus === 'birthday' ? birthdayRef : null
    if (!target) return
    const t = window.setTimeout(
      () => target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      120,
    )
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await getCurrentSession()
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      const now = new Date()
      let sched = getMonthSchedules(s.uid, now.getFullYear(), now.getMonth() + 1)
      if (!s.isDemo) {
        try {
          sched = await getRemoteMonthSchedules(s.uid, now.getFullYear(), now.getMonth() + 1)
        } catch {
          sched = []
        }
      }
      const off = sched.filter(e => e.isOff).length
      setSession(s)
      setName(s.name)
      setPart(s.part ?? '')
      setEmail(s.email)
      setCompareCount(allMemberUids(getGroupsState(s.uid)).length)
      setWorkDays(sched.length - off)
      setOffDays(off)

      if (!s.isDemo) {
        // One round trip instead of three — shortens the window where the
        // share list / birthday show their loading placeholders.
        try {
          const [{ data: prof }, lists, b] = await Promise.all([
            supabase.from('profiles').select('visibility, marketing_consent').eq('id', s.uid).maybeSingle(),
            listSharesWithProfile(),
            getMyBirthday(),
          ])
          if (!alive) return
          if (prof?.visibility === 'public' || prof?.visibility === 'private') {
            setVis(prof.visibility)
          }
          setMktConsent(!!prof?.marketing_consent)
          setShares(lists)
          setBirthday(b ?? '')
          setInitialBirthday(b ?? '')
        } catch {
          // Leave the defaults — the sections fall back to their empty states.
          // remoteLoading must still clear below or the skeletons never leave.
        }
      }
      if (alive) setRemoteLoading(false)
    })()
    return () => { alive = false }
  }, [router])

  async function reloadShares() {
    setShares(await listSharesWithProfile())
  }

  // 수신 동의 토글 — 낙관 갱신, 실패 시 롤백 (commitVisibility와 같은 패턴).
  async function onToggleMarketing() {
    if (mktBusy) return
    const next = !mktConsent
    setMktBusy(true)
    setMktConsent(next)
    const res = await setMarketingConsent(next)
    setMktBusy(false)
    if (!res.ok) {
      setMktConsent(!next)
      showToast(res.message ?? '수신 동의를 바꾸지 못했어요.', 'danger')
      return
    }
    showToast(
      next ? '업데이트·이벤트 알림 수신에 동의했어요.' : '업데이트·이벤트 알림 수신을 껐어요.',
      next ? 'success' : 'default',
    )
  }

  // 공개 → applied immediately; 비공개 → confirm sheet first (spec §3).
  function onVisibilityChange(next: Visibility) {
    if (next === vis) return
    if (next === 'private') setPendingPrivate(true)
    else commitVisibility('public')
  }

  async function commitVisibility(next: Visibility) {
    const prev = vis
    setVis(next)
    const res = await saveVisibility(next)
    if (!res.ok) {
      setVis(prev)
      showToast(res.message ?? '공개 범위를 바꾸지 못했어요.', 'danger')
      return
    }
    showToast('공개 범위를 바꿨어요', 'success')
  }

  // Share-row actions. Each disables the row controls while in flight, then
  // reloads so the row moves to its new bucket (or disappears).
  async function runShareAction(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string, gaEvent?: string) {
    if (shareBusy) return
    setShareBusy(true)
    const res = await fn()
    setShareBusy(false)
    if (!res.ok) { showToast(res.message ?? '잠시 후 다시 시도해 주세요.', 'danger'); return }
    if (gaEvent) track(gaEvent)
    showToast(okMsg, 'success')
    reloadShares()
  }

  const dirty = useMemo(() => {
    if (!session) return false
    return name !== session.name || part !== (session.part ?? '') || birthday !== initialBirthday
  }, [session, name, part, birthday, initialBirthday])

  // Section B rows: 요청 받음 → 공유 중. "내가 요청 중"은 캘린더 비교 그룹이
  // 단일 진실 출처이므로 여기엔 노출하지 않는다 — 그룹에서 빼는 동작이 곧 취소다.
  const shareRows = useMemo(() => [
    ...shares.incoming.map(s => ({ kind: 'incoming' as const, s })),
    ...shares.sharing.map(s => ({ kind: 'sharing' as const, s })),
  ], [shares])

  async function handleSave() {
    if (!dirty || saving || !session) return
    if (!name.trim()) { showToast('이름을 입력해 주세요.', 'danger'); return }
    setSaving(true)
    const res = await updateProfile({
      name: name.trim(),
      employeeId: session.employeeId,
      part: part.trim() || undefined,
    })
    if (!res.ok) {
      setSaving(false)
      showToast(res.message ?? '저장에 실패했어요.', 'danger')
      return
    }
    // Birthday lives in its own privacy-gated table — save only when changed.
    if (birthday !== initialBirthday) {
      const br = await saveMyBirthday(birthday || null)
      if (!br.ok) {
        setSaving(false)
        showToast(br.message ?? '생일 저장에 실패했어요.', 'danger')
        return
      }
      setInitialBirthday(birthday)
    }
    setSaving(false)
    setSession({ ...session, name: name.trim(), part: part.trim() || undefined })
    showToast('변경 사항을 저장했어요.', 'success')
  }

  async function handleConfirmDelete() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SCHEDULES_KEY)
      localStorage.removeItem(COMPARE_KEY)
      localStorage.removeItem(GROUPS_KEY)
      localStorage.removeItem(COLLEAGUE_DIRECTORY_KEY)
      localStorage.removeItem(SAMPLE_DIRECTORY_SEEDED_KEY)
      localStorage.removeItem('railink_compare_v3') // legacy shared list
      localStorage.removeItem(DEMO_SESSION_KEY)
      localStorage.removeItem('railink_demo_photo_v1')
    }
    await logout()
    showToast('데이터를 모두 삭제했어요.', 'success')
    router.replace('/login')
  }

  if (!session) return <div className="min-h-[100dvh] bg-bg" />

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center justify-between gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-1">
          <Link
            href="/calendar"
            aria-label="뒤로"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
          >
            <ChevronLeftIcon size={20} />
          </Link>
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">내 정보</h3>
        </div>
        <Button
          variant={dirty ? 'primary' : 'outline'}
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
          className={dirty ? '' : 'opacity-50'}
        >
          {saving ? '저장 중…' : '저장'}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-8">
        {/* Hero profile card */}
        <section className="flex flex-col items-center px-4 py-5 bg-surface border border-line rounded-lg">
          <div className="relative">
            <Avatar name={session.name} photo={session.photo} size="xl" color="brand" className="!w-[84px] !h-[84px] text-[28px]" />
            <Link
              href="/settings/photo"
              aria-label="프로필 사진 변경"
              className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-brand text-ink-on-brand border-[3px] border-surface grid place-items-center"
            >
              <EditIcon size={14} />
            </Link>
          </div>
          <p className="mt-3 text-[20px] font-bold tracking-tight text-ink-900">{session.name}</p>
          <p className={`mt-0.5 text-caption text-ink-500 ${session.profileType === 'personal' ? 'font-kr' : 'font-en'}`}>
            {session.profileType === 'personal'
              ? '개인 계정'
              : `${session.employeeId}${session.part ? ` · ${session.part}파트` : ''}`}
          </p>
          <div className="mt-3.5 flex items-stretch gap-5">
            <Stat label="비교 동료" value={compareCount} />
            <span className="w-px bg-line" />
            <Stat label="이번 달 근무" value={workDays} suffix="일" />
            <span className="w-px bg-line" />
            <Stat label="휴무" value={offDays} suffix="일" />
          </div>
        </section>

        {/* 기본 정보 */}
        <Section title="기본 정보">
          <FieldRow label="이름" hint={session.profileType === 'personal' ? '친구가 보는 이름이에요.' : undefined}>
            <FlatInput value={name} onChange={setName} />
          </FieldRow>
          <div ref={birthdayRef}>
            <FieldRow label="생일" hint="일정을 공유한 동료의 캘린더에만 표시돼요. 비우면 표시되지 않아요.">
              {remoteLoading ? (
                // Saved birthday is still in flight — an empty date input here
                // would read as "생일 미설정".
                <div className="h-7 flex items-center"><Skeleton className="w-32 h-4 rounded-md" /></div>
              ) : (
                <input
                  type="date"
                  value={birthday}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setBirthday(e.target.value)}
                  className="w-full h-7 bg-transparent outline-none text-[15px] font-en text-ink-900"
                />
              )}
            </FieldRow>
          </div>
          {/* 사번·소속 파트는 KTX 전용 식별 정보 — personal 계정에는 숨김. */}
          {session.profileType !== 'personal' && (
            <>
              <FieldRow label="사번" lock>
                <FlatInput value={session.employeeId} onChange={() => {}} mono readOnly />
              </FieldRow>
              <FieldRow label="소속 파트" hint="A · B · C 중에서 입력해 주세요.">
                <FlatInput value={part} onChange={setPart} placeholder="예: B" />
              </FieldRow>
            </>
          )}
          <FieldRow label="이메일" lock last>
            <FlatInput value={email} onChange={() => {}} mono readOnly />
          </FieldRow>
        </Section>

        {/* 보안 */}
        <Section title="보안">
          <LinkRow
            icon={<KeyIcon size={18} />}
            label="비밀번호 변경"
            href="/settings/password"
            last
          />
        </Section>

        {/* 공개 범위 (Section A) */}
        <section className="mt-4">
          <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">공개 범위</p>
          <RadioGroup
            options={VIS_OPTIONS}
            value={vis}
            onChange={onVisibilityChange}
            ariaLabel="공개 범위"
          />
        </section>

        {/* 알림 — 약속 초대 웹 푸시 (지원 기기 + 실계정만) */}
        {!session.isDemo && push !== 'unsupported' && (
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">알림</p>
            <div className="bg-surface border border-line rounded-lg px-3.5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">약속 초대 알림</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {push === 'loading'
                    ? '알림 상태를 확인하는 중…'
                    : push === 'denied'
                      ? '브라우저 설정에서 알림이 차단돼 있어요. 사이트 설정에서 허용으로 바꿔 주세요.'
                      : '초대를 받으면 이 기기로 바로 알려드려요.'}
                </p>
              </div>
              <Switch
                on={push === 'enabled'}
                onChange={onTogglePush}
                disabled={push === 'denied' || push === 'loading' || pushBusy}
                ariaLabel="약속 초대 알림"
              />
            </div>
          </section>
        )}

        {/* 알림 — iOS 사파리 탭: 설치해야 알림을 켤 수 있음을 안내(숨기지 않는다) */}
        {!session.isDemo && push === 'unsupported' && iosInstall && (
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">알림</p>
            <Link
              href="/install"
              className="flex items-center gap-3 bg-surface border border-line rounded-lg px-3.5 py-3 active:scale-[.99] transition-transform"
            >
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">약속 초대 알림</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  아이폰은 <span className="font-semibold text-ink-700">홈 화면에 추가</span>하면 약속 초대 알림을 받을 수 있어요. 설치 방법 보기
                </p>
              </div>
              <ChevronRightIcon size={16} className="shrink-0 text-ink-300" />
            </Link>
          </section>
        )}

        {/* 수신 동의 — 업데이트·이벤트 알림 (마케팅 정보 수신 동의, 실계정만).
            가입 폼의 선택 체크박스와 같은 동의를 여기서 언제든 바꿀 수 있다. */}
        {!session.isDemo && (
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">수신 동의</p>
            <div className="bg-surface border border-line rounded-lg px-3.5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">업데이트·이벤트 알림</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  신규 기능과 이벤트 소식을 받아요. 언제든 끌 수 있어요.
                </p>
              </div>
              <Switch
                on={mktConsent}
                onChange={onToggleMarketing}
                disabled={mktBusy || remoteLoading}
                ariaLabel="업데이트·이벤트 알림 수신 동의"
              />
            </div>
          </section>
        )}

        {/* 공유 중인 동료 (Section B) */}
        <div ref={sharesRef} style={{ scrollMarginTop: 12 }}>
        <Section title="공유 중인 동료">
          {remoteLoading ? (
            // Shimmer rows mirroring ShareRow's layout — the empty-state copy
            // must never flash while the list is still being fetched.
            [0, 1].map(i => (
              <div key={i} className={`flex items-center gap-3 px-3.5 py-3 ${i === 1 ? '' : 'border-b border-line'}`}>
                <Skeleton className="w-avatar-lg h-avatar-lg rounded-full" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="w-24 h-3.5 rounded-md" />
                  <Skeleton className="w-32 h-3 rounded-md mt-1.5" />
                </div>
              </div>
            ))
          ) : shareRows.length === 0 ? (
            <p className="px-3.5 py-5 text-caption text-ink-500 leading-relaxed text-center">
              아직 공유 중인 동료가 없어요. 캘린더에서 동료를 비교에 추가하면 공유 요청이 시작돼요.
            </p>
          ) : (
            shareRows.map((r, i) => (
              <ShareRow
                key={`${r.kind}-${r.s.ownerId}-${r.s.viewerId}`}
                kind={r.kind}
                share={r.s}
                busy={shareBusy}
                last={i === shareRows.length - 1}
                onAccept={() => runShareAction(() => respondShare(r.s.viewerId, true), `${r.s.counterpart.name}님과 일정을 공유해요`, 'share_accept')}
                onDecline={() => runShareAction(() => respondShare(r.s.viewerId, false), '요청을 거절했어요')}
                onStop={() => runShareAction(() => respondShare(r.s.viewerId, false), `${r.s.counterpart.name}님과의 공유를 중지했어요`)}
              />
            ))
          )}
        </Section>
        </div>

        {/* 기타 */}
        <Section title="기타">
          <LinkRow
            icon={<UploadIcon size={18} />}
            label="내 근무표 다시 등록"
            onClick={() => router.push('/calendar')}
          />
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-3.5 text-left"
          >
            <span className="text-callout font-semibold text-danger">데이터 모두 삭제</span>
            <span className="text-danger"><ChevronRightIcon size={16} /></span>
          </button>
        </Section>

        <p className="mt-4 text-center font-en text-[11px] text-ink-300">
          RAILINK · V1.0 · BUILD 2026.05
        </p>
      </div>

      {/* 비공개 전환 확인 시트 (spec §3) */}
      <BottomSheet open={pendingPrivate} onClose={() => setPendingPrivate(false)}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">비공개로 바꿀까요?</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            이미 일정을 공유 중인 동료는 영향 없어요. 새로 나를 찾는 동료는 사번을 알아야 해요.
          </p>
          <div className="flex gap-2.5 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setPendingPrivate(false)}>취소</Button>
            <Button className="flex-1" onClick={() => { setPendingPrivate(false); commitVisibility('private') }}>
              비공개로 바꾸기
            </Button>
          </div>
        </div>
      </BottomSheet>

      {confirmOpen && (
        <DangerConfirm
          title="데이터를 모두 삭제할까요?"
          body={
            <>
              등록한 근무표·비교 동료·설정이 모두 사라져요.
              <br />이 작업은 되돌릴 수 없어요.
            </>
          }
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-en text-[18px] font-bold text-ink-900">
        {value}
        {suffix && <span className="text-[11px] text-ink-500 font-medium ml-px">{suffix}</span>}
      </span>
      <span className="text-[11px] text-ink-500">{label}</span>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
        {title}
      </p>
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        {children}
      </div>
      {hint && <p className="mt-1.5 px-2 text-[11px] text-ink-500 leading-relaxed">{hint}</p>}
    </section>
  )
}

function FieldRow({
  label, hint, lock, last, children,
}: { label: string; hint?: string; lock?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? '' : 'border-b border-line'}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-ink-500 mb-1">
        {label}
        {lock && <span className="text-ink-300 font-normal">· 변경 불가</span>}
      </p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-300">{hint}</p>}
    </div>
  )
}

function FlatInput({
  value, onChange, mono, readOnly, placeholder,
}: { value: string; onChange: (v: string) => void; mono?: boolean; readOnly?: boolean; placeholder?: string }) {
  return (
    <input
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`w-full h-7 bg-transparent outline-none text-[15px] ${
        readOnly ? 'text-ink-700' : 'text-ink-900'
      } ${mono ? 'font-en' : 'font-kr'}`}
    />
  )
}

function LinkRow({
  icon, label, sub, href, onClick, last,
}: {
  icon: ReactNode
  label: string
  sub?: string
  href?: string
  onClick?: () => void
  last?: boolean
}) {
  const body = (
    <>
      <span className="text-ink-700 shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-callout font-medium text-ink-900">{label}</span>
        {sub && <span className="block mt-0.5 text-[11px] text-ink-500">{sub}</span>}
      </span>
      <span className="text-ink-300"><ChevronRightIcon size={16} /></span>
    </>
  )
  const cls = `w-full flex items-center gap-3 px-3.5 py-3.5 text-left ${last ? '' : 'border-b border-line'}`
  if (href) {
    return <Link href={href} className={cls}>{body}</Link>
  }
  return <button onClick={onClick} className={cls}>{body}</button>
}

function ShareRow({
  kind, share, busy, last, onAccept, onDecline, onStop,
}: {
  kind: 'incoming' | 'sharing'
  share: ShareWithProfile
  busy: boolean
  last: boolean
  onAccept?: () => void
  onDecline?: () => void
  onStop?: () => void
}) {
  const p = share.counterpart
  const caption = kind === 'incoming' ? '공유 요청을 받았어요' : '내 일정을 공유 중'
  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${last ? '' : 'border-b border-line'}`}>
      <Avatar name={p.name} photo={p.photo ?? undefined} size="lg" color="brand" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-callout text-ink-900 truncate">{p.name}</span>
          <span className="font-en text-caption text-ink-500">{p.employeeId}</span>
        </div>
        <p className="text-[11px] text-ink-500 mt-0.5">{caption}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {kind === 'incoming' ? (
          <>
            <PillBtn tone="brand" disabled={busy} onClick={onAccept}>수락</PillBtn>
            <PillBtn tone="danger" disabled={busy} onClick={onDecline}>거절</PillBtn>
          </>
        ) : (
          <PillBtn tone="danger" disabled={busy} onClick={onStop}>중지</PillBtn>
        )}
      </div>
    </div>
  )
}

function PillBtn({
  children, onClick, disabled, tone,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone: 'brand' | 'danger' }) {
  const toneCls = tone === 'brand' ? 'bg-brand-050 text-brand' : 'bg-danger-soft text-danger'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-caption font-semibold px-3 py-1.5 rounded-pill ${toneCls} ${disabled ? 'opacity-50' : ''}`}
    >
      {children}
    </button>
  )
}

