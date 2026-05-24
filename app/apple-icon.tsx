import { ImageResponse } from 'next/og'

// iOS "Add to Home Screen" icon (apple-touch-icon). iOS needs a PNG, so we
// render the brand mark (same as app/icon.svg) to a 180x180 PNG via next/og.
export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C3C60',
        }}
      >
        <svg
          width="112"
          height="112"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3 3-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M14.5 17.5c.6-2.4 2.7-3.5 4.5-3.5s2 1.1 2 3.5" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
