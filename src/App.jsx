import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './lib/theme.jsx'
import { queryClient } from './lib/queryClient'
import { Sidebar, BottomNav } from './components/Nav'
import { OfflineBanner } from './components/UI'
import UpdateBanner from './components/UpdateBanner'
import { TaskDB } from './lib/db'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import { ShoppingListsPage, ShoppingDetailPage } from './pages/ShoppingPage'
import TasksPage from './pages/TasksPage'
import { CalendarPage, BudgetPage } from './pages/CalendarBudgetPages'
import SettingsPage from './pages/SettingsPage'
import BabyPage from './pages/BabyPage'

function AppContent() {
  const { user, householdId, loading } = useAuth()

  // התראה ביום המשימה — רץ פעם אחת ביום בפתיחת האפליקציה
  useEffect(() => {
    if (!householdId || !user) return
    const checkTodayTasks = async () => {
      try {
        const today = new Date().toDateString()
        const lastChecked = localStorage.getItem('tasks-notif-date')
        if (lastChecked === today) return
        if (!('Notification' in window) || Notification.permission !== 'granted') return

        const tasks = await TaskDB.getAll(householdId)
        const todayStr = new Date().toISOString().slice(0, 10)
        const todayTasks = tasks.filter(t => !t.done && t.due_date === todayStr)
        if (todayTasks.length === 0) return

        localStorage.setItem('tasks-notif-date', today)

        setTimeout(() => {
          todayTasks.forEach(task => {
            new Notification('📋 משימה להיום', {
              body: task.title,
              icon: '/icon-192.png',
              tag: `task-today-${task.id}`,
            })
          })
        }, 3000)
      } catch (e) {
        console.error('Task notification check failed:', e)
      }
    }
    checkTodayTasks()
  }, [householdId, user])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🏠</div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>טוען...</p>
      </div>
    )
  }

  if (!user || !householdId) return <AuthPage />

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shopping" element={<ShoppingListsPage />} />
          <Route path="/shopping/:id" element={<ShoppingDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/baby" element={<BabyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
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
