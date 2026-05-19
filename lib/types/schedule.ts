export interface ScheduleEntry {
  uid: string
  date: string       // "YYYY-MM-DD"
  diaNr?: string
  trainNr?: string   // "대표열번1 · 대표열번2"
  startTime?: string // "HH:MM"
  endTime?: string   // "HH:MM" (24:00+ allowed for 익일 종료)
  isOff: boolean
}

export type CompareColor =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'

export interface CompareEntry {
  uid: string
  name: string
  employeeId: string
  color: CompareColor
  photo?: string
  office?: string
}
