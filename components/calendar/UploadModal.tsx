'use client'

import { ChangeEvent, ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, FileIcon, ImageIcon, EditIcon, ChevronLeftIcon,
  ChevronRightIcon, InfoIcon, CheckIcon,
} from '@/components/ui/icons'
import { parseScheduleFile, type ParsedScheduleRow } from '@/lib/parse/schedule-file'
import { recognizeScheduleImage, type OcrProgress } from '@/lib/parse/schedule-image'

export type UploadMethod = 'file' | 'image' | 'manual'
type Step = 'pick' | 'preview'

interface UploadModalProps {
  step: Step
  defaultYear: number
  defaultMonth: number
  onPreview: () => void
  onBack: () => void
  onClose: () => void
  onSave: (rows: ParsedScheduleRow[]) => void
}

const OPTIONS: {
  key: UploadMethod
  icon: ReactNode
  label: string
  sub: string
  meta: string
  primary?: boolean
}[] = [
  { key: 'file',   icon: <FileIcon size={22} />,  label: '엑셀 / CSV', sub: '회사 시스템에서 받은 표를 그대로 올리기', meta: '.xlsx · .xls · .csv', primary: true },
  { key: 'image',  icon: <ImageIcon size={22} />, label: '이미지',      sub: '스크린샷을 AI로 읽어서 등록',           meta: '.png · .jpg · .webp' },
  { key: 'manual', icon: <EditIcon size={22} />,  label: '직접 입력',   sub: '날짜별로 빈 표를 채워서 등록',          meta: '이번 달 전체 30일 폼' },
]

export function UploadModal({
  step, defaultYear, defaultMonth, onPreview, onBack, onClose, onSave,
}: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedScheduleRow[]>([])
  const [busy, setBusy] = useState<'file' | 'image' | null>(null)
  const [ocr, setOcr] = useState<OcrProgress | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy('file')
    setOcr(null)
    setOcrText('')
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(file.name)

    try {
      const parsed = await parseScheduleFile(file, defaultYear)
      setRows(parsed)
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 읽는 중 문제가 생겼어요.')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy('image')
    setOcr({ status: '이미지를 준비하고 있어요', progress: 0.02 })
    setOcrText('')
    setError(null)
    setNotice(null)
    setRows([])
    setFileName(file.name)

    try {
      const result = await recognizeScheduleImage(file, defaultYear, defaultMonth, setOcr)
      setRows(result.rows)
      setOcrText(result.text)
      setNotice(`AI 인식 신뢰도 ${Math.round(result.confidence)}%. 저장 전 날짜와 시간을 확인해 주세요.`)
      onPreview()
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 읽는 중 문제가 생겼어요.')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  function handleOption(key: UploadMethod) {
    setError(null)
    setNotice(null)
    if (key === 'file') {
      fileRef.current?.click()
      return
    }
    if (key === 'image') {
      imageRef.current?.click()
      return
    }
    setNotice('직접 입력 폼은 다음 단계에서 같은 저장 구조로 연결할 수 있어요.')
  }

  const previewRows = rows.slice(0, 20)

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
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={handleImageChange}
      />

      {/* Header */}
      <div className="h-topbar flex items-center justify-between pl-4 pr-1.5 border-b border-line shrink-0">
        <h3 className="text-subtitle font-bold tracking-tight text-ink-900">근무표 등록</h3>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {step === 'pick' ? (
          <>
            <p className="text-callout text-ink-700 leading-relaxed mb-3.5">
              어떻게 등록할까요? 회사에서 받은{' '}
              <strong className="text-ink-900">엑셀 또는 CSV 파일</strong>을 올리면
              날짜·다이번호·열번·출퇴근시각을 자동으로 읽어요.
            </p>
            <div className="grid gap-2.5">
              {OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => handleOption(o.key)}
                  disabled={!!busy}
                  className={`flex items-center gap-3.5 p-3.5 rounded-lg text-left border-[1.5px] ${
                    o.primary
                      ? 'border-brand bg-brand-050 shadow-sh1'
                      : 'border-line bg-surface'
                  } ${busy ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <div
                    className={`w-11 h-11 rounded-md grid place-items-center shrink-0 ${
                      o.primary ? 'bg-brand text-ink-on-brand' : 'bg-bg text-ink-700'
                    }`}
                  >
                    {o.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-callout text-ink-900">{o.label}</span>
                      {o.primary && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-brand-050 text-brand">
                          추천
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-ink-500 mt-0.5 leading-snug">{o.sub}</p>
                    <p className={`font-en text-[11px] font-semibold mt-1 ${o.primary ? 'text-brand' : 'text-ink-500'}`}>
                      {o.meta}
                    </p>
                  </div>
                  <span className={o.primary ? 'text-brand' : 'text-ink-500'}>
                    <ChevronRightIcon size={16} />
                  </span>
                </button>
              ))}
            </div>

            {busy === 'file' && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span><strong>{fileName}</strong> 파일을 읽고 있어요.</span>
              </StatusBox>
            )}
            {busy === 'image' && (
              <div className="mt-4 px-3.5 py-3 rounded-md bg-bg text-caption text-ink-700 leading-relaxed">
                <div className="flex items-center gap-2">
                  <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                  <span>
                    <strong>{fileName}</strong> · {ocr?.status ?? '이미지를 분석하고 있어요'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-pill bg-line overflow-hidden">
                  <div
                    className="h-full rounded-pill bg-brand transition-[width] duration-200"
                    style={{ width: `${Math.round((ocr?.progress ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
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
            {!busy && !error && !notice && (
              <StatusBox tone="info">
                <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
                <span>엑셀/CSV는 컬럼을 읽고, 이미지는 AI가 캘린더 내용을 해석해 근무 행을 찾아요.</span>
              </StatusBox>
            )}
          </>
        ) : (
          <>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-caption text-ink-500 mb-2.5"
            >
              <ChevronLeftIcon size={14} /> 입력 방식
              <span className="text-ink-300">·</span>
              <span className="text-ink-900 font-semibold inline-flex items-center gap-1">
                <FileIcon size={14} /> 엑셀 / CSV
              </span>
            </button>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-callout" style={{ background: '#DCFCE7', color: '#166534' }}>
              <span className="shrink-0 text-success"><CheckIcon size={16} /></span>
              <div>
                <strong>{fileName || '근무표 파일'}</strong> ·{' '}
                <span className="font-en">{rows.length}건 인식</span>
              </div>
            </div>

            <div className="mt-3 border border-line rounded-md overflow-hidden">
              <div className="grid grid-cols-[74px_1fr_60px_60px] bg-bg px-2.5 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
                <span>사업일자</span><span>다이/열번</span><span>출근</span><span>퇴근</span>
              </div>
              {previewRows.map((r, i) => (
                <div
                  key={`${r.date}-${i}`}
                  className={`grid grid-cols-[74px_1fr_60px_60px] px-2.5 py-2.5 items-center font-en text-caption ${
                    i < previewRows.length - 1 ? 'border-b border-line' : ''
                  } ${r.isOff ? 'bg-surface-2 text-ink-500' : 'bg-surface text-ink-900'}`}
                >
                  <span>{r.date.slice(5)}</span>
                  <span className="flex gap-1.5 items-center min-w-0">
                    <strong className={`font-bold ${r.isOff ? 'text-warn' : 'text-ink-900'}`}>
                      {r.diaNr || '—'}
                    </strong>
                    {!r.isOff && r.trainNr && <span className="text-ink-500 truncate">{r.trainNr}</span>}
                  </span>
                  <span>{r.startTime || '—'}</span>
                  <span>{r.endTime || '—'}</span>
                </div>
              ))}
            </div>
            {rows.length > previewRows.length && (
              <p className="mt-2 text-caption text-ink-500">
                미리보기는 처음 <span className="font-en">{previewRows.length}</span>건만 표시해요.
              </p>
            )}
            {ocrText && (
              <details className="mt-3 rounded-md border border-line bg-bg px-3 py-2">
                <summary className="cursor-pointer text-caption font-semibold text-ink-700">
                  AI 인식 원문 확인
                </summary>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-en text-[10px] leading-4 text-ink-500">
                  {ocrText}
                </pre>
              </details>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2.5 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] border-t border-line bg-surface shrink-0">
        <span className="flex-1 text-caption text-ink-500">
          {step === 'pick' ? '엑셀/CSV 파일을 선택해 주세요' : `총 ${rows.length}건`}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
        <Button
          variant={step === 'pick' ? 'outline' : 'primary'}
          size="sm"
          disabled={step === 'pick' || rows.length === 0}
          onClick={() => onSave(rows)}
        >
          저장
        </Button>
      </div>
    </div>
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
