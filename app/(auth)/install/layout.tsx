import type { Metadata } from 'next'

// Install guide is a helper screen reached from the login banner — keep it out of
// search for v1 (consistent with /find and /reset).
export const metadata: Metadata = {
  title: '홈 화면에 추가 · RaiLink',
  robots: { index: false, follow: false },
}

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
