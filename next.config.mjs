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

export default nextConfig
