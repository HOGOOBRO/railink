'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { CbSelect } from '@/components/ui/CbSelect'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { BrandMark, ChevronLeftIcon, EyeIcon, GoogleIcon } from '@/components/ui/icons'
import { useToast } from '@/components/ui/Toast'
import { signup, getCurrentSession, resendConfirmation, signInWithGoogle } from '@/lib/auth'
import { RadioGroup, type RadioOption } from '@/components/ui/RadioGroup'
import type { Visibility } from '@/lib/types/schedule'
import { savePendingInvite, peekInvite } from '@/lib/store/invites'
import { BRANCHES, BRANCH_OTHER, JOB_OPTIONS, CATEGORY_OPTIONS, AIRLINES, findAirline, type SignupCategory } from '@/lib/profile-fields'

const VIS_OPTIONS: RadioOption<Visibility>[] = [
  { value: 'public', title: '공개', desc: '이름·사진이 동료 검색에 떠요. 일정은 따로 수락이 필요해요.' },
  { value: 'private', title: '비공개', desc: '검색에는 안 떠요. 사번을 정확히 아는 동료만 공유를 요청할 수 있어요.' },
]


interface FormErrors {
  email?: string
  employeeId?: string
  name?: string
  branch?: string
  job?: string
  airline?: string
  password?: string
  passwordConfirm?: string
  terms?: string
}

const PW_LABELS = ['', '약함', '보통', '좋음', '강함']

// Required-agreement row: checkbox + label + "보기" link to the full document.
// We don't use <Checkbox> here because a nested <Link> inside its <label> would
// also toggle the checkbox on click. The label stays inside its own <label>
// element; the link sits outside it.
function AgreementRow({
  label,
  checked,
  onChange,
  href,
}: {
  label: string
  checked: boolean
  onChange: () => void
  href: string
}) {
  return (
    <div className="flex items-center gap-2.5 py-2 text-callout text-ink-900">
      <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="w-[18px] h-[18px] accent-brand cursor-pointer"
        />
        <span className="flex-1">{label}</span>
      </label>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-brand-050 text-brand">필수</span>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-caption text-ink-500 underline underline-offset-2 hover:text-ink-700"
      >
        보기
      </Link>
    </div>
  )
}

function pwStrength(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, Math.max(1, s))
}

export default function SignupPage() {
  const router = useRouter()
  const { showToast } = useToast()

  // 가입 첫 질문(직무 카테고리). KTX 중심 분기를 대체. airline은 '항공 승무원'일 때 소속.
  const [category, setCategory] = useState<SignupCategory>('ktx')
  const [airline, setAirline] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviterName, setInviterName] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '', employeeId: '', name: '',
    password: '', passwordConfirm: '',
  })
  // KTX 소속 지사: 드롭다운 선택값(BRANCHES 중 하나 또는 '기타'), '기타'면 branchOther 사용.
  const [branch, setBranch] = useState('')
  const [branchOther, setBranchOther] = useState('')
  // personal 직군: 칩 단일선택(JOB_OPTIONS value), 'other'면 jobOther 사용.
  const [jobCategory, setJobCategory] = useState<string | null>(null)
  const [jobOther, setJobOther] = useState('')
  const [terms, setTerms] = useState({
    tos: false, privacy: false, marketing: false,
  })
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const isKtx = category === 'ktx'
  const isAirline = category === 'airline'
  // 저장용 profile_type: KTX는 ktx_attendant, 항공/기타는 personal(+airline 태그).
  const profileType = isKtx ? 'ktx_attendant' : 'personal'

  useEffect(() => {
    let alive = true
    getCurrentSession().then(s => { if (alive && s) router.replace('/calendar') })
    return () => { alive = false }
  }, [router])

  // Invite entry (/signup?invite=TOKEN). We read window.location directly to
  // avoid useSearchParams' Suspense requirement. The token is stashed so it
  // survives the email-verification round trip (consumed at login). The toggle
  // DEFAULTS to personal but is NOT locked — a KTX colleague invited by another
  // KTX crew member can still pick "네" and keep their KTX identity; the invite
  // auto-connects either way (consume_invite is track-agnostic).
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite')
    if (!token) return
    // Deferring this client-only URL read to an effect is the hydration-safe
    // pattern (a lazy useState initializer reading window would mismatch SSR).
    // The rule's cascading-render concern doesn't apply to a one-shot mount read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInviteToken(token)
    savePendingInvite(token)
    setCategory('other')
    // Resolve the inviter's name (anon RPC) for the header; null → generic copy.
    peekInvite(token).then(setInviterName)
  }, [])

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(p => ({ ...p, [field]: e.target.value }))
      setErrors(p => ({ ...p, [field]: undefined }))
    }
  }

  const allRequired = terms.tos && terms.privacy
  const allAgrees = allRequired && terms.marketing
  function setAll(on: boolean) {
    setTerms({ tos: on, privacy: on, marketing: on })
    if (on) setErrors(p => ({ ...p, terms: undefined }))
  }
  function toggle(k: keyof typeof terms) {
    setTerms(p => ({ ...p, [k]: !p[k] }))
    setErrors(p => ({ ...p, terms: undefined }))
  }

  const strength = pwStrength(form.password)

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!form.email) e.email = '이메일을 입력해 주세요.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = '이메일 형식을 확인해 주세요.'
    // 사번 is KTX-only.
    if (isKtx) {
      if (!form.employeeId) e.employeeId = '사번을 입력해 주세요.'
      else if (!/^\d{4,8}$/.test(form.employeeId)) e.employeeId = '사번은 숫자 4~8자리로 입력해 주세요.'
    }
    if (!form.name) e.name = '이름을 입력해 주세요.'
    else if (!isKtx && form.name.length > 30) e.name = '이름은 30자 이내로 입력해 주세요.'
    // 지사·직무는 둘 다 선택(optional) — 가입 전환을 막지 않는다. 단 '기타'를
    // 골랐으면 텍스트를 받아야 데이터로 의미가 있어 그때만 필수.
    if (isKtx) {
      if (branch === BRANCH_OTHER && !branchOther.trim()) e.branch = '소속 지사를 입력해 주세요.'
    } else if (isAirline) {
      if (!airline) e.airline = '항공사를 선택해 주세요.'
    } else if (jobCategory === 'other' && !jobOther.trim()) {
      e.job = '직무를 입력해 주세요.'
    }
    if (!form.password) e.password = '비밀번호를 입력해 주세요.'
    else if (form.password.length < 8) e.password = '비밀번호는 8자 이상으로 설정해 주세요.'
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = '영문과 숫자를 모두 포함해 주세요.'
    if (form.passwordConfirm !== form.password) e.passwordConfirm = '비밀번호가 일치하지 않아요.'
    if (!allRequired) e.terms = '필수 약관에 모두 동의해 주세요.'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (isKtx && !visibility) return  // guarded by the disabled submit button

    // KTX 소속 지사: '기타' 선택 시 직접 입력값, 아니면 드롭다운 선택값.
    const branchValue = branch === BRANCH_OTHER ? branchOther.trim() : branch

    setLoading(true)
    const result = await signup({
      email: form.email,
      password: form.password,
      // personal has no 사번/지사; trigger clamps personal visibility to private.
      employeeId: isKtx ? form.employeeId : '',
      name: form.name,
      part: isKtx ? (branchValue || undefined) : undefined,
      visibility: isKtx ? (visibility as Visibility) : 'private',
      profileType,
      // 항공 승무원: 소속 항공사 태그(데이터 축적·항공사 테마·파서 레이아웃 키).
      airline: isAirline ? (airline || undefined) : undefined,
      // '기타'(personal) 전용: 직군(확장 우선순위용). KTX·항공엔 보내지 않는다.
      jobCategory: category === 'other' ? (jobCategory ?? undefined) : undefined,
      jobOther: category === 'other' && jobCategory === 'other' ? (jobOther.trim() || undefined) : undefined,
      // Survives the email-confirm redirect via ?invite= even on another browser.
      inviteToken,
      marketingConsent: terms.marketing,
    })
    if (!result.ok) {
      setLoading(false)
      if (result.field) setErrors({ [result.field]: result.message })
      else showToast(result.message, 'danger')
      return
    }
    if (result.needsConfirm) {
      setLoading(false)
      setSentTo(form.email)
      return
    }
    // Immediate session (email confirm disabled). The stashed invite token is
    // consumed on the calendar mount (single chokepoint for all entry paths).
    setLoading(false)
    showToast(`환영합니다, ${form.name} 님!`, 'success')
    router.push('/calendar')
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    // Google signups have no 사번/파트 → trigger classifies them as personal.
    // Any invite token is threaded through so it survives the round trip.
    const res = await signInWithGoogle(inviteToken)
    if (!res.ok) {
      setGoogleLoading(false)
      showToast(res.message ?? 'Google 로그인을 시작하지 못했어요.', 'danger')
    }
  }

  async function handleResend() {
    if (!sentTo) return
    await resendConfirmation(sentTo)
    showToast('인증 메일을 다시 보냈어요.', 'success')
  }

  if (sentTo) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center min-h-[100dvh] bg-surface px-8"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-5">
          <BrandMark size={26} />
        </div>
        <h1 className="text-[22px] font-bold tracking-tighter text-ink-900">메일을 확인해 주세요</h1>
        <p className="mt-3 text-callout text-ink-700 leading-relaxed">
          <span className="font-en text-ink-900">{sentTo}</span> 으로<br />
          인증 메일을 보냈어요. 메일의 링크를 누르면<br />가입이 완료되고 로그인할 수 있어요.
        </p>
        <div className="h-7" />
        <Link href="/login" className="w-full max-w-[360px]">
          <Button block>로그인 화면으로</Button>
        </Link>
        <button
          type="button"
          onClick={handleResend}
          className="mt-3.5 text-caption font-semibold text-brand hover:text-brand-700 transition-colors"
        >
          메일을 못 받으셨나요? 다시 보내기
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-[100dvh] bg-bg overflow-y-auto"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <Link
        href="/login"
        aria-label="뒤로"
        className="absolute top-2 left-2 w-10 h-10 grid place-items-center rounded-full text-ink-700 z-10"
      >
        <ChevronLeftIcon size={20} />
      </Link>

      <div className="px-5 pt-6 pb-20">
        <div className="flex items-center justify-center gap-1.5 font-en text-[18px] font-[400] text-ink-900">
          <BrandMark size={16} className="text-brand" /> RaiLink
        </div>

        {inviteToken ? (
          /* Inviter header — replaces the visible "계정 만들기" h1 when arriving via
             an invite link. Body text only (no headline). The inviter name comes
             from peek_invite (anon); until it resolves / if the token is unusable
             we use name-agnostic copy. */
          <>
            <h1 className="sr-only">계정 만들기</h1>
            <div className="mt-4 mb-5 bg-brand-050 border border-brand-100 rounded-lg px-4 py-5 flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-full bg-brand text-ink-on-brand grid place-items-center mb-3">
                <BrandMark size={20} />
              </div>
              <p className="text-callout text-ink-700 leading-relaxed">
                {inviterName
                  ? <><span className="font-bold text-ink-900">{inviterName} 님</span>이 RaiLink로 초대했어요.</>
                  : 'RaiLink로 초대받았어요.'}
                <br />가입하면 서로의 근무 일정을 한 화면에서 맞춰볼 수 있어요.
              </p>
            </div>
          </>
        ) : (
          <h1 className="text-center mt-3.5 mb-5 text-[26px] leading-tight font-bold tracking-tighter text-ink-900">
            계정 만들기
          </h1>
        )}

        {/* Google — fastest path for personal users (no 사번 to type). KTX crew
            can still use it and add their 사번 in 설정 later. */}
        <Button
          type="button"
          variant="outline"
          block
          className="mt-4"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
        >
          <GoogleIcon size={18} />
          {googleLoading ? '연결 중…' : 'Google로 계속하기'}
        </Button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-line-2" />
          <span className="text-[11px] font-semibold tracking-wider text-ink-500">또는 이메일로 가입</span>
          <div className="flex-1 h-px bg-line-2" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
          {/* The first question — 직무 카테고리(KTX / 항공 / 기타) */}
          <div className="border-b border-line pb-3.5 mb-1">
            <p className="text-[15px] font-bold text-ink-900">어떤 일을 하세요?</p>
            <RadioGroup
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              ariaLabel="직무 선택"
              className="flex flex-col gap-2 mt-3"
            />
            {isAirline && (
              /* 소속 항공사 — CbSelect 재사용. 활성 항공사만 선택 가능, 준비중은
                 '(준비중)'으로 보이되 선택 시 안내 후 무시. */
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-caption font-semibold tracking-wide text-ink-900">항공사</span>
                <CbSelect
                  value={airline}
                  placeholder="항공사를 선택해 주세요"
                  options={AIRLINES.map(a => ({ v: a.code, label: a.active ? a.label : `${a.label} (준비중)` }))}
                  onChange={code => {
                    const a = findAirline(code)
                    if (a && !a.active) { showToast(`${a.label}는 아직 준비 중이에요.`, 'default'); return }
                    setAirline(code)
                    setErrors(p => ({ ...p, airline: undefined }))
                  }}
                />
                {errors.airline && (
                  <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                    <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                    {errors.airline}
                  </p>
                )}
                <p className="text-caption font-normal tracking-normal text-ink-300">
                  지금은 에어프레미아 근무표 인식만 지원해요. 다른 항공사는 준비 중이에요.
                </p>
              </div>
            )}
            {inviteToken && (
              <p className="mt-2.5 flex items-start gap-1 text-[11px] text-ink-300 leading-relaxed">
                <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-ink-300 text-ink-on-brand text-[9px] font-bold grid place-items-center mt-px">i</span>
                어떤 직무를 고르든 {inviterName ? `${inviterName} 님` : '초대한 분'}과 자동으로 연결돼요.
              </p>
            )}
          </div>

          <Input
            id="email" label="이메일" required type="email" autoComplete="email"
            className="font-en" placeholder="이메일을 입력해 주세요"
            value={form.email} onChange={set('email')} error={errors.email}
          />
          {isKtx && (
            <Input
              id="employeeId" label="사번" required inputMode="numeric"
              className="font-en" placeholder="숫자 4~8자리"
              value={form.employeeId} onChange={set('employeeId')} error={errors.employeeId}
            />
          )}
          <Input
            id="name" label="이름" required autoComplete="name"
            maxLength={isKtx ? undefined : 30}
            hint={isKtx ? undefined : '친구가 보는 이름이에요.'}
            placeholder="이름을 입력해 주세요"
            value={form.name} onChange={set('name')} error={errors.name}
          />
          {isKtx && (
            /* 소속 지사 — 정해진 6개 드롭다운(약속 잡기 시간 선택과 동일한 CbSelect
               디자인) + '기타' 선택 시 직접 입력. 선택은 optional. */
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold tracking-wide text-ink-900">소속 지사</span>
              <CbSelect
                value={branch}
                placeholder="소속 지사를 선택해 주세요"
                options={[...BRANCHES.map(b => ({ v: b, label: b })), { v: BRANCH_OTHER, label: '기타' }]}
                onChange={v => { setBranch(v); setErrors(p => ({ ...p, branch: undefined })) }}
              />
              {branch === BRANCH_OTHER && (
                <div className="mt-1.5">
                  <Input
                    id="branchOther" aria-label="소속 지사 직접 입력"
                    placeholder="소속 지사를 입력해 주세요"
                    value={branchOther}
                    onChange={e => { setBranchOther(e.target.value); setErrors(p => ({ ...p, branch: undefined })) }}
                    error={errors.branch}
                  />
                </div>
              )}
              {branch !== BRANCH_OTHER && errors.branch && (
                <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                  {errors.branch}
                </p>
              )}
            </div>
          )}

          {category === 'other' && (
            /* 직무 — 단일선택 칩. 확장 우선순위 판단용(개인화 아님). 선택은
               optional이라 가입 전환을 막지 않는다. '기타' 선택 시 직접 입력. */
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold tracking-wide text-ink-900">직무</span>
              <div className="flex flex-wrap gap-2 mt-0.5" role="group" aria-label="직무 선택">
                {JOB_OPTIONS.map(opt => {
                  const active = jobCategory === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setJobCategory(active ? null : opt.value)
                        setErrors(p => ({ ...p, job: undefined }))
                      }}
                      className={`px-3.5 py-2 rounded-pill border-2 text-[14px] font-bold transition-colors ${
                        active ? 'border-brand bg-brand-050 text-brand' : 'border-line bg-surface text-ink-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {jobCategory === 'other' && (
                <div className="mt-1.5">
                  <Input
                    id="jobOther" aria-label="직무 직접 입력"
                    placeholder="어떤 일을 하시나요?"
                    value={jobOther}
                    onChange={e => { setJobOther(e.target.value); setErrors(p => ({ ...p, job: undefined })) }}
                    error={errors.job}
                  />
                </div>
              )}
              {jobCategory !== 'other' && (
                errors.job
                  ? (
                    <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                      <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                      {errors.job}
                    </p>
                  )
                  : <p className="text-caption font-normal tracking-normal text-ink-300">선택은 안 해도 괜찮아요.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Input
              id="password" label="비밀번호" required
              type={showPw ? 'text' : 'password'} autoComplete="new-password"
              className="font-en"
              value={form.password} onChange={set('password')}
              error={errors.password}
              hint={
                form.password
                  ? `강도: ${PW_LABELS[strength]}`
                  : '8자 이상, 영문과 숫자를 포함해 주세요.'
              }
              trailing={
                <button
                  type="button" onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="grid place-items-center w-9 h-9"
                >
                  <EyeIcon size={20} off={!showPw} />
                </button>
              }
            />
            {form.password && (
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className={`flex-1 h-1 rounded-pill ${
                      i <= strength
                        ? strength === 1 ? 'bg-danger'
                          : strength === 2 ? 'bg-warn'
                          : 'bg-success'
                        : 'bg-line-2'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <Input
            id="passwordConfirm" label="비밀번호 확인" required
            type={showPw ? 'text' : 'password'} autoComplete="new-password"
            className="font-en"
            value={form.passwordConfirm} onChange={set('passwordConfirm')}
            error={errors.passwordConfirm}
            trailing={
              <button
                type="button" onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                className="grid place-items-center w-9 h-9"
              >
                <EyeIcon size={20} off={!showPw} />
              </button>
            }
          />

          {/* Agreements */}
          <div className="border-t border-line pt-3.5 mt-1">
            <Checkbox
              label="전체 동의"
              className="font-bold border-b border-line mb-1"
              checked={allAgrees}
              onChange={e => setAll(e.target.checked)}
            />
            <AgreementRow
              label="이용약관에 동의합니다."
              checked={terms.tos}
              onChange={() => toggle('tos')}
              href="/legal/terms"
            />
            <AgreementRow
              label="개인정보 수집·이용에 동의합니다."
              checked={terms.privacy}
              onChange={() => toggle('privacy')}
              href="/legal/privacy"
            />
            <Checkbox
              label="업데이트·이벤트 알림 수신에 동의합니다." badge="optional"
              checked={terms.marketing} onChange={() => toggle('marketing')}
            />
            {errors.terms && (
              <p className="flex items-start gap-1 text-caption text-danger mt-1.5">
                <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                {errors.terms}
              </p>
            )}
          </div>

          {isKtx ? (
            /* Visibility — search exposure only; separate from schedule sharing.
               KTX-only: personal accounts always start private (settable later). */
            <div className="border-t border-line pt-3.5 mt-1">
              <p className="text-[15px] font-bold text-ink-900">내 계정을 동료가 검색할 수 있게 할까요?</p>
              <p className="mt-1 text-caption text-ink-500 leading-relaxed">
                이건 일정 공유와는 별개예요. 일정은 나중에 동료가 요청하고 내가 수락할 때만 공개돼요.
              </p>
              <RadioGroup
                options={VIS_OPTIONS}
                value={visibility}
                onChange={setVisibility}
                ariaLabel="공개 범위"
                className="flex flex-col gap-2 mt-3"
              />
              <p className="mt-2 text-[11px] text-ink-300">설정 → 공개 범위에서 언제든 바꿀 수 있어요.</p>
            </div>
          ) : (
            <div className="border-t border-line pt-3.5 mt-1 bg-brand-050 -mx-5 px-5 py-3.5">
              <p className="text-caption text-ink-700 leading-relaxed">
                가입 시 내 일정은 <span className="font-bold text-ink-900">비공개로 시작</span>해요.
                공개 범위는 설정에서 언제든 바꿀 수 있어요.
              </p>
            </div>
          )}

          <div className="h-1" />
          <Button type="submit" block disabled={loading || (isKtx && !visibility)}>
            {loading ? '가입 중…' : isKtx ? '가입하기' : '가입하고 시작하기'}
          </Button>

          <p className="text-center text-callout text-ink-700 mt-2">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-brand font-bold hover:text-brand-700 transition-colors">
              로그인
            </Link>
          </p>
        </form>

        {!inviteToken && (
          <div className="mt-4 bg-brand-050 border-2 border-line rounded-sm px-4 py-3.5 text-caption text-ink-700 leading-relaxed">
            <p className="text-[13px] font-bold text-ink-900 mb-1">가입 후 바로 시작할 수 있어요</p>
            내 근무표를 등록하고 동료와 일정을 공유할 수 있어요.
          </div>
        )}
      </div>
    </div>
  )
}
