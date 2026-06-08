'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BootSplash } from '@/components/loading/BootSplash'

// Root entry. We must return a 200 here (not a server-side redirect): search-
// engine verification robots — Naver's Yeti and Googlebot — fetch the canonical
// root, and a `redirect('/login')` returns 307, which Naver reports as a crawl
// failure ("정상적으로 데이터를 수신하지 못했습니다") so the <head> verification
// meta tags (from layout.tsx) are never read. Rendering a 200 splash exposes
// those tags, then we client-redirect to /login (which gates on session and
// forwards logged-in users to /calendar).
export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    // Forward the query string (utm_* campaign tags, ?invite=, etc.) so the
    // redirect doesn't drop it. Analytics' initial page_view fires after this
    // client redirect, so dropping the params here loses all attribution.
    router.replace('/login' + window.location.search)
  }, [router])
  return <BootSplash />
}
