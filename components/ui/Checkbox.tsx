'use client'

import { InputHTMLAttributes } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  badge?: 'required' | 'optional'
}

export function Checkbox({ label, badge, className, ...props }: CheckboxProps) {
  const t = useTranslations('ui.checkbox')
  return (
    <label className={cn('flex items-center gap-2.5 py-2 text-callout text-ink-900 cursor-pointer', className)}>
      <input
        type="checkbox"
        className="w-[18px] h-[18px] accent-brand cursor-pointer"
        {...props}
      />
      <span className="flex-1">{label}</span>
      {badge === 'required' && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-brand-050 text-brand">{t('required')}</span>
      )}
      {badge === 'optional' && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-bg text-ink-500">{t('optional')}</span>
      )}
    </label>
  )
}
