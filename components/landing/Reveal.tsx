'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** 스크롤 등장 연출 — 뷰포트에 들어오면 opacity/translateY 트랜지션.
 *  어떤 환경에서도 콘텐츠가 숨은 채 남지 않도록 IntersectionObserver +
 *  2.5초 안전망을 함께 둔다. prefers-reduced-motion이면 즉시 표시. */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    const safety = window.setTimeout(() => setShown(true), 2500)
    return () => {
      io.disconnect()
      window.clearTimeout(safety)
    }
  }, [])

  const style: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : 'translateY(22px)',
    transition:
      'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)',
  }

  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  )
}
