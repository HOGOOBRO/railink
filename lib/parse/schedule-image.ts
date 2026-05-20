import type { ParsedScheduleRow } from './schedule-file'

export interface OcrProgress {
  status: string
  progress: number
}

export interface RecognizedScheduleImage {
  rows: ParsedScheduleRow[]
  text: string
  confidence: number
}

interface ParseImageResponse {
  rows?: ParsedScheduleRow[]
  warnings?: string[]
  raw?: unknown
  model?: string
  imageCount?: number
  error?: string
}

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

  onProgress?.({
    status: files.length > 1 ? `이미지 ${files.length}장을 업로드하고 있어요` : '이미지를 업로드하고 있어요',
    progress: 0.15,
  })
  const request = fetch('/api/parse-schedule-image', {
    method: 'POST',
    body: form,
  })

  onProgress?.({
    status: files.length > 1 ? 'AI가 여러 스크린샷을 이어서 읽고 있어요' : 'AI가 근무표를 읽고 있어요',
    progress: 0.55,
  })
  const response = await request
  const payload = (await response.json()) as ParseImageResponse

  if (!response.ok) {
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
  }
}
