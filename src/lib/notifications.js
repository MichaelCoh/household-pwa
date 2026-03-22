// ============================================================
// Web Push Notifications — Frontend Integration
// ============================================================

import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = 'BPcxqws9Xw_q_hU9DhB-SV-psM6H_TQr5qsXOliFSngKe26VOJFgmQ2-6d_5_OJcveTtAn6eVO3492QVPbp3Jts'

// המרת base64 ל-Uint8Array (נדרש ל-Web Push API)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// בדיקה אם הדפדפן תומך בהתראות
export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

// קבלת סטטוס הרשאות התראות
export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

// בקשת הרשאה והרשמה למנוי
export async function subscribeToNotifications(userId, householdId) {
  if (!isNotificationSupported()) {
    throw new Error('Browser does not support notifications')
  }

  // בקשת הרשאה
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  // המתנה ל-Service Worker
  const registration = await navigator.serviceWorker.ready

  // בדיקה אם כבר קיים מנוי
  let subscription = await registration.pushManager.getSubscription()

  // אם אין מנוי, יצירת מנוי חדש
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  }

  // שמירת המנוי ב-Supabase
  const subJSON = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      household_id: householdId,
      endpoint: subJSON.endpoint,
      p256dh: subJSON.keys.p256dh,
      auth: subJSON.keys.auth
    },
    { onConflict: 'endpoint' }
  )

  if (error) throw error

  return subscription
}

// ביטול מנוי
export async function unsubscribeFromNotifications(userId) {
  if (!isNotificationSupported()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription) {
    await subscription.unsubscribe()

    // מחיקת המנוי מהמסד נתונים
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
  }
}

// שליחת התראה על פעולה — silent fail
// onlyUserIds: אם מוגדר (מערך uuid), ההתראה נשלחת רק למשתמשים האלה (בית + העדפות קטגוריה)
// אחרת: לכל בני הבית חוץ מ-exclude_user_id (המשתמש שביצע את הפעולה)
export async function sendPushNotification({ householdId, userId, title, body, url = '/', category = 'all', onlyUserIds = null }) {
  const pushServiceUrl = import.meta.env.VITE_PUSH_SERVICE_URL
  if (!pushServiceUrl) return
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    const payload = {
      household_id: householdId,
      title,
      body,
      url,
      category,
    }
    if (onlyUserIds && Array.isArray(onlyUserIds) && onlyUserIds.length > 0) {
      payload.only_user_ids = onlyUserIds
    } else {
      payload.exclude_user_id = userId
    }
    await fetch(pushServiceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('Push notification failed silently:', e)
  }
}

// שליחת התראה ידנית (לבדיקה) — שולחת גם לעצמך!
export async function sendTestNotification(householdId, userId) {
  const pushServiceUrl = import.meta.env.VITE_PUSH_SERVICE_URL
  if (!pushServiceUrl) throw new Error('שירות ההתראות לא מוגדר — ראה הגדרות')

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(pushServiceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      household_id: householdId,
      // ללא exclude_user_id — כדי שתשלח גם לעצמך בבדיקה
      title: '🔔 בדיקת התראה',
      body: 'ההתראות עובדות! 🎉',
      icon: '🔔',
      url: '/'
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'שגיאה בשליחה')
  }
  const result = await response.json()
  if (result.sent === 0) throw new Error('לא נמצאו מנויים — נסה להפעיל התראות מחדש')
  return result
}
