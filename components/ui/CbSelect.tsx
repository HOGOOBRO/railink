'use client'

/* Toss-style styled dropdown (NOT a native <select>) used by the 약속 잡기
 * wizard's time field. Field opens a rounded option panel below it; 44px rows,
 * selected row highlighted; exactly 5 rows tall with a bottom fade + chevron
 * hint when more exist. The existing components/ui/Select.tsx is a native
 * <select> wrapper and can't render this panel, so this is a separate component.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons'

export interface CbOption {
  v: string
  label: string
  /** 오른쪽에 붙는 작은 칩(예: '준비중'). */
  badge?: string
  /** 흐리게 표시(예: 준비중 항공사). */
  muted?: boolean
  /** 선택 불가한 섹션 헤더 행. */
  header?: boolean
}

const ROW_H = 44
const PANEL_H = ROW_H * 5 + 12   // 5 full rows, no half-cut rows

export function CbSelect({
  value, options, placeholder, disabled, onChange,
}: {
  value: string
  options: CbOption[]
  placeholder?: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !panelRef.current) return
    const idx = options.findIndex(o => o.v === value)
    if (idx > 2) panelRef.current.scrollTop = idx * ROW_H - ROW_H * 2
    const el = panelRef.current
    setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }, [open, options, value])

  function onPanelScroll() {
    const el = panelRef.current
    if (el) setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }

  const cur = options.find(o => o.v === value)
  const hasMore = options.length * ROW_H > PANEL_H

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full h-12 px-3.5 rounded-md border-2 bg-surface font-en text-body flex items-center justify-between text-left transition-colors ${
          open ? 'border-brand' : 'border-line'
        } ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'} ${cur ? 'text-ink-900' : 'text-ink-300'}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{cur ? cur.label : placeholder}</span>
          {cur?.badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-bg text-ink-500 shrink-0">{cur.badge}</span>
          )}
        </span>
        <span className={`text-ink-500 grid shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-[25]" />
          <div className="absolute left-0 right-0 z-30" style={{ top: 'calc(100% + 6px)' }}>
            <div
              ref={panelRef}
              onScroll={onPanelScroll}
              className="bg-surface rounded-[14px] border border-line shadow-sh3 overflow-y-auto p-1.5"
              style={{ maxHeight: PANEL_H }}
            >
              {options.map(o => {
                if (o.header) {
                  return (
                    <div
                      key={o.v}
                      className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-300 select-none"
                    >
                      {o.label}
                    </div>
                  )
                }
                const on = o.v === value
                return (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => { onChange(o.v); setOpen(false) }}
                    className={`w-full px-3 rounded-[10px] font-en text-[15px] flex items-center justify-between gap-2 text-left ${
                      on ? 'bg-brand-050 text-brand-700 font-bold' : o.muted ? 'text-ink-500 font-medium' : 'text-ink-900 font-medium'
                    }`}
                    style={{ height: ROW_H }}
                  >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{o.label}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {o.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-bg text-ink-500">{o.badge}</span>
                      )}
                      {on && <span className="text-brand grid"><CheckIcon size={15} /></span>}
                    </span>
                  </button>
                )
              })}
            </div>
            {hasMore && !atEnd && (
              <div
                className="absolute left-px right-px bottom-px h-10 pointer-events-none flex items-end justify-center rounded-b-[14px]"
                style={{ background: 'linear-gradient(to bottom, transparent, var(--surface) 80%)' }}
              >
                <span className="text-ink-500 grid mb-1"><ChevronDownIcon size={15} /></span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const MIN_VALUES = ['00', '10', '20', '30', '40', '50']

/** Dual 시/분 dropdowns. Stored value is 'HH:MM'; 분 disabled until 시 chosen. */
export function CbTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('ui.timeSelect')
  const [hh, mm] = value ? value.split(':') : ['', '']
  const hourOpts: CbOption[] = Array.from({ length: 24 }, (_, h) => ({ v: String(h).padStart(2, '0'), label: t('hourLabel', { h }) }))
  const minOpts: CbOption[] = MIN_VALUES.map(m => ({ v: m, label: t('minuteLabel', { m }) }))
  return (
    <div className="flex gap-2">
      <CbSelect value={hh} options={hourOpts} placeholder={t('hour')} onChange={h => onChange(`${h}:${mm || '00'}`)} />
      <CbSelect
        value={hh === '' ? '' : (mm || '00')}
        options={minOpts}
        placeholder={t('minute')}
        disabled={hh === ''}
        onChange={m => onChange(`${hh}:${m}`)}
      />
    </div>
  )
}
