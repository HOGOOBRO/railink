import { ImageResponse } from 'next/og'

// Generates og:image (and twitter image) at /opengraph-image — used by
// KakaoTalk, iMessage, etc. for the link preview card. Text is kept English
// so the default (latin) font renders cleanly; Korean would need a font fetch.
export const runtime = 'edge'
export const alt = 'RaiLink · Schedule, together.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: 'linear-gradient(135deg, #0C3C60 0%, #0A3050 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 10, fontWeight: 700, color: '#6E94B5' }}>
          FOR KTX CREW
        </div>
        <div style={{ fontSize: 132, fontWeight: 800, marginTop: 16, lineHeight: 1 }}>
          RaiLink
        </div>
        <div style={{ fontSize: 52, fontWeight: 600, marginTop: 28, color: '#D6E2EC' }}>
          Schedule, together.
        </div>
      </div>
    ),
    { ...size },
  )
}
