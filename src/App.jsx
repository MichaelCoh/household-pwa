import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
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

function AppContent() {
  const { user, householdId, loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🏠</div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>טוען...</p>
      </div>
    )
  }

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
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
            <UpdateBanner />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
