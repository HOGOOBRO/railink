// 근무표 코드 사전 — 인식한 코드(편명 아닌 한글/약어)를 분류·표준화한다.
// 미리 모든 코드를 알 수 없으므로: (1) 아는 코드는 내장 사전으로 바로 처리,
// (2) 모르는 코드는 사용자가 분류(roster_codes 테이블에 누적)해 점점 똑똑해진다.
// 사용자가 적는 답(라벨)은 띄어쓰기·오타·동의어를 정리해 표준 단어로 저장한다.

export type RosterCategory = 'work' | 'off' | 'standby' | 'training' | 'move' | 'other'

export const CATEGORY_META: Record<RosterCategory, { label: string; isOff: boolean }> = {
  work:     { label: '근무', isOff: false },
  off:      { label: '휴무', isOff: true },
  standby:  { label: 'STBY', isOff: false },
  training: { label: '훈련', isOff: false },
  move:     { label: '이동근무', isOff: false },
  other:    { label: '기타', isOff: false },
}

/** 분류 UI에 노출하는 순서. */
export const CATEGORY_ORDER: RosterCategory[] = ['work', 'off', 'standby', 'training', 'move', 'other']

/** 코드를 사전 키로 정규화 — 공백·기호 제거, 영문 대문자화. 띄어쓰기만 다른 코드가
 *  중복 저장되지 않게 한다. 한글은 그대로 유지. */
export function canonCode(raw: string | undefined | null): string {
  if (!raw) return ''
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s·.,/\\()[\]_-]+/g, '')
    .trim()
}

/** 내장(아는) 코드 → 분류. 캡쳐에서 자주 나오는 것만. 키는 canonCode 형태. */
const BUILTIN: Record<string, { category: RosterCategory; label: string }> = {
  DAYOFF:            { category: 'off', label: '휴무' },
  OFF:               { category: 'off', label: '휴무' },
  연차휴가:           { category: 'off', label: '연차' },
  연차:              { category: 'off', label: '연차' },
  휴무:              { category: 'off', label: '휴무' },
  STBY확인요망:       { category: 'standby', label: 'STBY' },
  장거리STBY확인요망:  { category: 'standby', label: 'STBY' },
  STBY:              { category: 'standby', label: 'STBY' },
  대기:              { category: 'standby', label: 'STBY' },
  REST:              { category: 'other', label: '체류' },
}

export function builtinCode(raw: string | undefined | null): { category: RosterCategory; label: string } | undefined {
  return BUILTIN[canonCode(raw)]
}

// 사용자가 답(코드 뜻)으로 적는 단어 → 표준 단어 치환. 키는 canonCode 형태.
const ANSWER_SYNONYMS: Record<string, string> = {
  스탠바이: 'STBY', STANDBY: 'STBY', 대기중: 'STBY', 스탠바이대기: 'STBY', 대기: 'STBY',
  트레이닝: '훈련', TRAINING: '훈련', 교육: '훈련', 정기훈련: '훈련', 안전훈련: '훈련',
  데드헤드: '이동근무', DH: '이동근무', DEADHEAD: '이동근무', 포지셔닝: '이동근무',
  관숙비행: '관숙비행', OE: '관숙비행',
  휴가: '휴가', 연차: '연차', 월차: '월차', 병가: '병가',
  오프: '휴무', DAYOFF: '휴무', OFF: '휴무',
  지상근무: '지상근무', 그라운드: '지상근무',
}

/** 사용자가 적은 답을 정리: 앞뒤·중복 공백 정리 후, 동의어면 표준어로 치환.
 *  매칭 없으면 공백만 정리한 원문을 그대로 둔다(손실 없음). */
export function normalizeAnswerLabel(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  const syn = ANSWER_SYNONYMS[canonCode(trimmed)]
  return syn ?? trimmed
}

/** 분류된 코드가 근무 행에 미치는 효과. */
export function categoryEffect(category: RosterCategory): { isOff: boolean } {
  return { isOff: CATEGORY_META[category].isOff }
}
