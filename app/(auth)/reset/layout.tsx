import type { Metadata } from 'next'

// Password-reset is reached via email recovery link, not search — keep it out
// of the index (and out of phishing-via-search surface).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
