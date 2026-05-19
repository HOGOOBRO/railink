'use client'

import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'brand' | 'outline' | 'outline-brand' | 'ghost' | 'soft' | 'danger-ghost'
type Size = 'default' | 'sm' | 'xs'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
}

// Each variant carries exactly one border declaration so no two border-color
// (or text-color) utilities ever collide — cn() is plain clsx (no tw-merge).
const variantClasses: Record<Variant, string> = {
  primary:        'border border-transparent bg-brand-700 text-ink-on-brand hover:bg-brand active:bg-brand-700 disabled:bg-ink-300 disabled:cursor-not-allowed',
  brand:          'border border-transparent bg-brand text-ink-on-brand hover:bg-brand-700 active:bg-brand disabled:bg-ink-300 disabled:cursor-not-allowed',
  outline:        'border border-line-2 bg-surface text-ink-900 hover:border-brand-300 hover:text-brand',
  'outline-brand':'border border-brand-100 bg-surface text-brand hover:border-brand-300',
  ghost:          'border border-transparent bg-transparent text-ink-700 hover:bg-bg hover:text-ink-900',
  soft:           'border border-transparent bg-brand-050 text-brand hover:bg-brand-100',
  'danger-ghost': 'border border-transparent bg-transparent text-danger hover:bg-danger-soft',
}

const sizeClasses: Record<Size, string> = {
  default: 'h-btn px-[18px] text-body font-semibold rounded-md',
  sm:      'h-btn-sm px-3 text-callout font-semibold rounded-sm',
  xs:      'h-btn-xs px-[10px] text-caption font-semibold rounded-xs',
}

export function Button({
  variant = 'primary',
  size = 'default',
  block = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-kr transition-[background,color,border-color] duration-150 active:scale-[.98]',
        variantClasses[variant],
        sizeClasses[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
