# 🏠 הבית שלנו — Household PWA

Progressive Web App לניהול משק בית, עם סנכרון בזמן אמת ותמיכה בעברית מלאה.

## תכונות

- 🛒 רשימות קניות
- ✅ משימות
- 📅 לוח שנה
- 💳 תקציב
- 👶 יומן תינוקת (גפן)
- 🔔 התראות בזמן אמת
- 📴 עבודה אופליין
- 🌙 Dark/Light mode
- 🔒 אבטחה עם Supabase Auth + RLS

## Stack

- **Frontend:** React 18, Vite, TanStack Query
- **Backend:** Supabase (PostgreSQL + Auth + Realtime)
- **Deployment:** Cloudflare Pages
- **PWA:** Workbox, IndexedDB

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

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```
