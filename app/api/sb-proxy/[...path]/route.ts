// Same-origin proxy for supabase REST/auth/realtime endpoints. The browser
// supabase-js client targets `${origin}/api/sb-proxy/...` instead of the
// supabase host directly, so calls are same-origin and the browser never
// fires a CORS preflight. Resolves the user-environment failure where
// supabase-js OPTIONS preflight returned status 0 / "Failed to fetch" while
// direct supabase fetches from the same browser succeeded.

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

// Hop-by-hop and request-scoped headers that must NOT be forwarded as-is.
const STRIPPED_REQ_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'accept-encoding',
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
    if (!STRIPPED_REQ_HEADERS.has(key.toLowerCase())) headers.set(key, value)
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
