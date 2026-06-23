// Same-origin proxy for supabase REST/auth/realtime endpoints. The browser
// supabase-js client targets `${origin}/api/sb-proxy/...` instead of the
// supabase host directly, so calls are same-origin and the browser never
// fires a CORS preflight. Resolves the user-environment failure where
// supabase-js OPTIONS preflight returned status 0 / "Failed to fetch" while
// direct supabase fetches from the same browser succeeded.

import type { NextRequest } from 'next/server'

// Edge 런타임 + 서울(icn1) 고정. 이 프록시는 fetch/URL/Headers/Response만 쓰는
// Web 표준 코드라 Edge 호환이다. nodejs 서버리스일 때는 부팅 시 ~8개 호출이 동시에
// 터지며 각자 콜드 스타트(~1초)를 물어 첫 진입이 6초+ 걸렸다. Edge는 콜드 스타트가
// 거의 없고 서울 엣지에서 실행돼 서울 Supabase와 같은 리전 → 호출당 왕복이 대폭 준다.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const preferredRegion = 'icn1'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

// Allowlist of request headers to forward. supabase-js + standard browser
// fetch send these; everything else (Vercel's `x-vercel-*`, `x-forwarded-*`,
// `x-real-ip`, Cloudflare's `cf-*`, browser `sec-fetch-*`, `user-agent`, etc.)
// is dropped. Without this filter, accumulated Vercel/CF/browser headers
// pushed the upstream request over PostgREST/nginx's header-size ceiling and
// every call came back HTTP 494 "Request Header Too Large".
const ALLOWED_REQ_HEADERS = new Set([
  'apikey',
  'authorization',
  'content-type',
  'accept',
  'accept-profile',
  'content-profile',
  'prefer',
  'range',
  'range-unit',
  'x-client-info',
  'x-supabase-api-version',
])

// Response headers that confuse the browser if forwarded verbatim through
// a streaming next.js Response (encoding/length are recomputed downstream).
const STRIPPED_RES_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
])

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  if (!SUPABASE_URL) {
    return new Response('Supabase URL not configured', { status: 500 })
  }

  const incoming = new URL(req.url)
  const targetUrl = `${SUPABASE_URL}/${path.join('/')}${incoming.search}`

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (ALLOWED_REQ_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  })

  // Edge 런타임에선 요청 본문을 버퍼링해 보낸다(스트리밍 duplex 대신 — 본문은 작은
  // JSON이라 무해하고, edge 환경 간 호환성이 더 안전하다). GET/HEAD는 본문 없음.
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  })

  const resHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RES_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}

type Ctx = { params: { path: string[] } }

export function GET(req: NextRequest, ctx: Ctx)    { return forward(req, ctx.params.path) }
export function POST(req: NextRequest, ctx: Ctx)   { return forward(req, ctx.params.path) }
export function PUT(req: NextRequest, ctx: Ctx)    { return forward(req, ctx.params.path) }
export function PATCH(req: NextRequest, ctx: Ctx)  { return forward(req, ctx.params.path) }
export function DELETE(req: NextRequest, ctx: Ctx) { return forward(req, ctx.params.path) }
export function HEAD(req: NextRequest, ctx: Ctx)   { return forward(req, ctx.params.path) }
export function OPTIONS(req: NextRequest, ctx: Ctx){ return forward(req, ctx.params.path) }
