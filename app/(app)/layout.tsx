import type { Metadata } from 'next'

// Authenticated area (calendar, settings) — never index. The pages are client
// components that redirect unauth users via JS, but Googlebot doesn't run that;
// putting noindex in this server layout's metadata bakes it into the static
// HTML shell so the private routes stay out of search regardless.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
