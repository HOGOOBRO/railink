'use client'

import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  required?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, id, children, ...props },
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
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full px-3 py-4 rounded-sm border-2 border-line bg-surface font-kr',
          'text-caption font-semibold tracking-wide',
          'bg-[url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238B91A1\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'/></svg>")] bg-no-repeat bg-[right_12px_center] pr-10',
          'transition-[border-color,box-shadow] duration-150',
          'focus:outline-none focus:border-brand focus:shadow-[0_0_0_4px_rgba(12,60,96,.12)]',
          error && 'border-danger focus:shadow-[0_0_0_4px_rgba(220,38,38,.10)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
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
