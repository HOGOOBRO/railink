import type { MetadataRoute } from 'next'

// Public, indexable pages only. Authenticated / account-flow routes
// (/calendar, /settings/*, /find, /reset, /install, /auth/callback) carry
// `robots: { index: false }` in their layouts and are deliberately excluded.
// The root "/" now serves a 200 splash (since #61), so it's listed as the
// canonical entry even though it client-redirects to /login.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://railink.app'
  const lastModified = new Date()
  return [
    { url: base, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/login`, lastModified, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/signup`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/legal/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/oss`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
