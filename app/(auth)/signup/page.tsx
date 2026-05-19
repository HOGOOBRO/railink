'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { BrandMark, ChevronLeftIcon, EyeIcon } from '@/components/ui/icons'
import { useToast } from '@/components/ui/Toast'
import { signup, getCurrentSession, resendConfirmation } from '@/lib/auth'

interface FormErrors {
  email?: string
  employeeId?: string
  name?: string
  password?: string
  passwordConfirm?: string
  terms?: string
}

const PW_LABELS = ['', '약함', '보통', '좋음', '강함']

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

  const [form, setForm] = useState({
    email: '', employeeId: '', name: '', part: '',
    password: '', passwordConfirm: '',
  })
  const [terms, setTerms] = useState({
    tos: false, privacy: false, share: false, marketing: false,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getCurrentSession().then(s => { if (alive && s) router.replace('/calendar') })
    return () => { alive = false }
  }, [router])

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(p => ({ ...p, [field]: e.target.value }))
      setErrors(p => ({ ...p, [field]: undefined }))
    }
  }

  const allRequired = terms.tos && terms.privacy && terms.share
  const allAgrees = allRequired && terms.marketing
  function setAll(on: boolean) {
    setTerms({ tos: on, privacy: on, share: on, marketing: on })
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
    if (!form.employeeId) e.employeeId = '사번을 입력해 주세요.'
    else if (!/^\d{4,8}$/.test(form.employeeId)) e.employeeId = '사번은 숫자 4~8자리로 입력해 주세요.'
    if (!form.name) e.name = '이름을 입력해 주세요.'
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

    setLoading(true)
    const result = await signup({
      email: form.email,
      password: form.password,
      employeeId: form.employeeId,
      name: form.name,
      part: form.part || undefined,
    })
    setLoading(false)
    if (!result.ok) {
      if (result.field) setErrors({ [result.field]: result.message })
      else showToast(result.message, 'danger')
      return
    }
    if (result.needsConfirm) {
      setSentTo(form.email)
      return
    }
    showToast(`환영합니다, ${form.name} 님!`, 'success')
    router.push('/calendar')
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
        <h1 className="text-center mt-3.5 mb-5 text-[26px] leading-tight font-bold tracking-tighter text-ink-900">
          계정 만들기
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
          <Input
            id="email" label="이메일" required type="email" autoComplete="email"
            className="font-en" placeholder="이메일을 입력해 주세요"
            value={form.email} onChange={set('email')} error={errors.email}
          />
          <Input
            id="employeeId" label="사번" required inputMode="numeric"
            className="font-en" placeholder="숫자 4~8자리"
            value={form.employeeId} onChange={set('employeeId')} error={errors.employeeId}
          />
          <Input
            id="name" label="이름" required autoComplete="name"
            placeholder="이름을 입력해 주세요"
            value={form.name} onChange={set('name')} error={errors.name}
          />
          <Input
            id="part" label="소속 파트"
            hint="팀 내 사용하는 파트 명칭이 있으면 적어 주세요."
            placeholder="예: A · B · C"
            value={form.part} onChange={set('part')}
          />

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
            <Checkbox
              label="이용약관에 동의합니다." badge="required"
              checked={terms.tos} onChange={() => toggle('tos')}
            />
            <Checkbox
              label="개인정보 수집·이용에 동의합니다." badge="required"
              checked={terms.privacy} onChange={() => toggle('privacy')}
            />
            <Checkbox
              label="동료에게 내 사번·이름·스케줄 공개에 동의합니다." badge="required"
              checked={terms.share} onChange={() => toggle('share')}
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

          <div className="h-1" />
          <Button type="submit" block disabled={loading}>
            {loading ? '가입 중…' : '가입하기'}
          </Button>

          <p className="text-center text-callout text-ink-700 mt-2">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-brand font-bold hover:text-brand-700 transition-colors">
              로그인
            </Link>
          </p>
        </form>

        <div className="mt-4 bg-brand-050 border-2 border-line rounded-sm px-4 py-3.5 text-caption text-ink-700 leading-relaxed">
          <p className="text-[13px] font-bold text-ink-900 mb-1">가입 후 바로 시작할 수 있어요</p>
          내 근무표를 등록하고 동료와 일정을 공유할 수 있어요.
        </div>
      </div>
    </div>
  )
}
