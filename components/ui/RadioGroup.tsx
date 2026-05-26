'use client'

import { useRef, type KeyboardEvent } from 'react'

export interface RadioOption<T extends string> {
  value: T
  title: string
  desc?: string
}

interface RadioGroupProps<T extends string> {
  options: RadioOption<T>[]
  value: T | null
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

/* WAI-ARIA radio group: role="radiogroup" of role="radio" buttons with
 * aria-checked, roving tabindex, and arrow-key navigation (selection follows
 * focus, wrapping). Used by the signup visibility step and settings 공개 범위. */
export function RadioGroup<T extends string>({
  options, value, onChange, ariaLabel, className,
}: RadioGroupProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function move(from: number, dir: 1 | -1) {
    const n = options.length
    const next = (from + dir + n) % n
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex(o => o.value === value)
    const cur = idx < 0 ? 0 : idx
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(cur, 1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(cur, -1) }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className={className ?? 'flex flex-col gap-2'}>
      {options.map((opt, i) => {
        const active = value === opt.value
        // Roving tabindex: the checked option is the tab stop, or the first when none chosen.
        const tabIndex = active || (value == null && i === 0) ? 0 : -1
        return (
          <button
            key={opt.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndex}
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-2.5 text-left rounded-md border-2 px-3.5 py-3 transition-colors ${
              active ? 'border-brand bg-brand-050' : 'border-line bg-surface'
            }`}
          >
            <span
              className={`mt-0.5 w-[18px] h-[18px] rounded-full border-2 grid place-items-center shrink-0 ${
                active ? 'border-brand' : 'border-line-2'
              }`}
            >
              {active && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink-900">{opt.title}</span>
              {opt.desc && <span className="block text-caption text-ink-500 mt-0.5 leading-relaxed">{opt.desc}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
