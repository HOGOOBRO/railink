/* Icon set — ported from the design prototype (railink/project/atoms.jsx `Ico`).
 * Stroke uses currentColor; size defaults match the prototype call sites. */

interface IconProps {
  size?: number
  className?: string
}

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function PlusIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.4} {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CloseIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.2} {...base} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={3} {...base} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function EyeIcon({ size = 20, off = false, className }: IconProps & { off?: boolean }) {
  return off ? (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24M10.7 5.08A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-3.07 3.81M6.6 6.6A13.2 13.2 0 0 0 1 12s4 7 11 7c1.7 0 3.2-.3 4.5-.85M2 2l20 20" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function UploadIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

export function FileIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

export function ImageIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

export function EditIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

export function UserIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function UserPlusIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

export function LogoutIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function InfoIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  )
}

// Google Material Icons `cake` (filled) — fill follows currentColor. Used in the
// birthday banner (pink) and the birthday nudge. Per the design handoff, NOT used
// as a calendar-cell marker (a pink dot is used there instead).
export function CakeIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9h-5V7h-2v2H6c-1.66 0-3 1.34-3 3v1.54c0 1.08.88 1.96 1.96 1.96.52 0 1.02-.2 1.38-.57l2.14-2.13 2.13 2.13c.74.74 2.03.74 2.77 0l2.14-2.13 2.13 2.13c.37.37.86.57 1.38.57 1.08 0 1.96-.88 1.96-1.96V12c0-1.66-1.34-3-3-3z" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.2} {...base} className={className}>
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
    </svg>
  )
}

export function EraserIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M7 21h10" />
      <path d="m5.5 14.5 4 4M20 13l-7-7a2 2 0 0 0-2.8 0l-6.4 6.4a2 2 0 0 0 0 2.8L7 18.6a2 2 0 0 0 2.8 0L20 13z" />
    </svg>
  )
}

export function KeyIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** Phone outline — used in the install-banner tile. */
export function PhoneIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...base} className={className}>
      <rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" />
    </svg>
  )
}

export function MailIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  )
}

/** iOS Safari share glyph (square + up arrow) — inline in install steps. */
export function ShareIosIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...base} className={className}>
      <path d="M12 3v12" /><path d="m8 7 4-4 4 4" />
      <path d="M6 12H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

/** Android Chrome overflow menu (three vertical dots) — inline in install steps. */
export function DotsIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}

/** Add-to-home-screen plus square — mirrors the OS "앱 설치" prompt glyph. */
export function AddSquareIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.8} {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
    </svg>
  )
}

/** RaiLink mark — two people (flat, brand color, no gradient/shadow). */
// 로고 — Figma node 378:476 "icon" (2인 그룹). 투톤: 연블루 채움 + 네이비 라인.
// 색은 디자인 고정값이라 currentColor를 따르지 않음(className은 호환용으로 유지).
// Google "G" — keeps its brand colors (does not inherit currentColor), per
// Google's sign-in branding guidelines.
export function GoogleIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}

export function BrandMark({ size = 18, className }: IconProps) {
  // 기본은 RaiLink 네이비 마크. 항공사 테마에서 --brandmark-fill/line을 덮으면
  // 그 색으로 바뀐다(제주=오렌지). 변수 미설정 시 폴백으로 기존 색 유지(랜딩·KTX 등).
  const FILL = 'var(--brandmark-fill, #D6E2EC)'
  const LINE = 'var(--brandmark-line, #0C3C60)'
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M10.7395 8.0099C12.2536 8.0099 13.481 6.78245 13.481 5.26832C13.481 3.7542 12.2536 2.52676 10.7395 2.52676C9.22534 2.52676 7.9979 3.7542 7.9979 5.26832C7.9979 6.78245 9.22534 8.0099 10.7395 8.0099Z" fill={FILL} />
      <path d="M10.7394 8.01004C12.2536 8.01004 13.481 6.78259 13.481 5.26847C13.481 4.0972 12.7465 3.09748 11.713 2.70479" stroke={LINE} strokeWidth="0.666667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.4841 11.8612C15.8251 12.7544 14.9196 14.477 13.3083 14.477H7.25762C5.64636 14.477 4.74082 12.7544 6.08186 11.8612C7.28474 11.0601 8.72933 10.5932 10.283 10.5932C11.8367 10.5932 13.2812 11.0601 14.4841 11.8612Z" fill={FILL} />
      <path d="M6.12623 7.46652C7.76753 7.46652 9.09806 6.13598 9.09806 4.49469C9.09806 2.85339 7.76753 1.52285 6.12623 1.52285C4.48493 1.52285 3.15439 2.85339 3.15439 4.49469C3.15439 6.13598 4.48493 7.46652 6.12623 7.46652Z" fill={FILL} stroke={LINE} strokeWidth="0.666667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.8118 11.3745C12.2655 12.3428 11.2839 14.2101 9.53732 14.2101H2.97838C1.2318 14.2101 0.250206 12.3428 1.70388 11.3745C3.0078 10.5061 4.57372 10 6.25785 10C7.94199 10 9.50792 10.5061 10.8118 11.3745Z" fill={FILL} stroke={LINE} strokeWidth="0.666667" />
      <path d="M9.15115 14.4772H13.3083C14.9197 14.4772 15.8251 12.7546 14.4841 11.8613C14.1138 11.6147 13.7206 11.3998 13.3083 11.2204" stroke={LINE} strokeWidth="0.666667" strokeLinecap="round" />
    </svg>
  )
}

/** Bell — 푸시 알림 너지/설정용. */
export function BellIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a6 6 0 0 0-6 6v3.1c0 .5-.2 1-.5 1.4L4 14.6c-.5.7 0 1.7.9 1.7h14.2c.9 0 1.4-1 .9-1.7l-1.5-2.1a2.4 2.4 0 0 1-.5-1.4V8a6 6 0 0 0-6-6z" />
      <path d="M9.6 18.3a2.5 2.5 0 0 0 4.8 0H9.6z" />
    </svg>
  )
}

/* ── 약속 잡기 (appointment) glyphs ── */

/** Map pin — filled brand with a white center hole. The marker for an
 *  appointment, on the month grid and (collapsed) in the timeline. */
export function PinIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 4.6 6 11.4 6.5 11.95a.7.7 0 0 0 1 0C13 20.4 19 13.6 19 9a7 7 0 0 0-7-7z" />
      <circle cx="12" cy="9" r="2.6" fill="#fff" />
    </svg>
  )
}

export function UsersIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M19.5 19v-1.2a3.2 3.2 0 0 0-2.5-3.1" />
      <path d="M15.2 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  )
}

export function PersonIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function CalendarIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  )
}

export function PlaceIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base} className={className}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
