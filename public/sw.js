// Service worker: makes the app installable (Chrome's install prompt needs a SW
// with a fetch handler), receives web push, AND caches immutable build assets so
// PWA cold launches don't re-download every JS/CSS/font chunk over the network.
//
// CACHING SCOPE IS DELIBERATELY NARROW — cache-first applies ONLY to
// /_next/static/* (content-hash-named, immutable: a new deploy mints new URLs,
// so a cached entry can never go stale). EVERYTHING ELSE — HTML navigations,
// /api/*, the Supabase proxy (/api/sb-proxy), dynamic routes (/icon, og-image) —
// is left untouched (network pass-through), so deploys are never served stale
// and Supabase data is always fresh, exactly as before.
const STATIC_CACHE = 'railink-static-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 옛 버전의 정적 캐시 정리(이 SW가 만든 것만). 캐시 이름 규칙을 바꾸면
    // 다음 배포에서 이전 캐시가 자동 폐기된다.
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((k) => k.startsWith('railink-static-') && k !== STATIC_CACHE)
        .map((k) => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // 변경 요청은 절대 캐시하지 않음
  let url
  try { url = new URL(req.url) } catch { return }
  // 같은 출처의 불변 빌드 자산만 캐시-우선. 그 외는 respondWith를 호출하지 않아
  // 브라우저 기본 네트워크 경로로 그대로 흐른다(기존 패스스루 동작 유지).
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req))
  }
})

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  // 캐시에 없으면 네트워크에서 받아 정상 200 응답만 저장. 실패하면 그대로 전파.
  const res = await fetch(req)
  if (res && res.status === 200) cache.put(req, res.clone())
  return res
}

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
