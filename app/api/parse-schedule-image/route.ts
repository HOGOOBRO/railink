import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedScheduleRow } from '@/lib/parse/schedule-file'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 5
// Keep multipart payloads below Vercel's request body ceiling after client-side compression.
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MONTHLY_AI_LIMIT = 5
const MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini'

interface AiScheduleRow {
  date: string
  diaNr: string
  trainNr: string
  startTime: string
  endTime: string
  isOff: boolean
}

interface AiScheduleResult {
  scheduleYear: number
  scheduleMonth: number
  periodSource: 'image' | 'fallback'
  rows: AiScheduleRow[]
  warnings: string[]
}

interface SchedulePeriod {
  year: number
  month: number
  source: 'image' | 'fallback'
}

interface UsageStatus {
  limit: number
  used: number
  remaining: number
  month: string
}

interface AiUsageDatabase {
  public: {
    Tables: {
      ai_image_usage: {
        Row: {
          id: number
          user_id: string
          usage_month: string
          image_count: number
          model: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          usage_month: string
          image_count?: number
          model?: string | null
        }
        Update: {
          user_id?: string
          usage_month?: string
          image_count?: number
          model?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type AiUsageSupabase = SupabaseClient<AiUsageDatabase>

const scheduleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scheduleYear', 'scheduleMonth', 'periodSource', 'rows', 'warnings'],
  properties: {
    scheduleYear: {
      type: 'integer',
      description: 'Four-digit schedule year. Read a visible year first; otherwise use the provided fallback year.',
    },
    scheduleMonth: {
      type: 'integer',
      description: 'Schedule month from 1 to 12. Read a visible month header first; otherwise use the provided fallback month.',
    },
    periodSource: {
      type: 'string',
      enum: ['image', 'fallback'],
      description: 'Use image when the month was read from a visible screenshot label or calendar header.',
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'diaNr', 'trainNr', 'startTime', 'endTime', 'isOff'],
        properties: {
          date: {
            type: 'string',
            description: 'Business date in YYYY-MM-DD format.',
          },
          diaNr: {
            type: 'string',
            description: 'Duty code such as H1055, ~(H1055), S, S(주휴), 휴무, or empty string if unknown.',
          },
          trainNr: {
            type: 'string',
            description: 'Representative train numbers joined with " · ", or empty string.',
          },
          startTime: {
            type: 'string',
            description: 'Start time as HH:MM. Use 24+ hour format for next-day end only when needed. Empty for off days.',
          },
          endTime: {
            type: 'string',
            description: 'End time as HH:MM. Use 24+ hour format for next-day end only when needed. Empty for off days.',
          },
          isOff: {
            type: 'boolean',
            description: 'True for off/holiday/rest days.',
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

export async function POST(req: NextRequest) {
  try {
    const headerToken = getBearerToken(req)
    console.info('[parse-schedule-image] Request received', {
      contentLength: req.headers.get('content-length') ?? 'unknown',
      hasHeaderToken: Boolean(headerToken),
    })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되어 있지 않아 이미지 인식을 사용할 수 없어요.' },
        { status: 500 },
      )
    }
    const form = await readScheduleForm(req)
    const auth = await getAuthenticatedSupabase(headerToken || getFormAccessToken(form))
    if (!auth) {
      console.info('[parse-schedule-image] Authentication rejected')
      return NextResponse.json(
        { error: 'AI 이미지 인식은 실제 로그인 계정에서만 사용할 수 있어요.' },
        { status: 401 },
      )
    }
    if (!form) {
      return NextResponse.json({ error: '이미지 업로드 본문을 읽지 못했어요. 다시 시도해 주세요.' }, { status: 400 })
    }

    const usageMonth = getCurrentUsageMonth()
    const usedThisMonth = await getImageUsageCount(auth.supabase, auth.userId, usageMonth)
    if (usedThisMonth >= MONTHLY_AI_LIMIT) {
      return NextResponse.json(
        {
          error: `이번 달 AI 이미지 인식 ${MONTHLY_AI_LIMIT}회 한도를 모두 사용했어요. 엑셀/CSV 또는 직접 입력을 사용해 주세요.`,
          usage: buildUsageStatus(usedThisMonth, usageMonth),
        },
        { status: 429 },
      )
    }

    const files = form.getAll('image').filter((file): file is File => file instanceof File)
    const defaultYear = Number(form.get('defaultYear')) || new Date().getFullYear()
    const defaultMonth = Number(form.get('defaultMonth')) || new Date().getMonth() + 1

    if (!files.length) {
      return NextResponse.json({ error: '이미지 파일이 필요해요.' }, { status: 400 })
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json({ error: `이미지는 한 번에 최대 ${MAX_IMAGES}장까지 올릴 수 있어요.` }, { status: 400 })
    }
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_IMAGE_BYTES) {
      return NextResponse.json({ error: '이미지는 총 3MB 이하로 올려주세요.' }, { status: 400 })
    }
    for (const file of files) {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'PNG, JPG, WEBP 이미지만 업로드할 수 있어요.' }, { status: 400 })
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: '이미지는 장당 8MB 이하로 올려주세요.' }, { status: 400 })
      }
    }
    console.info('[parse-schedule-image] Starting recognition', {
      imageCount: files.length,
      totalSize,
      usageMonth,
    })

    const imageContent = await Promise.all(
      files.map(async file => ({
        type: 'input_image' as const,
        image_url: await fileToDataUrl(file),
        detail: 'high' as const,
      })),
    )
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildPrompt(defaultYear, defaultMonth, files.length),
              },
              ...imageContent,
            ],
          },
        ],
        temperature: 0,
        text: {
          format: {
            type: 'json_schema',
            name: 'railink_schedule_image_parse',
            strict: true,
            schema: scheduleSchema,
          },
        },
      }),
    })

    const payload = await readJson(response)
    if (!response.ok) {
      console.error('[parse-schedule-image] OpenAI request failed', {
        status: response.status,
        message: getOpenAiErrorMessage(payload),
      })
      return NextResponse.json(
        { error: getOpenAiErrorMessage(payload) || '이미지 인식 API 호출에 실패했어요.' },
        { status: response.status },
      )
    }
    await recordImageUsage(auth.supabase, auth.userId, usageMonth, files.length)
    const usage = buildUsageStatus(usedThisMonth + 1, usageMonth)

    const outputText = extractOutputText(payload)
    if (!outputText) {
      return NextResponse.json({ error: '이미지 인식 결과가 비어 있어요.' }, { status: 502 })
    }

    const parsed = parseAiScheduleResult(outputText)
    if (!parsed) {
      console.error('[parse-schedule-image] Failed to parse model output', {
        preview: outputText.slice(0, 500),
      })
      return NextResponse.json({ error: '이미지 인식 결과 형식이 올바르지 않아요. 다시 시도해 주세요.' }, { status: 502 })
    }

    const period = normalizeSchedulePeriod(parsed, defaultYear, defaultMonth)
    const rows = normalizeRows(parsed.rows, period.year, period.month)
    if (!rows.length) {
      console.error('[parse-schedule-image] No usable rows extracted', {
        rowCount: parsed.rows?.length ?? 0,
        warnings: parsed.warnings ?? [],
      })
      return NextResponse.json(
        { error: '이미지에서 저장 가능한 근무 행을 찾지 못했어요.', warnings: parsed.warnings ?? [] },
        { status: 422 },
      )
    }

    return NextResponse.json({
      rows,
      warnings: parsed.warnings ?? [],
      raw: parsed,
      model: MODEL,
      imageCount: files.length,
      period,
      usage,
    })
  } catch (error) {
    console.error('[parse-schedule-image] Unexpected failure', {
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '이미지 인식 중 문제가 생겼어요.' },
      { status: 500 },
    )
  }
}

async function getAuthenticatedSupabase(token: string): Promise<{
  supabase: AiUsageSupabase
  userId: string
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anonKey) return null

  const supabase = createClient<AiUsageDatabase>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return { supabase, userId: data.user.id }
}

function getBearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? ''
}

async function readScheduleForm(req: NextRequest): Promise<FormData | null> {
  try {
    return await req.formData()
  } catch (error) {
    console.error('[parse-schedule-image] Failed to read multipart form', {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function getFormAccessToken(form: FormData | null): string {
  const token = form?.get('accessToken')
  return typeof token === 'string' ? token.trim() : ''
}

function getCurrentUsageMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

async function getImageUsageCount(
  supabase: AiUsageSupabase,
  userId: string,
  usageMonth: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('ai_image_usage')
    .select('id')
    .eq('user_id', userId)
    .eq('usage_month', usageMonth)
    .limit(MONTHLY_AI_LIMIT + 1)

  if (error) throw new Error(formatUsageStoreError(error.message))
  return Array.isArray(data) ? data.length : 0
}

async function recordImageUsage(
  supabase: AiUsageSupabase,
  userId: string,
  usageMonth: string,
  imageCount: number,
): Promise<void> {
  const { error } = await supabase.from('ai_image_usage').insert({
    user_id: userId,
    usage_month: usageMonth,
    image_count: imageCount,
    model: MODEL,
  })
  if (error) throw new Error(formatUsageStoreError(error.message))
}

function buildUsageStatus(used: number, usageMonth: string): UsageStatus {
  return {
    limit: MONTHLY_AI_LIMIT,
    used,
    remaining: Math.max(0, MONTHLY_AI_LIMIT - used),
    month: usageMonth,
  }
}

function formatUsageStoreError(message: string): string {
  if (/ai_image_usage|schema cache|relation|does not exist/i.test(message)) {
    return 'Supabase AI 사용량 테이블이 아직 적용되지 않아 이미지 인식을 사용할 수 없어요.'
  }
  return message || 'AI 사용량을 확인할 수 없어요.'
}

function buildPrompt(defaultYear: number, defaultMonth: number, imageCount: number): string {
  return [
    'You are extracting a KTX crew monthly work schedule from a screenshot.',
    imageCount > 1
      ? `There are ${imageCount} screenshots. Treat them as cropped pieces of the same monthly schedule, in upload order.`
      : 'There is one screenshot.',
    'If screenshots overlap, merge duplicate dates and keep the clearest row.',
    'The source is often a calendar or roster screenshot. Scan every visible cell and row from top to bottom and left to right.',
    'Return JSON only according to the schema.',
    'Read the schedule year and month from a visible title, calendar header, date range, or roster label before using a fallback.',
    `Only if the schedule year/month are not visible or remain ambiguous, use fallback ${defaultYear}-${String(defaultMonth).padStart(2, '0')}.`,
    'Set periodSource to "image" only when a visible image label establishes the schedule month. Otherwise use "fallback".',
    'If a date is shown only as a day number, convert it to a full YYYY-MM-DD date using scheduleYear and scheduleMonth.',
    'Never return a date as only a day number, M/D, or YYYY-M-D.',
    'Extract one row per visible business date that has a duty/off entry.',
    'Include rows even when train numbers or times are unclear; leave unclear fields as empty strings.',
    'Important fields:',
    '- date: YYYY-MM-DD.',
    '- diaNr: duty code, usually H plus digits/letters, ~(Hxxxx), S, S(주휴), 휴무, 오프.',
    '- trainNr: train numbers if visible, joined with " · ".',
    '- startTime/endTime: HH:MM; if end is next day, allow 24+ hour notation such as 25:08.',
    '- isOff: true for S, S(주휴), 휴무, 오프, off/rest days.',
    'Do not hallucinate unclear times or train numbers. Use empty string when unclear.',
    'Ignore UI chrome, phone status bar, app navigation, and unrelated text.',
    'Korean text may appear; preserve Korean off labels when visible.',
  ].join('\n')
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getOpenAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return ''
  const error = payload.error
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return ''
}

function parseAiScheduleResult(text: string): AiScheduleResult | null {
  try {
    const parsed = JSON.parse(text) as Partial<AiScheduleResult>
    if (!Array.isArray(parsed.rows)) return null
    return {
      scheduleYear: typeof parsed.scheduleYear === 'number' ? parsed.scheduleYear : 0,
      scheduleMonth: typeof parsed.scheduleMonth === 'number' ? parsed.scheduleMonth : 0,
      periodSource: parsed.periodSource === 'image' ? 'image' : 'fallback',
      rows: parsed.rows.filter(isAiScheduleRow),
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string')
        : [],
    }
  } catch {
    return null
  }
}

function normalizeSchedulePeriod(
  result: AiScheduleResult,
  defaultYear: number,
  defaultMonth: number,
): SchedulePeriod {
  const year = Number.isInteger(result.scheduleYear) && result.scheduleYear >= 2000 && result.scheduleYear <= 2100
    ? result.scheduleYear
    : defaultYear
  const month = Number.isInteger(result.scheduleMonth) && result.scheduleMonth >= 1 && result.scheduleMonth <= 12
    ? result.scheduleMonth
    : defaultMonth
  const source = year === result.scheduleYear && month === result.scheduleMonth
    ? result.periodSource
    : 'fallback'
  return { year, month, source }
}

function isAiScheduleRow(value: unknown): value is AiScheduleRow {
  return isRecord(value)
    && typeof value.date === 'string'
    && typeof value.diaNr === 'string'
    && typeof value.trainNr === 'string'
    && typeof value.startTime === 'string'
    && typeof value.endTime === 'string'
    && typeof value.isOff === 'boolean'
}

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return `data:${file.type};base64,${buffer.toString('base64')}`
}

function extractOutputText(payload: unknown): string {
  if (!isRecord(payload)) return ''
  if (typeof payload.output_text === 'string') return payload.output_text
  const chunks: string[] = []
  if (!Array.isArray(payload.output)) return ''
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text)
      }
    }
  }
  return chunks.join('\n').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeRows(
  rows: AiScheduleRow[] = [],
  defaultYear: number,
  defaultMonth: number,
): ParsedScheduleRow[] {
  const normalized = rows
    .map((row): ParsedScheduleRow | null => {
      const date = normalizeDate(row.date, defaultYear, defaultMonth)
      if (!date) return null
      const diaNr = normalizeDia(row.diaNr)
      const isOff = Boolean(row.isOff) || detectOff(diaNr)
      const startTime = isOff ? '' : normalizeTime(row.startTime)
      const endTime = isOff ? '' : normalizeTime(row.endTime)
      const normalizedRow: ParsedScheduleRow = {
        date,
        diaNr: diaNr || undefined,
        trainNr: normalizeTrainNr(row.trainNr) || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        isOff,
      }
      return normalizedRow
    })
    .filter((row): row is ParsedScheduleRow => row !== null)
    .filter(row => row.diaNr || row.startTime || row.endTime || row.trainNr)

  const byDate = new Map<string, ParsedScheduleRow>()
  for (const row of normalized) {
    const existing = byDate.get(row.date)
    if (!existing || rowScore(row) >= rowScore(existing)) byDate.set(row.date, row)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeDate(value: string, defaultYear: number, defaultMonth: number): string | null {
  const text = normalizeDigits(value).trim()
  if (!text) return null

  const iso = text.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/)
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const korean = text.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/)
  if (korean) {
    return buildIso(
      korean[1] ? Number(korean[1]) : defaultYear,
      Number(korean[2]),
      Number(korean[3]),
    )
  }

  const monthDay = text.match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})$/)
  if (monthDay) return buildIso(defaultYear, Number(monthDay[1]), Number(monthDay[2]))

  const dayOnly = text.match(/^(\d{1,2})(?:일)?$/)
  if (dayOnly) return buildIso(defaultYear, defaultMonth, Number(dayOnly[1]))

  return null
}

function buildIso(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeDia(value: string): string {
  return normalizeDigits(value)
    .replace(/\s+/g, '')
    .replace(/^OFF$/i, '오프')
    .trim()
}

function normalizeTrainNr(value: string): string {
  return normalizeDigits(value)
    .replace(/\s*[,.、]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectOff(diaNr: string): boolean {
  return /^(S(?:\([^)]*\))?|휴무|휴일|오프|OFF)$/iu.test(diaNr)
}

function rowScore(row: ParsedScheduleRow): number {
  return [
    row.diaNr,
    row.trainNr,
    row.startTime,
    row.endTime,
  ].filter(Boolean).length + (row.isOff ? 1 : 0)
}

function normalizeTime(value: string): string {
  const text = normalizeDigits(value).trim()
  if (!text) return ''

  const nextDay = /익일|다음날|next/i.test(text)
  const match = text.match(/(\d{1,2})\s*[:시h]\s*(\d{1,2})/)
    ?? text.replace(/\D/g, '').match(/^(\d{1,2})(\d{2})$/)
  if (!match) return ''

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || minute < 0 || minute > 59) return ''
  const normalizedHour = nextDay && hour < 24 ? hour + 24 : hour
  if (normalizedHour > 35) return ''
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[—–]/g, '-')
}
