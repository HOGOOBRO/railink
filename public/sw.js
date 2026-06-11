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
      // 이미 목표 경로(url)에 있는 창이 있으면 그대로 포커스.
      for (const c of list) {
        if (c.url && c.url.indexOf(url) !== -1 && 'focus' in c) return c.focus()
      }
      // 다른 경로의 창이 있으면 navigate 가능한 경우 이동 후 포커스(끝까지 await).
      for (const c of list) {
        if ('focus' in c && typeof c.navigate === 'function') {
          return c.navigate(url).then((nc) => (nc || c).focus()).catch(() => c.focus())
        }
      }
      // 떠 있는 창이 없거나 navigate 미지원 → 새 창.
      return self.clients.openWindow(url)
    }),
  )
})
