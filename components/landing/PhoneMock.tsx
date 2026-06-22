'use client'

import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { CalCell, type CellBar } from '@/components/calendar/CalCell'
import {
  BrandMark, SearchIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, EditIcon, UploadIcon,
} from '@/components/ui/icons'
import { buildMonthCells, DOW_KR } from '@/lib/schedule-utils'
import { PhoneShell } from './PhoneShell'

/* RaiLink 랜딩 핵심 비주얼 — 실제 앱 캘린더(2026년 6월) 정적 재현.
   실제 컴포넌트(CalCell·Avatar)와 실제 화면 마크업을 그대로 쓴다. 폰 셸·스케일은
   PhoneShell이 담당. variant="overlap"(겹쳐보기) | "solo"(내 근무만). */

type Code = 'n' | 'b' | 'g' | 'p' | 'o'
// CompareColor 토큰과 동일: Theo=brand(navy), 고양이가=c1(blue), 세상을=c2(green),
// 구한다=c3(pink), 얍=c4(orange).
const CODE_COLOR: Record<Code, string> = {
  n: 'var(--brand)', b: 'var(--c1)', g: 'var(--c2)', p: 'var(--c3)', o: 'var(--c4)',
}

// 실제 데모 계정에 들어간 아바타(/public/avatars)를 그대로 사용.
// nameKey는 landing.mock의 표시 이름 키(Theo는 고정 영문이라 키 없음).
const PEOPLE = [
  { name: 'Theo', color: 'brand' as const, me: true, photo: '/avatars/avatar-5.svg' },
  { nameKey: 'avatar1' as const, color: 'c1' as const, photo: '/avatars/cat-1.jpg' },
  { nameKey: 'avatar2' as const, color: 'c2' as const, photo: '/avatars/cat-2.jpg' },
  { nameKey: 'avatar3' as const, color: 'c3' as const, photo: '/avatars/cat-3.jpg' },
  { nameKey: 'avatar4' as const, color: 'c4' as const, photo: '/avatars/cat-4.jpg' },
]

// 6월 매일 근무자 (실제 앱과 동일한 칩/도트 셀로 렌더된다).
const WORK: Record<number, Code[]> = {
  1: ['b', 'g', 'o'], 2: ['n', 'b', 'g', 'p'], 3: ['n', 'b', 'p'], 4: ['n', 'g', 'p', 'o'], 5: ['n', 'b', 'p'], 6: ['b', 'g', 'o'],
  7: ['n', 'b'], 8: ['b', 'g', 'o'], 9: ['n', 'b', 'g', 'p'], 10: ['n', 'b', 'o'], 11: ['n', 'b', 'g'], 12: ['n', 'g', 'p'], 13: ['b', 'g', 'p', 'o'],
  14: ['n', 'b', 'g', 'p'], 15: ['n', 'b', 'o'], 16: ['n', 'g', 'o'], 17: [], 18: ['b', 'g', 'o'], 19: ['n', 'b', 'o'], 20: ['n', 'b', 'g'],
  21: ['n', 'b', 'g'], 22: ['n', 'b', 'g', 'p'], 23: ['n', 'b', 'g', 'p'], 24: ['n', 'g', 'o'], 25: ['b', 'g', 'o'], 26: ['n', 'b', 'o'], 27: ['n', 'b', 'g'],
  28: ['n', 'b', 'g', 'p'], 29: ['n', 'b', 'g'], 30: ['n', 'b', 'o'],
}
const BDAYS = [12, 25]
const TODAY = 14 // 2026-06-14
const TODAY_ISO = '2026-06-14'

// 실제 calendar/page.tsx의 PersonPill 정적 버전.
function PersonPill({
  name, color, self, selfLabel, editable, photo,
}: {
  name: string
  color: 'brand' | 'c1' | 'c2' | 'c3' | 'c4'
  self?: boolean
  selfLabel?: string
  editable?: boolean
  photo?: string
}) {
  const ring = color === 'brand' ? 'var(--brand)' : `var(--${color})`
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
      <div
        className="relative w-12 h-12 rounded-full bg-white grid place-items-center"
        style={{ boxShadow: `inset 0 0 0 2px ${ring}` }}
      >
        <Avatar name={name} photo={photo} size="lg" className="!w-[42px] !h-[42px]" color={color} />
        {self && (
          <span className="absolute -right-1 -bottom-0.5 bg-brand text-ink-on-brand text-[9px] font-bold px-1.5 rounded-pill shadow-[0_0_0_2px_#fff]">
            {selfLabel}
          </span>
        )}
        {editable && !self && (
          <span
            className="absolute -right-[3px] -bottom-[3px] w-[18px] h-[18px] rounded-full grid place-items-center text-white shadow-[0_0_0_2px_#fff]"
            style={{ background: ring }}
          >
            <EditIcon size={9} />
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold max-w-[56px] truncate text-center text-ink-900">{name}</span>
    </div>
  )
}

export function PhoneMock({
  variant,
  size,
  rotate,
}: {
  variant: 'overlap' | 'solo'
  size?: string
  rotate?: number
}) {
  const t = useTranslations('landing.mock')
  const overlap = variant === 'overlap'
  const compares = overlap
    ? PEOPLE.slice(1).map(p => ({ ...p, name: t(p.nameKey!) }))
    : []
  const weeks = buildMonthCells(2026, 6)
  const selected = overlap ? 17 : null
  const workDays = Object.values(WORK).filter(list => list.includes('n')).length

  function barsFor(d: number): CellBar[] {
    const codes = overlap ? WORK[d] ?? [] : (WORK[d]?.includes('n') ? (['n'] as Code[]) : [])
    return codes.map(c => ({ color: CODE_COLOR[c], isOff: false }))
  }

  return (
    <PhoneShell size={size} rotate={rotate}>
      <div className="flex flex-1 flex-col bg-surface min-h-0">
            {/* ── Top bar ── */}
            <header className="border-b border-line" style={{ background: 'rgba(255,255,255,0.92)' }}>
              <div className="h-topbar flex items-center gap-2 px-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="w-7 h-7 grid place-items-center text-brand shrink-0"><BrandMark size={22} /></span>
                  <span className="font-en text-subtitle font-[400] tracking-tight text-ink-900">RaiLink</span>
                </div>
                <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700 shrink-0"><SearchIcon size={20} /></span>
                <span className="w-10 grid place-items-center shrink-0"><Avatar name="Theo" photo="/avatars/avatar-5.svg" size="default" color="brand" /></span>
              </div>
            </header>

            {/* ── Compare-group zone ── */}
            <section className="bg-surface border-b border-line pb-3.5">
              <div className="flex items-center justify-between px-4 pt-3 mb-2">
                <span className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">{t('comparing')}</span>
                <span className="font-en text-[11px] font-semibold text-ink-500">{t('peopleCount', { n: compares.length })}</span>
              </div>
              <div className="flex gap-2.5 px-4 pt-1 pb-1 items-start overflow-hidden">
                <PersonPill name="Theo" color="brand" self selfLabel={t('selfTag')} photo={PEOPLE[0].photo} />
                {compares.map(c => (
                  <PersonPill key={c.name} name={c.name} color={c.color} editable photo={c.photo} />
                ))}
                <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
                  <span className="w-12 h-12 rounded-full bg-brand-050 text-brand grid place-items-center shadow-[inset_0_0_0_1.5px_var(--brand-100)]">
                    <PlusIcon size={20} />
                  </span>
                  <span className="text-[11px] font-semibold text-brand">{t('add')}</span>
                </div>
              </div>
            </section>

            {/* ── Month bar ── */}
            <div className="bg-surface flex flex-col">
              <div className="flex items-center justify-between h-topbar px-4">
                <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><ChevronLeftIcon size={20} /></span>
                <span className="font-kr text-title font-bold tracking-tight text-ink-900">{t('monthTitle')}</span>
                <span className="w-icon-btn h-icon-btn grid place-items-center rounded-full text-ink-700"><ChevronRightIcon size={20} /></span>
              </div>

              {/* DOW row */}
              <div className="grid grid-cols-7 border-b border-divider">
                {DOW_KR.map((d, i) => (
                  <div key={d} className={`text-center font-kr text-[13px] font-bold py-1 ${i === 0 ? 'text-danger' : i === 6 ? 'text-c1' : 'text-ink-700'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid — 칸 사이 1px 간격은 유지하되 흰색으로 두어 격자선이 보이지
                  않게 한다(실제 앱의 옅은 격자선을 랜딩에선 제거해 더 깔끔하게). */}
              <div className="flex flex-col gap-px bg-surface">
                {weeks.map((wk, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-px">
                    {wk.map((c, ci) => (
                      <CalCell
                        key={ci}
                        d={c.d}
                        isOther={c.isOther}
                        today={!c.isOther && c.d === TODAY}
                        selected={!c.isOther && c.d === selected}
                        bars={c.iso && !c.isOther ? barsFor(c.d) : []}
                        dow={ci}
                        holiday={!c.isOther && c.d === 6 ? t('holiday') : null}
                        isPast={!!c.iso && c.iso < TODAY_ISO}
                        hasBirthday={overlap && !c.isOther && BDAYS.includes(c.d)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Footer summary ── */}
            <div className="px-4 pt-3 text-caption text-ink-500">
              <div className="bg-bg px-3.5 py-2.5 rounded-md flex items-center gap-2">
                <span className="text-brand shrink-0"><UploadIcon size={14} /></span>
                <span>
                  {t.rich('summary', {
                    work: workDays,
                    off: 30 - workDays,
                    compare: compares.length,
                    b: (ch) => <strong className="font-en text-ink-700">{ch}</strong>,
                  })}
                </span>
              </div>
            </div>

            {/* 실제 앱처럼 하단 여백(spacer) — 아이폰 비율을 채운다. */}
            <div className="flex-1" />
          </div>

      {/* ── FAB ── 실제 앱의 우하단 + 버튼 */}
      <div className="absolute right-4 bottom-7 w-14 h-14 rounded-full bg-brand text-white grid place-items-center shadow-sh-brand">
        <PlusIcon size={24} />
      </div>
    </PhoneShell>
  )
}
