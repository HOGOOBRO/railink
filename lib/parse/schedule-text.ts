import type { ParsedScheduleRow } from './schedule-file'

interface TextParseContext {
  defaultYear: number
  defaultMonth: number
}

interface ParsedLine {
  row: ParsedScheduleRow
  score: number
}

const DIA_RE = /(?:~\s*)?\(?\s*H\s*[0-9A-Z]{3,5}\s*\)?|S\s*(?:\([^)]{0,12}\))?|휴무|휴일|오프|OFF/iu

export function parseScheduleText(
  text: string,
  defaultYear = new Date().getFullYear(),
  defaultMonth = new Date().getMonth() + 1,
): ParsedScheduleRow[] {
  const normalized = normalizeOcrText(text)
  const context = inferContext(normalized, { defaultYear, defaultMonth })
  const lines = normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)

  const parsed = new Map<string, ParsedLine>()
  for (const candidate of buildCandidateLines(lines)) {
    const result = parseScheduleLine(candidate, context)
    if (!result) continue
    const key = `${result.row.date}|${result.row.diaNr ?? ''}|${result.row.startTime ?? ''}|${result.row.endTime ?? ''}`
    const previous = parsed.get(key)
    if (!previous || result.score > previous.score) parsed.set(key, result)
  }

  return [...parsed.values()]
    .map(item => item.row)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[|｜]/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[：]/g, ':')
    .replace(/[ㆍ・]/g, '·')
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[Ｓｓ]/g, 'S')
    .replace(/[Ｈｈ]/g, 'H')
    .replace(/０/g, '0')
    .replace(/[lI](?=\d{3,})/g, '1')
}

function inferContext(text: string, fallback: TextParseContext): TextParseContext {
  const full = text.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*(?:[.\-/월]|월)/)
  if (full) {
    return { defaultYear: Number(full[1]), defaultMonth: Number(full[2]) }
  }
  const monthOnly = text.match(/(?:^|\D)(\d{1,2})\s*월/)
  if (monthOnly) {
    const month = Number(monthOnly[1])
    if (month >= 1 && month <= 12) return { ...fallback, defaultMonth: month }
  }
  return fallback
}

function buildCandidateLines(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i])
    if (i + 1 < lines.length) out.push(`${lines[i]} ${lines[i + 1]}`)
    if (i + 2 < lines.length) out.push(`${lines[i]} ${lines[i + 1]} ${lines[i + 2]}`)
  }
  return out
}

function parseScheduleLine(line: string, context: TextParseContext): ParsedLine | null {
  const date = extractDate(line, context)
  const dia = extractDia(line)
  if (!date || !dia) return null

  const isOff = /^(S|휴|오프|OFF)/iu.test(dia)
  const times = isOff ? [] : extractTimes(line)
  const trainNr = isOff ? '' : extractTrainNr(line, dia, times)

  const score =
    3 +
    (/\d{4}/.test(line) ? 2 : 0) +
    (times.length >= 2 ? 3 : times.length) +
    (trainNr ? 1 : 0) +
    (isOff ? 1 : 0)

  return {
    row: {
      date,
      diaNr: dia,
      trainNr: trainNr || undefined,
      startTime: times[0],
      endTime: times[1],
      isOff,
    },
    score,
  }
}

function extractDate(line: string, context: TextParseContext): string | null {
  const korean = line.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/)
  if (korean) {
    return buildIso(
      korean[1] ? Number(korean[1]) : context.defaultYear,
      Number(korean[2]),
      Number(korean[3]),
    )
  }

  const full = line.match(/(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/)
  if (full) return buildIso(Number(full[1]), Number(full[2]), Number(full[3]))

  const monthDay = line.match(/(?:^|\D)(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?=\D|$)/)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return buildIso(context.defaultYear, month, day)
    }
  }

  const dayBeforeDia = line.match(new RegExp(`(?:^|\\s)(\\d{1,2})(?:일)?\\s+(?=${DIA_RE.source})`, 'iu'))
  if (dayBeforeDia) {
    const day = Number(dayBeforeDia[1])
    if (day >= 1 && day <= 31) return buildIso(context.defaultYear, context.defaultMonth, day)
  }

  return null
}

function extractDia(line: string): string | null {
  const match = line.match(DIA_RE)
  if (!match) return null
  const raw = match[0].replace(/\s+/g, '').toUpperCase()
  if (/^OFF$/i.test(raw)) return '오프'
  if (/^휴/.test(raw) || /^오프/.test(raw)) return raw
  if (raw.startsWith('S')) return raw
  if (raw.startsWith('~')) return raw.replace(/^~\(?/, '~(').replace(/\)?$/, ')')
  return raw
}

function extractTimes(line: string): string[] {
  const times: string[] = []
  const colonRe = /(?:익일|다음날|next)?\s*(\d{1,2})\s*:\s*(\d{2})/giu
  let match: RegExpExecArray | null
  while ((match = colonRe.exec(line)) && times.length < 2) {
    const raw = match[0]
    let hour = Number(match[1])
    const minute = Number(match[2])
    if (/익일|다음날|next/i.test(raw) && hour < 24) hour += 24
    if (minute < 60) times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  if (times.length >= 2) return times

  const labelled = line.matchAll(/(?:출근|퇴근|시업|종업)\D{0,4}(\d{3,4})/g)
  for (const item of labelled) {
    const compact = item[1].padStart(4, '0')
    const hour = Number(compact.slice(0, -2))
    const minute = Number(compact.slice(-2))
    if (hour < 36 && minute < 60) times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    if (times.length >= 2) break
  }
  return times
}

function extractTrainNr(line: string, dia: string, times: string[]): string {
  let compact = line.replace(dia, ' ')
  for (const time of times) {
    const [h, m] = time.split(':')
    compact = compact
      .replace(time, ' ')
      .replace(`${Number(h)}:${m}`, ' ')
      .replace(`${h}${m}`, ' ')
  }
  const trainTokens = compact
    .match(/\b\d{2,4}\b/g)
    ?.filter(token => {
      const n = Number(token)
      return n > 31 && n < 10000
    }) ?? []

  return trainTokens.slice(0, 2).join(' · ')
}

function buildIso(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
