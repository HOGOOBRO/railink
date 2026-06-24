/* 부팅 네트워크 호출용 타임아웃·재시도 유틸.
 *
 * supabase-js fetch와 sb-proxy 경로엔 기본 타임아웃이 없어, 콜드스타트·일시적 stuck·
 * 네트워크 흔들림에서 응답이 영영 안 오면 await가 무한 pending이 된다 — 캘린더 데이터
 * 로딩바·세션 해석이 안 풀리는 원인. withTimeout으로 상한을 두고, retry로 한두 번 더
 * 시도해(콜드스타트였다면 다음엔 warm) 사용자가 강제종료/재진입으로 하던 복구를
 * 자동화한다. 주의: withTimeout이 거부해도 원본 Promise는 취소되지 않는다(JS Promise는
 * 취소 불가) — 버려진 fetch는 그냥 늦게 resolve되어 GC된다. 클라이언트 경로에선 무해. */

export class TimeoutError extends Error {
  constructor(label: string) {
    super(label)
    this.name = 'TimeoutError'
  }
}

/** Promise에 시간 상한을 건다. ms 안에 settle 안 되면 TimeoutError로 거부. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  }) as Promise<T>
}

/** fn을 타임아웃과 함께 실행하고, 실패 시 선형 백오프로 재시도한다. 모든 시도가
 *  실패하면 마지막 에러를 throw한다(호출부가 catch해 캐시 폴백/로딩 해제하도록). */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  opts: { tries: number; timeoutMs: number; backoffMs: number },
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < opts.tries; attempt++) {
    try {
      return await withTimeout(fn(), opts.timeoutMs, `attempt ${attempt + 1} timed out`)
    } catch (err) {
      lastErr = err
      if (attempt < opts.tries - 1) {
        await new Promise(resolve => setTimeout(resolve, opts.backoffMs * (attempt + 1)))
      }
    }
  }
  throw lastErr
}
