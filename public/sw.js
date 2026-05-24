// Minimal service worker. Its only job is to make the app installable
// (Chrome's install prompt requires a SW with a fetch handler). The fetch
// handler is a deliberate no-op pass-through — NO caching, so deploys are
// never served stale and Supabase data is always fresh.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // pass-through: let the network handle every request
})
