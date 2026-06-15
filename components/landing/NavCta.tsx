'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics'

/** 상단바 CTA — 처음엔 숨겨 hero의 CTA와 겹치지 않게 하고, hero의 CTA가 화면
 *  위로 스크롤돼 사라지면 슬며시 나타난다(#hero-cta-anchor 기준). 숨김 상태에도
 *  레이아웃 자리는 차지해 나타날 때 다른 요소가 밀리지 않는다. */
export function NavCta({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const anchor = document.getElementById('hero-cta-anchor')
    if (!anchor) return
    const io = new IntersectionObserver(
      ([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 },
    )
    io.observe(anchor)
    return () => io.disconnect()
  }, [])

  return (
    <Link
      href="/signup"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={() => track('landing_cta', { action: 'signup', location: 'nav' })}
      className={`${className} overflow-hidden transition-all duration-300 ${
        show ? 'max-w-[200px] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
      }`}
    >
      무료로 시작하기
    </Link>
  )
}
