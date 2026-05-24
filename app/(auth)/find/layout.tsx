import type { Metadata } from 'next'

// Password-find is an auth helper, not a landing page — keep it out of search
// (avoids surfacing a "비밀번호 찾기" form from search results).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function FindLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
