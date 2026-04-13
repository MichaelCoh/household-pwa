/**
 * queryClient.js
 * ─────────────────────────────────────────────────────────────────
 * מה זה: ה"מוח" של ניהול הנתונים באפליקציה.
 * TanStack Query מנהל עבורנו:
 *   - Cache: שומר תוצאות שאילתות, לא טוען שוב אם הנתונים טריים
 *   - Offline: מציג נתונים ישנים מה-cache כשאין אינטרנט
 *   - Refetch: מרענן ברקע כשחוזרים לאפליקציה
 *   - Optimistic updates: מעדכן את ה-UI מיד לפני שהשרת אישר
 */

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // כמה זמן (ms) הנתונים נחשבים "טריים" — לא יטען שוב בזמן הזה
      staleTime: 30_000, // 30 שניות

      // כמה זמן לשמור ב-cache אחרי שהרכיב מתנתק
      gcTime: 5 * 60_000, // 5 דקות

      // כמה פעמים לנסות שוב אם נכשל
      retry: 2,

      // האם להציג נתונים ישנים מה-cache בזמן טעינה — כן תמיד
      placeholderData: (previousData) => previousData,

      // לא לרענן כשהמשתמש חוזר לטאב (יטפל ה-Realtime)
      refetchOnWindowFocus: false,
    },
    mutations: {
      // ניסיון חוזר רק פעם אחת בעדכונים
      retry: 1,
    },
  },
})
