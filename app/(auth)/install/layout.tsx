import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// Install guide is a helper screen reached from the login banner — keep it out of
// search for v1 (consistent with /find and /reset).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('installTitle'),
    robots: { index: false, follow: false },
  }
}

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
