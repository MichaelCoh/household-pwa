import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV = [
  { path: '/',         label: 'בית',     icon: '🏠', color: 'var(--primary)' },
  { path: '/shopping', label: 'קניות',   icon: '🛒', color: 'var(--teal)' },
  { path: '/tasks',    label: 'משימות',  icon: '✅', color: 'var(--coral)' },
  { path: '/calendar', label: 'יומן',    icon: '📅', color: 'var(--sky)' },
  { path: '/baby',     label: 'גפן',     icon: '👶', color: 'var(--primary)' },
  { path: '/budget',   label: 'תקציב',   icon: '💳', color: 'var(--amber)' },
  { path: '/settings', label: 'הגדרות',  icon: '⚙️', color: 'var(--text-secondary)' },
]

export function Sidebar() {
  const { pathname } = useLocation()
  const { user, signOut } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">🏠 Household</div>
      {NAV.map(({ path, label, icon, color }) => (
        <Link key={path} to={path}
          className={`sidebar-item ${pathname === path ? 'active' : ''}`}
          style={pathname === path ? { color, background: color + '18' } : {}}>
          <span className="sidebar-item-icon">{icon}</span>
          {label}
        </Link>
      ))}
      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-user-name">👤 {user?.email?.split('@')[0]}</div>
          <div className="sidebar-user-email">{user?.email}</div>
          <button className="btn btn-ghost btn-sm btn-full" style={{ marginTop: '10px' }} onClick={signOut}>Sign out</button>
        </div>
      </div>
    </aside>
  )
}

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="bottom-nav">
      {NAV.map(({ path, label, icon, color }) => {
        const active = pathname === path
        return (
          <Link key={path} to={path}
            className={`bottom-nav-item ${active ? 'active' : ''}`}
            style={active ? { '--active-color': color } : {}}>
            <div className="bottom-nav-icon" style={active ? { background: color + '18' } : {}}>
              <span style={{ fontSize: '20px', opacity: active ? 1 : 0.4 }}>{icon}</span>
            </div>
            <span className="bottom-nav-label" style={active ? { color } : {}}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
