'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  ChevronLeftIcon, ChevronRightIcon, EditIcon, KeyIcon, UploadIcon,
} from '@/components/ui/icons'
import { getCurrentSession, logout, updateProfile, type Session } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getMonthSchedules, getRemoteMonthSchedules } from '@/lib/store/schedules'
import { COMPARE_KEY } from '@/lib/store/compare'
import { getGroupsState, allMemberUids, GROUPS_KEY } from '@/lib/store/groups'
import { COLLEAGUE_DIRECTORY_KEY, SAMPLE_DIRECTORY_SEEDED_KEY } from '@/lib/store/colleagues'
import { DangerConfirm } from '@/components/ui/DangerConfirm'

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

  const [share, setShare] = useState(true)
  const [baseShare, setBaseShare] = useState(true)
  const [saving, setSaving] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)

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
        const { data: prof } = await supabase
          .from('profiles').select('share_schedule').eq('id', s.uid).maybeSingle()
        if (alive && prof && typeof prof.share_schedule === 'boolean') {
          setShare(prof.share_schedule)
          setBaseShare(prof.share_schedule)
        }
      }
    })()
    return () => { alive = false }
  }, [router])

  const dirty = useMemo(() => {
    if (!session) return false
    return name !== session.name || part !== (session.part ?? '') || share !== baseShare
  }, [session, name, part, share, baseShare])

  async function handleSave() {
    if (!dirty || saving || !session) return
    if (!name.trim()) { showToast('이름을 입력해 주세요.', 'danger'); return }
    setSaving(true)
    const res = await updateProfile({
      name: name.trim(),
      employeeId: session.employeeId,
      part: part.trim() || undefined,
      shareSchedule: share,
    })
    setSaving(false)
    if (!res.ok) {
      showToast(res.message ?? '저장에 실패했어요.', 'danger')
      return
    }
    setBaseShare(share)
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
          <p className="mt-0.5 font-en text-caption text-ink-500">
            {session.employeeId}{session.part ? ` · ${session.part}파트` : ''}
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
          <FieldRow label="이름">
            <FlatInput value={name} onChange={setName} />
          </FieldRow>
          <FieldRow label="사번" lock>
            <FlatInput value={session.employeeId} onChange={() => {}} mono readOnly />
          </FieldRow>
          <FieldRow label="소속 파트" hint="A · B · C 중에서 입력해 주세요.">
            <FlatInput value={part} onChange={setPart} placeholder="예: B" />
          </FieldRow>
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

        {/* 공개 범위 */}
        <Section title="공개 범위" hint="저장하면 바로 적용돼요.">
          <ToggleRow
            label="내 일정을 동료에게 공개"
            sub="끄면 동료가 내 근무표·다이·출퇴근 시간을 볼 수 없어요."
            on={share} onChange={setShare}
            last
          />
        </Section>

        {/* 알림 */}
        <Section title="알림">
          <ToggleRow
            label="동료 일정이 바뀌면 알림"
            sub="비교 중인 동료의 근무표가 갱신됐을 때."
            on={false} onChange={() => {}} disabled
          />
          <ToggleRow
            label="내가 비교 대상으로 추가될 때 알림"
            on={false} onChange={() => {}} disabled
            last
          />
        </Section>

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

function ToggleRow({
  label, sub, on, onChange, last, disabled,
}: {
  label: string; sub?: string; on: boolean
  onChange: (on: boolean) => void; last?: boolean; disabled?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 px-3.5 py-3.5 ${last ? '' : 'border-b border-line'} ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5 text-callout font-medium text-ink-900">
          {label}
          {disabled && (
            <span className="text-[10px] font-bold text-ink-500 bg-bg px-1.5 py-0.5 rounded-pill">준비 중</span>
          )}
        </p>
        {sub && <p className="mt-0.5 text-[11px] text-ink-500 leading-relaxed">{sub}</p>}
      </div>
      <button
        onClick={() => { if (!disabled) onChange(!on) }}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        className={`relative w-11 h-[26px] rounded-pill shrink-0 transition-colors duration-150 ${
          on ? 'bg-brand' : 'bg-line-2'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sh1 transition-[left] duration-150"
          style={{ left: on ? 21 : 3 }}
        />
      </button>
    </div>
  )
}

