'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
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
import { BRANCHES, BRANCH_OTHER, JOB_OPTIONS, findAirline, airlineSelectOptions, airlineBases, koTopicParticle, type SignupCategory } from '@/lib/profile-fields'
import type { Locale } from '@/i18n/config'

interface FormErrors {
  email?: string
  employeeId?: string
  name?: string
  branch?: string
  job?: string
  airline?: string
  base?: string
  password?: string
  passwordConfirm?: string
  terms?: string
}

// Required-agreement row: checkbox + label + "보기" link to the full document.
// We don't use <Checkbox> here because a nested <Link> inside its <label> would
// also toggle the checkbox on click. The label stays inside its own <label>
// element; the link sits outside it.
function AgreementRow({
  label,
  checked,
  onChange,
  href,
  requiredLabel,
  viewLabel,
}: {
  label: string
  checked: boolean
  onChange: () => void
  href: string
  requiredLabel: string
  viewLabel: string
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
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-brand-050 text-brand">{requiredLabel}</span>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-caption text-ink-500 underline underline-offset-2 hover:text-ink-700"
      >
        {viewLabel}
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
  const t = useTranslations('signup')
  const tFields = useTranslations('fields')
  const locale = useLocale() as Locale

  const VIS_OPTIONS: RadioOption<Visibility>[] = [
    { value: 'public', title: tFields('visibility.public.title'), desc: tFields('visibility.public.desc') },
    { value: 'private', title: tFields('visibility.private.title'), desc: tFields('visibility.private.desc') },
  ]
  const CATEGORY_OPTIONS: { value: SignupCategory; title: string; desc: string }[] = [
    { value: 'ktx', title: tFields('category.ktx.title'), desc: tFields('category.ktx.desc') },
    { value: 'airline', title: tFields('category.airline.title'), desc: tFields('category.airline.desc') },
    { value: 'other', title: tFields('category.other.title'), desc: tFields('category.other.desc') },
  ]
  const jobOptions = JOB_OPTIONS.map(opt => ({ value: opt.value, label: tFields('job.' + opt.value) }))
  const PW_LABELS = ['', t('pwWeak'), t('pwFair'), t('pwGood'), t('pwStrong')]

  // 가입 첫 질문(직무 카테고리). KTX 중심 분기를 대체. airline은 '항공 승무원'일 때 소속.
  const [category, setCategory] = useState<SignupCategory>('ktx')
  const [airline, setAirline] = useState('')
  const [base, setBase] = useState('')
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
  const selectedAirline = findAirline(airline)
  // 다중베이스 항공사(제주항공)면 베이스 선택을 필수로 받는다. 단일베이스는 빈 배열.
  const baseOptions = airlineBases(airline)

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
    if (!form.email) e.email = t('errors.emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('errors.emailInvalid')
    // 사번 is KTX-only.
    if (isKtx) {
      if (!form.employeeId) e.employeeId = t('errors.employeeIdRequired')
      else if (!/^\d{4,8}$/.test(form.employeeId)) e.employeeId = t('errors.employeeIdFormat')
    }
    if (!form.name) e.name = t('errors.nameRequired')
    else if (!isKtx && form.name.length > 30) e.name = t('errors.nameTooLong')
    // 지사·직무는 둘 다 선택(optional) — 가입 전환을 막지 않는다. 단 '기타'를
    // 골랐으면 텍스트를 받아야 데이터로 의미가 있어 그때만 필수.
    if (isKtx) {
      if (branch === BRANCH_OTHER && !branchOther.trim()) e.branch = t('errors.branchRequired')
    } else if (isAirline) {
      if (!airline) e.airline = t('errors.airlineRequired')
      else if (airlineBases(airline).length > 0 && !base) e.base = '소속 베이스를 선택해 주세요.'
    } else if (jobCategory === 'other' && !jobOther.trim()) {
      e.job = t('errors.jobRequired')
    }
    if (!form.password) e.password = t('errors.passwordRequired')
    else if (form.password.length < 8) e.password = t('errors.passwordTooShort')
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = t('errors.passwordComposition')
    if (form.passwordConfirm !== form.password) e.passwordConfirm = t('errors.passwordMismatch')
    if (!allRequired) e.terms = t('errors.termsRequired')
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
      base: isAirline ? (base || undefined) : undefined,
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
    showToast(t('welcomeToast', { name: form.name }), 'success')
    router.push('/calendar')
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    // Google signups have no 사번/파트 → trigger classifies them as personal.
    // Any invite token is threaded through so it survives the round trip.
    const res = await signInWithGoogle(inviteToken)
    if (!res.ok) {
      setGoogleLoading(false)
      showToast(res.message ?? t('googleStartFailed'), 'danger')
    }
  }

  async function handleResend() {
    if (!sentTo) return
    await resendConfirmation(sentTo)
    showToast(t('resendToast'), 'success')
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
        <h1 className="text-[22px] font-bold tracking-tighter text-ink-900">{t('confirmTitle')}</h1>
        <p className="mt-3 text-callout text-ink-700 leading-relaxed">
          {t.rich('confirmBodyLine1', { email: sentTo, em: (chunks) => <span className="font-en text-ink-900">{chunks}</span> })}<br />
          {t('confirmBodyLine2')}<br />{t('confirmBodyLine3')}
        </p>
        <div className="h-7" />
        <Link href="/login" className="w-full max-w-[360px]">
          <Button block>{t('confirmToLogin')}</Button>
        </Link>
        <button
          type="button"
          onClick={handleResend}
          className="mt-3.5 text-caption font-semibold text-brand hover:text-brand-700 transition-colors"
        >
          {t('confirmResend')}
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
        aria-label={t('back')}
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
            <h1 className="sr-only">{t('title')}</h1>
            <div className="mt-4 mb-5 bg-brand-050 border border-brand-100 rounded-lg px-4 py-5 flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-full bg-brand text-ink-on-brand grid place-items-center mb-3">
                <BrandMark size={20} />
              </div>
              <p className="text-callout text-ink-700 leading-relaxed">
                {inviterName
                  ? t.rich('inviterHeader', { name: inviterName, b: (chunks) => <span className="font-bold text-ink-900">{chunks}</span> })
                  : t('inviterHeaderGeneric')}
                <br />{t('inviteBody')}
              </p>
            </div>
          </>
        ) : (
          <h1 className="text-center mt-3.5 mb-5 text-[26px] leading-tight font-bold tracking-tighter text-ink-900">
            {t('title')}
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
          {googleLoading ? t('googleLoading') : t('googleContinue')}
        </Button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-line-2" />
          <span className="text-[11px] font-semibold tracking-wider text-ink-500">{t('dividerEmail')}</span>
          <div className="flex-1 h-px bg-line-2" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
          {/* The first question — 직무 카테고리(KTX / 항공 / 기타) */}
          <div className="border-b border-line pb-3.5 mb-1">
            <p className="text-[15px] font-bold text-ink-900">{t('categoryQuestion')}</p>
            <RadioGroup
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              ariaLabel={t('categoryAriaLabel')}
              className="flex flex-col gap-2 mt-3"
            />
            {isAirline && (
              /* 소속 항공사 — CbSelect 재사용. 활성/준비중을 섹션으로 나눠 보여주고
                 준비중도 선택 가능(태그만 저장 → 활성화 시 자동 승격). */
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-caption font-semibold tracking-wide text-ink-900">{t('airlineLabel')}</span>
                <CbSelect
                  value={airline}
                  placeholder={t('airlinePlaceholder')}
                  options={airlineSelectOptions(locale, {
                    active: tFields('airline.headerActive'),
                    pending: tFields('airline.headerPending'),
                    badge: tFields('airline.badgePending'),
                  })}
                  onChange={code => {
                    setAirline(code)
                    setBase('')  // 항공사 바뀌면 베이스 초기화
                    setErrors(p => ({ ...p, airline: undefined, base: undefined }))
                  }}
                />
                {errors.airline && (
                  <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                    <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                    {errors.airline}
                  </p>
                )}
                <p className="text-caption font-normal tracking-normal text-ink-300">
                  {!selectedAirline
                    ? t('airlineHintDefault')
                    : selectedAirline.active
                      ? t('airlineHintActive', { airline: locale === 'en' ? selectedAirline.labelEn : selectedAirline.label })
                      : t('airlineHintPending', {
                          airline: locale === 'en' ? selectedAirline.labelEn : selectedAirline.label,
                          particle: koTopicParticle(selectedAirline.label),
                        })}
                </p>
                {/* 베이스(home base) — 지방 베이스가 있는 항공사(제주항공)만 노출, 필수.
                    체류 판정이 베이스 공항 기준이라 가입 때 받아 둔다. */}
                {baseOptions.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1">
                    <span className="text-caption font-semibold tracking-wide text-ink-900">소속 베이스</span>
                    <CbSelect
                      value={base}
                      placeholder="베이스를 선택하세요"
                      options={baseOptions.map(b => ({ v: b.value, label: b.label }))}
                      onChange={v => {
                        setBase(v)
                        setErrors(p => ({ ...p, base: undefined }))
                      }}
                    />
                    {errors.base && (
                      <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                        <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                        {errors.base}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {inviteToken && (
              <p className="mt-2.5 flex items-start gap-1 text-[11px] text-ink-300 leading-relaxed">
                <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-ink-300 text-ink-on-brand text-[9px] font-bold grid place-items-center mt-px">i</span>
                {t('inviteConnectNote', {
                  who: inviterName
                    ? t('inviteConnectWhoName', { name: inviterName })
                    : t('inviteConnectWhoGeneric'),
                })}
              </p>
            )}
          </div>

          <Input
            id="email" label={t('emailLabel')} required type="email" autoComplete="email"
            className="font-en" placeholder={t('emailPlaceholder')}
            value={form.email} onChange={set('email')} error={errors.email}
          />
          {isKtx && (
            <Input
              id="employeeId" label={t('employeeIdLabel')} required inputMode="numeric"
              className="font-en" placeholder={t('employeeIdPlaceholder')}
              value={form.employeeId} onChange={set('employeeId')} error={errors.employeeId}
            />
          )}
          <Input
            id="name" label={t('nameLabel')} required autoComplete="name"
            maxLength={isKtx ? undefined : 30}
            hint={isKtx ? undefined : t('nameHint')}
            placeholder={t('namePlaceholder')}
            value={form.name} onChange={set('name')} error={errors.name}
          />
          {isKtx && (
            /* 소속 지사 — 정해진 6개 드롭다운(약속 잡기 시간 선택과 동일한 CbSelect
               디자인) + '기타' 선택 시 직접 입력. 선택은 optional. */
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold tracking-wide text-ink-900">{t('branchLabel')}</span>
              <CbSelect
                value={branch}
                placeholder={t('branchPlaceholder')}
                options={[...BRANCHES.map(b => ({ v: b, label: b })), { v: BRANCH_OTHER, label: tFields('branchOther') }]}
                onChange={v => { setBranch(v); setErrors(p => ({ ...p, branch: undefined })) }}
              />
              {branch === BRANCH_OTHER && (
                <div className="mt-1.5">
                  <Input
                    id="branchOther" aria-label={t('branchOtherAriaLabel')}
                    placeholder={t('branchOtherPlaceholder')}
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
              <span className="text-caption font-semibold tracking-wide text-ink-900">{t('jobLabel')}</span>
              <div className="flex flex-wrap gap-2 mt-0.5" role="group" aria-label={t('jobAriaLabel')}>
                {jobOptions.map(opt => {
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
                    id="jobOther" aria-label={t('jobOtherAriaLabel')}
                    placeholder={t('jobOtherPlaceholder')}
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
                  : <p className="text-caption font-normal tracking-normal text-ink-300">{t('jobOptionalHint')}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Input
              id="password" label={t('passwordLabel')} required
              type={showPw ? 'text' : 'password'} autoComplete="new-password"
              className="font-en"
              value={form.password} onChange={set('password')}
              error={errors.password}
              hint={
                form.password
                  ? t('passwordStrength', { label: PW_LABELS[strength] })
                  : t('passwordHint')
              }
              trailing={
                <button
                  type="button" onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? t('hidePassword') : t('showPassword')}
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
            id="passwordConfirm" label={t('passwordConfirmLabel')} required
            type={showPw ? 'text' : 'password'} autoComplete="new-password"
            className="font-en"
            value={form.passwordConfirm} onChange={set('passwordConfirm')}
            error={errors.passwordConfirm}
            trailing={
              <button
                type="button" onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? t('hidePassword') : t('showPassword')}
                className="grid place-items-center w-9 h-9"
              >
                <EyeIcon size={20} off={!showPw} />
              </button>
            }
          />

          {/* Agreements */}
          <div className="border-t border-line pt-3.5 mt-1">
            <Checkbox
              label={t('agreeAll')}
              className="font-bold border-b border-line mb-1"
              checked={allAgrees}
              onChange={e => setAll(e.target.checked)}
            />
            <AgreementRow
              label={t('agreeTos')}
              checked={terms.tos}
              onChange={() => toggle('tos')}
              href="/legal/terms"
              requiredLabel={t('required')}
              viewLabel={t('view')}
            />
            <AgreementRow
              label={t('agreePrivacy')}
              checked={terms.privacy}
              onChange={() => toggle('privacy')}
              href="/legal/privacy"
              requiredLabel={t('required')}
              viewLabel={t('view')}
            />
            <Checkbox
              label={t('agreeMarketing')} badge="optional"
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
              <p className="text-[15px] font-bold text-ink-900">{t('visibilityQuestion')}</p>
              <p className="mt-1 text-caption text-ink-500 leading-relaxed">
                {t('visibilityDesc')}
              </p>
              <RadioGroup
                options={VIS_OPTIONS}
                value={visibility}
                onChange={setVisibility}
                ariaLabel={t('visibilityAriaLabel')}
                className="flex flex-col gap-2 mt-3"
              />
              <p className="mt-2 text-[11px] text-ink-300">{t('visibilityChangeNote')}</p>
            </div>
          ) : (
            <div className="border-t border-line pt-3.5 mt-1 bg-brand-050 -mx-5 px-5 py-3.5">
              <p className="text-caption text-ink-700 leading-relaxed">
                {t.rich('privacyStartsNote', { b: (chunks) => <span className="font-bold text-ink-900">{chunks}</span> })}
              </p>
            </div>
          )}

          <div className="h-1" />
          <Button type="submit" block disabled={loading || (isKtx && !visibility)}>
            {loading ? t('submitLoading') : isKtx ? t('submitKtx') : t('submitOther')}
          </Button>

          <p className="text-center text-callout text-ink-700 mt-2">
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-brand font-bold hover:text-brand-700 transition-colors">
              {t('loginLink')}
            </Link>
          </p>
        </form>

        {!inviteToken && (
          <div className="mt-4 bg-brand-050 border-2 border-line rounded-sm px-4 py-3.5 text-caption text-ink-700 leading-relaxed">
            <p className="text-[13px] font-bold text-ink-900 mb-1">{t('bottomCardTitle')}</p>
            {t('bottomCardBody')}
          </div>
        )}
      </div>
    </div>
  )
}
