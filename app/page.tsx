import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandMark } from '@/components/ui/icons'
import { LandingRedirect } from '@/components/LandingRedirect'

// 랜딩 — 검색엔진과 첫 방문자가 보는 유일한 "내용 있는" 페이지.
// 이전의 / 는 스플래시만 보여주고 /login으로 클라이언트 리다이렉트했는데, 그
// 결과 사이트 전체에 크롤러가 읽을 한국어 본문이 없어 구글·네이버 어디에도
// 색인되지 않았다(2026-06-12 진단: site:railink.app 0건). 본문은 서버에서
// 정적으로 렌더되고, 로그인 사용자만 LandingRedirect가 캘린더로 보낸다.
// 한글 표기 "레일링크"를 본문에 명시하는 것이 핵심 — 검색은 한글로 들어온다.

export const metadata: Metadata = {
  alternates: { canonical: 'https://railink.app' },
}

const FEATURES = [
  {
    no: '01',
    title: '근무표 등록',
    desc: '한 달 근무표를 사진으로 올리거나 직접 입력해서 내 캘린더로 만들어요.',
  },
  {
    no: '02',
    title: '동료와 일정 비교',
    desc: '동료의 근무 일정을 내 캘린더 위에 겹쳐 봐요. 같이 쉬는 날이 한눈에 보여요.',
  },
  {
    no: '03',
    title: '약속 잡기',
    desc: '겹치는 휴무에 약속을 만들고 동료를 초대해요. 응답이 오면 푸시 알림으로 알려드려요.',
  },
  {
    no: '04',
    title: '공개 범위는 내가 정해요',
    desc: '내가 수락한 동료만 내 일정을 볼 수 있어요. 검색에 보일지도 직접 정해요.',
  },
]

const STEPS = [
  '이메일이나 Google 계정으로 가입해요.',
  '이번 달 근무표를 등록해요.',
  '동료를 초대하고 일정을 비교해요.',
]

const FAQS = [
  {
    q: '레일링크는 무료인가요?',
    a: '네. 가입과 모든 기능이 무료예요.',
  },
  {
    q: 'KTX 승무원이 아니어도 쓸 수 있나요?',
    a: '네. 교대근무, 스케줄 근무를 하는 누구나 개인 계정으로 가입해서 쓸 수 있어요.',
  },
  {
    q: '내 근무표는 누가 볼 수 있나요?',
    a: '내가 공유를 수락한 동료만 볼 수 있어요. 수락하기 전에는 아무에게도 보이지 않아요.',
  },
  {
    q: '동료가 아직 레일링크를 안 쓰면 어떡하죠?',
    a: '초대 링크를 보내 주세요. 동료가 가입하는 순간 자동으로 나와 연결돼요.',
  },
]

// 구조화 데이터 — 검색 결과의 리치 노출(앱 정보, FAQ 펼침) 대상이 되게 한다.
// FAQPage의 질문·답은 위 FAQS(화면에 보이는 텍스트)와 반드시 일치해야 한다.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '레일링크',
      alternateName: ['RaiLink', 'railink'],
      url: 'https://railink.app',
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'Web',
      inLanguage: 'ko',
      description:
        '레일링크(RaiLink)는 교대근무자를 위한 무료 근무표 공유 캘린더입니다. 근무 스케줄을 등록하고 동료와 겹치는 휴무를 한눈에 확인하세요.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

const CTA_PRIMARY =
  'inline-flex items-center justify-center h-btn px-[18px] text-body font-semibold rounded-md font-kr ' +
  'border border-transparent bg-brand-700 text-ink-on-brand active:scale-[.98] transition-transform'
const CTA_OUTLINE =
  'inline-flex items-center justify-center h-btn px-[18px] text-body font-semibold rounded-md font-kr ' +
  'border border-line-2 bg-surface text-ink-900 active:scale-[.98] transition-transform'

export default function LandingPage() {
  return (
    <div
      className="min-h-[100dvh] bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <LandingRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <div className="mx-auto max-w-app-frame flex flex-col min-h-[100dvh]">
        {/* ── Header ── */}
        <header className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2">
            <BrandMark size={20} className="text-brand" />
            <span className="font-en text-[13px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
              RAILINK
            </span>
          </div>
          <Link href="/login" className="text-callout font-semibold text-brand">
            로그인
          </Link>
        </header>

        {/* ── Hero ── 로그인 페이지와 같은 Bold Mono editorial 톤 */}
        <section className="relative px-6 pt-14 pb-9">
          <div
            className="absolute top-2 right-6 font-en text-[10px] font-semibold tracking-[0.2em] text-ink-300"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            2026 / V1.0
          </div>
          <p className="font-en text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase mb-3.5">
            WORK SCHEDULE, SHARED
          </p>
          <p aria-hidden className="font-en text-[52px] font-[400] tracking-[-0.04em] leading-[0.95] text-ink-900">
            Schedule,
            <br />
            <span className="text-brand">together.</span>
          </p>
          <h1 className="mt-3.5 pt-3.5 border-t border-line text-[17px] font-bold tracking-tight text-ink-900">
            교대근무 동료와 근무표를 한 화면에서, 레일링크
          </h1>
          <p className="mt-2 text-[13px] text-ink-700 leading-relaxed">
            레일링크(RaiLink)는 근무 스케줄을 등록하고 동료와 비교하는 무료 근무표 공유
            캘린더예요. 겹치는 휴무를 찾아 약속까지 한 번에 잡아 보세요.
          </p>
          <div className="flex gap-2.5 mt-5">
            <Link href="/signup" className={`${CTA_PRIMARY} flex-1`}>
              무료로 시작하기
            </Link>
            <Link href="/login" className={`${CTA_OUTLINE} flex-1`}>
              로그인
            </Link>
          </div>
        </section>

        {/* ── 기능 ── */}
        <section className="px-6 py-9 border-t border-line">
          <h2 className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
            이런 걸 할 수 있어요
          </h2>
          <ul className="mt-4 flex flex-col gap-5">
            {FEATURES.map(f => (
              <li key={f.no} className="flex gap-4">
                <span className="font-en text-[13px] font-semibold text-brand pt-0.5 shrink-0">
                  {f.no}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold tracking-tight text-ink-900">{f.title}</h3>
                  <p className="mt-1 text-[13px] text-ink-700 leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 시작 방법 ── */}
        <section className="px-6 py-9 border-t border-line">
          <h2 className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
            이렇게 시작해요
          </h2>
          <ol className="mt-4 flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-050 text-brand font-en text-[12px] font-semibold grid place-items-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-[14px] text-ink-900">{s}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── FAQ ── */}
        <section className="px-6 py-9 border-t border-line">
          <h2 className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
            자주 묻는 질문
          </h2>
          <dl className="mt-4 flex flex-col gap-5">
            {FAQS.map(f => (
              <div key={f.q}>
                <dt className="text-[15px] font-bold tracking-tight text-ink-900">{f.q}</dt>
                <dd className="mt-1 text-[13px] text-ink-700 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="px-6 py-9 border-t border-line">
          <h2 className="text-[20px] font-bold tracking-tight text-ink-900">
            지금 시작해 보세요
          </h2>
          <p className="mt-1.5 text-[13px] text-ink-700 leading-relaxed">
            가입은 1분이면 끝나요. 동료를 초대하면 일정 비교가 바로 시작돼요.
          </p>
          <Link href="/signup" className={`${CTA_PRIMARY} w-full mt-4`}>
            무료로 시작하기
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-auto px-6 py-6 border-t border-line flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-ink-500">
            <Link href="/legal/terms" className="hover:text-ink-700">이용약관</Link>
            <Link href="/legal/privacy" className="hover:text-ink-700">개인정보처리방침</Link>
          </div>
          <p className="font-en text-[10px] font-semibold tracking-[0.2em] text-ink-300">
            RAILINK · 2026
          </p>
        </footer>
      </div>
    </div>
  )
}
