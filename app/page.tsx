import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { BrandMark } from '@/components/ui/icons'
import { LandingRedirect } from '@/components/LandingRedirect'
import { PhoneMock } from '@/components/landing/PhoneMock'
import { DayDetailMock } from '@/components/landing/DayDetailMock'
import { Reveal } from '@/components/landing/Reveal'
import { NavCta } from '@/components/landing/NavCta'
import { DemoButton } from '@/components/landing/DemoButton'
import { TrackedLink } from '@/components/landing/TrackedLink'

// 랜딩 — 검색엔진과 첫 방문자가 보는 유일한 "내용 있는" 페이지. 설득형 마케팅
// 랜딩(디자인 핸드오프 Direction A "같이 쉬는 날")으로, 핵심 기능 "겹쳐보기"를
// 전면에 세운다. 본문은 서버에서 정적으로 렌더돼 크롤러가 항상 읽고(한글 표기
// "레일링크" 명시 — 검색은 한글로 들어온다), 로그인 사용자만 LandingRedirect가
// 캘린더로 보낸다. 풀폭 페이지라 app/layout.tsx의 480px 프레임에서 제외된다
// (components/AppFrame.tsx).

export const metadata: Metadata = {
  alternates: { canonical: 'https://railink.app' },
}

// 랜딩은 흰색 풀폭 마케팅 페이지 — 앱 기본 theme-color(네이비 #0C3C60)를 그대로
// 두면 모바일 브라우저 상단바만 네이비로 칠해져 "위 네이비 / 아래 흰색"으로 배경이
// 갈린 것처럼 보인다. 이 라우트에서만 흰색으로 덮는다(다른 화면엔 영향 없음).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
  themeColor: '#FFFFFF',
  colorScheme: 'light',
}

interface FeatureItem { no: string; title: string; desc: string }
interface StepItem { n: string; title: string; desc: string }
interface FaqItem { q: string; a: string }

// ── shared style fragments ──
const WRAP = 'mx-auto max-w-[1200px] px-[clamp(20px,5vw,48px)]'
const EYEBROW =
  'font-en text-[clamp(11px,1.1vw,12px)] font-semibold tracking-[0.16em] uppercase text-brand-500'
const BTN =
  'inline-flex items-center justify-center gap-2 rounded-sm font-kr font-semibold whitespace-nowrap transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[.98]'
const BTN_LG = `${BTN} h-[52px] px-6 text-[16px]`
// border-solid 명시: globals.css의 button{border:none}가 border-style을 죽여
// <button>에선 테두리가 안 보이므로(Tailwind border는 두께만 지정).
const BTN_PRIMARY = 'bg-brand text-ink-on-brand hover:bg-brand-700'
const BTN_OUTLINE = 'bg-surface text-ink-900 border border-solid border-line-2 hover:border-brand-300'
const BTN_ON_DARK = 'bg-white text-brand hover:bg-brand-050'
const BTN_GHOST_DARK = 'bg-white/[0.08] text-white border border-solid border-white/25 hover:bg-white/[0.14]'

function ArrowRightBig() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default async function LandingPage() {
  const locale = await getLocale()
  const t = await getTranslations('landing')

  // 모듈 스코프가 아니라 컴포넌트 본문에서 사전(t)으로 배열을 구성한다 —
  // 서버 컴포넌트의 비동기 getTranslations는 본문에서만 await 가능하므로.
  const FEATURES = t.raw('features.items') as FeatureItem[]
  const STEPS = t.raw('steps.items') as StepItem[]
  const FAQS = t.raw('faq.items') as FaqItem[]

  // 구조화 데이터 — 검색 결과의 리치 노출(앱 정보, FAQ 펼침) 대상. FAQPage의
  // 질문·답은 아래 FAQS(화면에 보이는 텍스트)와 반드시 일치해야 한다. 활성
  // 로케일을 inLanguage에 반영한다.
  const JSON_LD = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: t('jsonLd.appName'),
        alternateName: ['RaiLink', 'railink'],
        url: 'https://railink.app',
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Web',
        inLanguage: locale,
        description: t('jsonLd.appDescription'),
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

  return (
    <div className="bg-surface text-ink-900 overflow-x-clip">
      <LandingRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/* ── Nav (sticky) ── */}
      <nav className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur-[14px]">
        <div className={`${WRAP} flex h-16 items-center justify-between`}>
          <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.01em]">
            <BrandMark size={22} className="text-brand" />
            {t('jsonLd.appName')}
            <span className="hidden font-en text-[13px] font-semibold tracking-[0.14em] text-ink-500 sm:inline">
              {t('nav.brandSub')}
            </span>
          </div>
          {/* GNB CTA는 처음엔 숨김 — hero CTA와 안 겹치고, 스크롤로 hero를 지나치면
              나타나 전환을 이어 유도한다. */}
          <div className="flex items-center gap-[18px]">
            <TrackedLink href="/login" action="login" location="nav" className="text-[14px] font-semibold text-ink-700">
              {t('nav.login')}
            </TrackedLink>
            <NavCta className={`${BTN} ${BTN_PRIMARY} h-[42px] px-[18px] text-[14px]`} />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative overflow-hidden">
        {/* 우상단 코너 글로우 — 데스크탑(2단)에서만. 모바일에선 60vw가 화면 절반을
            덮어 배경이 좌우로 갈린 것처럼 보이므로 숨긴다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[30%] -right-[10%] hidden h-[120%] w-[60vw] min-[920px]:block"
          style={{ background: 'radial-gradient(circle at 60% 40%, rgba(12,60,96,.07), transparent 62%)' }}
        />
        <div
          className={`${WRAP} relative grid grid-cols-1 items-center gap-2 pb-[clamp(40px,6vw,72px)] pt-[clamp(40px,7vw,84px)] min-[920px]:grid-cols-[1.04fr_.96fr] min-[920px]:gap-10`}
        >
          <div>
            <span className={`${EYEBROW} mb-[22px] block`}>{t('hero.eyebrow')}</span>
            <h1 className="m-0 text-[clamp(40px,6.6vw,78px)] font-extrabold leading-[0.98] tracking-[-0.035em] text-ink-900">
              {t('hero.titleLine1')}<br />
              <span className="relative whitespace-nowrap text-brand">
                {t('hero.titleHighlight')}
                <span
                  aria-hidden
                  className="absolute -left-0.5 -right-0.5 bottom-[0.06em] -z-10 h-[0.16em] rounded-[2px] bg-brand-100"
                />
              </span>
            </h1>
            <p className="mt-[26px] font-en text-[clamp(14px,1.6vw,17px)] font-normal tracking-[-0.01em] text-ink-300">
              {t('hero.subEn')}
            </p>
            <p className="mt-3.5 max-w-[30em] text-[clamp(15px,1.7vw,18px)] leading-[1.6] text-ink-700 [text-wrap:pretty]">
              {t('hero.lead')}
            </p>
            <div id="hero-cta-anchor" className="mt-[30px] flex flex-wrap gap-3">
              <TrackedLink href="/signup" action="signup" location="hero" className={`${BTN_LG} ${BTN_PRIMARY}`}>
                {t('hero.ctaStart')}
              </TrackedLink>
              <DemoButton location="hero" className={`${BTN_LG} ${BTN_OUTLINE}`}>
                {t('hero.ctaDemo')}
              </DemoButton>
            </div>
            <TrackedLink
              href="#magic"
              action="learn_more"
              location="hero"
              className="mt-3.5 inline-flex items-center gap-1 text-[14px] font-semibold text-brand hover:text-brand-700"
            >
              {t('hero.learnMore')} <span aria-hidden>→</span>
            </TrackedLink>
            <div className="mt-[22px] flex flex-wrap items-center gap-4 text-[13px] text-ink-500">
              <span>{t('hero.badge1')}</span>
              <span className="h-1 w-1 rounded-full bg-ink-300" />
              <span>{t('hero.badge2')}</span>
              <span className="h-1 w-1 rounded-full bg-ink-300" />
              <span>{t('hero.badge3')}</span>
            </div>
          </div>
          <div className="relative mt-6 flex justify-center min-[920px]:mt-0">
            <PhoneMock variant="overlap" size="clamp(280px,30vw,348px)" />
          </div>
        </div>
      </header>

      {/* ── Problem band ── */}
      <section className="bg-ink-900 text-white">
        <Reveal className={`${WRAP} py-[clamp(48px,7vw,84px)] text-center`}>
          <p className="font-en text-[12px] uppercase tracking-[0.16em] text-brand-300">{t('problem.eyebrow')}</p>
          <h2 className="mx-auto mt-4 max-w-[18em] text-[clamp(26px,4.4vw,46px)] font-extrabold leading-[1.18] tracking-[-0.025em] [text-wrap:balance]">
            {t('problem.headingLead')}{' '}
            <span className="text-brand-300">{t('problem.headingEmph')}</span>
          </h2>
        </Reveal>
      </section>

      {/* ── Magic — Before / After ── */}
      <section id="magic" className="py-[clamp(56px,8vw,112px)]">
        <div className={WRAP}>
          <Reveal className="mx-auto mb-[clamp(40px,5vw,64px)] max-w-[40em] text-center">
            <span className={EYEBROW}>{t('magic.eyebrow')}</span>
            <h2 className="mt-3.5 text-[clamp(28px,4.2vw,52px)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
              {t('magic.headingLine1')}<br />{t('magic.headingLine2')}
            </h2>
            <p className="mx-auto mt-4 max-w-[32em] text-[clamp(15px,1.7vw,18px)] leading-[1.6] text-ink-700 [text-wrap:pretty]">
              {t('magic.body')}
            </p>
          </Reveal>
          <Reveal className="mx-auto grid max-w-[920px] grid-cols-1 items-center gap-[clamp(20px,3vw,44px)] min-[780px]:grid-cols-[1fr_auto_1fr]">
            <div className="flex flex-col items-center gap-[18px]">
              <PhoneMock variant="solo" size="clamp(230px,24vw,300px)" />
              <div className="text-center">
                <div className="font-en text-[11px] uppercase tracking-[0.12em] text-ink-300">BEFORE</div>
                <div className="mt-1.5 text-[clamp(16px,1.9vw,20px)] font-bold tracking-[-0.01em] text-ink-900">{t('magic.beforeCaption')}</div>
              </div>
            </div>
            {/* Before→After 연결 표시 — 폰의 네이비 FAB와 구분되게 연한 브랜드 톤
                연결 글리프로(채워진 네이비 원=FAB와 충돌). */}
            <div className="mx-auto grid h-[54px] w-[54px] rotate-90 place-items-center rounded-full border border-solid border-brand-100 bg-brand-050 text-brand min-[780px]:rotate-0">
              <ArrowRightBig />
            </div>
            <div className="flex flex-col items-center gap-[18px]">
              <PhoneMock variant="overlap" size="clamp(230px,24vw,300px)" />
              <div className="text-center">
                <div className="font-en text-[11px] uppercase tracking-[0.12em] text-ink-300">AFTER</div>
                <div className="mt-1.5 text-[clamp(16px,1.9vw,20px)] font-bold tracking-[-0.01em] text-ink-900">{t('magic.afterCaption')}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Day detail (하루 보기) ── 월간 겹쳐보기에서 하루로 줌인 */}
      <section className="py-[clamp(56px,8vw,104px)]">
        <div className={WRAP}>
          <Reveal className="mx-auto mb-[clamp(36px,5vw,56px)] max-w-[40em] text-center">
            <span className={EYEBROW}>{t('dayDetail.eyebrow')}</span>
            <h2 className="mt-3.5 text-[clamp(28px,4.2vw,52px)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
              {t('dayDetail.headingLine1')}<br />{t('dayDetail.headingLine2')}
            </h2>
            <p className="mx-auto mt-4 max-w-[34em] text-[clamp(15px,1.7vw,18px)] leading-[1.6] text-ink-700 [text-wrap:pretty]">
              {t('dayDetail.bodyLine1')}
              <br className="hidden min-[480px]:block" />
              {' '}{t('dayDetail.bodyLine2')}
            </p>
          </Reveal>
          <Reveal className="flex justify-center">
            <DayDetailMock size="clamp(280px,30vw,340px)" />
          </Reveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-surface-2 py-[clamp(56px,8vw,104px)]">
        <div className={WRAP}>
          <Reveal className="mb-[clamp(32px,4vw,52px)] flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className={EYEBROW}>{t('features.eyebrow')}</span>
              <h2 className="mt-3 text-[clamp(26px,3.6vw,44px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
                {t('features.heading')}
              </h2>
            </div>
            <p className="max-w-[24em] text-[15px] text-ink-500">
              {t('features.subhead')}
            </p>
          </Reveal>
          <Reveal className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-line min-[720px]:grid-cols-2">
            {FEATURES.map(f => (
              <div key={f.no} className="bg-surface p-[clamp(26px,3vw,40px)]">
                <div className="font-en text-[13px] font-bold text-brand">{f.no}</div>
                <h3 className="mt-[18px] text-[clamp(18px,2.2vw,23px)] font-extrabold tracking-[-0.02em] text-ink-900">
                  {f.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-[1.6] text-ink-700 [text-wrap:pretty]">{f.desc}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="py-[clamp(56px,8vw,104px)]">
        <div className={WRAP}>
          <Reveal>
            <h2 className="mb-[clamp(36px,4vw,56px)] text-center text-[clamp(26px,3.6vw,44px)] font-extrabold tracking-[-0.03em]">
              {t('steps.heading')}
            </h2>
          </Reveal>
          <Reveal className="mx-auto grid max-w-[980px] grid-cols-1 gap-[clamp(20px,3vw,40px)] min-[720px]:grid-cols-3">
            {STEPS.map(s => (
              <div key={s.n} className="relative border-t border-line-2 pt-[30px]">
                <span className="absolute left-0 top-[-1px] -translate-y-1/2 bg-surface pr-2.5 font-en text-[13px] font-bold text-brand">
                  {s.n}
                </span>
                <h3 className="text-[clamp(17px,2vw,21px)] font-extrabold tracking-[-0.02em] text-ink-900">{s.title}</h3>
                <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-700">{s.desc}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── FAQ (SEO: FAQPage 리치 결과 유지) ── */}
      <section className="bg-surface-2 py-[clamp(56px,8vw,104px)]">
        <div className={WRAP}>
          <Reveal className="mx-auto max-w-[820px]">
            <span className={EYEBROW}>{t('faq.eyebrow')}</span>
            <h2 className="mt-3 text-[clamp(26px,3.6vw,44px)] font-extrabold tracking-[-0.03em]">
              {t('faq.heading')}
            </h2>
            <dl className="mt-8 border-t border-line">
              {FAQS.map(f => (
                <div key={f.q} className="border-b border-line py-6">
                  <dt className="text-[clamp(16px,1.9vw,19px)] font-bold tracking-[-0.01em] text-ink-900">{f.q}</dt>
                  <dd className="mt-2 text-[15px] leading-[1.6] text-ink-700 [text-wrap:pretty]">{f.a}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section id="cta" className="relative overflow-hidden bg-brand text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 80% 120%, rgba(255,255,255,.10), transparent 55%)' }}
        />
        <Reveal className={`${WRAP} relative py-[clamp(64px,9vw,128px)] text-center`}>
          <p className="font-en text-[12px] uppercase tracking-[0.2em] text-brand-300">{t('finalCta.eyebrow')}</p>
          <h2 className="mx-auto mt-[18px] max-w-[14em] text-[clamp(30px,5.4vw,64px)] font-extrabold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">
            {t('finalCta.heading')}
          </h2>
          <p className="mx-auto mt-[18px] max-w-[26em] text-[clamp(15px,1.8vw,18px)] text-brand-100">
            {t('finalCta.body')}
          </p>
          <div className="mt-[34px] flex flex-wrap justify-center gap-3">
            <TrackedLink href="/signup" action="signup" location="final" className={`${BTN_LG} ${BTN_ON_DARK}`}>
              {t('finalCta.ctaStart')}
            </TrackedLink>
            <DemoButton location="final" className={`${BTN_LG} ${BTN_GHOST_DARK}`}>
              {t('finalCta.ctaDemo')}
            </DemoButton>
          </div>
          {/* 로그인은 텍스트 링크로 강등 — CTA 버튼은 가입·데모 둘만 두어 위계 정리. */}
          <TrackedLink
            href="/login"
            action="login"
            location="final"
            className="mt-4 inline-block text-[14px] font-semibold text-brand-100 hover:text-white"
          >
            {t('finalCta.loginLink')}
          </TrackedLink>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-line">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-[18px] py-[30px]`}>
          <div className="flex gap-[18px] text-[13px] text-ink-500">
            <Link href="/legal/terms" className="hover:text-ink-900">{t('footer.terms')}</Link>
            <Link href="/legal/privacy" className="hover:text-ink-900">{t('footer.privacy')}</Link>
          </div>
          <div className="font-en text-[11px] tracking-[0.2em] text-ink-300">RAILINK · 2026</div>
        </div>
      </footer>
    </div>
  )
}
