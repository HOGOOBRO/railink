import type { ParsedScheduleRow } from './schedule-file'
import { supabase } from '@/lib/supabase'

export interface OcrProgress {
  status: string
  progress: number
  hint?: string
}

export interface RecognizedScheduleImage {
  rows: ParsedScheduleRow[]
  text: string
  confidence: number
  period?: SchedulePeriod
  usage?: AiUsageStatus
}

export interface SchedulePeriod {
  year: number
  month: number
  source: 'image' | 'fallback'
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
  period?: SchedulePeriod
  usage?: AiUsageStatus
  error?: string
}

const SUPABASE_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const MAX_RAW_IMAGE_BYTES = 12 * 1024 * 1024
// Vercel 요청 본문 한도(~4.5MB) 아래로 여유를 두고 4MB까지 허용. 해상도를 더 지켜
// 작은 시각 숫자가 압축으로 뭉개지는 걸 줄인다(서버 MAX_TOTAL_IMAGE_BYTES와 일치).
const MAX_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
// 압축 단계: 예산에 맞는 첫 단계를 쓴다. 바닥을 2048px로 둔 건 OpenAI 비전(detail:high)이
// 긴 변을 ~2048px로 다운스케일해 처리하기 때문 — 그 아래로 줄이면 모델이 쓸 수 있는 것보다
// 더 작게 보내 작은 글자가 깨진다. 1800은 다장 업로드가 4MB를 못 맞출 때만 쓰는 최후수단.
const COMPRESSION_PLANS = [
  { maxEdge: 2600, quality: 0.92 },
  { maxEdge: 2400, quality: 0.88 },
  { maxEdge: 2200, quality: 0.84 },
  { maxEdge: 2048, quality: 0.80 },
  { maxEdge: 1800, quality: 0.72 },
]
// 세로로 긴 캡쳐(예: 코레일관광개발 모바일 승무근무표 전체 캡쳐)는 OpenAI 비전이 짧은
// 변(폭)을 768px까지 축소해 시각 숫자가 ~7px로 뭉개진다 — 셀 하단 3칸 중 퇴근시각 대신
// 가운데 근무시간을 집던 오인식(2026-07-02)의 근본 원인. 높이 768px 이하의 가로 밴드로
// 잘라 보내면 축소가 전혀 없어 원본 해상도가 그대로 전달된다. 프롬프트는 이미 여러 장을
// "같은 근무표의 조각, 겹치는 날짜는 병합"으로 처리한다. 항공사 로스터는 현행 인식이
// 안정적이라 KTX/일반 경로(airline 없음)에만 적용한다.
const SPLIT_MIN_ASPECT = 1.4        // 세로/가로 비율이 이 이상일 때만 분할 후보
const SPLIT_SHORT_SIDE_CAP = 768    // OpenAI 비전(detail:high)의 짧은 변 상한
const SPLIT_LONG_SIDE_CAP = 2048    // OpenAI 비전(detail:high)의 긴 변 상한
const SPLIT_OVERLAP = 180           // 날짜 셀이 경계에 걸려도 어느 한 밴드엔 통째로 담기게
const SPLIT_MAX_BANDS = 5           // 서버 MAX_IMAGES와 동일

export async function recognizeScheduleImage(
  input: File | File[],
  defaultYear: number,
  defaultMonth: number,
  onProgress?: (progress: OcrProgress) => void,
  /** 팀 표(여러 사람 row)에서 자기 행을 골라내기 위해 보내는 본인 풀네임.
   *  KTX 단일 표는 무시됨. 빈 문자열이면 팀 표 인식을 비활성화. */
  userName?: string,
  /** 소속 항공사 코드(AIRLINES.code). 있으면 서버가 해당 항공사 로스터 레이아웃을
   *  적용한다(예: 'air-premia' 그리드). 없으면 KTX 로스터로 처리. */
  airline?: string,
): Promise<RecognizedScheduleImage> {
  const files = Array.isArray(input) ? input : [input]
  if (!files.length) {
    throw new Error('이미지 파일을 선택해 주세요.')
  }
  if (files.length > 5) {
    throw new Error('이미지는 한 번에 최대 5장까지 올릴 수 있어요.')
  }
  for (const file of files) {
    if (!isSupportedImage(file)) {
      throw new Error('PNG, JPG, WEBP 이미지만 업로드할 수 있어요.')
    }
    if (file.size > MAX_RAW_IMAGE_BYTES) {
      throw new Error('이미지는 장당 12MB 이하로 올려주세요.')
    }
  }

  onProgress?.({
    status: files.length > 1 ? `이미지 ${files.length}장을 압축하고 있어요` : '이미지를 압축하고 있어요',
    progress: 0.08,
  })
  const sources = await maybeSplitTallImage(files, airline)
  const uploadFiles = await prepareImagesForUpload(sources)

  const form = new FormData()
  uploadFiles.forEach(file => form.append('image', file))
  form.append('defaultYear', String(defaultYear))
  form.append('defaultMonth', String(defaultMonth))
  if (userName?.trim()) form.append('userName', userName.trim())
  if (airline?.trim()) form.append('airline', airline.trim())

  const token = await getImageAuthToken()
  form.append('accessToken', token)

  onProgress?.({
    status: files.length > 1 ? `이미지 ${files.length}장을 업로드하고 있어요` : '이미지를 업로드하고 있어요',
    progress: 0.15,
  })
  const request = uploadImages(form)

  onProgress?.({
    status: files.length > 1 ? 'AI가 여러 스크린샷을 이어서 읽고 있어요' : 'AI가 근무표를 읽고 있어요',
    progress: 0.55,
    hint: files.length > 1
      ? '여러 장은 보통 40-90초 정도 걸릴 수 있어요. 화면을 닫지 말고 잠시 기다려 주세요.'
      : '보통 20-40초 정도 걸릴 수 있어요. 화면을 닫지 말고 잠시 기다려 주세요.',
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
    payload.period ? `period: ${payload.period.year}-${String(payload.period.month).padStart(2, '0')} (${payload.period.source})` : '',
    payload.warnings?.length ? `warnings:\n${payload.warnings.join('\n')}` : '',
    payload.raw ? JSON.stringify(payload.raw, null, 2) : '',
  ].filter(Boolean).join('\n\n')

  onProgress?.({ status: '완료', progress: 1 })
  return {
    rows: payload.rows,
    text,
    confidence: payload.warnings?.length ? 80 : 92,
    period: payload.period,
    usage: payload.usage,
  }
}

function isSupportedImage(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || IMAGE_EXT_RE.test(file.name)
}

/** 세로로 긴 단일 캡쳐를 가로 밴드로 분할(KTX/일반 경로 전용 — airline이 있으면 원본 그대로).
 *  각 밴드는 짧은 변(높이)이 768px 이하가 되도록 잘라 OpenAI 비전의 축소를 피한다.
 *  분할이 이득이 없거나(작은 이미지) 실패하면 조용히 원본을 반환한다. */
async function maybeSplitTallImage(files: File[], airline?: string): Promise<File[]> {
  if (typeof window === 'undefined') return files
  if (files.length !== 1) return files
  if (airline?.trim()) return files
  const file = files[0]
  let url = ''
  try {
    url = URL.createObjectURL(file)
    const image = await loadImage(url)
    const w = image.naturalWidth
    const h = image.naturalHeight
    if (!w || !h || h / w < SPLIT_MIN_ASPECT) return files
    // 통짜로 보내도 축소가 안 일어나는 크기면 분할 이득이 없다.
    if (w <= SPLIT_SHORT_SIDE_CAP && h <= SPLIT_LONG_SIDE_CAP) return files

    const bands = Math.min(
      SPLIT_MAX_BANDS,
      Math.ceil((h - SPLIT_OVERLAP) / (SPLIT_SHORT_SIDE_CAP - SPLIT_OVERLAP)),
    )
    if (bands < 2) return files
    // 밴드 높이는 겹침을 감안해 전체를 정확히 덮도록 계산. 매우 긴 이미지가 밴드 수
    // 상한에 걸리면 밴드가 768px를 넘을 수 있지만, 그래도 통짜보다 훨씬 덜 축소된다.
    const bandH = Math.ceil((h + (bands - 1) * SPLIT_OVERLAP) / bands)
    const step = (h - bandH) / (bands - 1)
    // 폭이 긴 변 상한을 넘는 경우만 미리 줄인다(폰 캡쳐에선 사실상 없음).
    const scale = Math.min(1, SPLIT_LONG_SIDE_CAP / w)

    const out: File[] = []
    for (let i = 0; i < bands; i++) {
      const sy = Math.round(i * step)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(bandH * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return files
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, sy, w, bandH, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95)
      out.push(new File([blob], replaceExtension(file.name, `band${i + 1}.jpg`), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }))
    }
    return out
  } catch {
    return files
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

async function prepareImagesForUpload(files: File[]): Promise<File[]> {
  let prepared = files
  for (const plan of COMPRESSION_PLANS) {
    prepared = await Promise.all(files.map(file => compressImage(file, plan.maxEdge, plan.quality)))
    if (totalSize(prepared) <= MAX_UPLOAD_IMAGE_BYTES) return prepared
  }

  throw new Error('이미지 용량이 커서 업로드할 수 없어요. 한 번에 올리는 스크린샷 수를 줄이거나 조금 더 잘라서 올려주세요.')
}

function totalSize(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}

async function compressImage(file: File, maxEdge: number, quality: number): Promise<File> {
  if (typeof window === 'undefined') return file

  let url = ''
  try {
    url = URL.createObjectURL(file)
    const image = await loadImage(url)
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    const next = new File([blob], replaceExtension(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
    return next.size < file.size || file.size > MAX_UPLOAD_IMAGE_BYTES ? next : file
  } catch {
    return file
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('IMAGE_COMPRESSION_FAILED'))
    }, type, quality)
  })
}

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base || 'schedule'}.${extension}`
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

    // Reading the session failed (flaky network) or the stored token looked
    // malformed. Neither is a reason to forcibly sign the user out — that turns
    // a transient hiccup into a surprise logout. Surface a retry message; a
    // genuinely broken session is caught by the route guard on next navigation.
    throw new Error('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}

async function uploadImages(form: FormData): Promise<Response> {
  try {
    return await fetch(imageParseUrl(), {
      method: 'POST',
      body: form,
    })
  } catch {
    // A fetch rejection here means the request never reached the server
    // (offline, flaky signal) — NOT an auth problem. Don't sign the user out;
    // just ask them to retry.
    throw new Error('네트워크가 불안정해 이미지 업로드를 시작하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
  }
}

function imageParseUrl(): string {
  if (typeof window === 'undefined') return '/api/parse-schedule-image'
  return new URL('/api/parse-schedule-image', window.location.origin).toString()
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
