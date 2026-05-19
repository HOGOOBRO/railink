import { createClient } from '@supabase/supabase-js'

// The anon/publishable key is public by design; data access is enforced by
// Row Level Security, not key secrecy.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Build-safe: never throw at module load (pages prerender at build time, and
// the Vercel build would fail before env vars are configured). If the env is
// missing we fall back to a placeholder so the bundle loads; real auth calls
// then fail and surface our friendly error messages in the UI.
if ((!url || !anonKey) && typeof window !== 'undefined') {
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — ' +
    'set them in .env.local (local) and Vercel → Settings → Environment Variables (prod).',
  )
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
