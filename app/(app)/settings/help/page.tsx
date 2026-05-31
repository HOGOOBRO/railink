'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BrandMark, ChevronLeftIcon, ChevronRightIcon, MailIcon } from '@/components/ui/icons'

const CONTACT_EMAIL = 'hello@railink.app'

const FAQS: { q: string; a: string }[] = [
  {
    q: '근무표는 어디서 받아야 하나요?',
    a: '회사 시스템에서 받은 엑셀(.xlsx) 또는 CSV 파일을 그대로 올리면 자동으로 인식돼요. 사진/스크린샷도 OCR로 인식이 가능하지만 정확도가 낮을 수 있으니, 가능하면 엑셀 파일을 추천해요.',
  },
  {
    q: '동료에게 내 일정을 숨길 수 있나요?',
    a: '내 정보 → 공개 범위에서 "내 일정을 동료에게 공개" 토글을 끄면 비교 추가된 동료가 내 다이·출퇴근을 볼 수 없어요.',
  },
  {
    q: '비교 동료는 몇 명까지 추가할 수 있나요?',
    a: '최대 10명까지 추가할 수 있어요. 너무 많으면 캘린더가 복잡해져요.',
  },
  {
    q: '근무표가 변경되면 자동으로 반영되나요?',
    a: '회사 시스템과 연동되어 있지 않아 직접 업데이트해 주셔야 해요. 다음 달 근무표는 매월 마지막 주에 새로 등록해 주세요.',
  },
]

const TERMS: { label: string; sub?: string; href: string }[] = [
  { label: '서비스 이용약관', sub: '2026.06.01 시행', href: '/legal/terms' },
  { label: '개인정보 처리방침', sub: '2026.06.01 시행', href: '/legal/privacy' },
  { label: '오픈소스 라이선스', href: '/legal/oss' },
]

export default function HelpPage() {
  const [open, setOpen] = useState<number>(0)

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <Link
          href="/calendar"
          aria-label="뒤로"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <h3 className="text-[18px] font-bold tracking-tight text-ink-900">도움말 · 약관</h3>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-8">
        {/* App info */}
        <section className="flex items-center gap-3 px-4 py-4 bg-surface border border-line rounded-lg">
          <div className="w-11 h-11 rounded-lg bg-brand text-ink-on-brand grid place-items-center shrink-0">
            <BrandMark size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-ink-900">RaiLink</p>
            <p className="mt-0.5 text-caption text-ink-500">동료와 근무 스케줄을 맞춰보는 앱</p>
            <p className="mt-1 font-en text-[11px] text-ink-300">V1.0 · BUILD 2026.05</p>
          </div>
        </section>

        {/* FAQ */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          자주 묻는 질문
        </p>
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={i} className={i < FAQS.length - 1 ? 'border-b border-line' : ''}>
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="w-full flex items-center gap-2 px-3.5 py-3.5 text-left"
                  aria-expanded={isOpen}
                >
                  <span
                    className={`w-[22px] h-[22px] rounded-full font-en text-[11px] font-bold grid place-items-center shrink-0 ${
                      isOpen ? 'bg-brand text-ink-on-brand' : 'bg-brand-050 text-brand'
                    }`}
                  >
                    Q
                  </span>
                  <span className="flex-1 text-callout font-medium text-ink-900 leading-snug">{f.q}</span>
                  <span
                    className="text-ink-500 transition-transform duration-150"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                  >
                    <ChevronRightIcon size={14} />
                  </span>
                </button>
                {isOpen && (
                  <p className="pl-11 pr-3.5 pb-3.5 text-[13px] text-ink-700 leading-relaxed">{f.a}</p>
                )}
              </div>
            )
          })}
        </section>

        {/* 문의 — FAQ로 안 풀리면 메일로 직접. (railink.app 도메인 메일) */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          문의
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('[RaiLink] 문의')}`}
          className="flex items-center gap-3 px-4 py-4 bg-surface border border-line rounded-lg active:bg-bg transition-colors"
        >
          <div className="w-11 h-11 rounded-lg bg-brand-050 text-brand grid place-items-center shrink-0">
            <MailIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-callout font-bold text-ink-900">문의하기</p>
            <p className="mt-0.5 text-caption text-ink-500">궁금한 점 · 오류 제보 · 건의사항을 보내주세요</p>
            <p className="mt-1 font-en text-[11px] text-brand">{CONTACT_EMAIL}</p>
          </div>
          <span className="text-ink-300 shrink-0"><ChevronRightIcon size={16} /></span>
        </a>

        {/* Terms */}
        <p className="mt-4 px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
          약관 · 정책
        </p>
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          {TERMS.map((t, i) => (
            <Link
              key={t.label}
              href={t.href}
              className={`w-full flex items-center gap-2.5 px-3.5 py-3.5 text-left active:bg-bg transition-colors ${
                i < TERMS.length - 1 ? 'border-b border-line' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-callout font-medium text-ink-900">{t.label}</p>
                {t.sub && <p className="mt-0.5 font-en text-[11px] text-ink-500">{t.sub}</p>}
              </div>
              <span className="text-ink-300"><ChevronRightIcon size={16} /></span>
            </Link>
          ))}
        </section>

        {/* Independent-app disclaimer (RaiLink is not an official Korail service) */}
        <section className="mt-4 px-4 py-4 rounded-lg bg-bg border border-line">
          <p className="text-caption text-ink-500 leading-relaxed">
            RaiLink는 KTX 승무팀이 자율적으로 쓰는 <strong className="text-ink-700 font-semibold">독립 앱</strong>이에요.
            코레일의 공식 서비스가 아니며, 코레일과 제휴·후원 관계가 없어요.
          </p>
        </section>
      </div>
    </div>
  )
}
