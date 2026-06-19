import { supabase } from '@/lib/supabase'
import type { RosterCategory } from '@/lib/roster-codes'

export interface RosterCodeEntry {
  code: string
  category: RosterCategory | null
  label: string | null
  isOff: boolean
}

/** 항공사 코드 사전을 canonCode→분류 맵으로. 사전 테이블이 없거나(미적용) 오류면 빈 맵
 *  — 기능은 내장 사전으로 계속 동작한다. */
export async function fetchRosterCodes(airline: string): Promise<Map<string, RosterCodeEntry>> {
  const out = new Map<string, RosterCodeEntry>()
  if (!airline) return out
  try {
    const { data, error } = await supabase
      .from('roster_codes')
      .select('code,category,label,is_off')
      .eq('airline', airline)
    if (error || !Array.isArray(data)) return out
    for (const row of data as unknown as Array<Record<string, unknown>>) {
      const code = typeof row.code === 'string' ? row.code : ''
      if (!code) continue
      out.set(code, {
        code,
        category: (typeof row.category === 'string' ? row.category : null) as RosterCategory | null,
        label: typeof row.label === 'string' ? row.label : null,
        isOff: Boolean(row.is_off),
      })
    }
  } catch {
    // 무시 — 사전 없이도 동작
  }
  return out
}

/** 코드 분류를 사전에 기록(upsert). 실패해도 조용히 — 사전 갱신 실패가 근무표 저장을
 *  막지 않게 한다. */
export async function recordRosterCode(
  airline: string,
  code: string,
  opts: { category?: RosterCategory; label?: string; isOff?: boolean },
): Promise<void> {
  if (!airline || !code) return
  try {
    await supabase.rpc('upsert_roster_code', {
      p_airline: airline,
      p_code: code,
      p_category: opts.category ?? null,
      p_label: opts.label ?? null,
      p_is_off: opts.isOff ?? null,
    })
  } catch {
    // 무시
  }
}
