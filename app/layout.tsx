import type { Metadata } from 'next'
import Script from 'next/script'
import { JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { SwRegister } from '@/components/SwRegister'
import './globals.css'

const GA_ID = 'G-N9EBNCQPP0'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--jetbrains-mono',
})

const SITE_TITLE = 'RaiLink · 근무 스케줄 공유'
const SITE_DESC = '내 일정과 함께 보는 사람의 일정을 한 화면에서. 동료와 근무 스케줄을 맞춰보는 앱.'

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
  return (
    <html lang="ko" className={jetbrainsMono.variable}>
      <body>
        <ToastProvider>
          <div className="app-frame">{children}</div>
        </ToastProvider>
        <SwRegister />
        {/* Google Analytics (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  )
}
