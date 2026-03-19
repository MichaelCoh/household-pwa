/**
 * realtime.js
 * ─────────────────────────────────────────────────────────────────
 * מה זה: מאזין לשינויים ב-DB בזמן אמת.
 * כשמישהו בבית מוסיף/משנה/מוחק — כל המחוברים מקבלים עדכון תוך שניה.
 *
 * איך זה עובד:
 *   supabase.channel() פותח WebSocket לשרת.
 *   כל שינוי בטבלה נשלח לכל המחוברים דרך ה-WebSocket.
 *   אנחנו מגיבים על-ידי ביטול ה-cache → TanStack Query טוען מחדש.
 */

import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useEffect, useRef } from 'react'

/**
 * useRealtimeRefresh
 * ─────────────────────────────────────────────────────────────────
 * Hook שמאזין לשינויים בטבלה ומפעיל callback בכל שינוי.
 * משמש בכל מסך כדי לרענן נתונים כשמשתמש אחר עושה שינוי.
 *
 * @param {string}   table    - שם הטבלה ('shopping_items', 'tasks', וכו')
 * @param {Function} onUpdate - פונקציה שתרוץ בכל שינוי (בדרך כלל load())
 * @param {string}   [filter] - סינון אופציונלי (למשל: "list_id=eq.xxxx")
 *
 * דוגמה לשימוש בקומפוננטה:
 *   useRealtimeRefresh('tasks', load)
 *   useRealtimeRefresh('shopping_items', load, `list_id=eq.${listId}`)
 */
export function useRealtimeRefresh(table, onUpdate, filter) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!table) return

    const channelConfig = { event: '*', schema: 'public', table }
    if (filter) channelConfig.filter = filter

    const channel = supabase
      .channel(`rt:${table}:${filter || 'all'}:${Math.random()}`)
      .on('postgres_changes', channelConfig, () => {
        onUpdateRef.current?.()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter])
}

/**
 * connectionStatus
 * ─────────────────────────────────────────────────────────────────
 * בדיקת מצב חיבור ל-Supabase — מחזיר 'CONNECTED' / 'DISCONNECTED'
 */
let _status = 'UNKNOWN'
let _listeners = new Set()

const heartbeat = supabase
  .channel('heartbeat')
  .on('system', {}, (payload) => {
    const newStatus = payload.extension === 'postgres_changes' ? 'CONNECTED' : _status
    if (newStatus !== _status) {
      _status = newStatus
      _listeners.forEach((fn) => fn(_status))
    }
  })
  .subscribe((status) => {
    const mapped = status === 'SUBSCRIBED' ? 'CONNECTED' : 'DISCONNECTED'
    if (mapped !== _status) {
      _status = mapped
      _listeners.forEach((fn) => fn(_status))
    }
  })

export function onConnectionChange(fn) {
  _listeners.add(fn)
  fn(_status) // קריאה מיידית עם המצב הנוכחי
  return () => _listeners.delete(fn)
}

export function getConnectionStatus() {
  return _status
}
