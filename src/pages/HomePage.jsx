import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ShoppingDB, TaskDB, EventDB, ExpenseDB, BabyDB, timeAgo } from '../lib/db'

const GREETING = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'לילה טוב'
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export default function HomePage() {
  const { user, householdId, displayName } = useAuth()
  const [stats, setStats] = useState({ lists: 0, items: 0, tasks: 0, spent: 0 })
  const [todayEvents, setTodayEvents] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [lastBabyLog, setLastBabyLog] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    const load = async () => {
      const now = new Date()
      const [lists, allItems, tasks, expenses, events, lastBaby] = await Promise.all([
        ShoppingDB.getLists(householdId),
        ShoppingDB.getAllItems(householdId),
        TaskDB.getAll(householdId),
        ExpenseDB.getForMonth(householdId, now.getFullYear(), now.getMonth()),
        EventDB.getAll(householdId),
        BabyDB.getLast(householdId),
      ])
      const todayStr = now.toISOString().split('T')[0]
      setTodayEvents(events.filter(e => e.date === todayStr).slice(0, 3))
      setPendingTasks(tasks.filter(t => !t.done).slice(0, 5))
      setLastBabyLog(lastBaby)
      setStats({
        lists: lists.length,
        items: allItems.filter(i => !i.checked).length,
        tasks: tasks.filter(t => !t.done).length,
        spent: expenses.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0),
      })
      setLoading(false)
    }
    load()
  }, [householdId])

  const timeSinceBaby = (iso) => {
    if (!iso) return null
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    const h = Math.floor(m / 60)
    if (m < 1)  return 'עכשיו'
    if (m < 60) return `לפני ${m} דק׳`
    return `לפני ${h}:${String(m % 60).padStart(2, '0')} ש׳`
  }

  const name = displayName || 'שלום'
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' })

  const NAV_CARDS = [
    { to: '/shopping', label: 'קניות',  icon: '🛒', color: 'var(--teal)',  bg: 'var(--teal-light)',  stat: stats.lists, meta: `${stats.items} פריטים לקנות` },
    { to: '/tasks',    label: 'משימות', icon: '✅', color: 'var(--coral)', bg: 'var(--coral-light)', stat: stats.tasks, meta: 'משימות ממתינות' },
    { to: '/calendar', label: 'יומן',   icon: '📅', color: 'var(--sky)',   bg: 'var(--sky-light)',   stat: todayEvents.length, meta: 'אירועים היום' },
    { to: '/budget',   label: 'תקציב',  icon: '💳', color: 'var(--amber)', bg: 'var(--amber-light)', stat: `₪${stats.spent.toFixed(0)}`, meta: 'הוצאות החודש' },
  ]

  return (
    <div>
      {/* Hero */}
      <div style={{ background: 'var(--bg-card)', padding: '32px 20px 24px', paddingTop: 'max(32px, env(safe-area-inset-top))', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginBottom: '4px' }}>{dateStr}</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: '6px', color: 'var(--text-primary)' }}>
            {GREETING()},<br />{name} 👋
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>סקירת הבית שלך</p>
        </div>
      </div>

      <div className="page">
        {/* Nav cards */}
        <div className="nav-grid" style={{ marginTop: '24px' }}>
          {NAV_CARDS.map(({ to, label, icon, color, bg, stat, meta }) => (
            <Link key={to} to={to} className="nav-card" style={{ borderTopColor: color }}>
              <div className="nav-card-icon" style={{ background: bg }}>{icon}</div>
              <div className="nav-card-stat" style={{ color }}>{loading ? '—' : stat}</div>
              <div className="nav-card-label">{label}</div>
              <div className="nav-card-meta">{meta}</div>
            </Link>
          ))}
        </div>

        {/* Today's events */}
        {todayEvents.length > 0 && (
          <>
            <div className="section-label">אירועים היום <Link to="/calendar">כל האירועים</Link></div>
            <div className="card">
              {todayEvents.map((e, i) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: i < todayEvents.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{e.title}</div>
                    {e.time && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{e.time}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pending tasks */}
        {pendingTasks.length > 0 && (
          <>
            <div className="section-label">משימות ממתינות <Link to="/tasks">כל המשימות</Link></div>
            <div className="card">
              {pendingTasks.map((t, i) => {
                const pc = { high: 'var(--coral)', medium: 'var(--amber)', low: 'var(--mint)' }[t.priority] || 'var(--primary)'
                const overdue = t.due_date && new Date(t.due_date) < new Date()
                return (
                  <Link key={t.id} to="/tasks" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: i < pendingTasks.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: pc, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{t.title}</span>
                    {t.due_date && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: overdue ? 'var(--coral-light)' : 'var(--bg-elevated)', color: overdue ? 'var(--coral)' : 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
                        {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </>
        )}

        {/* כרטיס ילדים */}
        <div className="section-label">👶 ילדים <Link to="/baby">כל היומן</Link></div>
        <Link to="/baby" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', borderRight: '4px solid var(--primary)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
              👶
            </div>
            {lastBabyLog ? (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                  {lastBabyLog.feed_type === 'nursing'    && '🤱 הנקה'}
                  {lastBabyLog.feed_type === 'breastmilk' && `🍼 חלב שאוב${lastBabyLog.feed_amount_cc ? ` · ${lastBabyLog.feed_amount_cc} cc` : ''}`}
                  {lastBabyLog.feed_type === 'formula'    && `🥛 מטרנה${lastBabyLog.feed_amount_cc ? ` · ${lastBabyLog.feed_amount_cc} cc` : ''}`}
                  {!lastBabyLog.feed_type && (lastBabyLog.diaper_pee || lastBabyLog.diaper_poop) && 'חיתול'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>⏱️ {timeSinceBaby(lastBabyLog.logged_at)}</span>
                  {lastBabyLog.diaper_pee  && <span>💛 פיפי</span>}
                  {lastBabyLog.diaper_poop && <span>💩 קקי</span>}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>אין רשומות עדיין</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>לחץ להוספת האכלה ראשונה</div>
              </div>
            )}
            <span style={{ color: 'var(--primary)', fontSize: '20px' }}>›</span>
          </div>
        </Link>

        {!loading && pendingTasks.length === 0 && todayEvents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
            <p style={{ fontSize: '16px', fontWeight: 600 }}>הכל מסודר!</p>
            <p style={{ fontSize: '14px', marginTop: '4px' }}>אין משימות ממתינות ואין אירועים היום</p>
          </div>
        )}
      </div>
    </div>
  )
}
