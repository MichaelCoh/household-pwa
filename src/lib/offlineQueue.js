/**
 * offlineQueue.js
 * ─────────────────────────────────────────────────────────────────
 * מה זה: תור של פעולות קניות שנשמרות מקומית כשאין אינטרנט.
 * כשחוזרים לרשת — הפעולות מתבצעות אוטומטית.
 *
 * דוגמה:
 *   בסופר ללא קליטה → סמנת "חלב" → נשמר בתור.
 *   חזרת הביתה → WiFi → "חלב" מסתנכרן לשרת → אבא רואה עדכון.
 */

import { get, set, del } from 'idb-keyval'
import { queryClient } from './queryClient'

const QUEUE_KEY = 'hh_offline_queue'

/**
 * הוסף פעולה לתור (כשאין אינטרנט)
 * @param {Object} op - הפעולה: { type: 'toggle'|'add'|'delete', payload: {...} }
 */
export async function enqueue(op) {
  const queue = (await get(QUEUE_KEY)) || []
  queue.push({ ...op, id: crypto.randomUUID(), createdAt: Date.now() })
  await set(QUEUE_KEY, queue)
}

/**
 * כמה פעולות ממתינות לסנכרון
 */
export async function getPendingCount() {
  const queue = (await get(QUEUE_KEY)) || []
  return queue.length
}

/**
 * סנכרון כל הפעולות הממתינות לשרת
 * @param {Function} executors - מפה של { type → פונקציה שמבצעת את הפעולה }
 */
export async function flushQueue(executors) {
  const queue = (await get(QUEUE_KEY)) || []
  if (queue.length === 0) return

  const failed = []

  for (const op of queue) {
    try {
      const fn = executors[op.type]
      if (fn) await fn(op.payload)
    } catch (err) {
      console.warn('offlineQueue: נכשל בסנכרון פעולה', op, err)
      failed.push(op)
    }
  }

  // שמור רק את הפעולות שנכשלו
  if (failed.length > 0) {
    await set(QUEUE_KEY, failed)
  } else {
    await del(QUEUE_KEY)
  }

  // רענן את ה-cache אחרי סנכרון
  queryClient.invalidateQueries({ queryKey: ['shopping'] })
}

/**
 * ניטור אוטומטי: כשחוזרים לרשת → sync
 */
export function startQueueSync(executors) {
  const sync = async () => {
    if (navigator.onLine) {
      await flushQueue(executors)
    }
  }

  window.addEventListener('online', sync)

  // בדיקה גם בטעינה הראשונה
  if (navigator.onLine) sync()

  return () => window.removeEventListener('online', sync)
}
