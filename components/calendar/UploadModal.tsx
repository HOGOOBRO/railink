'use client'

import { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CloseIcon, FileIcon, ImageIcon, EditIcon, ChevronLeftIcon,
  ChevronRightIcon, InfoIcon, CheckIcon,
} from '@/components/ui/icons'

export type UploadMethod = 'file' | 'image' | 'manual'
type Step = 'pick' | 'preview'

interface UploadModalProps {
  step: Step
  onPick: (m: UploadMethod) => void
  onBack: () => void
  onClose: () => void
  onSave: () => void
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
  { key: 'image',  icon: <ImageIcon size={22} />, label: '이미지',      sub: '스크린샷 업로드 후 표를 직접 확인',     meta: '.png · .jpg · .heic' },
  { key: 'manual', icon: <EditIcon size={22} />,  label: '직접 입력',   sub: '날짜별로 빈 표를 채워서 등록',          meta: '이번 달 전체 30일 폼' },
]

const PREVIEW_ROWS = [
  { date: '05-01', dia: 'H1055',     tr: '16·216',   st: '10:58', et: '20:10' },
  { date: '05-02', dia: 'S',         off: true },
  { date: '05-03', dia: 'H1130',     tr: '869·864',  st: '12:12', et: '20:09' },
  { date: '05-04', dia: 'H1091',     tr: '287·224',  st: '13:38', et: '01:08' },
  { date: '05-05', dia: 'S(주휴)',   off: true },
  { date: '05-06', dia: 'H1048',     tr: '73·104',   st: '21:38', et: '11:49' },
  { date: '05-07', dia: '~(H1048)',  tr: '73·104',   st: '21:38', et: '11:49', cont: true },
  { date: '05-08', dia: 'H1007',     tr: '1011·1114', st: '09:58', et: '21:30' },
]

export function UploadModal({ step, onPick, onBack, onClose, onSave }: UploadModalProps) {
  return (
    <div
      className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-app-frame bg-surface z-[60] flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
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
              <strong className="text-ink-900">엑셀 파일</strong>이 있으면 가장 빠르고 정확해요.
            </p>
            <div className="grid gap-2.5">
              {OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => onPick(o.key)}
                  className={`flex items-center gap-3.5 p-3.5 rounded-lg text-left border-[1.5px] ${
                    o.primary
                      ? 'border-brand bg-brand-050 shadow-sh1'
                      : 'border-line bg-surface'
                  }`}
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
            <div className="mt-4 flex items-center gap-2 px-3.5 py-3 bg-bg rounded-md text-caption text-ink-700 leading-relaxed">
              <span className="text-brand shrink-0"><InfoIcon size={16} /></span>
              <span>회사에서 받은 근무표를 그대로 올리면 자동으로 인식돼요.</span>
            </div>
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
              <div><strong>2026_05_근무표.xlsx</strong> · <span className="font-en">8건 인식</span></div>
            </div>

            <div className="mt-3 border border-line rounded-md overflow-hidden">
              <div className="grid grid-cols-[74px_1fr_60px_60px] bg-bg px-2.5 py-2 text-[10px] font-bold text-ink-500 tracking-wide uppercase border-b border-line">
                <span>사업일자</span><span>다이/열번</span><span>출근</span><span>퇴근</span>
              </div>
              {PREVIEW_ROWS.map((r, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[74px_1fr_60px_60px] px-2.5 py-2.5 items-center font-en text-caption ${
                    i < PREVIEW_ROWS.length - 1 ? 'border-b border-line' : ''
                  } ${r.off ? 'bg-surface-2 text-ink-500' : 'bg-surface text-ink-900'}`}
                >
                  <span>{r.date}</span>
                  <span className="flex gap-1.5 items-center min-w-0">
                    <strong className={`font-bold ${r.off ? 'text-warn' : 'text-ink-900'}`}>{r.dia}</strong>
                    {!r.off && r.tr && <span className="text-ink-500">{r.tr}</span>}
                    {r.cont && (
                      <span className="text-[9px] px-1.5 py-px rounded-pill text-ink-700 shadow-[inset_0_0_0_1px_var(--line-2)]">연속</span>
                    )}
                  </span>
                  <span>{r.st || '—'}</span>
                  <span>{r.et || '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2.5 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] border-t border-line bg-surface shrink-0">
        <span className="flex-1 text-caption text-ink-500">
          {step === 'pick' ? '입력 방식을 골라 주세요' : '총 8건'}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
        <Button
          variant={step === 'pick' ? 'outline' : 'primary'}
          size="sm"
          disabled={step === 'pick'}
          onClick={onSave}
        >
          저장
        </Button>
      </div>
    </div>
  )
}
