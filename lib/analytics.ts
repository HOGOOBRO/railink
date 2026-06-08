/* Thin, type-safe wrapper over the gtag.js loaded in app/layout.tsx. Fires a
 * GA4 event when gtag is present; no-op during SSR or before gtag boots, so
 * callers never need to guard. Event names show up in GA4's Events report
 * automatically — no GTM / custom-dimension setup required to count them. */
type Gtag = (command: 'event', name: string, params?: Record<string, unknown>) => void

export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const gtag = (window as unknown as { gtag?: Gtag }).gtag
  gtag?.('event', event, params)
}
