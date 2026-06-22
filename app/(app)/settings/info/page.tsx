'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  ChevronLeftIcon, ChevronRightIcon, EditIcon, KeyIcon, UploadIcon,
} from '@/components/ui/icons'
import { getCurrentSession, getCachedSession, logout, updateProfile, setVisibility as saveVisibility, setMarketingConsent, type Session } from '@/lib/auth'
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
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { RadioGroup, type RadioOption } from '@/components/ui/RadioGroup'
import { CbSelect } from '@/components/ui/CbSelect'
import { BRANCHES, BRANCH_OTHER } from '@/lib/profile-fields'
import type { Visibility } from '@/lib/types/schedule'

const EMPTY_SHARES: ShareListsWithProfile = { incoming: [], outgoing: [], sharing: [], viewing: [] }

const SCHEDULES_KEY = 'railink_schedules_v3'
const DEMO_SESSION_KEY = 'railink_demo_session_v3'

export default function SettingsInfoPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('settings.info')
  const tFields = useTranslations('fields')

  const VIS_OPTIONS: RadioOption<Visibility>[] = [
    { value: 'public', title: tFields('visibility.public.title'), desc: tFields('visibility.public.desc') },
    { value: 'private', title: tFields('visibility.private.title'), desc: tFields('visibility.private.desc') },
  ]

  // 이스터에그: 버전 표기를 1.5초 내 7번 탭하면 이 기기를 GA에서 제외/복귀 토글.
  // PWA(특히 iOS)는 주소창이 없어 `?noga=1`을 입력할 수 없으므로 인앱 진입점으로 둠.
  // localStorage `ga_optout`은 components/Analytics.tsx가 마운트 시 읽음(새로고침/재실행 후 적용).
  const gaTapCountRef = useRef(0)
  const gaLastTapRef = useRef(0)
  function handleVersionTap() {
    const now = Date.now()
    if (now - gaLastTapRef.current > 1500) gaTapCountRef.current = 0
    gaLastTapRef.current = now
    gaTapCountRef.current += 1
    if (gaTapCountRef.current < 7) return
    gaTapCountRef.current = 0
    try {
      if (localStorage.getItem('ga_optout') === '1') {
        localStorage.removeItem('ga_optout')
        showToast(t('gaOptIn'), 'default')
      } else {
        localStorage.setItem('ga_optout', '1')
        showToast(t('gaOptOut'), 'success')
      }
    } catch {}
  }

  // Seed from the SPA-lifetime session cache so navigating into 내정보 doesn't
  // flash the blank gate while the session re-resolves (starts null otherwise).
  const [session, setSession] = useState<Session | null>(() => getCachedSession())
  const [compareCount, setCompareCount] = useState(0)
  const [workDays, setWorkDays] = useState(0)
  const [offDays, setOffDays] = useState(0)

  const [name, setName] = useState('')
  // 소속 지사: 드롭다운 선택값(BRANCHES 중 하나 또는 '기타'), '기타'면 branchOther.
  // 저장 값은 profiles.part 컬럼(파트 → 지사로 의미 교체).
  const [branch, setBranch] = useState('')
  const [branchOther, setBranchOther] = useState('')
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
          showToast(t('pushOff'), 'default')
        } catch (e) {
          showToast(e instanceof Error ? e.message : t('pushOffFailed'), 'danger')
        }
      } else {
        const res = await enablePush()
        setPush(res.status)
        if (res.status === 'enabled') showToast(t('pushOn'), 'success')
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
      // 저장된 part(지사)를 드롭다운/기타로 복원. 목록에 없는 값(레거시 파트
      // 'A'·'B' 등이나 직접 입력 지사)은 '기타'로 띄워 그대로 편집 가능하게.
      {
        const p = s.part ?? ''
        if (p === '') { setBranch(''); setBranchOther('') }
        else if ((BRANCHES as readonly string[]).includes(p)) { setBranch(p); setBranchOther('') }
        else { setBranch(BRANCH_OTHER); setBranchOther(p) }
      }
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
      showToast(res.message ?? t('marketingToggleFailed'), 'danger')
      return
    }
    showToast(
      next ? t('marketingOn') : t('marketingOff'),
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
      showToast(res.message ?? t('visibilityChangeFailed'), 'danger')
      return
    }
    showToast(t('visibilityChanged'), 'success')
  }

  // Share-row actions. Each disables the row controls while in flight, then
  // reloads so the row moves to its new bucket (or disappears).
  async function runShareAction(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string, gaEvent?: string) {
    if (shareBusy) return
    setShareBusy(true)
    const res = await fn()
    setShareBusy(false)
    if (!res.ok) { showToast(res.message ?? t('shareActionFailed'), 'danger'); return }
    if (gaEvent) track(gaEvent)
    showToast(okMsg, 'success')
    reloadShares()
  }

  // 저장될 지사 값: '기타'면 직접 입력값, 아니면 드롭다운 선택값.
  const branchValue = branch === BRANCH_OTHER ? branchOther.trim() : branch

  const dirty = useMemo(() => {
    if (!session) return false
    return name !== session.name || branchValue !== (session.part ?? '') || birthday !== initialBirthday
  }, [session, name, branchValue, birthday, initialBirthday])

  // Section B rows: 요청 받음 → 공유 중. "내가 요청 중"은 캘린더 비교 그룹이
  // 단일 진실 출처이므로 여기엔 노출하지 않는다 — 그룹에서 빼는 동작이 곧 취소다.
  const shareRows = useMemo(() => [
    ...shares.incoming.map(s => ({ kind: 'incoming' as const, s })),
    ...shares.sharing.map(s => ({ kind: 'sharing' as const, s })),
  ], [shares])

  async function handleSave() {
    if (!dirty || saving || !session) return
    if (!name.trim()) { showToast(t('nameRequired'), 'danger'); return }
    setSaving(true)
    const res = await updateProfile({
      name: name.trim(),
      employeeId: session.employeeId,
      part: branchValue || undefined,
    })
    if (!res.ok) {
      setSaving(false)
      showToast(res.message ?? t('saveFailed'), 'danger')
      return
    }
    // Birthday lives in its own privacy-gated table — save only when changed.
    if (birthday !== initialBirthday) {
      const br = await saveMyBirthday(birthday || null)
      if (!br.ok) {
        setSaving(false)
        showToast(br.message ?? t('birthdaySaveFailed'), 'danger')
        return
      }
      setInitialBirthday(birthday)
    }
    setSaving(false)
    setSession({ ...session, name: name.trim(), part: branchValue || undefined })
    showToast(t('saved'), 'success')
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
    showToast(t('deleted'), 'success')
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
            aria-label={t('back')}
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
          >
            <ChevronLeftIcon size={20} />
          </Link>
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('title')}</h3>
        </div>
        <Button
          variant={dirty ? 'primary' : 'outline'}
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
          className={dirty ? '' : 'opacity-50'}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-8">
        {/* Hero profile card */}
        <section className="flex flex-col items-center px-4 py-5 bg-surface border border-line rounded-lg">
          <div className="relative">
            <Avatar name={session.name} photo={session.photo} size="xl" color="brand" className="!w-[84px] !h-[84px] text-[28px]" />
            <Link
              href="/settings/photo"
              aria-label={t('photoEdit')}
              className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-brand text-ink-on-brand border-[3px] border-surface grid place-items-center"
            >
              <EditIcon size={14} />
            </Link>
          </div>
          <p className="mt-3 text-[20px] font-bold tracking-tight text-ink-900">{session.name}</p>
          <p className={`mt-0.5 text-caption text-ink-500 ${session.profileType === 'personal' ? 'font-kr' : 'font-en'}`}>
            {session.profileType === 'personal'
              ? t('accountPersonal')
              : `${session.employeeId}${session.part ? ` · ${session.part}` : ''}`}
          </p>
          <div className="mt-3.5 flex items-stretch gap-5">
            <Stat label={t('statCompare')} value={compareCount} />
            <span className="w-px bg-line" />
            <Stat label={t('statWork')} value={workDays} suffix={t('dayUnit')} />
            <span className="w-px bg-line" />
            <Stat label={t('statOff')} value={offDays} suffix={t('dayUnit')} />
          </div>
        </section>

        {/* 기본 정보 */}
        <Section title={t('sectionBasic')}>
          <FieldRow label={t('nameLabel')} hint={session.profileType === 'personal' ? t('nameHintPersonal') : undefined}>
            <FlatInput value={name} onChange={setName} />
          </FieldRow>
          <div ref={birthdayRef}>
            <FieldRow label={t('birthdayLabel')} hint={t('birthdayHint')}>
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
          {/* 사번·소속 지사는 KTX 전용 식별 정보 — personal 계정에는 숨김. */}
          {session.profileType !== 'personal' && (
            <>
              <FieldRow label={t('employeeIdLabel')} lock lockLabel={t('lockNote')}>
                <FlatInput value={session.employeeId} onChange={() => {}} mono readOnly />
              </FieldRow>
              <FieldRow label={t('branchLabel')} hint={branch === BRANCH_OTHER ? undefined : t('branchHint')}>
                <div className="py-1">
                  <CbSelect
                    value={branch}
                    placeholder={t('branchPlaceholder')}
                    options={[...BRANCHES.map(b => ({ v: b, label: b })), { v: BRANCH_OTHER, label: tFields('branchOther') }]}
                    onChange={setBranch}
                  />
                  {branch === BRANCH_OTHER && (
                    <div className="mt-2">
                      <FlatInput value={branchOther} onChange={setBranchOther} placeholder={t('branchOtherPlaceholder')} />
                    </div>
                  )}
                </div>
              </FieldRow>
            </>
          )}
          <FieldRow label={t('emailLabel')} lock lockLabel={t('lockNote')} last>
            <FlatInput value={email} onChange={() => {}} mono readOnly />
          </FieldRow>
        </Section>

        {/* 보안 */}
        <Section title={t('sectionSecurity')}>
          <LinkRow
            icon={<KeyIcon size={18} />}
            label={t('changePassword')}
            href="/settings/password"
            last
          />
        </Section>

        {/* 공개 범위 (Section A) */}
        <section className="mt-4">
          <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">{t('sectionVisibility')}</p>
          <RadioGroup
            options={VIS_OPTIONS}
            value={vis}
            onChange={onVisibilityChange}
            ariaLabel={t('visibilityAriaLabel')}
          />
        </section>

        {/* 알림 — 약속 초대 웹 푸시 (지원 기기 + 실계정만) */}
        {!session.isDemo && push !== 'unsupported' && (
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">{t('sectionNotifications')}</p>
            <div className="bg-surface border border-line rounded-lg px-3.5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">{t('appointmentPush')}</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {push === 'loading'
                    ? t('pushLoading')
                    : push === 'denied'
                      ? t('pushDenied')
                      : t('pushReady')}
                </p>
              </div>
              <Switch
                on={push === 'enabled'}
                onChange={onTogglePush}
                disabled={push === 'denied' || push === 'loading' || pushBusy}
                ariaLabel={t('appointmentPush')}
              />
            </div>
          </section>
        )}

        {/* 알림 — iOS 사파리 탭: 설치해야 알림을 켤 수 있음을 안내(숨기지 않는다) */}
        {!session.isDemo && push === 'unsupported' && iosInstall && (
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">{t('sectionNotifications')}</p>
            <Link
              href="/install"
              className="flex items-center gap-3 bg-surface border border-line rounded-lg px-3.5 py-3 active:scale-[.99] transition-transform"
            >
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">{t('appointmentPush')}</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {t.rich('iosInstallHint', { b: (c) => <span className="font-semibold text-ink-700">{c}</span> })}
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
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">{t('sectionConsent')}</p>
            <div className="bg-surface border border-line rounded-lg px-3.5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-callout font-semibold text-ink-900">{t('marketingTitle')}</p>
                <p className="text-caption text-ink-500 mt-0.5 leading-relaxed">
                  {t('marketingDesc')}
                </p>
              </div>
              <Switch
                on={mktConsent}
                onChange={onToggleMarketing}
                disabled={mktBusy || remoteLoading}
                ariaLabel={t('marketingAriaLabel')}
              />
            </div>
          </section>
        )}

        {/* 공유 중인 동료 (Section B) */}
        <div ref={sharesRef} style={{ scrollMarginTop: 12 }}>
        <Section title={t('sectionShares')}>
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
              {t('sharesEmpty')}
            </p>
          ) : (
            shareRows.map((r, i) => (
              <ShareRow
                key={`${r.kind}-${r.s.ownerId}-${r.s.viewerId}`}
                kind={r.kind}
                share={r.s}
                busy={shareBusy}
                last={i === shareRows.length - 1}
                caption={r.kind === 'incoming' ? t('shareCaptionIncoming') : t('shareCaptionSharing')}
                acceptLabel={t('accept')}
                declineLabel={t('decline')}
                stopLabel={t('stop')}
                onAccept={() => runShareAction(() => respondShare(r.s.viewerId, true), t('shareAccepted', { name: r.s.counterpart.name }), 'share_accept')}
                onDecline={() => runShareAction(() => respondShare(r.s.viewerId, false), t('shareDeclined'))}
                onStop={() => runShareAction(() => respondShare(r.s.viewerId, false), t('shareStopped', { name: r.s.counterpart.name }))}
              />
            ))
          )}
        </Section>
        </div>

        {/* 언어 / Language */}
        <LanguageSwitcher />

        {/* 기타 */}
        <Section title={t('sectionOther')}>
          <LinkRow
            icon={<UploadIcon size={18} />}
            label={t('reuploadSchedule')}
            onClick={() => router.push('/calendar')}
          />
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-3.5 text-left"
          >
            <span className="text-callout font-semibold text-danger">{t('deleteAll')}</span>
            <span className="text-danger"><ChevronRightIcon size={16} /></span>
          </button>
        </Section>

        <p
          onClick={handleVersionTap}
          className="mt-4 text-center font-en text-[11px] text-ink-300 select-none"
        >
          RAILINK · V1.0 · BUILD 2026.05
        </p>
      </div>

      {/* 비공개 전환 확인 시트 (spec §3) */}
      <BottomSheet open={pendingPrivate} onClose={() => setPendingPrivate(false)}>
        <div className="px-5 pt-2 pb-8">
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{t('privateConfirmTitle')}</h3>
          <p className="mt-2 text-callout text-ink-700 leading-relaxed">
            {t('privateConfirmBody')}
          </p>
          <div className="flex gap-2.5 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setPendingPrivate(false)}>{t('cancel')}</Button>
            <Button className="flex-1" onClick={() => { setPendingPrivate(false); commitVisibility('private') }}>
              {t('switchToPrivate')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {confirmOpen && (
        <DangerConfirm
          title={t('deleteConfirmTitle')}
          body={t.rich('deleteConfirmBody', { br: () => <br /> })}
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
  label, hint, lock, lockLabel, last, children,
}: { label: string; hint?: string; lock?: boolean; lockLabel?: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? '' : 'border-b border-line'}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-ink-500 mb-1">
        {label}
        {lock && <span className="text-ink-300 font-normal">· {lockLabel}</span>}
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
  kind, share, busy, last, caption, acceptLabel, declineLabel, stopLabel, onAccept, onDecline, onStop,
}: {
  kind: 'incoming' | 'sharing'
  share: ShareWithProfile
  busy: boolean
  last: boolean
  caption: string
  acceptLabel: string
  declineLabel: string
  stopLabel: string
  onAccept?: () => void
  onDecline?: () => void
  onStop?: () => void
}) {
  const p = share.counterpart
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
            <PillBtn tone="brand" disabled={busy} onClick={onAccept}>{acceptLabel}</PillBtn>
            <PillBtn tone="danger" disabled={busy} onClick={onDecline}>{declineLabel}</PillBtn>
          </>
        ) : (
          <PillBtn tone="danger" disabled={busy} onClick={onStop}>{stopLabel}</PillBtn>
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

