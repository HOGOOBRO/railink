'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Input } from '@/components/ui/Input'
import { CbSelect } from '@/components/ui/CbSelect'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/icons'
import { useToast } from '@/components/ui/Toast'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { getCurrentSession, completeOnboarding, logout } from '@/lib/auth'
import {
  findAirline, airlineSelectOptions, koTopicParticle, JOB_OPTIONS, type SignupCategory,
} from '@/lib/profile-fields'
import type { Locale } from '@/i18n/config'

/** Google 가입자 전용 차단 온보딩. 직업(카테고리)을 고르기 전엔 앱을 쓸 수 없다
 *  (OnboardingGate가 needsOnboarding이면 여기로 보낸다). 선택을 마치면 /calendar로. */
export default function WelcomePage() {
  const router = useRouter()
  const { showToast } = useToast()
  const t = useTranslations('welcome')
  const tFields = useTranslations('fields')
  const locale = useLocale() as Locale

  const CATEGORY_OPTIONS: { value: SignupCategory; title: string; desc: string }[] = [
    { value: 'ktx', title: tFields('category.ktx.title'), desc: tFields('category.ktx.desc') },
    { value: 'airline', title: tFields('category.airline.title'), desc: tFields('category.airline.desc') },
    { value: 'other', title: tFields('category.other.title'), desc: tFields('category.other.desc') },
  ]
  const jobOptions = JOB_OPTIONS.map(opt => ({ value: opt.value, label: tFields('job.' + opt.value) }))

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

  // 선택이 덜 끝났으면 '시작하기'를 비활성화한다(눌러서 에러 띄우기 전에 버튼으로 막음).
  // 항공 승무원=항공사 필수, 기타=직무 필수(직접입력 선택 시 내용까지), KTX=추가 입력 없음.
  const incomplete =
    (isAirline && !airline) ||
    (isOther && !jobCategory) ||
    (isOther && jobCategory === 'other' && !jobOther.trim())

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
    if (isAirline && !airline) e.airline = t('errors.airlineRequired')
    if (isOther && !jobCategory) e.job = t('errors.jobSelectRequired')
    if (isOther && jobCategory === 'other' && !jobOther.trim()) e.job = t('errors.jobRequired')
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
      showToast(res.message ?? t('saveFailed'), 'danger')
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
          {name ? t('greetingNamed', { name }) : t('greeting')}
        </h1>
        <p className="text-center text-callout text-ink-500 leading-relaxed mb-6">
          {t('subtitle')}
        </p>

        <div className="flex flex-col gap-3.5">
          <div>
            <p className="text-[15px] font-bold text-ink-900 mb-3">{t('categoryQuestion')}</p>
            <RadioGroup
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              ariaLabel={t('categoryAriaLabel')}
              className="flex flex-col gap-2"
            />
          </div>

          {isAirline && (
            <div className="flex flex-col gap-1">
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
                  ? t('airlineHintDefault')
                  : selectedAirline.active
                    ? t('airlineHintActive', { airline: locale === 'en' ? selectedAirline.labelEn : selectedAirline.label })
                    : t('airlineHintPending', {
                        airline: locale === 'en' ? selectedAirline.labelEn : selectedAirline.label,
                        particle: koTopicParticle(selectedAirline.label),
                      })}
              </p>
            </div>
          )}

          {isOther && (
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
              {jobCategory !== 'other' && errors.job && (
                <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
                  {errors.job}
                </p>
              )}
            </div>
          )}

          <Button block className="mt-2" onClick={handleSubmit} disabled={saving || incomplete}>
            {saving ? t('saving') : t('submit')}
          </Button>

          <button
            type="button"
            onClick={async () => { await logout(); router.replace('/login') }}
            className="mt-1 text-center text-caption text-ink-300 hover:text-ink-500"
          >
            {t('switchAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}
