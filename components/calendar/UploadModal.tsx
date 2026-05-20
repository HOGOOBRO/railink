'use client'

import { ChangeEvent, ReactNode, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, FileIcon, ImageIcon, EditIcon, ChevronLeftIcon,
  ChevronRightIcon, InfoIcon, CheckIcon, PlusIcon,
} from '@/components/ui/icons'
import { parseScheduleFile, type ParsedScheduleRow } from '@/lib/parse/schedule-file'
import { recognizeScheduleImage, type OcrProgress } from '@/lib/parse/schedule-image'

export type UploadMethod = 'file' | 'image' | 'manual'
type Step = 'pick' | 'preview' | 'manual'

interface UploadModalProps {
  step: Step
  defaultYear: number
  defaultMonth: number
  /** Existing rows for current month — used to pre-fill ManualBody on entry. */
  initialRows?: ParsedScheduleRow[]
  onPreview: () => void
  onManual: () => void
  onBack: () => void
  onClose: () => void
  onSave: (rows: ParsedScheduleRow[]) => void
}

const OPTIONS: {
  key: UploadMethod
  icon: ReactNode
  label: string
  sub: string
  meta: string
  primary?: boolean
}[] = [
  { key: 'file',   icon: <FileIcon size={22} />,  label: '엑셀 / CSV', sub: '회사 시스템에서 받은 표를 그대로 올리기', meta: '.xlsx · .xls · .csv', primary: true },
  { key: 'image',  icon: <ImageIcon size={22} />, label: '이미지',      sub: '스크린샷을 AI로 읽어서 등록',           meta: '.png · .jpg · .webp' },
  { key: 'manual', icon: <EditIcon size={22} />,  label: '직접 입력',   sub: '날짜별로 빈 표를 채워서 등록',          meta: '이번 달 전체 30일 폼' },
]

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

interface ManualRow {
  day: number       // 1..31
  dow: string       // 한글 요일
  dia?: string
  st?: string
  et?: string
  holiday?: boolean
  sun?: boolean
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function buildInitialManualRows(
  year: number, month: number, existing: ParsedScheduleRow[],
): ManualRow[] {
  const total = daysInMonth(year, month)
  const max = Math.min(12, total)
  const byDay = new Map<number, ParsedScheduleRow>()
  for (const r of existing) byDay.set(Number(r.date.slice(8, 10)), r)
  const rows: ManualRow[] = []
  for (let d = 1; d <= max; d++) {
    const dow = DOW_KR[new Date(year, month - 1, d).getDay()]
    const row: ManualRow = { day: d, dow }
    const hit = byDay.get(d)
    if (hit) {
      if (hit.isOff) {
        row.holiday = true
        row.sun = !!hit.diaNr && /주휴/.test(hit.diaNr)
      } else {
        row.dia = hit.diaNr
        row.st = hit.startTime
        row.et = hit.endTime
      }
    }
    rows.push(row)
  }
  return rows
}

function manualRowsToParsed(
  rows: ManualRow[], year: number, month: number,
): ParsedScheduleRow[] {
  const out: ParsedScheduleRow[] = []
  const yyyy = String(year)
  const mm = String(month).padStart(2, '0')
  for (const r of rows) {
    const filled = r.holiday || r.dia || r.st || r.et
    if (!filled) continue
    const date = `${yyyy}-${mm}-${String(r.day).padStart(2, '0')}`
    if (r.holiday) {
      out.push({ date, isOff: true, diaNr: r.sun ? 'S(주휴)' : 'S' })
    } else {
      out.push({
        date, isOff: false,
        diaNr: (r.dia || '').trim() || undefined,
        startTime: (r.st || '').trim() || undefined,
        endTime: (r.et || '').trim() || undefined,
      })
    }
  }
  return out
}

export function UploadModal({
  step, defaultYear, defaultMonth, initialRows = [],
  onPreview, onManual, onBack, onClose, onSave,
}: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedScheduleRow[]>([])
  const [busy, setBusy] = useState<'file' | 'image' | null>(null)
  const [ocr, setOcr] = useState<OcrProgress | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Manual-entry state — independent of file/image preview rows.
  const [manualRows, setManualRows] = useState<ManualRow[]>(
    () => buildInitialManualRows(defaultYear, defaultMonth, initialRows),
  )
  const monthTotal = useMemo(
    () => daysInMonth(defaultYear, defaultMonth), [defaultYear, defaultMonth],
  )
  const manualFilled = manualRows.filter(r => r.holiday || r.dia).length

  function setManualRow(i: number, patch: Partial<ManualRow>) {
    setManualRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function appendRemainingDays() {
    setManualRows(rs => {
      const start = rs.length + 1
      const more: ManualRow[] = []
      for (let d = start; d <= monthTotal; d++) {
        more.push({ day: d, dow: DOW_KR[new Date(defaultYear, defaultMonth - 1, d).getDay()] })
      }
      return [...rs, ...more]
    })
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy('file')
    setOcr(null)
    setOcrText('')
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(file.name)

    try {
      const parsed = await parseScheduleFile(file, defaultYear)
      setRows(parsed)
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 읽는 중 문제가 생겼어요.')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy('image')
    setOcr({ status: '이미지를 준비하고 있어요', progress: 0.02 })
    setOcrText('')
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(file.name)

    try {
      const result = await recognizeScheduleImage(file, defaultYear, defaultMonth, setOcr)
      setRows(result.rows)
      setOcrText(result.text)
      setNotice(`AI 인식 신뢰도 ${Math.round(result.confidence)}%. 저장 전 날짜와 시간을 확인해 주세요.`)
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 읽는 중 문제가 생겼어요.')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  function handleOption(key: UploadMethod) {
    setError(null)
    setNotice(null)
    if (key === 'file') { fileRef.current?.click(); return }
    if (key === 'image') { imageRef.current?.click(); return }
    onManual()
  }

  function handleSave() {
    if (step === 'manual') {
      const parsed = manualRowsToParsed(manualRows, defaultYear, defaultMonth)
      if (parsed.length === 0) {
        setError('하루 이상 입력한 뒤 저장해 주세요.')
        return
      }
      onSave(parsed)
      return
    }
    onSave(rows)
  }

  const previewRows = rows.slice(0, 20)
  const saveDisabled =
    step === 'pick' ||
    (step === 'preview' && rows.length === 0) ||
    (step === 'manual' && manualFilled === 0)

  const footerStatus =
    step === 'pick' ? '엑셀/CSV 파일을 선택해 주세요'
    : step === 'manual' ? '직접 입력 중'
    : `총 ${rows.length}건`

  return (
    <div
      className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-app-frame bg-surface z-[60] flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="sr-only"
        onChange={handleFileChange}
      />
      <input
        ref={imageRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={handleImageChange}
      />

      {/* Header */}
      <div className="h-topbar flex items-center justify-between pl-4 pr-1.5 border-b border-line shrink-0">
        <h3 className="text-subtitle font-bold tracking-tight text-ink-900">근무표 등록</h3>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {step === 'pick' && (
          <>
            <p className="text-callout text-ink-700 leading-relaxed mb-3.5">
              어떻게 등록할까요? 회사에서 받은{' '}
              <strong className="text-ink-900">엑셀 또는 CSV 파일</strong>을 올리면
              날짜·다이번호·열번·출퇴근시각을 자동으로 읽어요.
            </p>
            <div className="grid gap-2.5">
              {OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => handleOption(o.key)}
                  disabled={!!busy}
                  className={`flex items-center gap-3.5 p-3.5 rounded-lg text-left border-[1.5px] ${
                    o.primary
                      ? 'border-brand bg-brand-050 shadow-sh1'
                      : 'border-line bg-surface'
                  } ${busy ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <div
                    className={`w-11 h-11 rounded-md grid place-items-center shrink-0 ${
                      o.primary ? 'bg-brand text-ink-on-brand' : 'bg-bg text-ink-700'
                    }`}
                  >
                    {o.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-callout text-ink-900">{o.label}</span>
                      {o.primary && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-brand-050 text-brand">
                          추천
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-ink-500 mt-0.5 leading-snug">{o.sub}</p>
                    <p className={`font-en text-[11px] font-semibold mt-1 ${o.primary ? 'text-brand' : 'text-ink-500'}`}>
                      {o.meta}
                    </p>
                  </div>
                  <span className={o.primary ? 'text-brand' : 'text-ink-500'}>
                    <ChevronRightIcon size={16} />
                  </span>
                </button>
              ))}
            </div>

            {busy === 'file' && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span><strong>{fileName}</strong> 파일을 읽고 있어요.</span>
              </StatusBox>
            )}
            {busy === 'image' && (
              <div className="mt-4 px-3.5 py-3 rounded-md bg-bg text-caption text-ink-700 leading-relaxed">
                <div className="flex items-center gap-2">
                  <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                  <span>
                    <strong>{fileName}</strong> · {ocr?.status ?? '이미지를 분석하고 있어요'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-pill bg-line overflow-hidden">
                  <div
                    className="h-full rounded-pill bg-brand transition-[width] duration-200"
                    style={{ width: `${Math.round((ocr?.progress ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {error && (
              <StatusBox tone="danger">
                <span className="font-bold shrink-0">!</span>
                <span>{error}</span>
              </StatusBox>
            )}
            {notice && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>{notice}</span>
              </StatusBox>
            )}
            {!busy && !error && !notice && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>엑셀/CSV는 컬럼을 읽고, 이미지는 AI가 캘린더 내용을 해석해 근무 행을 찾아요.</span>
              </StatusBox>
            )}
          </>
        )}

        {step === 'preview' && (
          <>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-caption text-ink-500 mb-2.5"
            >
              <ChevronLeftIcon size={14} /> 입력 방식
              <span className="text-ink-300">·</span>
              <span className="text-ink-900 font-semibold inline-flex items-center gap-1">
                <FileIcon size={14} /> 엑셀 / CSV
              </span>
            </button>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-callout" style={{ background: '#DCFCE7', color: '#166534' }}>
              <span className="shrink-0 text-success"><CheckIcon size={16} /></span>
              <div>
                <strong>{fileName || '근무표 파일'}</strong> ·{' '}
                <span className="font-en">{rows.length}건 인식</span>
              </div>
            </div>

            <div className="mt-3 border border-line rounded-md overflow-hidden">
              <div className="grid grid-cols-[74px_1fr_60px_60px] bg-bg px-2.5 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
                <span>사업일자</span><span>다이/열번</span><span>출근</span><span>퇴근</span>
              </div>
              {previewRows.map((r, i) => (
                <div
                  key={`${r.date}-${i}`}
                  className={`grid grid-cols-[74px_1fr_60px_60px] px-2.5 py-2.5 items-center font-en text-caption ${
                    i < previewRows.length - 1 ? 'border-b border-line' : ''
                  } ${r.isOff ? 'bg-surface-2 text-ink-500' : 'bg-surface text-ink-900'}`}
                >
                  <span>{r.date.slice(5)}</span>
                  <span className="flex gap-1.5 items-center min-w-0">
                    <strong className={`font-bold ${r.isOff ? 'text-warn' : 'text-ink-900'}`}>
                      {r.diaNr || '—'}
                    </strong>
                    {!r.isOff && r.trainNr && <span className="text-ink-500 truncate">{r.trainNr}</span>}
                  </span>
                  <span>{r.startTime || '—'}</span>
                  <span>{r.endTime || '—'}</span>
                </div>
              ))}
            </div>
            {rows.length > previewRows.length && (
              <p className="mt-2 text-caption text-ink-500">
                미리보기는 처음 <span className="font-en">{previewRows.length}</span>건만 표시해요.
              </p>
            )}
            {ocrText && (
              <details className="mt-3 rounded-md border border-line bg-bg px-3 py-2">
                <summary className="cursor-pointer text-caption font-semibold text-ink-700">
                  AI 인식 원문 확인
                </summary>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-en text-[10px] leading-4 text-ink-500">
                  {ocrText}
                </pre>
              </details>
            )}
          </>
        )}

        {step === 'manual' && (
          <ManualBody
            rows={manualRows}
            year={defaultYear}
            month={defaultMonth}
            filled={manualFilled}
            total={monthTotal}
            onBack={onBack}
            onChange={setManualRow}
            onAppendRest={appendRemainingDays}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2.5 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] border-t border-line bg-surface shrink-0">
        <span className="flex-1 text-caption text-ink-500">{footerStatus}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
        <Button
          variant={step === 'pick' ? 'outline' : 'primary'}
          size="sm"
          disabled={saveDisabled}
          onClick={handleSave}
        >
          저장
        </Button>
      </div>
    </div>
  )
}

function StatusBox({ tone, children }: { tone: 'info' | 'danger'; children: ReactNode }) {
  return (
    <div
      className={`mt-4 flex items-center gap-2 px-3.5 py-3 rounded-md text-caption leading-relaxed ${
        tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : 'bg-bg text-ink-700'
      }`}
    >
      {children}
    </div>
  )
}

interface ManualBodyProps {
  rows: ManualRow[]
  year: number
  month: number
  filled: number
  total: number
  onBack: () => void
  onChange: (i: number, patch: Partial<ManualRow>) => void
  onAppendRest: () => void
}

function ManualBody({
  rows, year, month, filled, total, onBack, onChange, onAppendRest,
}: ManualBodyProps) {
  return (
    <>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-caption text-ink-500 mb-2.5"
      >
        <ChevronLeftIcon size={14} /> 입력 방식
        <span className="text-ink-300">·</span>
        <span className="text-ink-900 font-semibold inline-flex items-center gap-1">
          <EditIcon size={14} /> 직접 입력
        </span>
      </button>

      <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-brand-050 text-brand-700 text-caption mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-brand shrink-0"><EditIcon size={14} /></span>
          <span>
            {year}년 {month}월 ·{' '}
            <strong className="font-en">{filled}/{rows.length}</strong>일 입력됨
          </span>
        </div>
      </div>

      <div className="border border-line rounded-md overflow-hidden">
        <div className="grid grid-cols-[64px_1fr] bg-bg px-3 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
          <span>날짜</span><span>다이 · 출근 · 퇴근</span>
        </div>
        {rows.map((r, i) => {
          const dowColor =
            r.dow === '일' ? 'text-danger'
            : r.dow === '토' ? 'text-c1'
            : 'text-ink-500'
          return (
            <div
              key={r.day}
              className={`grid grid-cols-[64px_1fr] items-center px-3 py-2.5 ${
                i < rows.length - 1 ? 'border-b border-line' : ''
              } ${r.holiday ? 'bg-surface-2' : 'bg-surface'}`}
            >
              <div className="font-en text-caption text-ink-900 leading-tight">
                <div>{String(month).padStart(2, '0')}-{String(r.day).padStart(2, '0')}</div>
                <div className={`text-[10px] ${dowColor}`}>{r.dow}</div>
              </div>
              {r.holiday ? (
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold text-[11px] tracking-wide px-2 py-0.5 rounded-pill"
                    style={{ background: '#FEF3C7', color: '#92400E' }}
                  >
                    휴무
                  </span>
                  <span className="text-caption text-ink-500 font-en">
                    {r.sun ? 'S(주휴)' : 'S'}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => onChange(i, { holiday: false, sun: false })}
                    className="font-en text-[11px] font-bold text-brand"
                  >
                    근무로
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    value={r.dia ?? ''}
                    placeholder="H----"
                    onChange={e => onChange(i, { dia: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.dia ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 84 }}
                  />
                  <input
                    value={r.st ?? ''}
                    placeholder="시작"
                    onChange={e => onChange(i, { st: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.st ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 62 }}
                  />
                  <span className="text-ink-300 font-en">→</span>
                  <input
                    value={r.et ?? ''}
                    placeholder="종료"
                    onChange={e => onChange(i, { et: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.et ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 62 }}
                  />
                  <div className="flex-1" />
                  <button
                    onClick={() => onChange(i, { holiday: true, dia: undefined, st: undefined, et: undefined })}
                    className="font-en text-[11px] font-bold text-brand"
                  >
                    휴무
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {rows.length < total && (
        <button
          onClick={onAppendRest}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-md border border-dashed border-line-2 bg-surface text-callout font-semibold text-ink-700"
        >
          <PlusIcon size={14} />
          {rows.length + 1}일~{total}일 추가하기
        </button>
      )}
    </>
  )
}
