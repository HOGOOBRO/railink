import type { Metadata } from 'next'

// OAuth landing — reached only as a redirect target from Google/Supabase, never
// browsed to directly. Keep it out of the search index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
