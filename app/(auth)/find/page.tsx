'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeftIcon, CheckIcon } from '@/components/ui/icons'

type Mode = 'id' | 'pw'

export default function FindPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-bg" />}>
      <FindInner />
    </Suspense>
  )
}

function FindInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { showToast } = useToast()

  const raw = params.get('mode')
  const mode: Mode = raw === 'pw' ? 'pw' : 'id'
  const isId = mode === 'id'
  const title = isId ? '아이디 찾기' : '비밀번호 찾기'

  const [step, setStep] = useState<'input' | 'sent'>('input')
  const [emp, setEmp] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (isId) {
      if (!/^\d{4,8}$/.test(emp)) { setErr('사번은 숫자 4~8자리로 입력해 주세요.'); return }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('이메일 형식을 확인해 주세요.'); return }
    }
    setStep('sent')
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <button
          onClick={() => router.push('/login')}
          aria-label="뒤로"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">{title}</h3>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {step === 'input' ? (
          <>
            <p className="text-callout text-ink-700 leading-relaxed mb-4">
              {isId
                ? '가입 시 등록한 사번을 입력하시면, 등록된 이메일 주소의 일부를 알려드릴게요.'
                : '가입 시 등록한 이메일을 입력하시면, 비밀번호 재설정 링크를 보내드릴게요.'}
            </p>

            {isId ? (
              <Input
                id="emp"
                label="사번"
                required
                inputMode="numeric"
                className="font-en"
                placeholder="숫자 4~8자리"
                value={emp}
                onChange={e => { setEmp(e.target.value); setErr(null) }}
                error={err ?? undefined}
              />
            ) : (
              <Input
                id="findEmail"
                label="이메일"
                required
                type="email"
                className="font-en"
                placeholder="이메일을 입력해 주세요"
                value={email}
                onChange={e => { setEmail(e.target.value); setErr(null) }}
                error={err ?? undefined}
              />
            )}

            <div className="h-2" />
            <Button block onClick={submit}>
              {isId ? '이메일 확인하기' : '재설정 링크 받기'}
            </Button>

            <p className="text-center text-callout text-ink-700 mt-4">
              {isId ? '이메일이 기억나시나요?' : '비밀번호가 기억나시나요?'}{' '}
              <button
                onClick={() => router.push('/login')}
                className="font-kr font-bold text-brand hover:text-brand-700 transition-colors"
              >
                로그인
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center px-5 py-8 bg-surface border border-line rounded-lg">
              <div className="w-14 h-14 rounded-lg bg-brand-050 text-brand grid place-items-center mb-3.5">
                <CheckIcon size={28} />
              </div>
              <h2 className="text-[17px] font-bold text-ink-900">
                {isId ? '등록된 이메일을 찾았어요' : '안내 이메일을 보냈어요'}
              </h2>
              <p className="mt-2 text-callout text-ink-700 leading-relaxed">
                {isId ? (
                  <>
                    사번 <strong className="font-en">{emp}</strong>로 가입된
                    <br />이메일은 아래와 같아요.
                  </>
                ) : (
                  <>
                    <strong className="font-en">{email}</strong>
                    <br />위 주소로 5분 이내에 메일을 보내드려요.
                  </>
                )}
              </p>
              {isId && (
                <div className="mt-3.5 px-4 py-2.5 rounded-pill bg-brand-050 text-brand font-en font-bold text-[15px] tracking-wide">
                  s***@k***.com
                </div>
              )}
              {!isId && (
                <p className="mt-3.5 text-[11px] text-ink-500 leading-relaxed">
                  메일이 보이지 않으면 스팸 폴더도 확인해 주세요.
                </p>
              )}
            </div>

            <div className="h-4" />
            <Button block onClick={() => router.push('/login')}>로그인으로</Button>
            {!isId && (
              <button
                onClick={() => showToast('이메일을 다시 보냈어요.', 'success')}
                className="mt-2.5 w-full text-callout font-semibold text-ink-700 py-2"
              >
                이메일 다시 받기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
