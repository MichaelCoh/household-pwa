// ============================================================
// Service Worker — Push Notifications Handler
// ============================================================

// מאפשר הפעלה מיידית של SW חדש אחרי לחיצה על "עדכן"
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// מבטיח שה-SW החדש ישלוט מיד בכל הטאבים
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// האזנה להתראות נכנסות
self.addEventListener('push', event => {
  if (!event.data) return

  const data = event.data.json()
  const { title, body, icon, url } = data

  const options = {
    body,
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: url || '/' },
    vibrate: [200, 100, 200],
    tag: 'household-notification',
    requireInteraction: false
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// האזנה ללחיצה על התראה
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // אם האפליקציה כבר פתוחה, פשוט נעביר אותה לפוקוס
      for (let client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus()
        }
      }
      // אחרת, נפתח חלון חדש
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})

// ============================================================
// Background Sync — Calendar (Tier 1 Google → app)
// ============================================================
//
// The SW cannot speak to Supabase directly because it doesn't have access to
// the user's JWT. Instead, when the OS wakes us up, we broadcast a message to
// every controlled tab. The frontend's listenForServiceWorkerSync() picks it
// up and runs the actual pull. If no tab is alive, the sync stays registered
// and fires the next time a tab opens.
self.addEventListener('sync', (event) => {
  if (event.tag === 'calendar-sync') {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        client.postMessage({ type: 'CALENDAR_SYNC_TRIGGER', tag: event.tag, at: Date.now() })
      }
    })())
  }
})

// Periodic Background Sync (Chrome installed PWA only). Fires roughly every
// 15-30 minutes when the OS deems it appropriate. Same broadcast pattern.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'calendar-sync') {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        client.postMessage({ type: 'CALENDAR_SYNC_TRIGGER', tag: event.tag, at: Date.now() })
      }
    })())
  }
})
