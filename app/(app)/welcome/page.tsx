'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { CbSelect } from '@/components/ui/CbSelect'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/icons'
import { useToast } from '@/components/ui/Toast'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { getCurrentSession, completeOnboarding, logout } from '@/lib/auth'
import {
  CATEGORY_OPTIONS, findAirline, airlineSelectOptions, koTopicParticle, JOB_OPTIONS, type SignupCategory,
} from '@/lib/profile-fields'

/** Google 가입자 전용 차단 온보딩. 직업(카테고리)을 고르기 전엔 앱을 쓸 수 없다
 *  (OnboardingGate가 needsOnboarding이면 여기로 보낸다). 선택을 마치면 /calendar로. */
export default function WelcomePage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [ready, setReady] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<SignupCategory>('ktx')
  const [airline, setAirline] = useState('')
  const [jobCategory, setJobCategory] = useState<string | null>(null)
  const [jobOther, setJobOther] = useState('')
  const [errors, setErrors] = useState<{ airline?: string; job?: string }>({})
  const [saving, setSaving] = useState(false)

  const isAirline = category === 'airline'
  const isOther = category === 'other'
  const selectedAirline = findAirline(airline)

  // 진입 가드: 비로그인 → 로그인, 이미 선택 끝났으면 → 캘린더. 그 외에만 폼을 띄운다.
  useEffect(() => {
    let alive = true
    getCurrentSession().then(s => {
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      if (!s.needsOnboarding) { router.replace('/calendar'); return }
      setName(s.name || '')
      setReady(true)
    })
    return () => { alive = false }
  }, [router])

  function validate(): boolean {
    const e: typeof errors = {}
    if (isAirline && !airline) e.airline = '항공사를 선택해 주세요.'
    if (isOther && !jobCategory) e.job = '직무를 선택해 주세요.'
    if (isOther && jobCategory === 'other' && !jobOther.trim()) e.job = '직무를 입력해 주세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    const res = await completeOnboarding({
      category,
      airline: isAirline ? airline : undefined,
      jobCategory: isOther ? (jobCategory ?? undefined) : undefined,
      jobOther: isOther && jobCategory === 'other' ? (jobOther.trim() || undefined) : undefined,
    })
    if (!res.ok) {
      setSaving(false)
      showToast(res.message ?? '저장 중 문제가 생겼어요.', 'danger')
      return
    }
    router.replace('/calendar')
  }

  if (!ready) {
    return <div className="min-h-[100dvh] bg-bg" />
  }

  return (
    <div className="relative min-h-[100dvh] bg-bg overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="px-5 pt-8 pb-20">
        <div className="flex items-center justify-center gap-1.5 font-en text-[18px] font-[400] text-ink-900">
          <BrandMark size={16} className="text-brand" /> RaiLink
        </div>

        <h1 className="text-center mt-5 mb-1.5 text-[24px] leading-tight font-bold tracking-tighter text-ink-900">
          {name ? `${name} 님, 반가워요` : '반가워요'}
        </h1>
        <p className="text-center text-callout text-ink-500 leading-relaxed mb-6">
          시작하기 전에 어떤 일을 하는지 알려주세요.
        </p>

        <div className="flex flex-col gap-3.5">
          <div>
            <p className="text-[15px] font-bold text-ink-900 mb-3">어떤 일을 하세요?</p>
            <RadioGroup
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              ariaLabel="직무 선택"
              className="flex flex-col gap-2"
            />
          </div>

          {isAirline && (
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold tracking-wide text-ink-900">항공사</span>
              <CbSelect
                value={airline}
                placeholder="항공사를 선택해 주세요"
                options={airlineSelectOptions()}
                onChange={code => {
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
                {!selectedAirline
                  ? '준비 중인 항공사도 미리 고를 수 있어요.'
                  : selectedAirline.active
                    ? `${selectedAirline.label} 근무표를 사진으로 올리면 자동으로 읽어서 채워드려요.`
                    : `${selectedAirline.label}${koTopicParticle(selectedAirline.label)} 7월 중 추가될 예정이에요. 그때까지는 근무를 직접 입력해서 쓰다가, 사진 자동 인식이 준비되면 바로 켜져요.`}
              </p>
            </div>
          )}

          {isOther && (
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
              {jobCategory !== 'other' && errors.job && (
                <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                  {errors.job}
                </p>
              )}
            </div>
          )}

          <Button block className="mt-2" onClick={handleSubmit} disabled={saving}>
            {saving ? '저장 중…' : '시작하기'}
          </Button>

          <button
            type="button"
            onClick={async () => { await logout(); router.replace('/login') }}
            className="mt-1 text-center text-caption text-ink-300 hover:text-ink-500"
          >
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    </div>
  )
}
