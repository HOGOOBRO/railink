'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

/* Destructive-action modal (§15). The user must type a confirm word before the
 * danger button arms. Shared by 데이터 모두 삭제 (settings/info) and 그룹 삭제
 * (ManageGroupsSheet). */
export function DangerConfirm({
  title, body, confirmWord, confirmLabel, onCancel, onConfirm,
}: {
  title: string
  body: ReactNode
  confirmWord?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('ui.dangerConfirm')
  // 기본값은 훅을 호출할 수 없는 prop 자리 대신 여기서 t()로 채운다.
  const word = confirmWord ?? t('defaultWord')
  const label = confirmLabel ?? t('defaultConfirm')
  const [type, setType] = useState('')
  const armed = type === word
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
      <button
        aria-label={t('closeBackdrop')}
        onClick={onCancel}
        className="absolute inset-0"
        style={{ background: 'rgba(13,30,55,0.55)' }}
      />
      <div className="relative w-full max-w-[400px] bg-surface rounded-lg shadow-sh4 px-5 pt-5 pb-[18px]">
        <div className="w-11 h-11 rounded-lg bg-danger-soft text-danger grid place-items-center mx-auto mb-3 text-[22px] font-bold">!</div>
        <h3 className="text-center text-[18px] font-bold tracking-tight text-ink-900">{title}</h3>
        <p className="mt-1.5 text-center text-callout text-ink-700 leading-relaxed">{body}</p>

        <p className="mt-3.5 text-caption text-ink-500">
          {t.rich('prompt', {
            word,
            b: (c) => <strong className="text-danger">{c}</strong>,
          })}
        </p>
        <input
          value={type}
          onChange={e => setType(e.target.value)}
          className={`mt-1.5 w-full h-11 px-3.5 rounded-xs border-2 bg-surface text-[15px] text-ink-900 font-kr outline-none ${
            armed ? 'border-danger' : 'border-line'
          }`}
        />

        <div className="flex gap-2.5 mt-3.5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>{t('cancel')}</Button>
          <button
            disabled={!armed}
            onClick={armed ? onConfirm : undefined}
            className={`flex-1 h-btn rounded-md text-body font-semibold transition-colors ${
              armed
                ? 'bg-danger text-ink-on-brand'
                : 'bg-danger-soft text-danger opacity-70 cursor-not-allowed'
            }`}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
