import { NextRequest, NextResponse } from 'next/server'
import type { ParsedScheduleRow } from '@/lib/parse/schedule-file'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
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
  rows: AiScheduleRow[]
  warnings: string[]
}

const scheduleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rows', 'warnings'],
  properties: {
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
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되어 있지 않아 이미지 인식을 사용할 수 없어요.' },
        { status: 500 },
      )
    }

    const form = await req.formData()
    const file = form.get('image')
    const defaultYear = Number(form.get('defaultYear')) || new Date().getFullYear()
    const defaultMonth = Number(form.get('defaultMonth')) || new Date().getMonth() + 1

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일이 필요해요.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있어요.' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: '이미지는 8MB 이하로 올려주세요.' }, { status: 400 })
    }

    const dataUrl = await fileToDataUrl(file)
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
                text: buildPrompt(defaultYear, defaultMonth),
              },
              {
                type: 'input_image',
                image_url: dataUrl,
                detail: 'high',
              },
            ],
          },
        ],
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

    const payload = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || '이미지 인식 API 호출에 실패했어요.' },
        { status: response.status },
      )
    }

    const outputText = extractOutputText(payload)
    if (!outputText) {
      return NextResponse.json({ error: '이미지 인식 결과가 비어 있어요.' }, { status: 502 })
    }

    const parsed = JSON.parse(outputText) as AiScheduleResult
    const rows = normalizeRows(parsed.rows)
    if (!rows.length) {
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
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '이미지 인식 중 문제가 생겼어요.' },
      { status: 500 },
    )
  }
}

function buildPrompt(defaultYear: number, defaultMonth: number): string {
  return [
    'You are extracting a KTX crew monthly work schedule from a screenshot.',
    'Return JSON only according to the schema.',
    `If the year/month are ambiguous, use ${defaultYear}-${String(defaultMonth).padStart(2, '0')}.`,
    'Extract one row per visible business date that has a duty/off entry.',
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

function normalizeRows(rows: AiScheduleRow[] = []): ParsedScheduleRow[] {
  return rows
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .map(row => {
      const isOff = Boolean(row.isOff)
      const startTime = isOff ? '' : normalizeTime(row.startTime)
      const endTime = isOff ? '' : normalizeTime(row.endTime)
      return {
        date: row.date,
        diaNr: row.diaNr.trim() || undefined,
        trainNr: row.trainNr.trim() || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        isOff,
      }
    })
    .filter(row => row.diaNr || row.startTime || row.endTime || row.trainNr)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeTime(value: string): string {
  const text = value.trim()
  if (!text) return ''
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || minute < 0 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
