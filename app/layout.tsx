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

const SITE_TITLE = 'RaiLink · 코레일 승무원 스케줄 공유'
const SITE_DESC = '내 근무와 동료 근무를 한 화면에서 보는 KTX 승무원용 스케줄 도구.'

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
