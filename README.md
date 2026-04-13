# 🏠 הבית שלנו — Household PWA

Progressive Web App לניהול משק בית, עם סנכרון בזמן אמת ותמיכה בעברית מלאה.

## תכונות

- 🛒 רשימות קניות
- ✅ משימות (כולל תזכורות push מתוזמנות)
- 📅 לוח שנה
- 💳 תקציב
- 👶 יומן ילדים — מעקב האכלות/חיתולים (תינוקות), פרופיל בריאות, אבני דרך וחיסונים לפי גיל
- 🔔 התראות בזמן אמת (Web Push דרך Supabase Edge Functions)
- 📴 עבודה אופליין
- 🌙 Dark / Light mode
- 🔒 אבטחה עם Supabase Auth + RLS

## Stack

- **Frontend:** React 18, Vite, TanStack Query
- **Backend:** Supabase (PostgreSQL + Auth + Realtime)
- **Deployment:** Cloudflare Pages
- **PWA:** Workbox (כולל Service Worker להתראות)

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment Variables

העתק ל־`.env` מקומי (לא מועלה ל־Git). בפרודקשן (למשל Cloudflare Pages) הגדר את אותם המפתחות ב־**Environment variables** לפני build.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# כתובת פונקציית send-push — נדרש להפעלת התראות מהאפליקציה (בדיקה, פעולות בזמן אמת)
VITE_PUSH_SERVICE_URL=https://YOUR_PROJECT.supabase.co/functions/v1/send-push
```

**Cron לתזכורות משימות:** GitHub Actions קורא ל־Edge Function `dispatch-task-reminders`. ב־GitHub Repository → Secrets יש להגדיר `SUPABASE_URL` ו־`SUPABASE_ANON_KEY`, ולפרוס את הפונקציה ב־Supabase.
