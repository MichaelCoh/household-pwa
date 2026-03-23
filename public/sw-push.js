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
