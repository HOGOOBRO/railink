'use client'

/* Plain text input matching the 약속 잡기 wizard fields (48px, radius 12,
 * 2px line border, focuses to brand). Separate from the form-labelled Input in
 * components/ui/Input.tsx — the wizard renders its own FieldLbl above each. */

export function CbInput({
  value, onChange, placeholder, mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`w-full h-12 px-3.5 rounded-md border-2 border-line bg-surface text-body text-ink-900 placeholder:text-ink-300 outline-none focus:border-brand transition-colors ${mono ? 'font-en' : 'font-kr'}`}
    />
  )
}
