import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RaiLink · 코레일 승무원 스케줄',
    short_name: 'RaiLink',
    description: '내 근무와 동료 근무를 한 화면에서 보는 KTX 승무원용 스케줄 도구.',
    // Home redirects; start at /login directly (already-logged-in users are
    // bounced to /calendar) to avoid a redirect hop during PWA cold boot.
    start_url: '/login',
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
