/* iOS-style toggle switch. 50×30 track, 24px knob, slides on/off.
 *
 * The track + knob are pure CSS — no third-party dependency. Pair with a
 * borderless row label (see /settings/codebook 휴무 코드 row in the
 * design_handoff_codes handoff) rather than wrapping in a Checkbox-style
 * bordered box. */

interface SwitchProps {
  on: boolean
  onChange?: (on: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export function Switch({ on, onChange, disabled, ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`relative w-[50px] h-[30px] rounded-pill shrink-0 transition-colors duration-150 ${
        on ? 'bg-brand' : 'bg-line-2'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className="absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sh1 transition-[left] duration-150"
        style={{ left: on ? 23 : 3 }}
      />
    </button>
  )
}
