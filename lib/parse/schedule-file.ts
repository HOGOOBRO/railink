import type { ScheduleEntry } from '@/lib/types/schedule'

export type ParsedScheduleRow = Omit<ScheduleEntry, 'uid'>

type Cell = string | number | boolean | Date | null | undefined

interface ColumnMap {
  date: number
  dia?: number
  train?: number
  train1?: number
  train2?: number
  start?: number
  end?: number
  off?: number
}

const DATE_HEADERS = ['사업일자', '근무일자', '일자', '날짜', 'date', 'workdate']
const DIA_HEADERS = ['다이번호', '다이', 'dia', 'diano', 'dianumber', '근무코드']
const TRAIN_HEADERS = ['대표열번', '열번', 'trainnr', 'trainnumber', 'train']
const TRAIN1_HEADERS = ['대표열번1', '열번1', 'train1', 'trainno1']
const TRAIN2_HEADERS = ['대표열번2', '열번2', 'train2', 'trainno2']
const START_HEADERS = ['출근시각', '출근시간', '출근', '시업', 'starttime', 'start']
const END_HEADERS = ['퇴근시각', '퇴근시간', '퇴근', '종업', 'endtime', 'end']
const OFF_HEADERS = ['휴일여부', '휴무여부', '휴일', '휴무', '오프', 'off', 'holiday', 'isoff']

export async function parseScheduleFile(file: File, defaultYear = new Date().getFullYear()): Promise<ParsedScheduleRow[]> {
  const ext = extensionOf(file.name)
  if (ext === 'csv') {
    return parseMatrix(parseCsv(await file.text()), defaultYear)
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('읽을 수 있는 시트가 없어요.')
    const sheet = wb.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    return parseMatrix(matrix, defaultYear)
  }
  throw new Error('이 형식은 아직 지원하지 않아요. .xlsx 또는 .csv로 올려주세요.')
}

function parseMatrix(matrix: Cell[][], defaultYear: number): ParsedScheduleRow[] {
  const rows = matrix.filter(row => row.some(cell => clean(cell)))
  if (!rows.length) throw new Error('파일에서 근무표 데이터를 찾지 못했어요.')

  const headerIndex = findHeaderIndex(rows)
  const headers = rows[headerIndex].map(cell => clean(cell))
  const columns = resolveColumns(headers)

  if (columns.date < 0) {
    throw new Error('사업일자·날짜 컬럼을 찾지 못했어요.')
  }
  if (columns.dia == null && columns.start == null && columns.end == null) {
    throw new Error('다이번호 또는 출퇴근시각 컬럼을 찾지 못했어요.')
  }

  const parsed: ParsedScheduleRow[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const date = normalizeDate(row[columns.date], defaultYear)
    if (!date) continue

    const diaNr = valueAt(row, columns.dia)
    const startTime = normalizeTime(cellAt(row, columns.start))
    const endTime = normalizeTime(cellAt(row, columns.end))
    const trainNr = normalizeTrainNr(
      valueAt(row, columns.train),
      valueAt(row, columns.train1),
      valueAt(row, columns.train2),
    )
    const isOff = detectOff(diaNr, valueAt(row, columns.off), startTime, endTime, trainNr)

    if (!diaNr && !startTime && !endTime && !trainNr) continue

    parsed.push({
      date,
      diaNr: diaNr || undefined,
      trainNr: trainNr || undefined,
      startTime: isOff ? undefined : startTime || undefined,
      endTime: isOff ? undefined : endTime || undefined,
      isOff,
    })
  }

  if (!parsed.length) {
    throw new Error('저장할 수 있는 근무 행이 없어요. 날짜와 다이번호 컬럼을 확인해 주세요.')
  }

  return parsed.sort((a, b) => a.date.localeCompare(b.date))
}

function findHeaderIndex(rows: Cell[][]): number {
  let bestIndex = 0
  let bestScore = -1
  rows.slice(0, 12).forEach((row, index) => {
    const headers = row.map(cell => clean(cell))
    const cols = resolveColumns(headers)
    let score = 0
    if (cols.date >= 0) score += 4
    if (cols.dia != null) score += 3
    if (cols.start != null) score += 2
    if (cols.end != null) score += 2
    if (cols.train != null || cols.train1 != null || cols.train2 != null) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestScore >= 4 ? bestIndex : 0
}

function resolveColumns(headers: string[]): ColumnMap {
  return {
    date: findColumn(headers, DATE_HEADERS) ?? -1,
    dia: findColumn(headers, DIA_HEADERS),
    train: findColumn(headers, TRAIN_HEADERS),
    train1: findColumn(headers, TRAIN1_HEADERS),
    train2: findColumn(headers, TRAIN2_HEADERS),
    start: findColumn(headers, START_HEADERS),
    end: findColumn(headers, END_HEADERS),
    off: findColumn(headers, OFF_HEADERS),
  }
}

function findColumn(headers: string[], candidates: string[]): number | undefined {
  const normalizedHeaders = headers.map(normalizeHeader)
  const normalizedCandidates = candidates.map(normalizeHeader)
  const exact = normalizedHeaders.findIndex(header => normalizedCandidates.includes(header))
  if (exact >= 0) return exact
  const included = normalizedHeaders.findIndex(header =>
    !!header && normalizedCandidates.some(candidate => header.includes(candidate) || candidate.includes(header)),
  )
  return included >= 0 ? included : undefined
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s._\-()\/\\·:]/g, '')
}

function valueAt(row: Cell[], index?: number): string {
  if (index == null || index < 0) return ''
  return clean(row[index])
}

function cellAt(row: Cell[], index?: number): Cell {
  if (index == null || index < 0) return undefined
  return row[index]
}

function clean(value: Cell): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).replace(/\uFEFF/g, '').trim()
}

function normalizeTrainNr(combined: string, train1: string, train2: string): string {
  // "-" 는 대표열번2 미사용 등의 빈 자리표시자 — 떼어 내 "209 · -" 같은
  // 매달린 구분자가 저장되지 않게 한다 (AI·직접입력 경로와 동일 규칙).
  const t1 = (train1 ?? '').trim() === '-' ? '' : (train1 ?? '').trim()
  const t2 = (train2 ?? '').trim() === '-' ? '' : (train2 ?? '').trim()
  if (t1 && t2) return `${t1} · ${t2}`
  if (t1 || t2) return t1 || t2
  if (combined) {
    return combined
      .split(/[,.\s·]+/)
      .map(s => s.trim())
      .filter(s => s && s !== '-')
      .join(' · ')
  }
  return ''
}

function detectOff(diaNr: string, offValue: string, startTime: string, endTime: string, trainNr: string): boolean {
  const dia = diaNr.trim().toLowerCase()
  const off = offValue.trim().toLowerCase()
  if (/^(s|off|휴무|휴일|오프)/i.test(dia)) return true
  if (['y', 'yes', 'true', '1', 'o', '휴무', '휴일', '오프', 'off'].includes(off)) return true
  return !startTime && !endTime && !trainNr && /휴|off|오프/i.test(diaNr)
}

function normalizeDate(value: Cell, defaultYear: number): string | null {
  if (value instanceof Date) return dateToIso(value)
  if (typeof value === 'number' && Number.isFinite(value)) return excelDateToIso(value)

  const raw = clean(value)
  if (!raw) return null

  const korean = raw.match(/(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/)
  if (korean) {
    const y = korean[1] ? expandYear(Number(korean[1])) : defaultYear
    return buildIso(y, Number(korean[2]), Number(korean[3]))
  }

  const numeric = raw.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/)
  if (numeric) {
    const a = Number(numeric[1])
    const b = Number(numeric[2])
    const c = Number(numeric[3])
    if (a > 31) return buildIso(expandYear(a), b, c)
    if (c > 31) return buildIso(expandYear(c), a, b)
    return buildIso(defaultYear, a, b)
  }

  const serial = Number(raw)
  if (Number.isFinite(serial) && serial > 20000) return excelDateToIso(serial)
  return null
}

function normalizeTime(value: Cell | undefined): string {
  if (value == null) return ''
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value >= 1 ? value % 1 : value
    if (fraction > 0) return minutesToTime(Math.round(fraction * 24 * 60))
  }

  const raw = clean(value)
  if (!raw || /^(--?|오프|휴무|휴일|off)$/i.test(raw)) return ''

  const nextDay = /익일|다음날|next/i.test(raw)
  const colon = raw.match(/(\d{1,2})\s*[:시h]\s*(\d{1,2})/)
  if (colon) {
    let hour = Number(colon[1])
    const minute = Number(colon[2])
    if (nextDay && hour < 24) hour += 24
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  const compact = raw.replace(/\D/g, '')
  if (compact.length === 3 || compact.length === 4) {
    let hour = Number(compact.slice(0, -2))
    const minute = Number(compact.slice(-2))
    if (nextDay && hour < 24) hour += 24
    if (minute < 60) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  return ''
}

function parseCsv(text: string): Cell[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"'
      i++
    } else if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  row.push(cell)
  rows.push(row)
  return rows
}

function excelDateToIso(serial: number): string | null {
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  return buildIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function dateToIso(date: Date): string {
  return buildIso(date.getFullYear(), date.getMonth() + 1, date.getDate()) ?? ''
}

function buildIso(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year
}

function minutesToTime(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}
