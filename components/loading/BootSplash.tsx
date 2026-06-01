import { BrandMark } from '@/components/ui/icons'
import { LoadDots } from '@/components/ui/LoadDots'

/* ① 부팅 · 화이트 — app cold-boot / PWA entry splash.
 * design_handoff_loading_states §4. Shown delay-gated (only when the
 * session/data resolve is slow) so fast opens never flash it. */
export function BootSplash() {
  return (
    <div
      className="relative flex flex-col min-h-[100dvh] bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* soft top glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(58% 38% at 50% 30%, rgba(12,60,96,0.05), transparent 72%)',
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className="w-28 h-28 rounded-[32px] bg-white grid place-items-center rl-float-soft"
          style={{
            animation: 'rl-float-soft 3.2s ease-in-out infinite',
            boxShadow:
              '0 8px 24px -8px rgba(12,60,96,0.20), 0 2px 6px rgba(0,0,0,0.06)',
          }}
        >
          <BrandMark size={54} />
        </div>
        <div className="mt-6 font-en text-[28px] font-medium tracking-[0.14em] text-brand">
          RAILINK
        </div>
        <div className="mt-2 text-[13px] font-medium text-ink-500">
          동료와 함께 일정 맞추기
        </div>
      </div>

      <div
        className="flex flex-col items-center gap-[18px]"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <LoadDots />
        <div className="font-en text-[10px] font-semibold tracking-[0.24em] text-ink-300 uppercase">
          RAILINK · 2026 / V1.0
        </div>
      </div>
    </div>
  )
}
