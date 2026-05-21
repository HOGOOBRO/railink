import type { ParsedScheduleRow } from './schedule-file'
import { supabase } from '@/lib/supabase'

export interface OcrProgress {
  status: string
  progress: number
}

export interface RecognizedScheduleImage {
  rows: ParsedScheduleRow[]
  text: string
  confidence: number
  usage?: AiUsageStatus
}

export interface AiUsageStatus {
  limit: number
  used: number
  remaining: number
  month: string
}

interface ParseImageResponse {
  rows?: ParsedScheduleRow[]
  warnings?: string[]
  raw?: unknown
  model?: string
  imageCount?: number
  usage?: AiUsageStatus
  error?: string
}

const SUPABASE_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export async function recognizeScheduleImage(
  input: File | File[],
  defaultYear: number,
  defaultMonth: number,
  onProgress?: (progress: OcrProgress) => void,
): Promise<RecognizedScheduleImage> {
  const files = Array.isArray(input) ? input : [input]
  if (!files.length) {
    throw new Error('이미지 파일을 선택해 주세요.')
  }
  if (files.length > 5) {
    throw new Error('이미지는 한 번에 최대 5장까지 올릴 수 있어요.')
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      throw new Error('이미지 파일만 업로드할 수 있어요.')
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('이미지는 장당 8MB 이하로 올려주세요.')
    }
  }

  const form = new FormData()
  files.forEach(file => form.append('image', file))
  form.append('defaultYear', String(defaultYear))
  form.append('defaultMonth', String(defaultMonth))

  const token = await getImageAuthToken()

  onProgress?.({
    status: files.length > 1 ? `이미지 ${files.length}장을 업로드하고 있어요` : '이미지를 업로드하고 있어요',
    progress: 0.15,
  })
  const request = uploadImages(form, token)

  onProgress?.({
    status: files.length > 1 ? 'AI가 여러 스크린샷을 이어서 읽고 있어요' : 'AI가 근무표를 읽고 있어요',
    progress: 0.55,
  })
  const response = await request
  const payload = await readParseImageResponse(response)

  if (!response.ok) {
    if (response.status === 401) {
      await supabase.auth.signOut().catch(() => undefined)
    }
    throw new Error(payload.error || '이미지 인식에 실패했어요.')
  }
  if (!payload.rows?.length) {
    throw new Error('이미지에서 저장할 수 있는 근무 행을 찾지 못했어요.')
  }

  onProgress?.({ status: '인식 결과를 정리하고 있어요', progress: 0.9 })
  const text = [
    payload.model ? `model: ${payload.model}` : '',
    payload.imageCount ? `images: ${payload.imageCount}` : '',
    payload.warnings?.length ? `warnings:\n${payload.warnings.join('\n')}` : '',
    payload.raw ? JSON.stringify(payload.raw, null, 2) : '',
  ].filter(Boolean).join('\n\n')

  onProgress?.({ status: '완료', progress: 1 })
  return {
    rows: payload.rows,
    text,
    confidence: payload.warnings?.length ? 80 : 92,
    usage: payload.usage,
  }
}

async function getImageAuthToken(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    const token = data.session?.access_token?.trim()
    if (!token) {
      throw new Error('AI_IMAGE_NO_TOKEN')
    }
    if (!SUPABASE_JWT_PATTERN.test(token)) {
      throw new Error('AI_IMAGE_INVALID_TOKEN')
    }
    return token
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_IMAGE_NO_TOKEN') {
      throw new Error('AI 이미지 인식은 실제 로그인 계정에서만 사용할 수 있어요.')
    }

    await supabase.auth.signOut().catch(() => undefined)
    throw new Error('로그인 세션이 손상되어 이미지 업로드를 시작하지 못했어요. 다시 로그인한 뒤 시도해 주세요.')
  }
}

async function uploadImages(form: FormData, token: string): Promise<Response> {
  try {
    return await fetch('/api/parse-schedule-image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    })
  } catch {
    await supabase.auth.signOut().catch(() => undefined)
    throw new Error('이미지 업로드 요청을 만들지 못했어요. 다시 로그인한 뒤 시도해 주세요.')
  }
}

async function readParseImageResponse(response: Response): Promise<ParseImageResponse> {
  try {
    return (await response.json()) as ParseImageResponse
  } catch {
    return {
      error: response.ok
        ? '이미지 인식 서버 응답을 읽지 못했어요. 새로고침 후 다시 시도해 주세요.'
        : '이미지 인식 서버가 올바른 응답을 보내지 않았어요. 잠시 후 다시 시도해 주세요.',
    }
  }
}
