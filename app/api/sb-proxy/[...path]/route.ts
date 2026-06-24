// Same-origin proxy for supabase REST/auth/realtime endpoints. The browser
// supabase-js client targets `${origin}/api/sb-proxy/...` instead of the
// supabase host directly, so calls are same-origin and the browser never
// fires a CORS preflight. Resolves the user-environment failure where
// supabase-js OPTIONS preflight returned status 0 / "Failed to fetch" while
// direct supabase fetches from the same browser succeeded.

import type { NextRequest } from 'next/server'

// Edge 런타임 + 서울(icn1) 고정. nodejs 서버리스는 저트래픽이라 부팅 시 동시 호출이
// 각자 콜드 스타트(~1초)를 물어 첫 진입이 6초+ 걸렸다(함수가 식어 있다가 깨어남).
// Edge는 콜드 스타트가 거의 없고 서울 엣지에서 실행돼 서울 Supabase와 같은 리전 →
// 호출당 ~100ms. 단 edge는 nodejs와 동작이 달라 forward에서 세 가지를 맞춰줘야 한다:
//  ① Next.js가 catch-all 세그먼트를 `path=` 쿼리로 덧붙임 → 제거
//  ② edge fetch가 gzip 응답을 자동 해제 안 함 → accept-encoding: identity로 평문 수신
//  ③ 204/304 등 본문 금지 상태에 버퍼를 넣으면 Response 생성이 throw → 본문 null 처리
export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const preferredRegion = 'icn1'

// 본문을 가질 수 없는 응답 상태(여기에 ArrayBuffer를 넘기면 Response가 throw → 500).
// supabase 쓰기(PATCH/DELETE, Prefer: return=minimal)가 204를 반환한다.
const NULL_BODY_STATUS = new Set([101, 204, 205, 304])

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
  // ① edge에선 Next.js가 catch-all([...path]) 세그먼트를 `path=rest&path=v1&...`로
  // 쿼리에 덧붙인다. 그대로 두면 PostgREST가 `path`를 필터로 해석해 400(빈 데이터).
  incoming.searchParams.delete('path')
  const targetUrl = `${SUPABASE_URL}/${path.join('/')}${incoming.search}`

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (ALLOWED_REQ_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  })
  // ② edge fetch는 gzip 응답을 자동 해제하지 않으므로 압축을 끄고 평문으로 받는다.
  headers.set('accept-encoding', 'identity')

  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const body = hasBody ? await req.arrayBuffer() : undefined

  // 업스트림 hang 방어: edge fetch엔 기본 타임아웃이 없어, 콜드스타트·네트워크 단절로
  // Supabase 응답이 영영 안 오면 이 fetch가 무한 pending → 클라 supabase-js fetch도
  // 무한 pending이 되어 캘린더 데이터 로딩바·세션 해석이 안 풀린다(관측된 증상). 10초
  // 상한을 둬 hang을 504로 끊어, 클라가 무한 대기 대신 즉시 실패를 받아 재시도하거나
  // 호출부 catch로 떨어지게 한다. 정상(빠른) 응답엔 영향이 없다.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    })

    const resHeaders = new Headers()
    upstream.headers.forEach((value, key) => {
      if (!STRIPPED_RES_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value)
    })

    // ③ 204/304 등은 본문이 없어야 한다(버퍼를 넘기면 Response가 throw → 500).
    const resBody = NULL_BODY_STATUS.has(upstream.status) ? null : await upstream.arrayBuffer()
    return new Response(resBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    })
  } catch (err) {
    // abort(타임아웃) 또는 네트워크 오류 → 504. 무한 pending보다 즉시 실패가 낫다.
    const aborted = err instanceof Error && err.name === 'AbortError'
    return new Response(aborted ? 'Upstream timeout' : 'Upstream fetch error', { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}

type Ctx = { params: { path: string[] } }

export function GET(req: NextRequest, ctx: Ctx)    { return forward(req, ctx.params.path) }
export function POST(req: NextRequest, ctx: Ctx)   { return forward(req, ctx.params.path) }
export function PUT(req: NextRequest, ctx: Ctx)    { return forward(req, ctx.params.path) }
export function PATCH(req: NextRequest, ctx: Ctx)  { return forward(req, ctx.params.path) }
export function DELETE(req: NextRequest, ctx: Ctx) { return forward(req, ctx.params.path) }
export function HEAD(req: NextRequest, ctx: Ctx)   { return forward(req, ctx.params.path) }
export function OPTIONS(req: NextRequest, ctx: Ctx){ return forward(req, ctx.params.path) }
