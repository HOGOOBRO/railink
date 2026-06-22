'use client'

import { ChangeEvent, CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, FileIcon, ImageIcon, EditIcon, ChevronLeftIcon,
  ChevronRightIcon, InfoIcon, CheckIcon, PlusIcon, EraserIcon,
} from '@/components/ui/icons'
import { parseScheduleFile, type ParsedScheduleRow } from '@/lib/parse/schedule-file'
import { recognizeScheduleImage, type OcrProgress } from '@/lib/parse/schedule-image'
import { fmtClock, hmToDecimal, canonicalEnd, isOvernight, normalizeTimeInput } from '@/lib/schedule-utils'
import { getCodebook, type CodebookEntry } from '@/lib/store/codebook'
import { canonCode, builtinCode, normalizeAnswerLabel, categoryEffect, CATEGORY_ORDER, CATEGORY_META, type RosterCategory } from '@/lib/roster-codes'
import { isAirportCode } from '@/lib/airline-routes'
import { fetchRosterCodes, recordRosterCode, type RosterCodeEntry } from '@/lib/store/roster-codes'
import { AnalyzeTableSkeleton } from '@/components/calendar/AnalyzeTableSkeleton'
import { RosterExampleCard } from '@/components/calendar/RosterExampleCard'
import { RosterExampleTable } from '@/components/calendar/RosterExampleTable'
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

// AI 인식 신뢰도가 이 값 미만일 때만 'AI 인식 원문 확인'(raw 텍스트)을 노출한다.
// 잘 읽힌 경우(happy path)엔 미리보기표만 보여 깔끔하게, 의심스러울 때만 원문
// 대조 수단을 제공. 90%는 명확히 잘 읽힌 선 — 그 아래는 확인 가치가 있다.
const LOW_CONFIDENCE_PCT = 90

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
  /** 소속 항공사 코드(AIRLINES.code). AI 이미지 인식에 전달해 항공사 로스터
   *  레이아웃(예: 에어프레미아 그리드)을 적용한다. 항공 승무원만 값이 있다. */
  airline?: string
  onPreview: () => void
  onManual: () => void
  onBack: () => void
  onClose: () => void
  onSave: (rows: ParsedScheduleRow[]) => Promise<void> | void
}

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
// 표시용 영어 요일. r.dow는 내부 비교(주말 색상 등)에 쓰이는 한글 키로 유지하고,
// 화면에는 로케일에 맞는 라벨만 골라 보여준다(en일 때만 치환).
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

// Sentinel thrown by normalizePreviewRows for a malformed date — caught in
// handleSave and mapped to the localized errors.invalidDate message (this
// module-level helper has no access to the t() hook).
const INVALID_DATE_ERROR = 'INVALID_DATE'

function normalizePreviewRows(rows: ParsedScheduleRow[]): ParsedScheduleRow[] {
  const byDate = new Map<string, ParsedScheduleRow>()
  for (const row of rows) {
    const date = row.date.trim()
    if (!isIsoDate(date)) {
      throw new Error(INVALID_DATE_ERROR)
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
          // 항공 다중 레그(아시아나): 미리보기에서 편집하지 않는 노선 레그를 보존한다.
          flights: row.flights && row.flights.length ? row.flights : undefined,
        }

    const filled = next.isOff || next.diaNr || next.trainNr || next.startTime || next.endTime
    if (filled) byDate.set(date, next)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Personal accounts have no KTX duty(다이)/열번(train) concept — their direct-input
 *  UI never exposes those fields. But the photo-OCR and file paths have zero
 *  profileType branching and will happily extract dia/train from a KTX roster,
 *  producing a "general 계정인데 KTX 다이가 박힌" inconsistent schedule. Drop those
 *  from WORKING rows here (keep the 'S' off-marker + times). Returns whether
 *  anything was stripped so the caller can tell the user why the preview lost them. */
function stripKtxFieldsForPersonal(
  rows: ParsedScheduleRow[],
): { rows: ParsedScheduleRow[]; stripped: boolean } {
  let stripped = false
  const next = rows.map(row => {
    if (row.isOff || (!row.diaNr && !row.trainNr)) return row
    stripped = true
    return { ...row, diaNr: undefined, trainNr: undefined }
  })
  return { rows: next, stripped }
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
  step, defaultYear, defaultMonth, initialRows = [], userName, userId, isPersonal = false, airline,
  onPreview, onManual, onBack, onClose, onSave,
}: UploadModalProps) {
  const t = useTranslations('upload')
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [sourceKind, setSourceKind] = useState<'file' | 'image'>('file')
  const [rows, setRows] = useState<ParsedScheduleRow[]>([])
  const [busy, setBusy] = useState<'file' | 'image' | null>(null)
  const [ocr, setOcr] = useState<OcrProgress | null>(null)
  const [ocrText, setOcrText] = useState('')
  // AI 이미지 인식 신뢰도(%). ocrText와 같은 생애주기로 묶어, 낮을 때만 원문
  // 토글을 노출하는 데 쓴다. null = 인식 결과 없음(파일/엑셀 경로 등).
  const [confidence, setConfidence] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 코드 사전: 항공 승무원 미리보기에서 '모르는 코드'를 분류받아 다음부턴 자동 인식.
  const [codeCatalog, setCodeCatalog] = useState<Map<string, RosterCodeEntry>>(new Map())
  const [classified, setClassified] = useState<Record<string, { category: RosterCategory; label: string }>>({})
  const [skippedCodes, setSkippedCodes] = useState<Set<string>>(new Set())   // '건너뛰기' 한 코드(원문 그대로 저장)
  const [renamingCodes, setRenamingCodes] = useState<Set<string>>(new Set()) // '다르게 부르기' 입력칸 연 코드
  const toggleInSet = (setter: typeof setSkippedCodes, key: string) =>
    setter(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  useEffect(() => {
    if (step !== 'preview' || !airline) return
    let alive = true
    fetchRosterCodes(airline).then(c => { if (alive) setCodeCatalog(c) })
    return () => { alive = false }
  }, [step, airline])
  // 분류가 필요한 '처음 보는 코드'(비행 아님 + 내장/사전에 없음). 원문(표시용) 유지.
  const pendingCodes = useMemo(() => {
    if (!airline) return [] as string[]
    const seen = new Set<string>()
    const list: string[] = []
    for (const r of rows) {
      if (r.isOff || r.flights?.length) continue
      const dia = (r.diaNr ?? '').trim()
      if (!dia) continue
      const key = canonCode(dia)
      if (!key || seen.has(key)) continue
      // 공항코드(BKK·FRA 등 체류 마커)는 근무코드가 아니므로 분류 대상에서 제외.
      if (isAirportCode(dia)) continue
      if (builtinCode(dia) || codeCatalog.get(key)?.category) continue
      seen.add(key)
      list.push(dia)
    }
    return list
  }, [rows, airline, codeCatalog])

  // 항공 승무원(airline)·KTX는 올릴 로스터 캡쳐가 있으니 '이미지 등록'을 hero로,
  // 일반 personal만 '직접 입력'을 hero로 둔다.
  const imageFirst = !isPersonal || !!airline
  // 항공 승무원: 사진 선택 전 "어떤 화면을 올리나" 안내 화면을 거친다.
  const [imageGuide, setImageGuide] = useState(false)

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

  // 일괄 채우기 직전 상태 스냅샷 — 실수로 눌러도 한 번에 되돌릴 수 있게.
  const [fillUndo, setFillUndo] = useState<ManualRow[] | null>(null)

  // opt-in 일괄 채우기: 모든 평일을 09:00–18:00로 덮어쓴다 (08–17 등 기존
  // 시간도 09–18로 바뀜). 주말과 명시적 '휴무'일은 그대로 보존. 코드(다이)·열번은
  // 비워서 raw 09–18 시간으로 표시되게 한다. 누르기 직전 상태를 저장해 되돌리기 제공.
  function fillWeekdays() {
    setFillUndo(manualRows)
    setManualRows(manualRows.map(r => {
      if (r.dow === '토' || r.dow === '일') return r
      if (r.holiday) return r
      return { ...r, dia: undefined, tr: undefined, st: '09:00', et: '18:00' }
    }))
  }
  function undoFillWeekdays() {
    if (!fillUndo) return
    setManualRows(fillUndo)
    setFillUndo(null)
  }
  const monthTotal = useMemo(
    () => daysInMonth(defaultYear, defaultMonth), [defaultYear, defaultMonth],
  )
  // 일반 근무는 dia 없이 시간만 채울 수 있으니 st/et 도 filled로 인정.
  const manualFilled = manualRows.filter(r => r.holiday || r.dia || r.tr || r.st || r.et).length

  function setManualRow(i: number, patch: Partial<ManualRow>) {
    setFillUndo(null) // 개별 편집을 시작하면 직전 일괄채우기 되돌리기는 만료
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
    setConfidence(null)
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(file.name)
    setSourceKind('file')

    try {
      const parsed = await parseScheduleFile(file, defaultYear)
      // 항공 승무원은 편명(열번)·활동코드가 유의미하므로 strip 대상에서 제외.
      const display = isPersonal && !airline
        ? stripKtxFieldsForPersonal(parsed)
        : { rows: parsed, stripped: false }
      setRows(displayPreviewRows(display.rows))
      if (display.stripped) {
        setNotice(t('notice.personalStripped'))
      }
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.fileRead'))
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    // 안내 화면(항공 가이드)을 닫아 인식 중 로딩/진행 표시가 보이게 한다.
    setImageGuide(false)

    setBusy('image')
    setOcr({
      status: files.length > 1 ? t('ocr.preparingMany', { count: files.length }) : t('ocr.preparing'),
      progress: 0.02,
    })
    setOcrText('')
    setConfidence(null)
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(files.length === 1 ? files[0].name : t('ocr.fileNameMore', { name: files[0].name, count: files.length - 1 }))
    setSourceKind('image')

    try {
      // 항공 승무원이면 항공사 레이아웃을 쓰고 팀-표(userName) 경로는 끈다.
      const result = await recognizeScheduleImage(
        files, defaultYear, defaultMonth, setOcr, airline ? undefined : userName, airline,
      )
      // 항공 승무원은 편명(열번)·활동코드가 유의미하므로 strip 대상에서 제외.
      const display = isPersonal && !airline
        ? stripKtxFieldsForPersonal(result.rows)
        : { rows: result.rows, stripped: false }
      setRows(displayPreviewRows(display.rows))
      setOcrText(result.text)
      setConfidence(result.confidence)
      const usageText = result.usage
        ? ' ' + t('notice.usage', { used: result.usage.used, limit: result.usage.limit })
        : ''
      const periodText = result.period
        ? result.period.source === 'image'
          ? ' ' + t('notice.periodFromImage', { year: result.period.year, month: result.period.month })
          : ' ' + t('notice.periodFromScreen', { year: result.period.year, month: result.period.month })
        : ''
      const personalNote = display.stripped
        ? ' ' + t('notice.personalStripped')
        : ''
      setNotice(t('notice.confidence', { confidence: Math.round(result.confidence) }) + periodText + ' ' + t('notice.merged') + usageText + personalNote)
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.imageRead'))
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  function handleOption(key: UploadMethod) {
    setError(null)
    setNotice(null)
    if (key === 'file') { fileRef.current?.click(); return }
    if (key === 'image') {
      // 항공 승무원: 바로 앨범을 열지 않고 먼저 "어떤 화면을 올리나" 안내를 보여준다.
      if (airline) { setImageGuide(true); return }
      imageRef.current?.click(); return
    }
    onManual()
  }

  async function handleSave() {
    // 분류한 코드를 행에 반영: 휴무면 isOff, 표준 라벨로 치환. 이번 세션 분류뿐 아니라
    // 공용 사전(codeCatalog)에 이미 분류된 코드도 자동 적용 — 그래야 "다음부턴 자동 인식"이
    // 실제로 동작한다. (분류 안 했거나 건너뛴 코드는 원문 그대로)
    const applyClassified = (rs: ParsedScheduleRow[]) => !airline ? rs : rs.map(r => {
      if (r.isOff || r.flights?.length || !r.diaNr) return r
      const key = canonCode(r.diaNr)
      if (skippedCodes.has(key)) return r
      const known = codeCatalog.get(key)
      const category = classified[key]?.category ?? known?.category ?? undefined
      if (!category) return r
      const label = classified[key]?.label ?? known?.label ?? r.diaNr
      return { ...r, diaNr: label || r.diaNr, isOff: categoryEffect(category).isOff }
    })

    let parsed: ParsedScheduleRow[]
    try {
      parsed = step === 'manual'
        ? manualRowsToParsed(manualRows, defaultYear, defaultMonth)
        : normalizePreviewRows(applyClassified(rows))
      if (parsed.length === 0) {
        setError(step === 'manual' ? t('errors.manualEmpty') : t('errors.previewEmpty'))
        return
      }
    } catch (err) {
      if (err instanceof Error && err.message === INVALID_DATE_ERROR) {
        setError(t('errors.invalidDate'))
      } else {
        setError(err instanceof Error ? err.message : t('errors.checkInput'))
      }
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(parsed)
      // 분류를 공용 사전에 기록 — 다음부턴 모든 같은 항공사 크루가 자동 인식. 실패해도 저장엔 영향 없음.
      if (airline) {
        for (const [code, c] of Object.entries(classified)) {
          if (skippedCodes.has(code)) continue   // 건너뛴 코드는 사전에 기록 안 함
          void recordRosterCode(airline, code, { category: c.category, label: c.label, isOff: categoryEffect(c.category).isOff })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function setPreviewRow(i: number, patch: Partial<ParsedScheduleRow>) {
    setRows(current => current.map((row, idx) => {
      if (idx !== i) return row
      const next = { ...row, ...patch }
      // 항공편 행(레그 보유)의 편명·시각·코드를 직접 고치면, 캘린더는 레그(flights)를
      // 우선 렌더해 그 수정이 무시된다. 편집 시 레그를 비워 수정이 실제 반영되게 한다.
      if (row.flights?.length && ('diaNr' in patch || 'trainNr' in patch || 'startTime' in patch || 'endTime' in patch)) {
        next.flights = undefined
      }
      return next
    }))
  }

  // 다중레그 항공편의 개별 레그 시각(std/sta)을 고친다. flights는 유지한 채(노선·시차
  // 정보 보존) 해당 레그만 갈고, 하루 시작/종료(startTime/endTime)는 첫·마지막 레그에서
  // 다시 끌어온다. setPreviewRow와 달리 flights를 비우지 않아 레그 수정이 그대로 반영된다.
  function setPreviewLeg(i: number, legIdx: number, patch: { std?: string; sta?: string }) {
    setRows(current => current.map((row, idx) => {
      if (idx !== i || !row.flights?.length) return row
      const flights = row.flights.map((lg, k) => (k === legIdx ? { ...lg, ...patch } : lg))
      return {
        ...row,
        flights,
        startTime: flights[0]?.std || row.startTime,
        endTime: flights[flights.length - 1]?.sta || row.endTime,
      }
    }))
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
    saving ? t('footer.saving')
    : step === 'pick' ? t('footer.pickMethod')
    : step === 'manual' ? t('footer.manualEntry')
    : t('footer.totalCount', { count: rows.length })

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
        <h3 className="text-subtitle font-bold tracking-tight text-ink-900">{t('title')}</h3>
        <button
          onClick={onClose}
          aria-label={t('close')}
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* 항공 승무원 전용: 사진 선택 전 "어떤 화면을 올리나" 안내(AI 스캔 예시 카드) */}
        {step === 'pick' && imageGuide && (
          <>
            <button
              type="button"
              onClick={() => setImageGuide(false)}
              className="inline-flex items-center gap-1 text-caption font-semibold text-ink-500 mb-2 -ml-1"
            >
              <ChevronLeftIcon size={16} /> {t('guide.backToMethods')}
            </button>
            <h4 className="text-[22px] font-bold tracking-tight text-ink-900 leading-tight mb-1.5">
              {t('guide.title')}
            </h4>
            <p className="text-[13.5px] text-ink-500 leading-relaxed mb-4">
              {airline === 'asiana'
                ? t.rich('guide.descAsiana', { b: (chunks) => <strong className="text-ink-700">{chunks}</strong> })
                : t.rich('guide.descDefault', { b: (chunks) => <strong className="text-ink-700">{chunks}</strong> })}
            </p>

            {airline === 'asiana' ? <RosterExampleTable /> : <RosterExampleCard />}

            <ul className="mt-4 flex flex-col gap-2">
              {(airline === 'asiana'
                ? [t('guide.tipsAsiana.fitsOneScreen'), t('guide.tipsAsiana.clearText'), t('guide.tipsAsiana.noClipping')]
                : [t('guide.tipsDefault.fitsOneScreen'), t('guide.tipsDefault.clearText'), t('guide.tipsDefault.codeLegendOk')]
              ).map(tip => (
                <li key={tip} className="flex items-start gap-2 text-caption text-ink-700 leading-relaxed">
                  <span className="shrink-0 mt-0.5 text-brand"><CheckIcon size={15} /></span>
                  {tip}
                </li>
              ))}
            </ul>

            <Button block className="mt-5" onClick={() => imageRef.current?.click()}>
              {t('guide.selectPhoto')}
            </Button>
          </>
        )}

        {step === 'pick' && !imageGuide && (
          <>
            <h4 className="text-[22px] font-bold tracking-tight text-ink-900 leading-tight mb-1.5">
              {imageFirst ? t('pick.titleImage') : t('pick.titleManual')}
            </h4>
            <p className="text-[13.5px] text-ink-500 leading-relaxed mb-4">
              {imageFirst
                ? (airline ? t('pick.descImageAirline') : t('pick.descImageKtx'))
                : t('pick.descManual')}
            </p>

            {!imageFirst ? (
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
                  <span className="text-[16px] font-bold leading-none">{t('pick.manualHero')}</span>
                  <span className="block mt-1 text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    {t('pick.manualHeroSub')}
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
                    <span className="text-[16px] font-bold leading-none">{t('pick.imageHero')}</span>
                  </span>
                  <span className="block mt-1 text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    {t('pick.imageHeroSub')}
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
              <span className="text-[11px] font-semibold tracking-wider text-ink-300">{t('pick.or')}</span>
              <span className="flex-1 h-px bg-line" />
            </div>

            {/* Secondary methods — 직접입력 hero(일반 personal)일 때만 사진을 부차로 */}
            <div className="grid gap-2">
              {!imageFirst ? (
                <>
                  <SecondaryMethod
                    icon={<ImageIcon size={18} />}
                    label={t('pick.imageHero')}
                    sub={t('pick.imageSecondarySub')}
                    onClick={() => handleOption('image')}
                    disabled={!!busy}
                  />
                  <SecondaryMethod
                    icon={<FileIcon size={18} />}
                    label={t('pick.fileLabel')}
                    sub={t('pick.fileSub')}
                    onClick={() => handleOption('file')}
                    disabled={!!busy}
                  />
                </>
              ) : (
                <>
                  <SecondaryMethod
                    icon={<FileIcon size={18} />}
                    label={t('pick.fileLabel')}
                    sub={t('pick.fileSub')}
                    onClick={() => handleOption('file')}
                    disabled={!!busy}
                  />
                  <SecondaryMethod
                    icon={<EditIcon size={18} />}
                    label={t('pick.manualHero')}
                    sub={airline ? t('pick.manualSecondarySubAirline') : t('pick.manualSecondarySubKtx')}
                    onClick={() => handleOption('manual')}
                    disabled={!!busy}
                  />
                </>
              )}
            </div>

            {busy === 'file' && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>{t.rich('ocr.readingFile', { name: fileName, b: (chunks) => <strong>{chunks}</strong> })}</span>
              </StatusBox>
            )}
            {busy === 'image' && (
              <>
                <div className="mt-4 px-3.5 py-3 rounded-md bg-bg text-caption text-ink-700 leading-relaxed">
                  <div className="flex items-center gap-2">
                    <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                    <span>
                      <strong>{fileName}</strong> · {ocr?.status ?? t('ocr.analyzing')}
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
                {/* ③ 채워질 미리보기 표 모양 스켈레톤 — 진행률 표시는 위에 유지.
                    항공/KTX는 코드 컬럼 표시(라벨만 다름), 일반 personal은 컬럼 생략. */}
                <AnalyzeTableSkeleton
                  ktx={!isPersonal || !!airline}
                  codeLabel={airline ? t('preview.colCodeAirline') : t('preview.colCodeKtx')}
                />
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
              <ChevronLeftIcon size={14} /> {t('preview.backToMethods')}
              <span className="text-ink-300">·</span>
              <span className="text-ink-900 font-semibold inline-flex items-center gap-1">
                {sourceKind === 'image' ? <ImageIcon size={14} /> : <FileIcon size={14} />}
                {sourceKind === 'image' ? t('preview.sourceImage') : t('preview.sourceFile')}
              </span>
            </button>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-callout" style={{ background: '#DCFCE7', color: '#166534' }}>
              <span className="shrink-0 text-success"><CheckIcon size={16} /></span>
              <div>
                <strong>{fileName || t('preview.defaultFileName')}</strong> ·{' '}
                <span className="font-en">{t('preview.recognizedCount', { count: rows.length })}</span>
              </div>
            </div>

            {pendingCodes.length > 0 && (
              <CodeClassifier
                codes={pendingCodes}
                classified={classified}
                skipped={skippedCodes}
                renaming={renamingCodes}
                onPick={(key, category, label) => {
                  setClassified(prev => ({ ...prev, [key]: { category, label } }))
                  setSkippedCodes(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n })
                }}
                onSkip={key => toggleInSet(setSkippedCodes, key)}
                onToggleRename={key => toggleInSet(setRenamingCodes, key)}
              />
            )}

            <PreviewBody
              rows={previewRows}
              onChange={setPreviewRow}
              onChangeLeg={setPreviewLeg}
              onRemove={removePreviewRow}
              onAppend={appendPreviewRow}
              airline={airline}
            />
            {saving && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>{t('footer.savingHint')}</span>
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
            {/* 신뢰도가 낮을 때만 원문 대조 수단을 노출 — 잘 읽힌 경우엔 미리보기표만
                보여 깔끔하게 둔다. confidence가 null이면(인식 결과 없음) 숨김. */}
            {ocrText && confidence !== null && confidence < LOW_CONFIDENCE_PCT && (
              <details className="mt-3 rounded-md border border-line bg-bg px-3 py-2">
                <summary className="cursor-pointer text-caption font-semibold text-ink-700">
                  {t('preview.rawTextToggle')}
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
              onUndoFill={undoFillWeekdays}
              canUndoFill={fillUndo !== null}
            />
            {saving && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>{t('footer.savingHint')}</span>
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
        <Button variant="ghost" size="sm" onClick={onClose}>{t('footer.cancel')}</Button>
        <Button
          variant={step === 'pick' ? 'outline' : 'primary'}
          size="sm"
          disabled={saveDisabled}
          onClick={handleSave}
        >
          {saving ? t('footer.savingShort') : t('footer.save')}
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
  /** 일반 모드 opt-in: 평일을 09–18로 일괄 채움(덮어쓰기). */
  onFillWeekdays: () => void
  /** 직전 일괄 채우기 되돌리기. */
  onUndoFill: () => void
  /** 되돌릴 일괄 채우기 스냅샷이 있는지. */
  canUndoFill: boolean
}

/** 처음 보는 코드 분류 패널. 칩으로 종류를 고르면 저장 시 공용 사전에 기록돼 다음부턴
 *  자동 인식. 건너뛰거나 분류 안 해도 원문 그대로 저장되어 손실 없음. */
function CodeClassifier({ codes, classified, skipped, renaming, onPick, onSkip, onToggleRename }: {
  codes: string[]
  classified: Record<string, { category: RosterCategory; label: string }>
  skipped: Set<string>
  renaming: Set<string>
  onPick: (key: string, category: RosterCategory, label: string) => void
  onSkip: (key: string) => void
  onToggleRename: (key: string) => void
}) {
  const t = useTranslations('upload')
  const remaining = codes.filter(c => {
    const k = canonCode(c)
    return !classified[k] && !skipped.has(k)
  }).length
  return (
    <div className="rounded-md border-2 border-brand-100 bg-brand-050 p-3 flex flex-col gap-3">
      <div>
        <p className="text-callout font-bold text-ink-900">{t('classify.title', { count: codes.length })}</p>
        <p className="text-caption text-ink-500 mt-0.5">
          {remaining > 0 ? t('classify.remaining', { count: remaining }) : t('classify.allDone')}
        </p>
      </div>
      {codes.map(code => {
        const key = canonCode(code)
        const sel = classified[key]
        const isSkip = skipped.has(key)
        const isRenaming = renaming.has(key)
        return (
          <div key={key} className={`flex flex-col gap-1.5 pt-2.5 border-t border-brand-100 first:border-t-0 first:pt-0 ${isSkip ? 'opacity-55' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-callout text-ink-900 font-en truncate">
                {code}
                {!isSkip && sel && <span className="ml-2 font-sans text-caption font-bold text-brand">✓ {sel.label}</span>}
                {isSkip && <span className="ml-2 font-sans text-caption font-semibold text-ink-500">{t('classify.skipped')}</span>}
              </span>
              <button type="button" onClick={() => onSkip(key)} className="shrink-0 text-caption font-semibold text-ink-500 hover:text-ink-700">
                {isSkip ? t('classify.undoSkip') : t('classify.skip')}
              </button>
            </div>
            {!isSkip && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_ORDER.map(cat => {
                    const on = sel?.category === cat
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => onPick(key, cat, CATEGORY_META[cat].label)}
                        className={`px-2.5 py-1 rounded-pill border-2 text-caption font-bold transition-colors ${on ? 'border-brand bg-surface text-brand' : 'border-line bg-surface text-ink-700'}`}
                      >
                        {CATEGORY_META[cat].label}
                      </button>
                    )
                  })}
                </div>
                {sel && (
                  isRenaming ? (
                    <input
                      autoFocus
                      value={sel.label}
                      placeholder={t('classify.renamePlaceholder')}
                      onChange={e => onPick(key, sel.category, e.target.value)}
                      onBlur={e => onPick(key, sel.category, normalizeAnswerLabel(e.target.value) || CATEGORY_META[sel.category].label)}
                      className="h-9 px-2.5 rounded-sm border border-line bg-surface text-caption self-start min-w-[180px]"
                    />
                  ) : (
                    <button type="button" onClick={() => onToggleRename(key)} className="self-start text-caption font-semibold text-brand">
                      {t('classify.rename')}
                    </button>
                  )
                )}
              </>
            )}
          </div>
        )
      })}
      <p className="text-caption text-ink-300">{t('classify.noPickHint')}</p>
    </div>
  )
}

/** "HH:MM" → 분. 형식이 아니면 null. */
function legHm(t?: string): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** 다중 레그에서 물리적으로 불가능한 시각 = 다음 레그가 이전 레그 도착 전에 출발.
 *  OCR 시각 오독을 잡는 안전망(예: 8961 도착 16:55 vs 8962 출발 16:35). 자정을 넘기는
 *  레그(sta<std) 다음부터는 익일이라 비교가 모호하므로 건너뛴다(오탐 방지). 문제면 안내
 *  문구를 조립할 params(편명·시각), 없으면 null. 메시지 문장은 호출부(PreviewBody)에서
 *  t()로 현지화해 조립한다 — 이 모듈 레벨 함수에는 훅이 없으므로. */
interface LegTimeIssue { next: string; prev: string; arr: string; dep: string }
function legTimeIssue(flights: ParsedScheduleRow['flights']): LegTimeIssue | null {
  if (!flights || flights.length < 2) return null
  for (let i = 0; i < flights.length - 1; i++) {
    const a = flights[i], b = flights[i + 1]
    const aStd = legHm(a.std), aSta = legHm(a.sta), bStd = legHm(b.std)
    if (aSta == null || bStd == null) continue
    if (aStd != null && aSta < aStd) continue   // a가 자정 넘김 → 이후 비교 모호
    if (bStd < aSta) {
      return { next: b.flight ?? '', prev: a.flight ?? '', arr: a.sta ?? '', dep: b.std ?? '' }
    }
  }
  return null
}

interface PreviewBodyProps {
  rows: ParsedScheduleRow[]
  onChange: (i: number, patch: Partial<ParsedScheduleRow>) => void
  onChangeLeg: (i: number, legIdx: number, patch: { std?: string; sta?: string }) => void
  onRemove: (i: number) => void
  onAppend: () => void
  /** 항공 승무원이면 KTX 용어(다이/열번) 대신 근무코드/편명으로 라벨링. */
  airline?: string
}

function PreviewBody({ rows, onChange, onChangeLeg, onRemove, onAppend, airline }: PreviewBodyProps) {
  const t = useTranslations('upload')
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-caption font-semibold text-ink-500">
          {t('preview.editHint')}
        </p>
        <button
          type="button"
          onClick={onAppend}
          className="inline-flex items-center gap-1 text-caption font-bold text-brand"
        >
          <PlusIcon size={13} /> {t('preview.addRow')}
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
                aria-label={t('preview.dateAria')}
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
                {t('preview.off')}
              </label>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="w-8 h-8 grid place-items-center rounded-full text-ink-500 hover:bg-bg"
                aria-label={t('preview.removeRowAria', { date: row.date })}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {row.flights?.length && !row.isOff ? (
              // 다중레그 항공편: 레그별 출발·도착을 직접 고칠 수 있게 한 줄씩 편다(하루
              // 시작/종료 한 칸으론 개별 레그 오독을 못 고침). 편명·구간은 표시, 시각만 수정.
              <div className="mt-2 flex flex-col gap-1.5">
                {row.flights.map((lg, li) => (
                  <div key={li} className="flex items-center gap-1.5">
                    <span className="font-en text-caption font-bold text-ink-900 w-11 shrink-0 truncate" title={lg.flight}>{lg.flight || '—'}</span>
                    <span className="font-en text-[11px] text-ink-500 w-[64px] shrink-0 truncate">{[lg.from, lg.to].filter(Boolean).join('→') || '—'}</span>
                    <input
                      value={lg.std ?? ''}
                      placeholder={t('preview.legDeparture')}
                      inputMode="numeric"
                      maxLength={5}
                      aria-label={t('preview.legDepartureAria', { flight: lg.flight || '' })}
                      onChange={e => onChangeLeg(i, li, { std: normalizeTimeInput(e.target.value) })}
                      className="flex-1 min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg"
                    />
                    <span className="text-ink-300 text-caption shrink-0">→</span>
                    <input
                      value={lg.sta ?? ''}
                      placeholder={t('preview.legArrival')}
                      inputMode="numeric"
                      maxLength={5}
                      aria-label={t('preview.legArrivalAria', { flight: lg.flight || '' })}
                      onChange={e => onChangeLeg(i, li, { sta: normalizeTimeInput(e.target.value) })}
                      className="flex-1 min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-[1fr_1fr_62px_62px] gap-1.5">
                <input
                  value={row.diaNr ?? ''}
                  placeholder={row.isOff ? 'S' : (airline ? t('preview.placeholderCodeAirline') : t('preview.placeholderCodeKtx'))}
                  onChange={e => onChange(i, { diaNr: e.target.value })}
                  className="min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg"
                />
                <input
                  value={row.trainNr ?? ''}
                  placeholder={airline ? t('preview.placeholderTrainAirline') : t('preview.placeholderTrainKtx')}
                  disabled={row.isOff}
                  onChange={e => onChange(i, { trainNr: e.target.value })}
                  className="min-w-0 font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
                />
                <input
                  value={row.startTime ?? ''}
                  placeholder={t('preview.placeholderStart')}
                  disabled={row.isOff}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={e => onChange(i, { startTime: normalizeTimeInput(e.target.value) })}
                  className="font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
                />
                <input
                  value={row.endTime ?? ''}
                  placeholder={t('preview.placeholderEnd')}
                  disabled={row.isOff}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={e => onChange(i, { endTime: normalizeTimeInput(e.target.value) })}
                  className="font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border border-line bg-bg disabled:opacity-50"
                />
              </div>
            )}

            {!row.isOff && isOvernight(row.startTime, row.endTime) && (
              <span className="mt-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-brand-050 text-brand">
                {t('preview.overnightBadge')}
              </span>
            )}
            {(() => {
              const issue = !row.isOff ? legTimeIssue(row.flights) : null
              if (!issue) return null
              return (
                <span className="mt-1.5 flex items-start gap-1 text-[10px] font-bold leading-snug text-danger">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-danger text-ink-on-brand text-[9px] grid place-items-center mt-px">!</span>
                  {t('preview.legTimeIssue', {
                    next: issue.next || t('preview.legNextFallback'),
                    prev: issue.prev || t('preview.legPrevFallback'),
                    arr: issue.arr,
                    dep: issue.dep,
                  })}
                </span>
              )
            })()}
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
  onBack, onChange, onAppendRest, onFillWeekdays, onUndoFill, canUndoFill,
}: ManualBodyProps) {
  const t = useTranslations('upload')
  const locale = useLocale()
  const headerLabel = category === 'ktx' ? t('manual.headerKtx') : t('manual.headerGeneral')

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
        <ChevronLeftIcon size={14} /> {t('preview.backToMethods')}
        <span className="text-ink-300">·</span>
        <span className="text-ink-900 font-semibold inline-flex items-center gap-1">
          <EditIcon size={14} /> {t('manual.directInput')}
        </span>
      </button>

      <div className="flex items-center justify-between px-3 py-2.5 rounded-[12px] bg-brand-050 text-brand-700 text-caption mb-3">
        <div className="flex items-center gap-2">
          <span className="text-brand shrink-0"><EditIcon size={14} /></span>
          <span>
            {t.rich('manual.monthProgress', {
              year, month, filled, total: rows.length,
              b: (chunks) => <strong className="font-en">{chunks}</strong>,
            })}
          </span>
        </div>
      </div>

      {/* Category picker — 직군. Personal 계정은 KTX 승무(다이번호) 모드가
          무의미하므로 토글을 숨기고 일반 근무로 고정한다 (manualCategory 기본값이
          이미 general). KTX 계정만 두 직군을 오갈 수 있다. */}
      {!isPersonal && (
        <>
          <p className="px-1 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-ink-300">{t('manual.roleLabel')}</p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <CategoryChip
              active={category === 'ktx'}
              title={t('manual.roleKtxTitle')}
              sub={t('manual.roleKtxSub')}
              onClick={() => onCategoryChange('ktx')}
            />
            <CategoryChip
              active={category === 'general'}
              title={t('manual.roleGeneralTitle')}
              sub={t('manual.roleGeneralSub')}
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
            {t.rich('manual.ktxHint', { b: (chunks) => <strong className="text-ink-900">{chunks}</strong> })}
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
                {t.rich('manual.codebookEmpty', { b: (chunks) => <strong className="text-ink-700">{chunks}</strong> })}
              </span>
              <span className="text-brand font-semibold shrink-0 ml-2">{t('manual.codebookSettings')}</span>
            </Link>
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5 pb-1.5">
                <p className="text-[11px] font-bold tracking-wider uppercase text-ink-500">
                  {t('manual.codePaletteLabel')}
                </p>
                <Link
                  href="/settings/codebook?from=calendar"
                  className="inline-flex items-center gap-1 text-caption font-semibold text-brand"
                >
                  <EditIcon size={13} /> {t('manual.codeManage')}
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
                    {t('manual.paintErasing')}
                  </>
                ) : active?.kind === 'code' ? (
                  <>
                    <span className="font-en font-bold text-brand">{active.code.label}</span>
                    {' '}{t('manual.paintApplying')}
                  </>
                ) : (
                  <>
                    <span className="text-ink-300 shrink-0"><InfoIcon size={13} /></span>
                    <span className="text-ink-500">{t('manual.paintIdle')}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {category === 'general' && (
        <div className="mb-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onFillWeekdays}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] border border-line-2 bg-surface text-caption font-semibold text-ink-700 active:bg-bg"
          >
            {t('manual.fillWeekdays')}
          </button>
          {canUndoFill && (
            <button
              type="button"
              onClick={onUndoFill}
              className="shrink-0 px-3.5 py-2.5 rounded-[12px] border-[1.5px] border-line bg-bg text-caption font-bold text-ink-700 active:opacity-70"
            >
              {t('manual.undoFill')}
            </button>
          )}
        </div>
      )}

      <div className="border border-line rounded-[12px] overflow-hidden">
        <div className="grid grid-cols-[56px_1fr] bg-bg px-3 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
          <span>{t('manual.colDate')}</span><span>{headerLabel}</span>
        </div>
        {rows.map((r, i) => {
          const dowColor =
            r.dow === '일' ? 'text-danger'
            : r.dow === '토' ? 'text-c1'
            : 'text-ink-500'
          // r.dow(한글)는 비교용으로 두고, 표시는 로케일에 맞춰 영어로 치환.
          const dowLabel = locale === 'en' ? (DOW_EN[DOW_KR.indexOf(r.dow)] ?? r.dow) : r.dow

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
                  <div className={`text-[10px] ${dowColor}`}>{dowLabel}</div>
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
                    <span className="text-caption text-ink-500">{t('manual.dayOff')}</span>
                  </div>
                ) : (r.st || r.et) ? (
                  <div className="flex items-center gap-2 font-en text-[13.5px] text-ink-700">
                    <span>{r.st ?? '--:--'}</span>
                    <span className="text-ink-300">~</span>
                    <span>{r.et ?? '--:--'}</span>
                  </div>
                ) : (
                  <span className="text-caption text-ink-300">{t('manual.tapToEnter')}</span>
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
                <div className={`text-[10px] ${dowColor}`}>{dowLabel}</div>
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
                    {t('manual.toWork')}
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
                    placeholder={t('manual.placeholderTrain')}
                    onChange={e => onChange(i, { tr: e.target.value })}
                    className={`font-en text-caption text-ink-900 placeholder:text-ink-500 outline-none px-2 h-8 rounded-xs border ${
                      r.tr ? 'border-line-2 bg-surface' : 'border-line bg-bg'
                    }`}
                    style={{ width: 84 }}
                  />
                  <input
                    value={r.st ?? ''}
                    placeholder={t('manual.placeholderStart')}
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
                    placeholder={t('manual.placeholderEnd')}
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
                    {t('manual.markOff')}
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
          {t('manual.appendDays', { from: rows.length + 1, to: total })}
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
  const t = useTranslations('upload')
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
        {code.isOff ? t('manual.off') : `${code.startTime}~${code.endTime}`}
      </span>
    </button>
  )
}

function EraserChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useTranslations('upload')
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
      <span className="text-[10.5px] font-semibold leading-none">{t('manual.eraser')}</span>
    </button>
  )
}

function HolidayTag() {
  const t = useTranslations('upload')
  return (
    <span
      className="font-bold text-[11px] tracking-wide px-2 py-0.5 rounded-pill"
      style={{ background: '#FEF3C7', color: '#92400E' }}
    >
      {t('manual.off')}
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
