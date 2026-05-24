import { ImageResponse } from 'next/og'

// PWA / manifest icons at 192 and 512. Referenced from app/manifest.ts as
// /icon/192 and /icon/512. The brand mark sits at ~60% of the square (safe
// zone) so Android's maskable crop (circle/squircle) doesn't clip it.
// app/icon.svg stays as the crisp vector favicon for browser tabs.
export const runtime = 'edge'

export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ]
}

export default function Icon({ id }: { id: string }) {
  const px = id === '512' ? 512 : 192
  const mark = Math.round(px * 0.6)
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
          width={mark}
          height={mark}
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
    { width: px, height: px },
  )
}
