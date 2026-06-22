import createNextIntlPlugin from 'next-intl/plugin'

// 쿠키 기반 i18n. 로케일 설정은 ./i18n/request.ts 에서 읽는다(URL 프리픽스 없음).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Send the default *.vercel.app host to the canonical custom domain so
      // there's one address. 307 (temporary) for now — easy to roll back;
      // switch `permanent` to true (308) once railink.app is verified stable.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'railink.vercel.app' }],
        destination: 'https://railink.app/:path*',
        permanent: false,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
