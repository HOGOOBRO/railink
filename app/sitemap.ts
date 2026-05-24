import type { MetadataRoute } from 'next'

// Only the public landing pages. The homepage "/" 307-redirects, so it's
// intentionally omitted (Google drops redirect-only URLs anyway).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://railink.app'
  const lastModified = new Date()
  return [
    { url: `${base}/login`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
  ]
}
