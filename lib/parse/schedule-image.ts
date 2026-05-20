import { parseScheduleText } from './schedule-text'
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

export async function recognizeScheduleImage(
  file: File,
  defaultYear: number,
  defaultMonth: number,
  onProgress?: (progress: OcrProgress) => void,
): Promise<RecognizedScheduleImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있어요.')
  }

  onProgress?.({ status: '이미지를 보정하고 있어요', progress: 0.05 })
  const image = await preprocessImage(file).catch(() => file)

  onProgress?.({ status: '이미지에서 글자를 읽고 있어요', progress: 0.12 })
  let result: { text: string; confidence: number }
  try {
    result = await runOcr(image, ['kor', 'eng'], onProgress)
  } catch {
    result = await runOcr(image, ['eng'], onProgress)
  }

  onProgress?.({ status: '근무표 행을 정리하고 있어요', progress: 0.95 })
  const rows = parseScheduleText(result.text, defaultYear, defaultMonth)
  if (!rows.length) {
    throw new Error('이미지에서 저장할 수 있는 근무 행을 찾지 못했어요. 더 선명한 스크린샷이나 엑셀/CSV 파일로 다시 시도해 주세요.')
  }

  onProgress?.({ status: '완료', progress: 1 })
  return { rows, text: result.text, confidence: result.confidence }
}

async function runOcr(
  image: File | string,
  langs: string[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<{ text: string; confidence: number }> {
  const Tesseract = await import('tesseract.js')
  const worker = await Tesseract.createWorker(langs, Tesseract.OEM.DEFAULT, {
    logger: message => {
      const progress = 0.12 + Math.min(0.82, Math.max(0, message.progress) * 0.82)
      onProgress?.({ status: translateStatus(message.status), progress })
    },
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const { data } = await worker.recognize(image)
    return { text: data.text, confidence: data.confidence }
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}

function translateStatus(status: string): string {
  if (/loading language/i.test(status)) return 'OCR 언어 데이터를 준비하고 있어요'
  if (/initializing/i.test(status)) return 'OCR 엔진을 초기화하고 있어요'
  if (/recognizing/i.test(status)) return '이미지에서 글자를 읽고 있어요'
  return status || '이미지를 분석하고 있어요'
}

async function preprocessImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxSide = 2400
  const scale = Math.min(2, Math.max(1, 1600 / Math.max(bitmap.width, 1)))
  const fit = Math.min(1, maxSide / Math.max(bitmap.width * scale, bitmap.height * scale))
  const width = Math.max(1, Math.round(bitmap.width * scale * fit))
  const height = Math.max(1, Math.round(bitmap.height * scale * fit))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('이미지를 처리할 수 없어요.')

  ctx.drawImage(bitmap, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128))
    const value = contrasted > 245 ? 255 : contrasted < 45 ? 0 : contrasted
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
