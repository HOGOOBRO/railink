'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Switch } from '@/components/ui/Switch'
import {
  ChevronLeftIcon, ChevronRightIcon, PlusIcon, CloseIcon,
} from '@/components/ui/icons'
import { getCurrentSession, type Session } from '@/lib/auth'
import {
  addCode, getCodebook, removeCode, seedDefaultCodes, updateCode,
  type CodebookEntry, type CodebookState, MAX_LABEL,
} from '@/lib/store/codebook'
import { normalizeTimeInput } from '@/lib/schedule-utils'

type SheetMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; entry: CodebookEntry }

export default function CodebookSettingsPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<CodebookState>({ codes: [] })
  const [sheet, setSheet] = useState<SheetMode>({ type: 'closed' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await getCurrentSession()
      if (!alive) return
      if (!s) { router.replace('/login'); return }
      setSession(s)
      setState(getCodebook(s.uid))
    })()
    return () => { alive = false }
  }, [router])

  function startSeed() {
    if (!session) return
    let cur: CodebookState = { codes: [] }
    for (const c of seedDefaultCodes()) {
      const { state: next } = addCode(session.uid, {
        label: c.label, isOff: c.isOff, startTime: c.startTime, endTime: c.endTime,
      })
      cur = next
    }
    setState(cur)
  }

  function handleSave(input: Omit<CodebookEntry, 'id'>) {
    if (!session) return
    if (sheet.type === 'create') {
      const { state: next, error } = addCode(session.uid, input)
      if (error === 'duplicate') { showToast('같은 이름의 코드가 이미 있어요.', 'danger'); return }
      if (error === 'limit')      { showToast('코드를 더 추가할 수 없어요.', 'danger'); return }
      setState(next)
      setSheet({ type: 'closed' })
      showToast('코드를 추가했어요.', 'success')
    } else if (sheet.type === 'edit') {
      const { state: next, error } = updateCode(session.uid, sheet.entry.id, input)
      if (error === 'duplicate') { showToast('같은 이름의 코드가 이미 있어요.', 'danger'); return }
      setState(next)
      setSheet({ type: 'closed' })
      showToast('코드를 저장했어요.', 'success')
    }
  }

  function handleRemove(id: string) {
    if (!session) return
    const next = removeCode(session.uid, id)
    setState(next)
    setSheet({ type: 'closed' })
    showToast('코드를 지웠어요.', 'success')
  }

  if (!session) return <div className="min-h-[100dvh] bg-bg" />

  const empty = state.codes.length === 0

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="h-topbar flex items-center justify-between gap-1 px-1.5 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-1">
          <Link
            href="/settings/info"
            aria-label="뒤로"
            className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
          >
            <ChevronLeftIcon size={20} />
          </Link>
          <h3 className="text-[18px] font-bold tracking-tight text-ink-900">내 근무 코드</h3>
        </div>
        <button
          onClick={() => setSheet({ type: 'create' })}
          className="inline-flex items-center gap-1 px-3 h-btn-sm text-callout font-semibold text-brand"
        >
          <PlusIcon size={14} /> 추가
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <p className="px-1 text-[13px] text-ink-500 leading-relaxed mb-4">
          자주 쓰는 근무 코드를 미리 정의해 두면, 직접 입력할 때 칩을 고르고
          날짜를 탭하기만 해도 빠르게 등록할 수 있어요.
        </p>

        {empty ? (
          <div className="mt-2 flex flex-col items-center gap-3 py-10 px-4 bg-surface border border-dashed border-line rounded-lg">
            <p className="text-callout text-ink-700 text-center leading-relaxed">
              아직 등록된 코드가 없어요.<br />
              자주 쓰는 패턴을 한 번에 시드해서 시작할 수 있어요.
            </p>
            <Button variant="outline-brand" size="sm" onClick={startSeed}>
              샘플 코드로 시작하기
            </Button>
            <p className="text-[11px] text-ink-300">또는 우상단 + 버튼으로 직접 추가</p>
          </div>
        ) : (
          <>
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
              등록된 코드 <span className="font-en">{state.codes.length}</span>개
            </p>

            <div className="border border-line rounded-[14px] overflow-hidden bg-surface">
              {state.codes.map((c, i) => (
                <CodeRow
                  key={c.id}
                  code={c}
                  last={i === state.codes.length - 1}
                  onTap={() => setSheet({ type: 'edit', entry: c })}
                />
              ))}
            </div>

            <button
              onClick={() => setSheet({ type: 'create' })}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] border border-dashed border-line-2 bg-surface text-callout font-semibold text-ink-700 active:bg-bg"
            >
              <PlusIcon size={14} /> 코드 추가하기
            </button>
          </>
        )}
      </div>

      <BottomSheet open={sheet.type !== 'closed'} onClose={() => setSheet({ type: 'closed' })}>
        {sheet.type !== 'closed' && (
          <CodeForm
            initial={sheet.type === 'edit' ? sheet.entry : undefined}
            onSave={handleSave}
            onRemove={sheet.type === 'edit' ? () => handleRemove(sheet.entry.id) : undefined}
            onCancel={() => setSheet({ type: 'closed' })}
          />
        )}
      </BottomSheet>
    </div>
  )
}

function CodeRow({
  code, last, onTap,
}: { code: CodebookEntry; last: boolean; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center gap-3 px-3.5 py-3.5 text-left active:bg-bg ${
        last ? '' : 'border-b border-line'
      }`}
    >
      {/* code badge: warm tone for 휴무, brand for 근무 */}
      <span
        className="min-w-[46px] h-[46px] px-2 grid place-items-center rounded-[11px] font-en font-bold text-[15px] shrink-0"
        style={
          code.isOff
            ? { background: '#FEF3C7', color: '#92400E' }
            : { background: 'var(--brand-050)', color: 'var(--brand-700)' }
        }
      >
        {code.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-ink-900 truncate">{code.label}</div>
        <div className={`text-[12.5px] text-ink-500 mt-0.5 ${code.isOff ? '' : 'font-en'}`}>
          {code.isOff ? '휴무 코드' : `${code.startTime} – ${code.endTime}`}
        </div>
      </div>
      <span
        className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-pill"
        style={
          code.isOff
            ? { background: 'rgba(217,119,6,0.12)', color: 'var(--warn)' }
            : { background: 'var(--brand-050)', color: 'var(--brand)' }
        }
      >
        {code.isOff ? '휴무' : '근무'}
      </span>
      <span className="text-ink-300 ml-0.5"><ChevronRightIcon size={16} /></span>
    </button>
  )
}

function CodeForm({
  initial, onSave, onRemove, onCancel,
}: {
  initial?: CodebookEntry
  onSave: (input: Omit<CodebookEntry, 'id'>) => void
  onRemove?: () => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [isOff, setIsOff] = useState(initial?.isOff ?? false)
  const [start, setStart] = useState(initial?.startTime ?? '')
  const [end, setEnd] = useState(initial?.endTime ?? '')
  const [error, setError] = useState<string | null>(null)

  const timesOk = isOff || (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end))
  const canSave = label.trim().length > 0 && timesOk

  function submit() {
    const labelTrim = label.trim()
    if (!labelTrim) { setError('코드 이름을 입력해 주세요.'); return }
    if (labelTrim.length > MAX_LABEL) { setError(`코드 이름은 ${MAX_LABEL}자 이하로 해 주세요.`); return }
    if (!isOff && !timesOk) { setError('시간은 HH:MM 형식으로 입력해 주세요.'); return }
    onSave({
      label: labelTrim,
      isOff,
      startTime: isOff ? undefined : start.trim(),
      endTime:   isOff ? undefined : end.trim(),
    })
  }

  return (
    <div className="px-5 pt-1 pb-7">
      <h3 className="text-subtitle font-bold tracking-tight text-ink-900 mb-4">
        {initial ? '코드 수정' : '코드 추가'}
      </h3>

      {/* name */}
      <p className="px-0.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-ink-500">
        코드 이름
      </p>
      <input
        value={label}
        onChange={e => { setLabel(e.target.value); setError(null) }}
        placeholder="예: N, A, 출장, 연차"
        maxLength={MAX_LABEL}
        className="w-full h-[50px] px-3.5 rounded-[12px] border-[1.5px] border-line-2 bg-surface text-[16px] text-ink-900 outline-none mb-1.5"
      />

      {/* off toggle — borderless row + switch */}
      <button
        type="button"
        onClick={() => { setIsOff(v => !v); setError(null) }}
        className="w-full flex items-center justify-between gap-3 py-3.5 active:opacity-70"
      >
        <div className="text-left">
          <div className="text-[15px] font-semibold text-ink-900">휴무 코드</div>
          <div className="text-[11.5px] text-ink-500 mt-0.5">
            출퇴근 시간 없이 쉬는 날로 표시돼요
          </div>
        </div>
        <Switch on={isOff} onChange={v => { setIsOff(v); setError(null) }} ariaLabel="휴무 코드 토글" />
      </button>
      <div className="h-px bg-line mb-3.5" />

      {/* times — hidden when 휴무 on */}
      {!isOff && (
        <>
          <p className="px-0.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-ink-500">
            출근 · 퇴근 시간
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2.5 items-center">
            <input
              value={start}
              onChange={e => { setStart(normalizeTimeInput(e.target.value)); setError(null) }}
              placeholder="09:00"
              inputMode="numeric"
              maxLength={5}
              className="w-full h-[50px] px-3.5 rounded-[12px] border-[1.5px] border-line-2 bg-surface font-en text-[17px] font-semibold text-ink-900 text-center outline-none"
            />
            <span className="text-ink-300 font-en">→</span>
            <input
              value={end}
              onChange={e => { setEnd(normalizeTimeInput(e.target.value)); setError(null) }}
              placeholder="18:00"
              inputMode="numeric"
              maxLength={5}
              className="w-full h-[50px] px-3.5 rounded-[12px] border-[1.5px] border-line-2 bg-surface font-en text-[17px] font-semibold text-ink-900 text-center outline-none"
            />
          </div>
          <p className="text-caption text-ink-500 mt-2">
            숫자만 입력하면 자동으로{' '}
            <strong className="text-ink-700 font-en">시:분</strong>으로 맞춰져요.{' '}
            <span className="text-ink-300">(예: 0930 → 09:30)</span>
          </p>
        </>
      )}

      {error && <p className="text-caption text-danger mt-2">{error}</p>}

      <div className="flex gap-2.5 mt-5">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="코드 삭제"
            className="h-[50px] px-3 rounded-[11px] border border-line-2 bg-surface text-danger grid place-items-center"
          >
            <CloseIcon size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-[50px] rounded-[11px] border border-line-2 bg-surface text-ink-900 text-[15px] font-bold"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="flex-1 h-[50px] rounded-[11px] bg-brand-700 text-white text-[15px] font-bold disabled:opacity-45"
        >
          {initial ? '저장' : '추가'}
        </button>
      </div>
    </div>
  )
}
