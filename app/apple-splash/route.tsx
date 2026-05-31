import { ImageResponse } from 'next/og'

// iOS PWA launch image (apple-touch-startup-image). iOS doesn't auto-generate a
// splash from the manifest, so we serve one large 2048x2732 (iPad Pro portrait)
// navy image; iOS scales/letterboxes it to each device. Referenced from layout's
// appleWebApp.startupImage.
//
// Static port of the §17 "Brand immersive" splash from the design handoff
// (source/pwa-splash.jsx): a glass tile holding the people-pair brand mark, the
// RAILINK wordmark (JetBrains Mono), the Korean tagline, and a bottom version
// caption. Animations (glyph-in, dot pulse) are intentionally dropped — a launch
// image is a single still frame.
export const runtime = 'edge'

// next/og (Satori) ships no JetBrains Mono / Korean font, so we fetch subsetted
// TTFs from Google Fonts. Default edge fetch UA gets TTF (not woff2, which Satori
// can't parse). Each load is best-effort: on failure we degrade gracefully.
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`
    const css = await (await fetch(url)).text()
    const src = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)
    if (!src) return null
    const res = await fetch(src[1])
    return res.status === 200 ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

const WORDMARK = 'RAILINK'
const TAGLINE = '동료와 함께 일정 맞추기'
const CAPTION = 'RAILINK · 2026 / V1.0'

export async function GET() {
  const [mono, kr] = await Promise.all([
    loadGoogleFont('JetBrains+Mono:wght@400', WORDMARK + CAPTION),
    loadGoogleFont('Noto+Sans+KR:wght@500', TAGLINE),
  ])

  const fonts = [
    mono && { name: 'JetBrains Mono', data: mono, weight: 400 as const, style: 'normal' as const },
    kr && { name: 'Noto Sans KR', data: kr, weight: 500 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' }[]

  const monoFamily = mono ? 'JetBrains Mono' : 'monospace'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#0C3C60',
        }}
      >
        {/* center cluster: glass tile + glyph, wordmark, tagline */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 520,
              height: 520,
              borderRadius: 150,
              background: 'rgba(255,255,255,0.08)',
              border: '3px solid rgba(255,255,255,0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="290"
              height="290"
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

          <div
            style={{
              marginTop: 120,
              fontSize: 120,
              fontFamily: monoFamily,
              fontWeight: 400,
              letterSpacing: 17,
              color: '#ffffff',
            }}
          >
            {WORDMARK}
          </div>

          {kr && (
            <div
              style={{
                marginTop: 36,
                fontSize: 48,
                fontFamily: 'Noto Sans KR',
                fontWeight: 500,
                letterSpacing: 2,
                color: 'rgba(255,255,255,0.62)',
              }}
            >
              {TAGLINE}
            </div>
          )}
        </div>

        {/* bottom cluster: loading dots + version caption */}
        <div
          style={{
            paddingBottom: 220,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', marginBottom: 96 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 26,
                  height: 26,
                  marginLeft: i === 0 ? 0 : 26,
                  borderRadius: 999,
                  background: '#ffffff',
                  opacity: 0.55,
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: 42,
              fontFamily: monoFamily,
              fontWeight: 400,
              letterSpacing: 10,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            {CAPTION}
          </div>
        </div>
      </div>
    ),
    {
      width: 2048,
      height: 2732,
      fonts: fonts.length ? fonts : undefined,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  )
}
