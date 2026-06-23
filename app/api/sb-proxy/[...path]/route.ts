// Same-origin proxy for supabase REST/auth/realtime endpoints. The browser
// supabase-js client targets `${origin}/api/sb-proxy/...` instead of the
// supabase host directly, so calls are same-origin and the browser never
// fires a CORS preflight. Resolves the user-environment failure where
// supabase-js OPTIONS preflight returned status 0 / "Failed to fetch" while
// direct supabase fetches from the same browser succeeded.

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 함수를 서울(icn1)에 고정. Supabase 프로젝트가 서울(ap-northeast-2)이고 주 사용자도
// 한국인데, 리전 미설정 시 Vercel 기본값(US East, iad1)에서 실행돼 모든 DB 호출이
// 미국을 경유(브라우저→서울엣지→US함수→서울DB→US→한국)하며 1개당 1초+ 걸렸다.
// 함수·DB·사용자를 같은 리전에 모으면 호출당 ~100ms로 떨어져 부팅이 대폭 빨라진다.
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

  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
  }
  if (hasBody) init.duplex = 'half'

  const upstream = await fetch(targetUrl, init)

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
