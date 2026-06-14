import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '레일링크 RaiLink · 근무표 공유 캘린더',
    short_name: 'RaiLink',
    description: '레일링크는 교대근무자를 위한 무료 근무표 공유 캘린더예요. 내 근무 스케줄을 등록하고 동료와 겹치는 휴무를 한눈에 확인하세요.',
    // Installed-app users are almost always logged in, so start at /calendar:
    // its loader shows a neutral surface while the session resolves, then the
    // calendar. Starting at /login instead flashed the login form on every cold
    // boot before bouncing logged-in users on. Logged-out users are sent to
    // /login by the calendar guard. (iOS caches start_url at install time, so
    // already-installed icons keep the old value until re-added — the login
    // page also gates its form for that case.)
    start_url: '/calendar',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F6F8',
    theme_color: '#0C3C60',
    lang: 'ko',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
