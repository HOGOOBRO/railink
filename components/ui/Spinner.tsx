'use client'

import { useTranslations } from 'next-intl'

/* Loading spinner ring — design_handoff_loading_states §3.
 * 24×24 viewBox, light track + brand (or colleague-color) arc, 1s linear spin
 * via Tailwind's `animate-spin`. `color` accepts any CSS color incl. a var()
 * (e.g. "var(--c1)" for the colleague palette). */
interface SpinnerProps {
  size?: number
  stroke?: number
  /** Any CSS color. Defaults to the brand navy. */
  color?: string
  className?: string
}

export function Spinner({ size = 22, stroke = 3, color = 'var(--brand)', className }: SpinnerProps) {
  const t = useTranslations('common')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin shrink-0${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={t('loading')}
    >
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray="22 60"
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}
