/* 생일 — profile_birthdays 테이블 위의 얇은 클라이언트.
 *
 * 노출 규칙은 전부 RLS가 강제한다(20260606010000_profile_birthdays):
 *   - 내 생일은 내가 읽고 쓴다.
 *   - 동료 생일은 그 동료가 나에게 일정을 공유(accepted)했을 때만 select에 잡힌다.
 * 따라서 getMemberBirthdays는 그냥 in(...)으로 긁어도 권한 없는 행은 RLS가 거른다.
 *
 * 데모 세션은 Supabase 세션이 없어 getUser()가 비고, 모든 함수가 빈 결과로
 * 단락된다(네트워크 호출 없음). 캘린더 로더가 !isDemo 분기에서만 부르지만
 * 방어적으로 한 번 더 막아 둔다. */
import { supabase } from '../supabase'

/** 내 생일('YYYY-MM-DD') 또는 미설정 시 null. */
export async function getMyBirthday(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profile_birthdays').select('birthday').eq('id', user.id).maybeSingle()
  if (error) return null
  return (data?.birthday as string | null) ?? null
}

/** 내 생일 저장. null이면 삭제(미설정으로 되돌림). */
export async function setMyBirthday(
  birthday: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: '로그인 상태를 확인해 주세요.' }
  if (birthday === null) {
    const { error } = await supabase.from('profile_birthdays').delete().eq('id', user.id)
    return error ? { ok: false, message: '생일 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' } : { ok: true }
  }
  const { error } = await supabase
    .from('profile_birthdays')
    .upsert({ id: user.id, birthday }, { onConflict: 'id' })
  return error ? { ok: false, message: '생일 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' } : { ok: true }
}

/** 주어진 uid들 중 내가 볼 수 있는(=accepted 공유) 생일만. uid → 'YYYY-MM-DD'.
 *  권한 없는 uid는 RLS가 결과에서 제외하므로 호출 측에서 추가 필터가 필요 없다. */
export async function getMemberBirthdays(uids: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(uids)].filter(Boolean)
  if (!ids.length) return {}
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data, error } = await supabase
    .from('profile_birthdays').select('id,birthday').in('id', ids)
  if (error || !data) return {}
  const out: Record<string, string> = {}
  for (const r of data as { id: string; birthday: string }[]) out[r.id] = r.birthday
  return out
}
