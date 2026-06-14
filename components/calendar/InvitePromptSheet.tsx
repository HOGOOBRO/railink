'use client'

import { UserPlusIcon, CloseIcon } from '@/components/ui/icons'

/** 권유 시트가 어느 트리거에서 떴는지 — 카피 분기 + GA4 `trigger` 파라미터 공용. */
export type InvitePromptTrigger = 'first_compare' | 'upload_empty' | 'upload_has_friends'

interface InvitePromptSheetProps {
  trigger: InvitePromptTrigger
  /** X / 백드롭 / 스와이프 — 거절 경로(상위 BottomSheet onClose로 연결). */
  onClose: () => void
  /** 주 버튼 "초대 링크 만들기" — 이 시트를 닫고 기존 InviteCreateSheet를 연다. */
  onCreate: () => void
}

/* 레이아웃·버튼·토큰은 3개 변형 공통, 카피만 trigger로 분기(핸드오프 3절 표).
 * 헤더·버튼 패턴은 InviteCreateSheet를 그대로 따른다(아이콘 타일 + 제목/부제 + X,
 * 풀폭 brand 버튼). "나중에" 보조 버튼 없음 — 이탈은 X/백드롭/스와이프뿐. */
const COPY: Record<InvitePromptTrigger, { title: string; subtitle: string; body: string }> = {
  first_compare: {
    title: '친구 한 명 더 초대해볼까요?',
    subtitle: '방금 본 겹쳐보기를 다른 친구와도',
    body: '초대 링크로 들어오면 그 친구 근무가 캘린더에 자동으로 들어와, 둘 다 쉬는 날을 바로 찾을 수 있어요.',
  },
  upload_empty: {
    title: '이제 같이 볼 친구만 있으면 돼요',
    subtitle: '근무표는 다 준비됐어요',
    body: '친구가 들어오면 서로 근무가 자동으로 연결돼, 둘 다 쉬는 날이 바로 보여요.',
  },
  upload_has_friends: {
    title: '올린 김에, 친구도 초대할까요?',
    subtitle: '아직 RaiLink에 없는 친구를 데려와요',
    body: '초대 링크로 들어오면 따로 검색할 필요 없이 바로 연결돼, 새 근무까지 같이 볼 수 있어요.',
  },
}

export function InvitePromptSheet({ trigger, onClose, onCreate }: InvitePromptSheetProps) {
  const copy = COPY[trigger]
  return (
    <div className="flex flex-col pb-7">
      {/* header */}
      <div className="flex items-start gap-2.5 px-5 pt-2 pb-3">
        <span className="w-10 h-10 rounded-lg bg-brand-050 text-brand grid place-items-center shrink-0 mt-px">
          <UserPlusIcon size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-subtitle font-bold tracking-tight text-ink-900" style={{ wordBreak: 'keep-all' }}>
            {copy.title}
          </p>
          <p className="text-caption text-ink-500 mt-1" style={{ wordBreak: 'keep-all' }}>
            {copy.subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="w-9 h-9 grid place-items-center text-ink-500 rounded-full hover:bg-bg shrink-0 mt-px"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* body */}
      <div className="px-5">
        <p className="text-callout text-ink-700 [text-wrap:pretty]" style={{ wordBreak: 'keep-all' }}>
          {copy.body}
        </p>
      </div>

      {/* action — 주 버튼만(보조 버튼 없음) */}
      <div className="px-5 pt-5">
        <button
          onClick={onCreate}
          className="w-full h-btn rounded-sm bg-brand text-ink-on-brand font-semibold text-callout active:scale-[.98] transition-transform"
        >
          초대 링크 만들기
        </button>
      </div>
    </div>
  )
}
