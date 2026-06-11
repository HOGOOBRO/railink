// Minimal service worker. Its only job is to make the app installable
// (Chrome's install prompt requires a SW with a fetch handler) and to receive
// web push. The fetch handler is a deliberate no-op pass-through — NO caching,
// so deploys are never served stale and Supabase data is always fresh.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // pass-through: let the network handle every request
})

// ── Web push (약속 초대 알림) ──
// payload: { title, body, url } — /api/push-invite가 보낸다.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* 비JSON 페이로드 → 기본값 */ }
  event.waitUntil(self.registration.showNotification(data.title || 'RaiLink', {
    body: data.body || '',
    icon: '/icon/192',
    badge: '/icon/192',
    data: { url: data.url || '/calendar' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/calendar'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 떠 있는 창이 있으면 포커스(가능하면 해당 경로로), 없으면 새로 연다.
      for (const c of list) {
        if ('focus' in c) {
          if (c.navigate) c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
