/**
 * offlineCache.js
 * ─────────────────────────────────────────────────────────────────
 * מה זה: שמירת "צילום" של הנתונים האחרונים ב-IndexedDB (אחסון בטלפון).
 * מטרה: להציג נתונים גם כשאין אינטרנט (read-only).
 *
 * IndexedDB = מסד נתונים קטן שיושב בדפדפן של הטלפון.
 * idb-keyval = ספרייה שמפשטת כתיבה/קריאה ממנו.
 *
 * שימוש:
 *   await saveCache('shopping-lists', data)   // שמירה אחרי טעינה מהשרת
 *   const data = await loadCache('shopping-lists')  // קריאה כשאין אינטרנט
 */

import { set, get, del } from 'idb-keyval'

const CACHE_PREFIX = 'hh_cache_'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 ימים

/**
 * שמירת נתונים ב-cache עם timestamp
 */
export async function saveCache(key, data) {
  try {
    await set(CACHE_PREFIX + key, {
      data,
      savedAt: Date.now(),
    })
  } catch (err) {
    console.warn('offlineCache: שגיאה בשמירה', key, err)
  }
}

/**
 * קריאת נתונים מ-cache
 * מחזיר null אם אין cache או שהוא ישן מדי
 */
export async function loadCache(key) {
  try {
    const entry = await get(CACHE_PREFIX + key)
    if (!entry) return null
    if (Date.now() - entry.savedAt > CACHE_MAX_AGE) {
      await del(CACHE_PREFIX + key)
      return null
    }
    return entry.data
  } catch (err) {
    console.warn('offlineCache: שגיאה בקריאה', key, err)
    return null
  }
}

/**
 * מחיקת cache ספציפי
 */
export async function clearCache(key) {
  try {
    await del(CACHE_PREFIX + key)
  } catch {}
}
