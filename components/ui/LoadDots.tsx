/* Three-dot pulse — design_handoff_loading_states §3.
 * 6×6 brand dots, 0.16s stagger, infinite. Used in footer/banner load hints. */
interface LoadDotsProps {
  /** Any CSS color; defaults to brand navy. */
  color?: string
  className?: string
}

export function LoadDots({ color = 'var(--brand)', className }: LoadDotsProps) {
  return (
    <div className={`flex gap-1.5${className ? ` ${className}` : ''}`} aria-hidden>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: color,
            animation: `rl-dot-pulse 1.2s ease-in-out ${i * 0.16}s infinite both`,
          }}
        />
      ))}
    </div>
  )
}
