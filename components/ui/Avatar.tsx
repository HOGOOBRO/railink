'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type AvatarSize = 'xs' | 'sm' | 'default' | 'lg' | 'xl'
type AvatarColor =
  | 'brand' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

interface AvatarProps {
  /** Full name — initials are derived (Korean: last 2 chars). */
  name?: string
  /** Explicit initials override. Falls back to deriving from `name`. */
  initials?: string
  /** Photo URL. On load error, falls back to initials. */
  photo?: string
  size?: AvatarSize
  color?: AvatarColor
  bordered?: boolean
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  xs:      'w-avatar-xs h-avatar-xs text-[9px]',
  sm:      'w-avatar-sm h-avatar-sm text-[10px]',
  default: 'w-avatar h-avatar text-caption',
  lg:      'w-avatar-lg h-avatar-lg text-body',
  xl:      'w-avatar-xl h-avatar-xl text-[22px]',
}

const colorClasses: Record<AvatarColor, string> = {
  brand: 'bg-brand text-ink-on-brand',
  c1:    'bg-c1 text-ink-on-brand',
  c2:    'bg-c2 text-ink-on-brand',
  c3:    'bg-c3 text-ink-on-brand',
  c4:    'bg-c4 text-ink-on-brand',
  c5:    'bg-c5 text-ink-on-brand',
  c6:    'bg-c6 text-ink-on-brand',
  c7:    'bg-c7 text-ink-on-brand',
  c8:    'bg-c8 text-ink-on-brand',
  c9:    'bg-c9 text-ink-on-brand',
  c10:   'bg-c10 text-ink-on-brand',
}

/** Korean name → last 2 chars; otherwise word initials. */
export function toInitials(name = ''): string {
  const n = name.trim()
  if (!n) return ''
  if (/^[ㄱ-힝]+$/.test(n)) return n.length >= 2 ? n.slice(-2) : n
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function Avatar({
  name, initials, photo,
  size = 'default', color = 'brand', bordered = false, className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const label = initials ?? toInitials(name)

  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        onError={() => setFailed(true)}
        className={cn(
          'rounded-full object-cover shrink-0 bg-bg',
          sizeClasses[size],
          bordered && 'shadow-[0_0_0_2px_var(--surface),0_0_0_3px_currentColor]',
          className,
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full grid place-items-center font-bold shrink-0',
        sizeClasses[size],
        colorClasses[color],
        bordered && 'shadow-[0_0_0_2px_var(--surface),0_0_0_3px_currentColor]',
        className,
      )}
      aria-label={label}
    >
      {label}
    </div>
  )
}
