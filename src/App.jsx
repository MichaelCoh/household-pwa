import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured, supabase, isPasswordRecovery } from './lib/supabase'
import { ThemeProvider } from './lib/theme.jsx'
import { queryClient } from './lib/queryClient'
import { Sidebar, BottomNav } from './components/Nav'
import { OfflineBanner, PageSpinner } from './components/UI'
import UpdateBanner from './components/UpdateBanner'
import AuthPage from './pages/AuthPage'

const HomePage = lazy(() => import('./pages/HomePage'))
const ShoppingListsPage = lazy(() => import('./pages/ShoppingPage').then((m) => ({ default: m.ShoppingListsPage })))
const ShoppingDetailPage = lazy(() => import('./pages/ShoppingPage').then((m) => ({ default: m.ShoppingDetailPage })))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const CalendarPage = lazy(() => import('./pages/CalendarBudgetPages').then((m) => ({ default: m.CalendarPage })))
const BudgetPage = lazy(() => import('./pages/CalendarBudgetPages').then((m) => ({ default: m.BudgetPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const BabyPage = lazy(() => import('./pages/BabyPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

function RouteFallback() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
      <PageSpinner />
    </div>
  )
}

function MissingSupabaseConfig() {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--primary)',
        }}
      >
        חסרות הגדרות Supabase
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 440, lineHeight: 1.6, marginBottom: 20 }}>
        הוסף קובץ <code style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>.env</code>{' '}
        בשורש הפרויקט עם המפתחות מ־Supabase (Project Settings → API).
      </p>
      <pre
        style={{
          textAlign: 'left',
          direction: 'ltr',
          background: 'var(--bg-card)',
          padding: 16,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          fontSize: 13,
          overflow: 'auto',
          width: 'min(480px, 100%)',
          color: 'var(--text-secondary)',
        }}
      >
        {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...`}
      </pre>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>
        שמור את הקובץ והפעל מחדש את <code dir="ltr">npm run dev</code>.
      </p>
    </div>
  )
}

function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleUpdate = async () => {
    if (newPassword.length < 6) { setError('הסיסמה חייבת להכיל לפחות 6 תווים'); return }
    setError('')
    setLoading(true)
    try {
      const { error: e } = await supabase.auth.updateUser({ password: newPassword })
      if (e) throw e
      setDone(true)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>הסיסמה עודכנה בהצלחה!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>תוכלו להמשיך להשתמש באפליקציה.</p>
          <button className="btn btn-primary btn-full" onClick={() => window.location.reload()}>המשך</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" style={{ marginBottom: '14px' }}>🔑 איפוס סיסמה</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, textAlign: 'center', marginBottom: '8px' }}>בחרו סיסמה חדשה</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>הזינו סיסמה חדשה לחשבונכם.</p>
        <div className="input-group">
          <label className="input-label">סיסמה חדשה</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder="לפחות 6 תווים"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpdate()}
              autoFocus
              autoComplete="new-password"
              style={{ paddingLeft: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', padding: '4px', lineHeight: 1 }}
              tabIndex={-1}
            >
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        {error && (
          <p style={{ color: 'var(--coral)', fontSize: '13px', marginBottom: '12px', background: 'var(--coral-light)', padding: '10px', borderRadius: '8px' }}>{error}</p>
        )}
        <button className="btn btn-primary btn-full" onClick={handleUpdate} disabled={loading}>
          {loading ? 'שומר...' : 'עדכון סיסמה'}
        </button>
      </div>
    </div>
  )
}

function AppContent() {
  const { user, householdId, loading } = useAuth()
  const { pathname } = useLocation()
  const [isRecovery, setIsRecovery] = useState(false)

  // Check the module-level flag (set before React mounted) + listen for late events
  useEffect(() => {
    if (isPasswordRecovery) setIsRecovery(true)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🏠</div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>טוען...</p>
      </div>
    )
  }

  if (isRecovery) return <ResetPasswordScreen />

  if (!user || !householdId) {
    return (
      <Suspense fallback={<RouteFallback />}>
        {pathname === '/landing' ? <LandingPage /> : <AuthPage />}
      </Suspense>
    )
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <OfflineBanner />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shopping" element={<ShoppingListsPage />} />
            <Route path="/shopping/:id" element={<ShoppingDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/baby" element={<BabyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/join" element={<Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {!isSupabaseConfigured ? (
          <MissingSupabaseConfig />
        ) : (
          <>
            <AuthProvider>
              <BrowserRouter>
                <AppContent />
              </BrowserRouter>
            </AuthProvider>
            <UpdateBanner />
          </>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
