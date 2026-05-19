'use client'

import { InputHTMLAttributes, ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: ReactNode
  error?: string
  required?: boolean
  /** Element rendered at the right edge of the field (e.g. show/hide toggle). */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, trailing, className, id, ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={id}
          className="text-caption font-semibold tracking-wide text-ink-900"
        >
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full px-3.5 h-12 rounded-sm border-2 border-line bg-surface font-kr',
            'text-body font-normal tracking-normal placeholder:text-ink-500',
            'transition-[border-color,box-shadow] duration-150',
            'focus:outline-none focus:border-brand focus:shadow-[0_0_0_4px_rgba(12,60,96,.12)]',
            error && 'border-danger focus:shadow-[0_0_0_4px_rgba(220,38,38,.10)]',
            trailing && 'pr-11',
            className,
          )}
          {...props}
        />
        {trailing && (
          <div className="absolute top-1/2 right-1.5 -translate-y-1/2 w-9 h-9 grid place-items-center text-ink-500">
            {trailing}
          </div>
        )}
      </div>
      {hint && !error && (
        <p className="text-caption font-normal tracking-normal text-ink-300">{hint}</p>
      )}
      {error && (
        <p className="flex items-start gap-1 text-caption text-danger mt-0.5">
          <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[10px] font-bold grid place-items-center mt-px">!</span>
          {error}
        </p>
      )}
    </div>
  )
})
