'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { ChevronLeftIcon, PlusIcon, CloseIcon } from '@/components/ui/icons'
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
    const seeded: CodebookState = { codes: seedDefaultCodes() }
    setState(seeded)
    // saveCodebook 은 addCode 안에서 호출되므로 명시적으로 한 번에 저장.
    // 시드는 가벼우니 addCode 루프로 처리.
    let cur = { codes: [] as CodebookEntry[] }
    for (const c of seeded.codes) {
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

      <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-8">
        <p className="px-1 text-caption text-ink-500 leading-relaxed">
          자주 쓰는 근무 코드(N, A, B, 출장, 연차 등)를 미리 정의해 두면,
          근무표 직접 입력 시 코드 칩을 선택하고 날짜 셀을 탭하기만 해도
          빠르게 등록할 수 있어요.
        </p>

        {empty ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-10 px-4 bg-surface border border-dashed border-line rounded-lg">
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
          <section className="mt-4">
            <p className="px-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-ink-500">
              등록된 코드 <span className="font-en">{state.codes.length}</span>개
            </p>
            <div className="grid grid-cols-2 gap-2">
              {state.codes.map(c => (
                <CodeCard key={c.id} code={c} onTap={() => setSheet({ type: 'edit', entry: c })} />
              ))}
            </div>
          </section>
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

function CodeCard({ code, onTap }: { code: CodebookEntry; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="flex flex-col items-start gap-1 px-3.5 py-3 rounded-[12px] bg-surface border border-line text-left active:bg-bg"
    >
      <span className="text-[15px] font-bold text-ink-900 leading-tight">{code.label}</span>
      <span className={`text-[11px] font-en leading-tight ${code.isOff ? 'text-warn' : 'text-ink-500'}`}>
        {code.isOff ? '휴무' : `${code.startTime ?? '--:--'} – ${code.endTime ?? '--:--'}`}
      </span>
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

  function submit() {
    const labelTrim = label.trim()
    if (!labelTrim) { setError('코드 이름을 입력해 주세요.'); return }
    if (labelTrim.length > MAX_LABEL) { setError(`코드 이름은 ${MAX_LABEL}자 이하로 해 주세요.`); return }
    if (!isOff) {
      if (!start || !end) { setError('시작·종료 시각을 입력해 주세요.'); return }
      if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) {
        setError('시간은 HH:MM 형식으로 입력해 주세요.'); return
      }
    }
    onSave({
      label: labelTrim,
      isOff,
      startTime: isOff ? undefined : start.trim(),
      endTime:   isOff ? undefined : end.trim(),
    })
  }

  return (
    <div className="px-5 pt-2 pb-7">
      <h3 className="text-[18px] font-bold tracking-tight text-ink-900">
        {initial ? '코드 편집' : '코드 추가'}
      </h3>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label className="block px-1 pb-1 text-[11px] font-semibold tracking-wide text-ink-500">
            코드 이름
          </label>
          <input
            value={label}
            onChange={e => { setLabel(e.target.value); setError(null) }}
            placeholder="예: N, DO, 출장"
            maxLength={MAX_LABEL}
            className="w-full h-10 px-3 rounded-md border border-line bg-surface text-[15px] text-ink-900 outline-none"
          />
        </div>

        <label className="flex items-center justify-between px-3.5 py-3 rounded-md bg-surface border border-line">
          <span className="text-callout font-medium text-ink-900">휴무 코드</span>
          <input
            type="checkbox"
            checked={isOff}
            onChange={e => { setIsOff(e.target.checked); setError(null) }}
            className="w-5 h-5 accent-[var(--brand)]"
          />
        </label>

        {!isOff && (
          <div className="flex items-center gap-2">
            <input
              value={start}
              onChange={e => { setStart(normalizeTimeInput(e.target.value)); setError(null) }}
              placeholder="09:00"
              inputMode="numeric"
              maxLength={5}
              className="flex-1 h-10 px-3 rounded-md border border-line bg-surface font-en text-[15px] text-ink-900 outline-none"
            />
            <span className="font-en text-ink-300">→</span>
            <input
              value={end}
              onChange={e => { setEnd(normalizeTimeInput(e.target.value)); setError(null) }}
              placeholder="18:00"
              inputMode="numeric"
              maxLength={5}
              className="flex-1 h-10 px-3 rounded-md border border-line bg-surface font-en text-[15px] text-ink-900 outline-none"
            />
          </div>
        )}

        {error && <p className="text-caption text-danger">{error}</p>}
      </div>

      <div className="mt-5 flex gap-2.5">
        {onRemove && (
          <Button variant="outline" className="px-3" onClick={onRemove} aria-label="삭제">
            <CloseIcon size={14} />
          </Button>
        )}
        <Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button>
        <Button className="flex-1" onClick={submit}>{initial ? '저장' : '추가'}</Button>
      </div>
    </div>
  )
}
