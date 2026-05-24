import type { MetadataRoute } from 'next'

// Internal crew tool: allow the public landing pages, keep crawlers out of
// authenticated / account-flow areas (saves crawl budget; noindex meta on
// those routes guarantees they stay out of results).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/calendar', '/settings', '/find', '/reset'],
    },
    sitemap: 'https://railink.app/sitemap.xml',
  }
}
