import { createClient } from '@supabase/supabase-js'

// The anon/publishable key is public by design; data access is enforced by
// Row Level Security, not key secrecy.
const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if ((!directUrl || !anonKey) && typeof window !== 'undefined') {
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — ' +
    'set them in .env.local (local) and Vercel → Settings → Environment Variables (prod).',
  )
}

// Browser → same-origin proxy (/api/sb-proxy/*). Some user networks/CDN
// edges fail the cross-origin OPTIONS preflight that supabase-js triggers
// with custom headers (Accept-Profile, Prefer, X-Client-Info), even though
// direct GETs succeed. Routing through a same-origin next.js handler
// eliminates the preflight entirely.
// SSR/build → direct URL: there's no window, and server-side calls don't
// have the CORS issue anyway.
const url = typeof window !== 'undefined'
  ? `${window.location.origin}/api/sb-proxy`
  : (directUrl || 'https://placeholder.supabase.co')

export const supabase = createClient(
  url,
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
