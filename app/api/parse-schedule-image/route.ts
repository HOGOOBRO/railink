import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedScheduleRow } from '@/lib/parse/schedule-file'
import type { Flight } from '@/lib/types/schedule'
import { isAirportCode } from '@/lib/airline-routes'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 5
// Keep multipart payloads below Vercel's request body ceiling (~4.5MB) after client-side
// compression. 4MB matches the client budget (lib/parse/schedule-image.ts) — raised from 3MB
// so dense rosters keep enough resolution for small time digits.
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MONTHLY_AI_LIMIT = 5
const MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1'

interface AiFlightLeg {
  flight: string
  from: string
  to: string
  std: string
  sta: string
  showup?: string
  terminal?: string
}

interface AiScheduleRow {
  date: string
  diaNr: string
  trainNr: string
  startTime: string
  endTime: string
  isOff: boolean
  flights?: AiFlightLeg[]   // 아시아나 등 노선 명시 항공사에서만 채워진다
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

// 항공사별로 출력 양식을 분리한다. flights(노선 레그)는 노선이 캡쳐에 명시된 항공사
// (아시아나)에서만 필요하므로, 그 경우에만 스키마에 넣는다. KTX·팀·에어프레미아는
// 기존 양식 그대로 — 잘 되던 인식의 출력 계약을 건드리지 않는다.
const FLIGHTS_SCHEMA = {
  type: 'array',
  description: 'Flight legs for this date, from the SECTOR + STD/STA columns. One object per leg, in order. Empty array for non-flight days (off / standby / layover-only).',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['flight', 'from', 'to', 'std', 'sta', 'showup', 'terminal'],
    properties: {
      flight: { type: 'string', description: 'Flight number, e.g. "OZ349" or "349". Empty string if none.' },
      from: { type: 'string', description: 'Departure airport IATA (3 letters) from the SECTOR column, e.g. "ICN".' },
      to: { type: 'string', description: 'Arrival airport IATA (3 letters) from the SECTOR column, e.g. "NKG".' },
      std: { type: 'string', description: 'Scheduled departure local time HH:MM (drop any day-number prefix). Empty if unknown.' },
      sta: { type: 'string', description: 'Scheduled arrival local time HH:MM (drop any day-number prefix). Empty if unknown.' },
      showup: { type: 'string', description: 'SHOWUP report time HH:MM if shown for this leg (drop terminal token and day-number, e.g. "T2 04 10:40" -> "10:40"). Empty if blank.' },
      terminal: { type: 'string', description: 'SHOWUP location/terminal token if shown, e.g. "T2", "G". Empty if blank.' },
    },
  },
} as const

function buildScheduleSchema(includeFlights: boolean) {
  const rowRequired = ['date', 'diaNr', 'trainNr', 'startTime', 'endTime', 'isOff']
  const rowProps: Record<string, unknown> = {
    date: { type: 'string', description: 'Business date in YYYY-MM-DD format.' },
    diaNr: { type: 'string', description: 'Duty code such as H1055, ~(H1055), S, S(주휴), 휴무, or empty string if unknown.' },
    trainNr: { type: 'string', description: 'Representative train numbers joined with " · ", or empty string.' },
    startTime: { type: 'string', description: 'Start time as HH:MM. Use 24+ hour format for next-day end only when needed. Empty for off days.' },
    endTime: { type: 'string', description: 'End time as HH:MM. Use 24+ hour format for next-day end only when needed. Empty for off days.' },
    isOff: { type: 'boolean', description: 'True for off/holiday/rest days.' },
  }
  if (includeFlights) {
    rowRequired.push('flights')
    rowProps.flights = FLIGHTS_SCHEMA
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['scheduleYear', 'scheduleMonth', 'periodSource', 'rows', 'warnings'],
    properties: {
      scheduleYear: { type: 'integer', description: 'Four-digit schedule year. Read a visible year first; otherwise use the provided fallback year.' },
      scheduleMonth: { type: 'integer', description: 'Schedule month from 1 to 12. Read a visible month header first; otherwise use the provided fallback month.' },
      periodSource: { type: 'string', enum: ['image', 'fallback'], description: 'Use image when the month was read from a visible screenshot label or calendar header.' },
      rows: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: rowRequired, properties: rowProps },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  }
}

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

    const unlimited = isUnlimitedEmail(auth.email)
    const usageMonth = getCurrentUsageMonth()
    let usedThisMonth = 0
    if (!unlimited) {
      usedThisMonth = await getImageUsageCount(auth.supabase, auth.userId, usageMonth)
      if (usedThisMonth >= MONTHLY_AI_LIMIT) {
        return NextResponse.json(
          {
            error: `이번 달 AI 이미지 인식 ${MONTHLY_AI_LIMIT}회 한도를 모두 사용했어요. 엑셀/CSV 또는 직접 입력을 사용해 주세요.`,
            usage: buildUsageStatus(usedThisMonth, usageMonth),
          },
          { status: 429 },
        )
      }
    }

    const files = form.getAll('image').filter((file): file is File => file instanceof File)
    const defaultYear = Number(form.get('defaultYear')) || new Date().getFullYear()
    const defaultMonth = Number(form.get('defaultMonth')) || new Date().getMonth() + 1
    const userName = String(form.get('userName') ?? '').trim()
    const airline = String(form.get('airline') ?? '').trim()

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
      unlimited,
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
                text: buildPrompt(defaultYear, defaultMonth, files.length, userName, airline),
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
            // 아시아나만 flights(노선 레그) 포함 양식. 나머지는 기존 양식 그대로.
            schema: buildScheduleSchema(airline === 'asiana'),
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
    let usage: UsageStatus | undefined
    if (!unlimited) {
      await recordImageUsage(auth.supabase, auth.userId, usageMonth, files.length)
      usage = buildUsageStatus(usedThisMonth + 1, usageMonth)
    }

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
        userName: userName || '<none>',
      })
      const warnings = parsed.warnings ?? []
      const nameNotFound = warnings.some(w => /name_not_found/i.test(w))
      const teamNeedsName = warnings.some(w => /team_roster_needs_username/i.test(w))
      const message = nameNotFound
        ? `팀 표에서 "${userName}" 이름을 찾지 못했어요. 표에 적힌 이름과 내 정보의 이름이 정확히 일치하는지 확인해 주세요.`
        : teamNeedsName
          ? '팀 표는 내 이름이 등록돼 있어야 인식할 수 있어요. 설정 → 내 정보에서 이름을 먼저 채워 주세요.'
          : '이미지에서 저장 가능한 근무 행을 찾지 못했어요.'
      return NextResponse.json({ error: message, warnings }, { status: 422 })
    }

    // Sanity check (team-roster only): the model can mis-read every small
    // single-letter cell as the same default token and still emit a full
    // month. If 5+ rows all carry the same diaNr (and no times were set),
    // that's almost certainly a guess — reject so the user goes to direct
    // input instead of saving wrong data.
    if (userName && rows.length >= 5) {
      const codes = new Set<string>()
      let hasExplicitTime = false
      for (const r of rows) {
        if (r.diaNr) codes.add(r.diaNr)
        if (r.startTime || r.endTime) {
          // KTX layout fills startTime/endTime directly from the image, so
          // the diversity check would false-positive there. If any explicit
          // time slipped in, treat the result as a single-user layout and
          // skip the guard.
          hasExplicitTime = true
          break
        }
      }
      if (!hasExplicitTime && codes.size <= 1) {
        console.error('[parse-schedule-image] Low diversity — likely a guess', {
          rowCount: rows.length,
          singleCode: [...codes][0] ?? '<none>',
        })
        return NextResponse.json(
          {
            error: '표를 또렷이 읽지 못했어요. 사진을 더 크고 선명하게 다시 찍거나, 직접 입력으로 등록해 주세요.',
            warnings: ['low_diversity_suspicion', ...(parsed.warnings ?? [])],
          },
          { status: 422 },
        )
      }
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
  email: string
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
  return { supabase, userId: data.user.id, email: data.user.email ?? '' }
}

/** 운영자(관리자) 계정 — 항상 이미지 인식 무제한. handle_new_user_profile()의
 *  is_admin 화이트리스트와 동일. (서버 코드라 클라이언트에 노출되지 않음) */
const ADMIN_UNLIMITED_EMAILS = new Set([
  'wlsgus23@nate.com', 'wlsgus23@naver.com', 'wlsgus11117@gmail.com',
])

/** Test/admin accounts that bypass the monthly AI image limit.
 * 관리자 이메일은 항상 무제한이고, 추가로 AI_IMAGE_UNLIMITED_EMAILS(콤마 구분)에
 * 적힌 이메일도 무제한. (서버 env, 클라이언트 비노출) */
function isUnlimitedEmail(email: string): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  if (ADMIN_UNLIMITED_EMAILS.has(lower)) return true
  const raw = process.env.AI_IMAGE_UNLIMITED_EMAILS
  if (!raw) return false
  const allow = raw.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
  return allow.includes(lower)
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

function buildPrompt(defaultYear: number, defaultMonth: number, imageCount: number, userName: string, airline: string): string {
  // 에어프레미아: KTX(A)/팀표(B) 프롬프트를 아예 거치지 않고 전용 프롬프트만 쓴다.
  // (그리드가 KTX 캘린더와 비슷해 A로 오인 → 편명·코드를 비우는 문제 방지)
  if (airline === 'air-premia') {
    const ap: string[] = [
      "You are extracting ONE Air Premia (에어프레미아) cabin-crew member's MONTHLY schedule from a screenshot.",
      'Layout: a 7-column calendar grid, columns Sun..Sat (일 월 화 수 목 금 토). Each day cell shows, top to bottom:',
      "  - the DAY NUMBER in the cell's top corner (01, 02, ...),",
      '  - an optional activity CODE (ANLV, OFF, OVMRIG, RDO, REST, STH, TCRE),',
      '  - zero to two flight numbers (YP### — e.g. YP801, YP102),',
      '  - ONE clock-time range like "0735(L)~1845(L)".',
      imageCount > 1
        ? `There are ${imageCount} screenshots of the same month; merge by date and keep the clearest cell.`
        : 'There is one screenshot.',
      'Read EVERY non-empty cell, left to right and top to bottom. Return JSON only per the schema.',
      '',
      '## Date — use the printed day number',
      'The period is printed near the top as "Period: 01Jun26 to 30Jun26" (DDMmmYY). Read the YEAR (26 -> 2026) and MONTH (Jun -> 06); set periodSource "image".',
      "For EACH cell, take the day number printed in that cell's corner and combine with the period year/month to make the date (YYYY-MM-DD). ALWAYS use the printed number — never infer the date from grid position (cells can look offset).",
      `If no period label is visible, fall back to ${defaultYear}-${String(defaultMonth).padStart(2, '0')} and set periodSource "fallback".`,
      '',
      '## Per-cell mapping (one row per non-empty cell)',
      '- trainNr: the flight number(s) shown, e.g. "YP801 · YP802". Join multiple with " · ". Keep the YP prefix exactly. REQUIRED whenever flight numbers are visible — never leave empty on a flight day.',
      '- diaNr: the activity code if the cell shows one (ANLV / OFF / OVMRIG / RDO / REST / STH / TCRE). If the cell has only flights+times, leave diaNr empty. A cell may have BOTH a code AND a flight (e.g. "REST" + "YP102") — put the code in diaNr and the flight in trainNr.',
      '- startTime / endTime: from the time range. startTime = FIRST time, endTime = LAST time. Drop the "(L)" suffix. Format HH:MM.',
      '- OVERNIGHT: if endTime is earlier than startTime, leave the printed clock value as-is (server adds +24h). A trailing "~" with no second time = continues next day (endTime empty). A leading "~HHMM" = continuation end on this date (startTime empty).',
      '- isOff = true ONLY for ANLV, OFF, OVMRIG, RDO (no times). isOff = false for REST, STH, TCRE and any cell that has flight numbers or times.',
      '',
      '## Rules',
      'Never return a date as only a day number — always full YYYY-MM-DD.',
      'Do NOT hallucinate codes/flights/times that are not visible; leave unclear fields as empty strings, but DO capture everything that IS printed (especially flight numbers and codes).',
      'Ignore the "Sum / Total BLH" box and the "Activity Code Descriptions" legend at the bottom — those are not daily cells.',
    ]
    return ap.join('\n')
  }

  if (airline === 'asiana') {
    const oz: string[] = [
      "You are extracting ONE Asiana Airlines (아시아나항공) cabin-crew member's MONTHLY roster from a screenshot.",
      'Layout: a TABLE with one row per FLIGHT LEG. Columns (left to right):',
      '  DATE (날짜, e.g. "04/01(수)") | FLIGHT (편명, digits like 349, 8949, 541) | SHOWUP (쇼업, e.g. "T2 04 10:40" or "G 07 11:25") | SECTOR (구간, e.g. "ICN/NKG") | STD (출발, "DD HH:MM" e.g. "04 12:30") | STA (도착, "DD HH:MM") | ETD.',
      'CRITICAL — group legs by DATE: the DATE cell is printed only on the FIRST leg of each day; following legs that day have a BLANK date and belong to the SAME date. Carry the last seen date down. Output ONE row per DATE, with that date\'s legs collected into the "flights" array (in order).',
      imageCount > 1
        ? `There are ${imageCount} screenshots of the same roster; merge by date and keep the clearest.`
        : 'There is one screenshot.',
      'Return JSON only per the schema.',
      '',
      '## Date',
      'Read the month from the rows (the DATE column is MM/DD). Use the year from any visible period label, else fall back to ' + `${defaultYear}`,
      `. Fallback month/year: ${defaultYear}-${String(defaultMonth).padStart(2, '0')} (periodSource "fallback"); otherwise "image". Each output row\'s "date" is the full YYYY-MM-DD of that DATE cell.`,
      '',
      '## Flight rows (one or more legs in a day)',
      'For each leg on that date, push an object into "flights":',
      '  - flight: the FLIGHT number exactly as printed (digits; keep as-is, e.g. "349", "8949"). ',
      '  - from / to: split the SECTOR "AAA/BBB" into from=AAA, to=BBB (3-letter IATA, e.g. ICN, NKG, GMP, CJU, FRA, MNL, PEK, BKK, TSN, SEA).',
      '  - std: the STD time as HH:MM (DROP the leading day-number — "04 12:30" → "12:30").',
      '  - sta: the STA time as HH:MM (DROP the leading day-number — "14 14:35" → "14:35").',
      '  - showup / terminal: SHOWUP is shown ONLY on the first leg of a trip, like "T2 04 10:40" or "G 07 11:25". Put terminal="T2"/"G" and showup="10:40" (drop the day-number). Leave both "" on legs with no SHOWUP.',
      'Also set, for the whole day row: trainNr = the flight numbers joined with " · " (e.g. "349 · 350"); startTime = first leg std; endTime = last leg sta; diaNr = "" ; isOff = false.',
      '',
      '## Non-flight rows (no FLIGHT number / no SECTOR)',
      '- "DAY OFF" → isOff true, diaNr "OFF", flights [].',
      '- "연차휴가" (annual leave) → isOff true, diaNr "연차", flights [].',
      '- "STBY확인요망" / "장거리 STBY확인요망" / standby → isOff false, diaNr "STBY", no times, flights [].',
      '- A row that shows ONLY an airport code with no flight number (e.g. "FRA", "BKK", "ICN" on a layover/rest day) → isOff false, diaNr "REST", no times, flights []. (It marks a stay; do not invent a flight.)',
      '- ANY OTHER text you do not recognize (training, ground duty, codes you have not seen) → put the text VERBATIM into diaNr, isOff false, no times, flights []. NEVER drop a cell\'s text or guess — preserve exactly what is printed so it can be classified later.',
      '',
      '## Rules',
      'Always emit full YYYY-MM-DD dates. Do NOT hallucinate sectors or times — leave a field empty if not printed, but capture everything that IS printed.',
      'Ignore the column header row, page tabs, and any totals.',
    ]
    return oz.join('\n')
  }
  const lines: string[] = [
    'You are extracting a monthly work schedule from a screenshot.',
    'The image may be one of two layouts — recognize which and proceed accordingly:',
    '  (A) Single-user KORAIL/KTX roster — ONE person\'s month. It appears EITHER as a calendar grid (each cell stacks a duty code + 1-2 train numbers + up to 3 clock times) OR, most commonly, as a per-day TABLE (XROIS) with one row per date and labeled columns: 사업일자(date) | 다이아번호(duty code) | 대표열번1 | 대표열번2 (train numbers) | 출근시각(start) | 퇴근시각(end) | 휴일여부 (Y=off / N=work). In layout (A) you MUST extract the train numbers.',
    '  (B) Team shift-roster spreadsheet — a row per PERSON. The leftmost column is a list of Korean NAMES; subsequent columns are dates 1..31, each cell containing a SHORT code letter (D, N, A, B, 출장, 연) and NO clock times.',
    'DISAMBIGUATION (decide this FIRST): look at the leftmost column. If it holds DATES / 사업일자 (e.g. "2026.07.01") or day numbers running down the rows, it is layout (A) — a single person\'s schedule, so you MUST extract the train numbers. Treat it as layout (B) ONLY when the leftmost column is a list of PERSON NAMES.',
    imageCount > 1
      ? `There are ${imageCount} screenshots. Treat them as cropped pieces of the same monthly schedule, in upload order.`
      : 'There is one screenshot.',
    'If screenshots overlap, merge duplicate dates and keep the clearest row.',
    'Scan every visible cell and row from top to bottom and left to right.',
    'Return JSON only according to the schema.',
    '',
    '## Period (year + month)',
    'On layout (A), the period is printed near the top as "YYYY년 MM월 현재" (e.g. "2026년 06월 현재"), and the two-digit month is often shown as a large faint watermark digit behind the grid (e.g. "06").',
    'On layout (B), look for a sheet tab/title like "2026.06" or "6월" near the top of the screenshot — the column headers are usually plain day numbers 1..31.',
    'On the per-day TABLE (XROIS), every row already carries a FULL date in the 사업일자 column (e.g. "2026.07.01"). Read each date directly from its own row; do not infer it from a header. The "1 2 3 4 5" tabs at the very top are page navigation — ignore them.',
    'Read that header/watermark/tab exactly. The month is 01-12 — use it verbatim.',
    'Cross-check: the weekday of day 1 must be consistent with the year and month you read.',
    `Use fallback ${defaultYear}-${String(defaultMonth).padStart(2, '0')} ONLY when no month label is visible anywhere.`,
    'Set periodSource to "image" when you read the month from the screenshot, otherwise "fallback".',
    '',
    '## Layout (A) — single-user KTX roster',
    '- diaNr: duty code, usually H plus digits/letters (e.g. H1055, H1G37, H1C27), ~(Hxxxx), S, S(주휴), 휴무, 오프.',
    '- Cell layout: code + 1-2 train numbers on one line, up to THREE clock times on the next.',
    '- trainNr: the number(s) shown next to the duty code (e.g. "16 216"). Join with " · ". Do NOT confuse them with clock times.',
    '- Times: FIRST time = startTime, LAST = endTime, IGNORE the middle one. HH:MM.',
    '- OVERNIGHT (박차/1박/야간): end < start ⇒ next day. Write end in 24+ hour notation (01:08 → 25:08, 11:49 → 35:49).',
    '- isOff: true for S, S(주휴), 휴무, 오프 (these cells have no times).',
    '',
    '### Layout (A) — per-day TABLE (XROIS) column mapping',
    '- One row = one date. Map columns directly, header by header:',
    '  · 다이아번호 → diaNr (verbatim: H1055, H1G37, ~(H1042), S, …).',
    '  · 대표열번1 + 대표열번2 → trainNr. Join the two with " · " and DROP any "-" placeholder. So 대표열번1="165", 대표열번2="170" → "165 · 170"; "209" + "-" → "209"; both "-" → empty.',
    '  · 출근시각 → startTime, 퇴근시각 → endTime. This table has EXACTLY two time columns (no middle time to skip).',
    '  · 휴일여부 = Y ⇒ isOff:true (that row\'s diaNr is usually "S" and its train/time cells are "-"). 휴일여부 = N ⇒ a working day, so train numbers MUST be filled from 대표열번1/2.',
    '- A "-" in any cell means empty. NEVER leave trainNr empty on a working (N) row when 대표열번1/2 show numbers.',
  ]
  if (userName) {
    lines.push(
      '',
      '## Layout (B) — team shift-roster',
      'PRECONDITION: apply this whole section ONLY when the leftmost column is a list of Korean PERSON names. If the leftmost column holds dates / 사업일자 / day numbers (the XROIS per-day table), this is layout (A) — IGNORE this entire section and extract train numbers as layout (A) describes. Do NOT leave trainNr empty for a single-person date table.',
      `### Step 1 — find the name row`,
      `- The user\'s name is: "${userName}". The leftmost column is a list of Korean names.`,
      `- Find the SINGLE row whose name exactly equals "${userName}" — ignore Korean whitespace and any parenthetical suffix like (이름).`,
      `- Verify: read the entire name back from the image and confirm it matches "${userName}" character-by-character. If unsure, return rows: [] + warning "name_not_found". DO NOT pick a similar-looking name.`,
      '- If no row matches, return rows: [] and add warning "name_not_found".',
      '',
      '### Step 2 — align columns with dates',
      '- The HEADER row above the data shows day numbers like "31 1 2 3 ... 30" or "1 2 3 ... 31". Read the header carefully.',
      `- The FIRST data column may belong to the previous month (e.g. a "31" header before scheduleMonth=6 means May 31). For any header day that is NOT a valid day in scheduleMonth (e.g. day=31 when scheduleMonth=6 has only 30 days), DO NOT emit a row for that column — skip it entirely.`,
      `- For each remaining column, the header day = the date number for scheduleYear/scheduleMonth. Pair the header day with the cell directly under it in the name row (vertical alignment, not offset).`,
      '',
      '### Step 3 — read each cell',
      '- Each cell holds ONE token: a single Latin letter ("D" / "N" / "A" / "B") OR a short Korean string ("출장" / "연" / "연차"). It is never a multi-letter Latin combo.',
      '- Latin letters can be visually similar — be extra careful: D has a vertical left bar with a half-circle right; B has TWO bumps; N has zig-zag strokes; A has a triangular top with a crossbar. Bold/colored variants are the SAME letter.',
      '- diaNr = the cell\'s token EXACTLY as printed. Leave trainNr / startTime / endTime as empty strings — the server fills startTime/endTime from the code.',
      '- isOff: true only when the code is D / DO / 연 / 연차.',
      '- If a cell is blank, whitespace-only, or its letter is genuinely unreadable, SKIP that day (do not emit a row, do not guess).',
      '- Sanity check: count the codes you emitted. If a sub-table to the right of the main table shows per-person totals (e.g. "D 9, N 0, A 11, B 9, 연 1"), use it to verify your per-code counts; if your count for a code differs by more than 1, re-read that code\'s cells.',
      '',
      '### CRITICAL confidence rule',
      '- If you cannot READ the cells with confidence (image too small/blurry/cropped, you would have to guess each letter), return rows: [] and warning "row_unreadable". An empty result is correct.',
      '- NEVER fill an entire month with the same code (e.g. 30 days of "N") — that pattern means you guessed a default token instead of reading. Real shift rosters have a mix of codes; one-code-fits-all is the signature of an OCR failure.',
      '- If after careful reading every cell would resolve to the same single code, you almost certainly mis-read — return rows: [] + "row_unreadable" instead.',
    )
  } else {
    lines.push(
      '',
      '## Layout (B) — team shift-roster',
      '- No user name was provided; you cannot pick a row. If the screenshot is a team roster, return rows: [] and warning "team_roster_needs_username".',
    )
  }
  lines.push(
    '',
    '## Common rules',
    'If a date is shown only as a day number, convert it to a full YYYY-MM-DD date using scheduleYear and scheduleMonth.',
    'Never return a date as only a day number, M/D, or YYYY-M-D.',
    'Include rows even when fields are unclear; leave unclear fields as empty strings.',
    'Do not hallucinate unclear times or train numbers. Empty string when unclear.',
    'Ignore UI chrome, phone status bar, app navigation, sheet toolbars, and unrelated text.',
    'Korean text may appear; preserve Korean labels exactly when visible.',
  )
  return lines.join('\n')
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
    && (value.flights === undefined || Array.isArray(value.flights))
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

/** Shift-code → fixed-hours mapping for shift-roster team tables (e.g. 항공사).
 * AI는 이런 표에선 다이 셀의 코드(D/N/A/B/출장/연 등)만 추출하고 시간은 비울 때가
 * 많아서, 서버가 코드별 기본 시간으로 채워준다. AI가 명시한 시간이 이미 있으면
 * 그게 우선. */
const SHIFT_CODE_MAP: Record<string, { start?: string; end?: string; off?: boolean }> = {
  D:    { off: true },
  DO:   { off: true },
  '연': { off: true },
  '연차': { off: true },
  N:    { start: '08:00', end: '17:00' },
  A:    { start: '05:30', end: '14:30' },
  B:    { start: '13:30', end: '22:30' },
  '출장': { start: '08:00', end: '11:00' },
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
      const codeMap = SHIFT_CODE_MAP[diaNr.toUpperCase()] ?? SHIFT_CODE_MAP[diaNr]
      const isOff = Boolean(row.isOff) || detectOff(diaNr) || (codeMap?.off ?? false)
      const startTime = isOff ? '' : (normalizeTime(row.startTime) || codeMap?.start || '')
      let endTime = isOff ? '' : (normalizeTime(row.endTime) || codeMap?.end || '')
      // Overnight (박차): if end is earlier than start, it lands on the next
      // day. Guarantee the +24h here in code so a missing "익일" hint from the
      // model can't yield a negative-duration (broken) timeline box.
      if (startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number)
        const [eh, em] = endTime.split(':').map(Number)
        if (eh < sh || (eh === sh && em <= sm)) {
          endTime = `${String(eh + 24).padStart(2, '0')}:${String(em).padStart(2, '0')}`
        }
      }
      // 노선 명시 항공사(아시아나): 하루치 레그를 정제해 보관하고, 그날 출도착·편명을
      // 첫/마지막 레그에서 끌어온다. flights는 저장되어 노선·시차·레그별 상세에 쓰인다.
      const flights = isOff ? [] : sanitizeFlights(row.flights)
      if (flights.length) {
        const first = flights[0]
        const last = flights[flights.length - 1]
        const legTrain = flights.map(f => f.flight).filter(Boolean).join(' · ')
        let fStart = first.std || ''
        let fEnd = last.sta || ''
        // 같은 시간대 야간(예: 국내선 박차)만 +24 보정 — 국제선 날짜 넘김은 placeShift가
        // instant로 처리하므로 여기선 단순 비교만(보수적).
        if (fStart && fEnd) {
          const [sh, sm] = fStart.split(':').map(Number)
          const [eh, em] = fEnd.split(':').map(Number)
          if (eh < sh || (eh === sh && em <= sm)) fEnd = `${String(eh + 24).padStart(2, '0')}:${String(em).padStart(2, '0')}`
        }
        return {
          date,
          diaNr: diaNr || undefined,
          trainNr: (legTrain || normalizeTrainNr(row.trainNr)) || undefined,
          startTime: fStart || startTime || undefined,
          endTime: fEnd || endTime || undefined,
          isOff: false,
          flights,
        }
      }
      const trainNr = normalizeTrainNr(row.trainNr) || undefined
      // 편명·시간 없이 공항코드만 찍힌 행(예: "BKK", "FRA")은 체류 마커다. 프롬프트가
      // REST로 시키지만 모델이 '모르는 코드'로 원문 보존해버리는 경우가 있어, 서버에서
      // 확정적으로 REST로 정규화한다 → 분류 UI에 안 뜨고(REST는 내장 코드), 캘린더에선
      // 체류 처리로 스킵된다. 편명/시간이 있으면 진짜 비행이므로 건드리지 않는다.
      const dia = !trainNr && !startTime && !endTime && isAirportCode(diaNr) ? 'REST' : diaNr
      const normalizedRow: ParsedScheduleRow = {
        date,
        diaNr: dia || undefined,
        trainNr,
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
    if (!existing) { byDate.set(row.date, row); continue }
    // 같은 날짜에 비행 레그가 흩어져 들어오면(모델이 날짜별로 안 묶고 레그별 행을 낸 경우)
    // 레그를 합친다 — 안 그러면 dedup이 날짜당 1행만 남겨 나머지 레그가 사라진다.
    if (row.flights?.length || existing.flights?.length) {
      byDate.set(row.date, mergeFlightRows(existing, row))
    } else if (rowScore(row) >= rowScore(existing)) {
      byDate.set(row.date, row)
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** 같은 날짜의 두 행을 비행 레그 기준으로 병합. 레그를 합쳐 std순 정렬·중복 제거하고
 *  그날 편명·출도착을 첫/마지막 레그에서 다시 끌어온다. */
function mergeFlightRows(a: ParsedScheduleRow, b: ParsedScheduleRow): ParsedScheduleRow {
  const seen = new Set<string>()
  const legs: Flight[] = []
  for (const f of [...(a.flights ?? []), ...(b.flights ?? [])]) {
    const key = `${f.flight ?? ''}|${f.std ?? ''}|${f.from ?? ''}|${f.to ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    legs.push(f)
  }
  if (!legs.length) return rowScore(b) >= rowScore(a) ? b : a
  legs.sort((x, y) => (x.std ?? '').localeCompare(y.std ?? ''))
  const first = legs[0], last = legs[legs.length - 1]
  const legTrain = legs.map(f => f.flight).filter(Boolean).join(' · ')
  let end = last.sta || ''
  const start = first.std || ''
  if (start && end) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    if (eh < sh || (eh === sh && em <= sm)) end = `${String(eh + 24).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  }
  return {
    date: a.date,
    isOff: false,
    diaNr: a.diaNr ?? b.diaNr,
    trainNr: legTrain || a.trainNr || b.trainNr || undefined,
    startTime: start || a.startTime || undefined,
    endTime: end || a.endTime || undefined,
    flights: legs,
  }
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
  // Split on every separator (comma, dot, middot) and whitespace, then drop
  // "-" placeholders (an empty 대표열번 column in the XROIS table) and blanks
  // so "209 · -" never reaches storage as a dangling separator. KTX train
  // numbers are bare integers, so whitespace is always a delimiter.
  return normalizeDigits(value)
    .split(/[,.、·\s]+/)
    .map(token => token.trim())
    .filter(token => token && token !== '-')
    .join(' · ')
}

function detectOff(diaNr: string): boolean {
  return /^(S(?:\([^)]*\))?|휴무|휴일|오프|OFF)$/iu.test(diaNr)
}

/** AI가 준 비행 레그를 정제: IATA 3자리·HH:MM·편명만 남기고 빈 레그는 버린다. */
function sanitizeFlights(legs: AiFlightLeg[] | undefined): Flight[] {
  if (!Array.isArray(legs)) return []
  const out: Flight[] = []
  for (const leg of legs) {
    if (!isRecord(leg)) continue
    const flight = typeof leg.flight === 'string' ? normalizeDigits(leg.flight).replace(/\s+/g, '').trim() : ''
    const from = sanitizeIata(leg.from)
    const to = sanitizeIata(leg.to)
    const std = typeof leg.std === 'string' ? normalizeTime(leg.std) : ''
    const sta = typeof leg.sta === 'string' ? normalizeTime(leg.sta) : ''
    const showup = typeof leg.showup === 'string' ? normalizeTime(leg.showup) : ''
    const terminal = typeof leg.terminal === 'string' ? leg.terminal.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : ''
    if (!flight && !from && !to && !std && !sta) continue
    out.push({
      flight: flight || undefined,
      from: from || undefined,
      to: to || undefined,
      std: std || undefined,
      sta: sta || undefined,
      showup: showup || undefined,
      terminal: terminal || undefined,
    })
  }
  return out
}

function sanitizeIata(value: unknown): string {
  if (typeof value !== 'string') return ''
  const code = value.toUpperCase().replace(/[^A-Z]/g, '')
  return code.length === 3 ? code : ''
}

function rowScore(row: ParsedScheduleRow): number {
  return [
    row.diaNr,
    row.trainNr,
    row.startTime,
    row.endTime,
  ].filter(Boolean).length + (row.isOff ? 1 : 0) + (row.flights?.length ?? 0)
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
  if (normalizedHour > 40) return ''
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[—–]/g, '-')
}
