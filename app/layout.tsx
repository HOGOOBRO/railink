import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { AppFrame } from '@/components/AppFrame'
import { SwRegister } from '@/components/SwRegister'
import { Analytics } from '@/components/Analytics'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--jetbrains-mono',
})

// 한글 표기 "레일링크"를 제목·설명에 반드시 포함 — 한국어 검색("레일링크",
// "근무표 공유")이 매칭될 문서가 사이트에 있어야 한다 (2026-06 SEO 진단).
const SITE_TITLE = '레일링크 RaiLink · 근무표 공유 캘린더'
const SITE_DESC =
  '레일링크는 교대근무자를 위한 무료 근무표 공유 캘린더예요. 내 근무 스케줄을 등록하고 동료와 겹치는 휴무를 한눈에 확인하세요.'

export const metadata: Metadata = {
  metadataBase: new URL('https://railink.app'),
  title: SITE_TITLE,
  description: SITE_DESC,
  // Static og:image (public/og-image.png) — a fixed, query-less URL that
  // KakaoTalk's scraper reliably caches, unlike the dynamic next/og route.
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    url: 'https://railink.app',
    siteName: 'RaiLink',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, type: 'image/png', alt: 'RaiLink' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ['/og-image.png'],
  },
  // iOS "Add to Home Screen": full-screen standalone + short home-screen label.
  appleWebApp: {
    capable: true,
    title: 'RaiLink',
    statusBarStyle: 'default',
    startupImage: ['/apple-splash'],
  },
  // Search engine site verification (rendered into <head> as <meta> tags).
  // Naver 서치어드바이저 + Google Search Console "HTML 태그" method. (Google can
  // also verify via the DNS TXT record in Vercel DNS — that path doesn't need
  // this tag.)
  verification: {
    google: 'oETvNpqz_tZgbKyUYZ15GbF10AGg1RrhuwtWoFHE9s8',
    other: {
      'naver-site-verification': 'cfe75c133903a6b79a29b1988a77274b13df6758',
    },
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
  themeColor: '#0C3C60',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Inline background on html/body so a cold PWA launch paints the neutral
  // surface immediately — before globals.css loads. Without it the system can
  // flash a black screen (standalone dark mode) until the stylesheet applies.
  return (
    <html lang="ko" className={jetbrainsMono.variable} style={{ backgroundColor: '#F5F6F8' }}>
      <body style={{ backgroundColor: '#F5F6F8' }}>
        {/* gtag 동기 스텁: gtag.js(afterInteractive + opt-out 체크 뒤 지연 마운트)가
            로드되기 전에 발생한 이벤트(빠른 가입/데모 로그인)가 유실되지 않도록
            dataLayer에 큐잉한다. opt-out이면 gtag.js가 영영 안 실리므로 큐는
            전송 없이 버려진다 — noga 동작 그대로 유지. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};',
          }}
        />
        <ToastProvider>
          <AppFrame>{children}</AppFrame>
        </ToastProvider>
        <SwRegister />
        <Analytics />
      </body>
    </html>
  )
}
