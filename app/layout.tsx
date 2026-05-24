import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import './globals.css'

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
  // og:image is generated automatically from app/opengraph-image.tsx
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    url: 'https://railink.app',
    siteName: 'RaiLink',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
  themeColor: '#0C3C60',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={jetbrainsMono.variable}>
      <body>
        <ToastProvider>
          <div className="app-frame">{children}</div>
        </ToastProvider>
      </body>
    </html>
  )
}
