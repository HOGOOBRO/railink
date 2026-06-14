'use client'

import { ChangeEvent, CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, FileIcon, ImageIcon, EditIcon, ChevronLeftIcon,
  ChevronRightIcon, InfoIcon, CheckIcon, PlusIcon, EraserIcon,
} from '@/components/ui/icons'
import { parseScheduleFile, type ParsedScheduleRow } from '@/lib/parse/schedule-file'
import { recognizeScheduleImage, type OcrProgress } from '@/lib/parse/schedule-image'
import { fmtClock, hmToDecimal, canonicalEnd, isOvernight, normalizeTimeInput } from '@/lib/schedule-utils'
import { getCodebook, type CodebookEntry } from '@/lib/store/codebook'
import { AnalyzeTableSkeleton } from '@/components/calendar/AnalyzeTableSkeleton'
import Link from 'next/link'

// Show overnight ends as a real next-day clock ("11:49") in the editable preview
// instead of 24+ notation ("35:49"); the +24 is re-derived on save (see
// normalizePreviewRows). Same-day ends are unchanged.
function displayPreviewRows(rows: ParsedScheduleRow[]): ParsedScheduleRow[] {
  return rows.map(r =>
    !r.isOff && r.endTime ? { ...r, endTime: fmtClock(hmToDecimal(r.endTime)) } : r,
  )
}

export type UploadMethod = 'file' | 'image' | 'manual'
type Step = 'pick' | 'preview' | 'manual'
type ManualCategory = 'ktx' | 'general'

// Inline glyphs from the upload handoff — kept local to this file because
// they only appear here. SparkleGlyph signals AI assist, CameraGlyph drives
// the primary hero tile.
function SparkleGlyph({ size = 14, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5 10.3 11.2 5 9.5l5.3-1.7L12 2.5z" />
      <path d="M19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  )
}
function CameraGlyph({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 7h3l2-2.5h8L18 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

interface UploadModalProps {
  step: Step
  defaultYear: number
  defaultMonth: number
  /** Existing rows for current month — used to pre-fill ManualBody on entry. */
  initialRows?: ParsedScheduleRow[]
  /** Real-account full name; passed to AI image OCR so a team roster (여러 사람
   *  row) can be filtered down to just the user's row. */
  userName?: string
  /** Owner uid — used by ManualBody to load the per-user codebook (코드 palette). */
  userId?: string
  /** Personal (비-KTX) 계정: 등록 화면에서 직접입력을 hero로 올리고, 직접입력
   *  기본 카테고리를 '일반 근무'로 전환한다 (KTX 다이 입력은 부차적). */
  isPersonal?: boolean
  onPreview: () => void
  onManual: () => void
  onBack: () => void
  onClose: () => void
  onSave: (rows: ParsedScheduleRow[]) => Promise<void> | void
}

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

interface ManualRow {
  day: number       // 1..31
  dow: string       // 한글 요일
  dia?: string
  tr?: string       // 열번 (대표열번1 · 대표열번2)
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
  // Editing an existing schedule loads the WHOLE month so every saved day is visible
  // and editable. This is critical: save replaces the entire month, so any existing
  // day not loaded here (e.g. 13~말일) would be silently wiped. A blank first-time
  // entry stays capped at 12 rows (+ "행 추가") to avoid overwhelming the input.
  const max = existing.length ? total : Math.min(12, total)
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
        row.tr = hit.trainNr
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
    const filled = r.holiday || r.dia || r.tr || r.st || r.et
    if (!filled) continue
    const date = `${yyyy}-${mm}-${String(r.day).padStart(2, '0')}`
    if (r.holiday) {
      out.push({ date, isOff: true, diaNr: r.sun ? 'S(주휴)' : 'S' })
    } else {
      out.push({
        date, isOff: false,
        diaNr: (r.dia || '').trim() || undefined,
        trainNr: (r.tr || '').trim() || undefined,
        startTime: (r.st || '').trim() || undefined,
        endTime: (r.et || '').trim() || undefined,
      })
    }
  }
  return out
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizePreviewRows(rows: ParsedScheduleRow[]): ParsedScheduleRow[] {
  const byDate = new Map<string, ParsedScheduleRow>()
  for (const row of rows) {
    const date = row.date.trim()
    if (!isIsoDate(date)) {
      throw new Error('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.')
    }

    const isOff = Boolean(row.isOff)
    const next: ParsedScheduleRow = isOff
      ? {
          date,
          isOff: true,
          diaNr: row.diaNr?.trim() || 'S',
        }
      : {
          date,
          isOff: false,
          diaNr: row.diaNr?.trim() || undefined,
          trainNr: row.trainNr?.trim() || undefined,
          startTime: row.startTime?.trim() || undefined,
          // Re-derive 24+ notation for overnight ends from the wrapped clock the
          // user edited, so storage stays canonical even though the input showed "11:49".
          endTime: canonicalEnd(row.startTime?.trim() || undefined, row.endTime?.trim() || undefined),
        }

    const filled = next.isOff || next.diaNr || next.trainNr || next.startTime || next.endTime
    if (filled) byDate.set(date, next)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function nextPreviewDate(rows: ParsedScheduleRow[], year: number, month: number): string {
  const usedDays = new Set(rows.map(row => Number(row.date.slice(8, 10))).filter(Number.isFinite))
  const total = daysInMonth(year, month)
  for (let day = 1; day <= total; day++) {
    if (!usedDays.has(day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(total).padStart(2, '0')}`
}

export function UploadModal({
  step, defaultYear, defaultMonth, initialRows = [], userName, userId, isPersonal = false,
  onPreview, onManual, onBack, onClose, onSave,
}: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [sourceLabel, setSourceLabel] = useState('엑셀 / CSV')
  const [rows, setRows] = useState<ParsedScheduleRow[]>([])
  const [busy, setBusy] = useState<'file' | 'image' | null>(null)
  const [ocr, setOcr] = useState<OcrProgress | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Manual-entry state — independent of file/image preview rows.
  const [manualRows, setManualRows] = useState<ManualRow[]>(
    () => buildInitialManualRows(defaultYear, defaultMonth, initialRows),
  )
  const [manualCategory, setManualCategory] = useState<ManualCategory>(isPersonal ? 'general' : 'ktx')

  // 일반 카테고리 첫 활성 시 한 달 전체로 펼치기만 한다 (칩으로 칠할 날들이 다
  // 보이게). 자동 채움은 하지 않는다 — 사용자가 안 건드린 빈 날이 멋대로 근무로
  // 저장되지 않도록. 규칙 근무는 아래 "평일 09–18 일괄 채우기" 버튼으로 opt-in.
  const expandedGeneralRef = useRef(false)
  useEffect(() => {
    if (manualCategory !== 'general' || expandedGeneralRef.current) return
    expandedGeneralRef.current = true
    const total = daysInMonth(defaultYear, defaultMonth)
    setManualRows(rs => {
      if (rs.length >= total) return rs
      const expanded = [...rs]
      for (let d = expanded.length + 1; d <= total; d++) {
        expanded.push({
          day: d,
          dow: DOW_KR[new Date(defaultYear, defaultMonth - 1, d).getDay()],
        })
      }
      return expanded
    })
  }, [manualCategory, defaultYear, defaultMonth])

  // opt-in 일괄 채우기: 빈 평일만 09:00–18:00로. 이미 채운 날·주말·휴무는 보존.
  function fillWeekdays() {
    setManualRows(rs => rs.map(r => {
      if (r.holiday || r.dia || r.tr || r.st || r.et) return r
      if (r.dow === '토' || r.dow === '일') return r
      return { ...r, st: '09:00', et: '18:00' }
    }))
  }
  const monthTotal = useMemo(
    () => daysInMonth(defaultYear, defaultMonth), [defaultYear, defaultMonth],
  )
  // 일반 근무는 dia 없이 시간만 채울 수 있으니 st/et 도 filled로 인정.
  const manualFilled = manualRows.filter(r => r.holiday || r.dia || r.tr || r.st || r.et).length

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
    setSourceLabel('엑셀 / CSV')

    try {
      const parsed = await parseScheduleFile(file, defaultYear)
      setRows(displayPreviewRows(parsed))
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 읽는 중 문제가 생겼어요.')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    setBusy('image')
    setOcr({
      status: files.length > 1 ? `이미지 ${files.length}장을 준비하고 있어요` : '이미지를 준비하고 있어요',
      progress: 0.02,
    })
    setOcrText('')
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(files.length === 1 ? files[0].name : `${files[0].name} 외 ${files.length - 1}장`)
    setSourceLabel('이미지')

    try {
      const result = await recognizeScheduleImage(files, defaultYear, defaultMonth, setOcr, userName)
      setRows(displayPreviewRows(result.rows))
      setOcrText(result.text)
      const usageText = result.usage
        ? ` 이번 달 ${result.usage.used}/${result.usage.limit}회 사용.`
        : ''
      const periodText = result.period
        ? result.period.source === 'image'
          ? ` 이미지에서 ${result.period.year}년 ${result.period.month}월로 읽었어요.`
          : ` 월 표기가 불명확해 현재 화면의 ${result.period.year}년 ${result.period.month}월 기준으로 읽었어요.`
        : ''
      setNotice(`AI 인식 신뢰도 ${Math.round(result.confidence)}%.${periodText} 여러 장을 올린 경우 겹치는 날짜는 병합했어요.${usageText}`)
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

  async function handleSave() {
    let parsed: ParsedScheduleRow[]
    try {
      parsed = step === 'manual'
        ? manualRowsToParsed(manualRows, defaultYear, defaultMonth)
        : normalizePreviewRows(rows)
      if (parsed.length === 0) {
        setError(step === 'manual' ? '하루 이상 입력한 뒤 저장해 주세요.' : '저장할 근무 행이 없어요.')
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '입력한 값을 확인해 주세요.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '근무표 저장 중 문제가 생겼어요.')
    } finally {
      setSaving(false)
    }
  }

  function setPreviewRow(i: number, patch: Partial<ParsedScheduleRow>) {
    setRows(current => current.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  }

  function removePreviewRow(i: number) {
    setRows(current => current.filter((_, idx) => idx !== i))
  }

  function appendPreviewRow() {
    setRows(current => [
      ...current,
      { date: nextPreviewDate(current, defaultYear, defaultMonth), isOff: false },
    ])
  }

  const previewRows = rows
  const saveDisabled =
    saving ||
    step === 'pick' ||
    (step === 'preview' && rows.length === 0) ||
    (step === 'manual' && manualFilled === 0)

  const footerStatus =
    saving ? 'Supabase에 저장하고 확인 중'
    : step === 'pick' ? '입력 방식을 골라 주세요'
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
        multiple
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
            <h4 className="text-[22px] font-bold tracking-tight text-ink-900 leading-tight mb-1.5">
              {isPersonal ? '근무 일정을 등록해 주세요' : '근무표 사진을 올려 주세요'}
            </h4>
            <p className="text-[13.5px] text-ink-500 leading-relaxed mb-4">
              {isPersonal
                ? '직접 입력으로 빠르게 추가하거나, 사진·파일로도 등록할 수 있어요.'
                : 'AI가 날짜·다이·출퇴근 시각을 읽어서 자동으로 채워 드려요.'}
            </p>

            {isPersonal ? (
              /* Primary hero — 직접 입력. 일반계정은 KTX 다이 인식이 무의미하므로
                 직접입력을 hero로 올리고 사진은 부차 메서드로 강등. */
              <button
                onClick={() => handleOption('manual')}
                disabled={!!busy}
                className={`w-full flex items-center gap-3 p-[18px] rounded-[16px] bg-brand-500 text-ink-on-brand text-left ${
                  busy ? 'opacity-70 cursor-wait' : 'active:scale-[.99]'
                }`}
              >
                <span
                  className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.16)' }}
                >
                  <EditIcon size={22} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[16px] font-bold leading-none">직접 입력</span>
                  <span className="block mt-1 text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    날짜별 근무 시간을 빠르게 입력해요
                  </span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }} className="shrink-0">
                  <ChevronRightIcon size={18} />
                </span>
              </button>
            ) : (
              /* Primary hero — image (AI). Card color = brand-500 (사용자 요청: 0.5 톤). */
              <button
                onClick={() => handleOption('image')}
                disabled={!!busy}
                className={`w-full flex items-center gap-3 p-[18px] rounded-[16px] bg-brand-500 text-ink-on-brand text-left ${
                  busy ? 'opacity-70 cursor-wait' : 'active:scale-[.99]'
                }`}
              >
                <span
                  className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.16)' }}
                >
                  <CameraGlyph size={22} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <SparkleGlyph size={14} className="shrink-0" style={{ color: '#FFD9B8' }} />
                    <span className="text-[16px] font-bold leading-none">사진으로 등록</span>
                  </span>
                  <span className="block mt-1 text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    AI가 자동으로 채워드려요 · 촬영·앨범 모두 가능
                  </span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }} className="shrink-0">
                  <ChevronRightIcon size={18} />
                </span>
              </button>
            )}

            {/* "또는" divider */}
            <div className="my-5 flex items-center gap-2.5">
              <span className="flex-1 h-px bg-line" />
              <span className="text-[11px] font-semibold tracking-wider text-ink-300">또는</span>
              <span className="flex-1 h-px bg-line" />
            </div>

            {/* Secondary methods — 일반계정은 직접입력이 hero라 사진/파일을 부차로 */}
            <div className="grid gap-2">
              {isPersonal ? (
                <>
                  <SecondaryMethod
                    icon={<ImageIcon size={18} />}
                    label="사진으로 등록"
                    sub="근무표 사진을 AI가 읽어드려요"
                    onClick={() => handleOption('image')}
                    disabled={!!busy}
                  />
                  <SecondaryMethod
                    icon={<FileIcon size={18} />}
                    label="엑셀 / CSV 파일"
                    sub="회사에서 받은 .xlsx · .csv 업로드"
                    onClick={() => handleOption('file')}
                    disabled={!!busy}
                  />
                </>
              ) : (
                <>
                  <SecondaryMethod
                    icon={<FileIcon size={18} />}
                    label="엑셀 / CSV 파일"
                    sub="회사에서 받은 .xlsx · .csv 업로드"
                    onClick={() => handleOption('file')}
                    disabled={!!busy}
                  />
                  <SecondaryMethod
                    icon={<EditIcon size={18} />}
                    label="직접 입력"
                    sub="KTX 승무 · 일반 근무 모두 가능"
                    onClick={() => handleOption('manual')}
                    disabled={!!busy}
                  />
                </>
              )}
            </div>

            {busy === 'file' && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span><strong>{fileName}</strong> 파일을 읽고 있어요.</span>
              </StatusBox>
            )}
            {busy === 'image' && (
              <>
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
                  {ocr?.hint && (
                    <p className="mt-2 text-ink-500">
                      {ocr.hint}
                    </p>
                  )}
                </div>
                {/* ③ 채워질 미리보기 표 모양 스켈레톤 — 진행률 표시는 위에 유지. */}
                <AnalyzeTableSkeleton />
              </>
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
                {sourceLabel === '이미지' ? <ImageIcon size={14} /> : <FileIcon size={14} />}
                {sourceLabel}
              </span>
            </button>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-callout" style={{ background: '#DCFCE7', color: '#166534' }}>
              <span className="shrink-0 text-success"><CheckIcon size={16} /></span>
              <div>
                <strong>{fileName || '근무표 파일'}</strong> ·{' '}
                <span className="font-en">{rows.length}건 인식</span>
              </div>
            </div>

            <PreviewBody
              rows={previewRows}
              onChange={setPreviewRow}
              onRemove={removePreviewRow}
              onAppend={appendPreviewRow}
            />
            {saving && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>Supabase에 저장하고 저장 건수를 확인하고 있어요.</span>
              </StatusBox>
            )}
            {error && (
              <StatusBox tone="danger">
                <span className="font-bold shrink-0">!</span>
                <span>{error}</span>
              </StatusBox>
            )}
            {notice && !error && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>{notice}</span>
              </StatusBox>
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
          <>
            <ManualBody
              rows={manualRows}
              year={defaultYear}
              month={defaultMonth}
              filled={manualFilled}
              total={monthTotal}
              category={manualCategory}
              isPersonal={isPersonal}
              userId={userId}
              onCategoryChange={setManualCategory}
              onBack={onBack}
              onChange={setManualRow}
              onAppendRest={appendRemainingDays}
              onFillWeekdays={fillWeekdays}
            />
            {saving && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>Supabase에 저장하고 저장 건수를 확인하고 있어요.</span>
              </StatusBox>
            )}
            {error && (
              <StatusBox tone="danger">
                <span className="font-bold shrink-0">!</span>
                <span>{error}</span>
              </StatusBox>
            )}
          </>
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
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}

function SecondaryMethod({
  icon, label, sub, onClick, disabled,
}: { icon: ReactNode; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[12px] border border-line bg-surface text-left ${
        disabled ? 'opacity-60 cursor-wait' : 'active:bg-bg'
      }`}
    >
      <span className="w-9 h-9 rounded-[10px] bg-bg text-ink-700 grid place-items-center shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold text-ink-900 leading-none">{label}</span>
        <span className="block mt-1 text-[11px] text-ink-300 leading-snug">{sub}</span>
      </span>
      <span className="text-ink-300 shrink-0"><ChevronRightIcon size={16} /></span>
    </button>
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
  category: ManualCategory
  /** Personal 계정: 직군(KTX/일반) 토글을 숨기고 일반 근무로 고정. */
  isPersonal: boolean
  /** Owner uid — used to load the per-user codebook for the paint palette. */
  userId?: string
  onCategoryChange: (next: ManualCategory) => void
  onBack: () => void
  onChange: (i: number, patch: Partial<ManualRow>) => void
  onAppendRest: () => void
  /** 일반 모드 opt-in: 빈 평일을 09–18로 일괄 채움. */
  onFillWeekdays: () => void
}

interface PreviewBodyProps {
  rows: ParsedScheduleRow[]
  onChange: (i: number, patch: Partial<ParsedScheduleRow>) => void
  onRemove: (i: number) => void
  onAppend: () => void
}

function PreviewBody({ rows, onChange, onRemove, onAppend }: PreviewBodyProps) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-caption font-semibold text-ink-500">
          저장 전 날짜와 시간을 직접 수정할 수 있어요.
        </p>
        <button
          type="button"
          onClick={onAppend}
          className="inline-flex items-center gap-1 text-caption font-bold text-brand"
        >
          <PlusIcon size={13} /> 행 추가
        </button>
      </div>

      <div className="border border-line rounded-md overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={`${row.date}-${i}`}
            className={`px-3 py-3 ${
              i < rows.length - 1 ? 'border-b border-line' : ''
            } ${row.isOff ? 'bg-surface-2' : 'bg-surface'}`}
          >
            <div className="flex items-center gap-2">
              <input
                value={row.date}
                onChange={e => onChange(i, { date: e.target.value })}
                aria-label="사업일자"
                className="font-en text-caption text-ink-900 outline-none px-2 h-8 rounded-xs border border-line bg-bg"
                style={{ width: 106 }}
              />
              <label className="shrink-0 inline-flex items-center gap-1.5 text-caption font-semibold text-ink-700">
                <input
                  type="checkbox"
                  checked={row.isOff}
                  onChange={e => onChange(i, {
                    isOff: e.target.checked,
                    startTime: e.target.checked ? undefined : row.startTime,
                    endTime: e.target.checked ? undefined : row.endTime,
                  })}
                  className="w-4 h-4 accent-[var(--brand)]"
                />
                휴무
              </label>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="w-8 h-8 grid place-items-center rounded-full text-ink-500 hover:bg-bg"
                aria-label={`${row.date} 행 삭제`}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_1fr_62px_62px] gap-1.5">
              <input
                value={row.diaNr ?? ''}
                placeholder={row.isOff ? 'S' : '다이'}
                onChange={e => onChange(i, { diaNr: e.target.value })}
                className="min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg"
              />
              <input
                value={row.trainNr ?? ''}
                placeholder="열번"
                disabled={row.isOff}
                onChange={e => onChange(i, { trainNr: e.target.value })}
                className="min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
              />
              <input
                value={row.startTime ?? ''}
                placeholder="시작"
                disabled={row.isOff}
                inputMode="numeric"
                maxLength={5}
                onChange={e => onChange(i, { startTime: normalizeTimeInput(e.target.value) })}
                className="font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
              />
              <input
                value={row.endTime ?? ''}
                placeholder="종료"
                disabled={row.isOff}
                inputMode="numeric"
                maxLength={5}
                onChange={e => onChange(i, { endTime: normalizeTimeInput(e.target.value) })}
                className="font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
              />
            </div>

            {!row.isOff && isOvernight(row.startTime, row.endTime) && (
              <span className="mt-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-brand-050 text-brand">
                종료 시각은 다음날 (익일)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Code palette / paint mode:
// When the user picks a chip the row inputs are replaced with a single tap
// target. Tapping a row applies the chip's preset to that day; tapping the
// chip again clears the active state and the row inputs come back.
type ActiveCode =
  | { kind: 'eraser' }
  | { kind: 'code'; id: string; code: CodebookEntry }
  | null

function applyCodeToRow(active: ActiveCode): Partial<ManualRow> | null {
  if (!active) return null
  if (active.kind === 'eraser') {
    return { holiday: false, sun: false, dia: undefined, st: undefined, et: undefined }
  }
  const c = active.code
  if (c.isOff) {
    return { holiday: true, sun: false, dia: c.label, st: undefined, et: undefined }
  }
  return { holiday: false, sun: false, dia: c.label, st: c.startTime, et: c.endTime }
}

function activeKey(active: ActiveCode): string | null {
  if (!active) return null
  return active.kind === 'eraser' ? 'eraser' : active.id
}

function ManualBody({
  rows, year, month, filled, total, category, isPersonal, userId, onCategoryChange,
  onBack, onChange, onAppendRest, onFillWeekdays,
}: ManualBodyProps) {
  const headerLabel = category === 'ktx' ? '다이 · 출근 · 퇴근' : '근무'

  // Codebook is only used in the general category (KTX cells need a
  // month-specific 다이 number that can't be preset).
  const [codes, setCodes] = useState<CodebookEntry[]>([])
  useEffect(() => {
    if (!userId || category !== 'general') { setCodes([]); return }
    setCodes(getCodebook(userId).codes)
  }, [userId, category])

  const [active, setActive] = useState<ActiveCode>(null)
  useEffect(() => { if (codes.length === 0) setActive(null) }, [codes.length])

  function pickChip(next: ActiveCode) {
    setActive(cur => {
      if (!cur || !next) return next
      if (activeKey(cur) === activeKey(next)) return null
      return next
    })
  }

  function paintRow(i: number) {
    const patch = applyCodeToRow(active)
    if (patch) onChange(i, patch)
  }

  // Find the codebook entry that matches a row's stored label, for the
  // general-mode "code applied" cell render.
  function codeFor(r: ManualRow): CodebookEntry | null {
    if (!r.dia) return null
    return codes.find(c => c.label === r.dia) ?? null
  }

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

      <div className="flex items-center justify-between px-3 py-2.5 rounded-[12px] bg-brand-050 text-brand-700 text-caption mb-3">
        <div className="flex items-center gap-2">
          <span className="text-brand shrink-0"><EditIcon size={14} /></span>
          <span>
            {year}년 {month}월 ·{' '}
            <strong className="font-en">{filled}/{rows.length}</strong>일 입력됨
          </span>
        </div>
      </div>

      {/* Category picker — 직군. Personal 계정은 KTX 승무(다이번호) 모드가
          무의미하므로 토글을 숨기고 일반 근무로 고정한다 (manualCategory 기본값이
          이미 general). KTX 계정만 두 직군을 오갈 수 있다. */}
      {!isPersonal && (
        <>
          <p className="px-1 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-ink-300">직군</p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <CategoryChip
              active={category === 'ktx'}
              title="KTX 승무"
              sub="다이 + 출퇴근"
              onClick={() => onCategoryChange('ktx')}
            />
            <CategoryChip
              active={category === 'general'}
              title="일반 근무"
              sub="출퇴근만"
              onClick={() => onCategoryChange('general')}
            />
          </div>
        </>
      )}

      {/* KTX 안내 strip — 다이번호 직접 입력 모드 */}
      {category === 'ktx' && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-bg rounded-[12px] text-caption text-ink-700 leading-relaxed">
          <span className="text-ink-300 shrink-0 mt-px"><InfoIcon size={14} /></span>
          <span>
            날짜마다 다이번호와 출·퇴근 시각을 직접 입력해 주세요.
            쉬는 날은 <strong className="text-ink-900">휴무</strong>로 바꿀 수 있어요.
          </span>
        </div>
      )}

      {/* Code palette — 일반 모드 전용. 칩 + 구분선 + 지우개 + 활성 hint. */}
      {category === 'general' && (
        <div className="mb-3">
          {codes.length === 0 ? (
            <Link
              href="/settings/codebook?from=calendar"
              className="flex items-center justify-between px-3.5 py-3 rounded-[12px] border border-dashed border-line-2 bg-surface text-caption text-ink-500"
            >
              <span>
                <strong className="text-ink-700">내 근무 코드</strong>를 등록해 두면
                탭만으로 입력할 수 있어요.
              </span>
              <span className="text-brand font-semibold shrink-0 ml-2">설정 →</span>
            </Link>
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5 pb-1.5">
                <p className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
                  근무 코드
                </p>
                <Link
                  href="/settings/codebook?from=calendar"
                  className="inline-flex items-center gap-1 text-caption font-semibold text-brand"
                >
                  <EditIcon size={13} /> 코드 관리
                </Link>
              </div>

              {/* horizontally scrollable: chips + divider + eraser */}
              <div className="flex items-stretch gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {codes.map(c => (
                  <CodeChip
                    key={c.id}
                    code={c}
                    active={activeKey(active) === c.id}
                    onClick={() => pickChip({ kind: 'code', id: c.id, code: c })}
                  />
                ))}
                <div className="w-px bg-line my-0.5 shrink-0" />
                <EraserChip
                  active={activeKey(active) === 'eraser'}
                  onClick={() => pickChip({ kind: 'eraser' })}
                />
              </div>

              {/* active-tool hint */}
              <div className="mt-2 flex items-center gap-1.5 text-caption text-ink-700">
                {active?.kind === 'eraser' ? (
                  <>
                    <span className="text-danger"><EraserIcon size={13} /></span>
                    지우는 중 — 비울 날짜를 탭하세요
                  </>
                ) : active?.kind === 'code' ? (
                  <>
                    <span className="font-en font-bold text-brand">{active.code.label}</span>
                    {' '}칠하는 중 — 적용할 날짜를 탭하세요
                  </>
                ) : (
                  <>
                    <span className="text-ink-300 shrink-0"><InfoIcon size={13} /></span>
                    <span className="text-ink-500">위 코드 칩을 고른 뒤, 아래 날짜를 탭하면 적용돼요</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {category === 'general' && (
        <button
          type="button"
          onClick={onFillWeekdays}
          className="mb-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] border border-line-2 bg-surface text-caption font-semibold text-ink-700 active:bg-bg"
        >
          평일 09:00~18:00 일괄 채우기
        </button>
      )}

      <div className="border border-line rounded-[12px] overflow-hidden">
        <div className="grid grid-cols-[56px_1fr] bg-bg px-3 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
          <span>날짜</span><span>{headerLabel}</span>
        </div>
        {rows.map((r, i) => {
          const dowColor =
            r.dow === '일' ? 'text-danger'
            : r.dow === '토' ? 'text-c1'
            : 'text-ink-500'

          // ─── general mode: chip-paint cell (always a button) ─────────
          if (category === 'general') {
            const code = codeFor(r)
            return (
              <button
                key={r.day}
                onClick={() => paintRow(i)}
                disabled={!active}
                className={`w-full grid grid-cols-[56px_1fr] items-center px-3 py-3 text-left ${
                  i < rows.length - 1 ? 'border-b border-line' : ''
                } ${(code?.isOff || r.holiday) ? 'bg-surface-2' : 'bg-surface'} ${
                  active ? 'active:bg-brand-050 cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className="font-en text-caption text-ink-900 leading-tight">
                  <div>{String(month).padStart(2, '0')}-{String(r.day).padStart(2, '0')}</div>
                  <div className={`text-[10px] ${dowColor}`}>{r.dow}</div>
                </div>
                {code && code.isOff ? (
                  <div className="flex items-center gap-2">
                    <HolidayTag />
                    <span className="text-callout font-semibold font-en text-ink-700">{code.label}</span>
                  </div>
                ) : code ? (
                  <div className="flex items-center gap-2 font-en text-[13.5px] text-ink-900">
                    <span className="font-bold">{code.label}</span>
                    <span className="text-ink-300">·</span>
                    <span className="text-ink-700">{code.startTime}~{code.endTime}</span>
                  </div>
                ) : r.holiday ? (
                  <div className="flex items-center gap-2">
                    <HolidayTag />
                    <span className="text-caption text-ink-500">오프</span>
                  </div>
                ) : (r.st || r.et) ? (
                  <div className="flex items-center gap-2 font-en text-[13.5px] text-ink-700">
                    <span>{r.st ?? '--:--'}</span>
                    <span className="text-ink-300">~</span>
                    <span>{r.et ?? '--:--'}</span>
                  </div>
                ) : (
                  <span className="text-caption text-ink-300">탭하여 입력</span>
                )}
              </button>
            )
          }

          // ─── KTX mode: inline 다이 + 시각 inputs (no paint) ──────────
          return (
            <div
              key={r.day}
              className={`grid grid-cols-[56px_1fr] items-center px-3 py-2.5 ${
                i < rows.length - 1 ? 'border-b border-line' : ''
              } ${r.holiday ? 'bg-surface-2' : 'bg-surface'}`}
            >
              <div className="font-en text-caption text-ink-900 leading-tight">
                <div>{String(month).padStart(2, '0')}-{String(r.day).padStart(2, '0')}</div>
                <div className={`text-[10px] ${dowColor}`}>{r.dow}</div>
              </div>
              {r.holiday ? (
                <div className="flex items-center gap-2">
                  <HolidayTag />
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={r.dia ?? ''}
                    placeholder="H----"
                    onChange={e => onChange(i, { dia: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.dia ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 80 }}
                  />
                  <input
                    value={r.tr ?? ''}
                    placeholder="열번"
                    onChange={e => onChange(i, { tr: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.tr ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 84 }}
                  />
                  <input
                    value={r.st ?? ''}
                    placeholder="시작"
                    inputMode="numeric"
                    maxLength={5}
                    onChange={e => onChange(i, { st: normalizeTimeInput(e.target.value) })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.st ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 62 }}
                  />
                  <span className="text-ink-300 font-en">→</span>
                  <input
                    value={r.et ?? ''}
                    placeholder="종료"
                    inputMode="numeric"
                    maxLength={5}
                    onChange={e => onChange(i, { et: normalizeTimeInput(e.target.value) })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.et ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 62 }}
                  />
                  <button
                    onClick={() => onChange(i, { holiday: true, dia: undefined, tr: undefined, st: undefined, et: undefined })}
                    className="font-en text-[11px] font-bold text-brand ml-auto"
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
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] border border-dashed border-line-2 bg-surface text-callout font-semibold text-ink-700"
        >
          <PlusIcon size={14} />
          {rows.length + 1}일~{total}일 추가하기
        </button>
      )}
    </>
  )
}

function CodeChip({
  code, active, onClick,
}: {
  code: CodebookEntry
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 px-3.5 py-2 rounded-[12px] shrink-0 min-w-[64px] text-left ${
        active
          ? 'border-[1.5px] border-brand bg-brand-050'
          : 'border border-line-2 bg-surface'
      }`}
    >
      <span className={`text-[15px] font-bold leading-tight ${
        code.isOff ? '' : 'font-en'
      } ${active ? 'text-brand-700' : 'text-ink-900'}`}>
        {code.label}
      </span>
      <span
        className={`text-[10.5px] leading-none ${
          code.isOff ? 'font-bold text-warn' : `font-en ${active ? 'text-brand' : 'text-ink-500'}`
        }`}
      >
        {code.isOff ? '휴무' : `${code.startTime}~${code.endTime}`}
      </span>
    </button>
  )
}

function EraserChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  const style = active
    ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)', borderWidth: 1.5 }
    : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`shrink-0 flex flex-col items-center justify-center gap-1 px-3.5 py-2 rounded-[12px] ${
        active ? '' : 'border border-dashed border-line-2 bg-surface text-ink-500'
      }`}
    >
      <EraserIcon size={16} />
      <span className="text-[10.5px] font-semibold leading-none">지우개</span>
    </button>
  )
}

function HolidayTag() {
  return (
    <span
      className="font-bold text-[11px] tracking-wide px-2 py-0.5 rounded-pill"
      style={{ background: '#FEF3C7', color: '#92400E' }}
    >
      휴무
    </span>
  )
}

function CategoryChip({
  active, title, sub, onClick,
}: { active: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-[10px] text-left ${
        active
          ? 'border-[1.5px] border-brand bg-brand-050 text-brand-700'
          : 'border border-line bg-surface text-ink-500'
      }`}
    >
      <span className={`text-[13px] ${active ? 'font-bold' : 'font-semibold text-ink-900'}`}>
        {title}
      </span>
      <span className={`text-[10px] ${active ? 'text-brand' : 'text-ink-300'}`}>
        {sub}
      </span>
    </button>
  )
}
