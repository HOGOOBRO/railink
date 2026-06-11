/* GA4 이벤트 헬퍼 — app/layout.tsx의 동기 스텁이 만들어 둔 window.gtag로
 * 보낸다. 서버에서는 no-op; opt-out(?noga=1) 브라우저에서는 gtag.js가 안
 * 실려 큐가 소비되지 않으므로 자연히 버려진다.
 *
 * 기존 이벤트(pwa_install·demo_login·sign_up)는 이 헬퍼 이전에 추가된 raw
 * window.gtag 호출로 남아 있다 — 동작이 같으므로 굳이 옮기지 않았다. */
export function track(name: string, params?: Record<string, string>): void {
  if (typeof window === 'undefined') return
  const gtag = (window as unknown as {
    gtag?: (command: 'event', name: string, params?: Record<string, string>) => void
  }).gtag
  gtag?.('event', name, params)
}
