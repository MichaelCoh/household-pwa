import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { BabyDB } from '../lib/db'
import { sendPushNotification } from '../lib/notifications'
import { useRealtimeRefresh } from '../lib/realtime'
import { useToast, confirmDelete } from '../components/UI'

// ── קבועים ────────────────────────────────────────────────────────────────
const FEED_TYPES = [
  { key: 'nursing',    label: 'הנקה',       icon: '🤱', hasCC: false },
  { key: 'breastmilk', label: 'חלב שאוב',   icon: '🍼', hasCC: true  },
  { key: 'formula',    label: 'מטרנה',       icon: '🥛', hasCC: true  },
]

const FILTERS = [
  { key: 'today',     label: 'היום' },
  { key: 'yesterday', label: 'אתמול' },
  { key: 'week',      label: '7 ימים' },
  { key: 'month',     label: 'חודש' },
]

// ── עזרים ─────────────────────────────────────────────────────────────────
function getDateRange(filter) {
  const now  = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (filter === 'today') {
    return {
      from: today.toISOString(),
      to:   new Date(today.getTime() + 86400000).toISOString(),
    }
  }
  if (filter === 'yesterday') {
    const y = new Date(today.getTime() - 86400000)
    return { from: y.toISOString(), to: today.toISOString() }
  }
  if (filter === 'week') {
    return {
      from: new Date(today.getTime() - 6 * 86400000).toISOString(),
      to:   new Date(today.getTime() + 86400000).toISOString(),
    }
  }
  // month
  return {
    from: new Date(today.getTime() - 29 * 86400000).toISOString(),
    to:   new Date(today.getTime() + 86400000).toISOString(),
  }
}

function timeSince(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  if (m < 1)  return 'עכשיו'
  if (m < 60) return `לפני ${m} דק׳`
  if (h < 24) return `לפני ${h}:${String(m % 60).padStart(2, '0')} ש׳`
  return `לפני ${Math.floor(h / 24)} ימים`
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

function nowTimeInput() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function todayDateInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── כרטיס סטטיסטיקה ───────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 12px',
      flex: 1,
      minWidth: 0,
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
    }}>
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
      {sub && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center' }}>{sub}</span>}
    </div>
  )
}

// ── שורת יומן ─────────────────────────────────────────────────────────────
function LogRow({ log, onDelete, onEdit, showDate }) {
  const feedInfo = FEED_TYPES.find(f => f.key === log.feed_type)
  const hasFeed  = !!log.feed_type
  const hasDiap  = log.diaper_pee || log.diaper_poop

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* שעה */}
      <div style={{ textAlign: 'center', minWidth: '44px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>
          {formatTime(log.logged_at)}
        </div>
        {showDate && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {formatDate(log.logged_at)}
          </div>
        )}
      </div>

      {/* תוכן */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasFeed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px' }}>{feedInfo?.icon}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {feedInfo?.label}
            </span>
            {log.feed_amount_cc != null && (
              <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 700, background: 'var(--primary-light)', padding: '1px 8px', borderRadius: '999px' }}>
                {log.feed_amount_cc} cc
              </span>
            )}
          </div>
        )}
        {hasDiap && (
          <div style={{ display: 'flex', gap: '6px', marginTop: hasFeed ? '4px' : '0' }}>
            {log.diaper_pee  && <span style={{ fontSize: '12px', background: 'rgba(255,214,0,0.2)', color: '#b8860b', padding: '1px 8px', borderRadius: '999px', fontWeight: 600 }}>💛 פיפי</span>}
            {log.diaper_poop && <span style={{ fontSize: '12px', background: 'rgba(139,90,43,0.15)', color: '#8B5A2B', padding: '1px 8px', borderRadius: '999px', fontWeight: 600 }}>💩 קקי</span>}
          </div>
        )}
        {log.notes && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>📝 {log.notes}</div>
        )}
        {!hasFeed && !hasDiap && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>הערה בלבד</span>
        )}
      </div>

      {/* עריכה + מחיקה */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={() => onEdit(log)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.45, padding: '4px' }}
        >✏️</button>
        <button
          onClick={() => onDelete(log)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.35, padding: '4px' }}
        >🗑️</button>
      </div>
    </div>
  )
}

// ── מודאל הוספה/עריכה ────────────────────────────────────────────────────
function QuickLogModal({ open, onClose, onSave, lastCc, editingLog }) {
  const [feedType,  setFeedType]  = useState(null)
  const [ccInput,   setCcInput]   = useState('')
  const [diaperPee, setDiaperPee] = useState(false)
  const [diaperPoop,setDiaperPoop]= useState(false)
  const [notes,     setNotes]     = useState('')
  const [timeInput, setTimeInput] = useState(nowTimeInput())
  const [dateInput, setDateInput] = useState(todayDateInput())
  const [saving,    setSaving]    = useState(false)

  // מילוי שדות בעת פתיחה (איפוס לחדש, מילוי לעריכה)
  useEffect(() => {
    if (open) {
      if (editingLog) {
        const d = new Date(editingLog.logged_at)
        setFeedType(editingLog.feed_type || null)
        setCcInput(editingLog.feed_amount_cc != null ? String(editingLog.feed_amount_cc) : '')
        setDiaperPee(!!editingLog.diaper_pee)
        setDiaperPoop(!!editingLog.diaper_poop)
        setNotes(editingLog.notes || '')
        setTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
        setDateInput(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      } else {
        setFeedType(null)
        setCcInput(lastCc != null ? String(lastCc) : '')
        setDiaperPee(false)
        setDiaperPoop(false)
        setNotes('')
        setTimeInput(nowTimeInput())
        setDateInput(todayDateInput())
      }
      setSaving(false)
    }
  }, [open, editingLog, lastCc])

  if (!open) return null

  const currentFeed = FEED_TYPES.find(f => f.key === feedType)
  const showCC = currentFeed?.hasCC

  const handleSave = async () => {
    if (!feedType && !diaperPee && !diaperPoop && !notes.trim()) return
    setSaving(true)
    const loggedAt = new Date(`${dateInput}T${timeInput}`).toISOString()
    await onSave({
      loggedAt,
      feedType,
      feedAmountCc: showCC && ccInput ? parseInt(ccInput, 10) : null,
      diaperPee,
      diaperPoop,
      notes: notes.trim(),
    })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-handle" />

        {/* כותרת + שעה */}
        <div className="modal-header">
          <h2 className="modal-title">{editingLog ? '✏️ עריכת רשומה — גפן' : '👶 רשומה חדשה — גפן'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* שעה ותאריך */}
        <div style={{ display: 'flex', gap: '10px', padding: '0 16px 16px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px' }}>🕐</span>
          <input
            type="time"
            value={timeInput}
            onChange={e => setTimeInput(e.target.value)}
            className="input"
            style={{ flex: 1, padding: '10px 12px', textAlign: 'center', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-display)' }}
          />
          <input
            type="date"
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            className="input"
            style={{ flex: 1.2, padding: '10px 12px', fontSize: '14px' }}
          />
        </div>

        {/* האכלה */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🍼 האכלה
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: showCC ? '12px' : '0' }}>
            {FEED_TYPES.map(ft => (
              <button
                key={ft.key}
                type="button"
                onClick={() => setFeedType(prev => prev === ft.key ? null : ft.key)}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  borderRadius: 'var(--radius-md)',
                  border: feedType === ft.key ? '2px solid var(--primary)' : '2px solid var(--border)',
                  background: feedType === ft.key ? 'var(--primary-light)' : 'var(--bg-elevated)',
                  color: feedType === ft.key ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '22px' }}>{ft.icon}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.2, textAlign: 'center' }}>{ft.label}</span>
              </button>
            ))}
          </div>

          {/* כמות cc — מופיע רק לחלב שאוב / מטרנה */}
          {showCC && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>כמות:</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                style={{
                  width: '80px',
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '28px',
                  color: 'var(--primary)',
                  textAlign: 'center',
                  padding: 0,
                }}
              />
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' }}>cc</span>
            </div>
          )}
        </div>

        {/* קו הפרדה */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '0 16px 16px' }} />

        {/* חיתול */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🧷 חיתול
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setDiaperPee(p => !p)}
              style={{
                flex: 1,
                padding: '14px 8px',
                borderRadius: 'var(--radius-md)',
                border: diaperPee ? '2px solid #f0c040' : '2px solid var(--border)',
                background: diaperPee ? 'rgba(255,214,0,0.15)' : 'var(--bg-elevated)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '28px' }}>💛</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPee ? '#b8860b' : 'var(--text-secondary)' }}>פיפי</span>
            </button>
            <button
              type="button"
              onClick={() => setDiaperPoop(p => !p)}
              style={{
                flex: 1,
                padding: '14px 8px',
                borderRadius: 'var(--radius-md)',
                border: diaperPoop ? '2px solid #8B5A2B' : '2px solid var(--border)',
                background: diaperPoop ? 'rgba(139,90,43,0.15)' : 'var(--bg-elevated)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '28px' }}>💩</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPoop ? '#8B5A2B' : 'var(--text-secondary)' }}>קקי</span>
            </button>
          </div>
        </div>

        {/* הערה */}
        <div style={{ padding: '0 16px 16px' }}>
          <input
            type="text"
            placeholder="הערה (אופציונלי)..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="input"
            style={{ fontSize: '14px' }}
          />
        </div>

        {/* כפתורים */}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            style={{
              flex: 2,
              background: 'var(--primary)',
              color: '#fff',
              opacity: (!feedType && !diaperPee && !diaperPoop && !notes.trim()) ? 0.4 : 1,
            }}
            onClick={handleSave}
            disabled={saving || (!feedType && !diaperPee && !diaperPoop && !notes.trim())}
          >
            {saving ? '...' : editingLog ? '✓ עדכן' : '✓ שמור'}
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── דף ראשי ────────────────────────────────────────────────────────────────
export default function BabyPage() {
  const { user, householdId } = useAuth()
  const [logs,       setLogs]       = useState([])
  const [lastLog,    setLastLog]    = useState(null)
  const [lastFeed,   setLastFeed]   = useState(null)
  const [filter,     setFilter]     = useState('today')
  const [showModal,  setShowModal]  = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [showToast,  ToastEl]       = useToast()

  const load = useCallback(async () => {
    if (!householdId) return
    const { from, to } = getDateRange(filter)
    const [fetchedLogs, last, lastFeedLog] = await Promise.all([
      BabyDB.getLogs(householdId, from, to),
      BabyDB.getLast(householdId),
      BabyDB.getLastFeed(householdId),
    ])
    setLogs(fetchedLogs)
    setLastLog(last)
    setLastFeed(lastFeedLog)
    setLoading(false)
  }, [householdId, filter])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh('baby_logs', load)

  const handleSave = async ({ loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes }) => {
    try {
      if (editingLog) {
        await BabyDB.update(editingLog.id, { loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes })
        showToast('✓ עודכן!')
      } else {
        await BabyDB.add(householdId, user.id, loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes)
        showToast('✓ נשמר!')
        if (feedType) {
          const feedLabel = feedType === 'nursing' ? 'הנקה' : feedType === 'breastmilk' ? 'חלב שאוב' : 'מטרנה'
          sendPushNotification({ householdId, userId: user.id, title: '👶 האכלה — גפן', body: feedLabel + (feedAmountCc ? ` ${feedAmountCc}cc` : ''), url: '/baby', category: 'baby' })
        }
      }
      setShowModal(false)
      setEditingLog(null)
      load()
    } catch (e) {
      showToast('❌ שגיאה: ' + e.message)
    }
  }

  const handleEdit = (log) => {
    setEditingLog(log)
    setShowModal(true)
  }

  const handleDelete = async (log) => {
    if (!confirmDelete('למחוק רשומה זו?')) return
    try {
      await BabyDB.delete(log.id)
      showToast('✓ נמחק')
      load()
    } catch (e) {
      showToast('❌ שגיאה: ' + e.message)
    }
  }

  // ── סטטיסטיקות ──────────────────────────────────────────────────────────
  const todayLogs = filter === 'today' ? logs : (() => {
    const { from, to } = getDateRange('today')
    return logs.filter(l => l.logged_at >= from && l.logged_at < to)
  })()

  const feedingLogs  = logs.filter(l => l.feed_type)
  const diaperLogs   = logs.filter(l => l.diaper_pee || l.diaper_poop)
  const totalCC      = feedingLogs
    .filter(l => l.feed_amount_cc != null)
    .reduce((s, l) => s + l.feed_amount_cc, 0)

  // שעת ההאכלה האחרונה מהלוג הגלובלי (לא מסונן)
  const lastFeedTime  = lastFeed ? formatTime(lastFeed.logged_at) : '—'
  const lastFeedSince = lastFeed ? timeSince(lastFeed.logged_at) : null

  // cc אחרון לברירת מחדל
  const lastCc = lastLog?.feed_amount_cc ?? null

  // הצגת תאריך בשורה כשמציגים יותר מיום אחד
  const showDateInRow = filter === 'week' || filter === 'month'

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="page-header-accent" style={{ background: 'var(--primary)' }} />
            <div>
              <h1 className="page-title">👶 גפן</h1>
              <p className="page-subtitle">יומן האכלות וחיתולים</p>
            </div>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--primary)', color: '#fff' }}
            onClick={() => { setEditingLog(null); setShowModal(true) }}
          >
            + הוסף
          </button>
        </div>
      </div>

      <div className="page" style={{ paddingTop: '16px' }}>

        {/* סטטיסטיקות */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <StatCard
            icon="⏱️"
            label="האכלה אחרונה"
            value={lastFeedTime}
            sub={lastFeedSince}
            color="var(--primary)"
          />
          <StatCard
            icon="🍼"
            label={filter === 'today' ? 'האכלות היום' : `האכלות (${filter === 'yesterday' ? 'אתמול' : '7 ימים'})`}
            value={feedingLogs.length}
            sub={totalCC > 0 ? `סה"כ ${totalCC} cc` : null}
            color="var(--teal)"
          />
          <StatCard
            icon="🧷"
            label={filter === 'today' ? 'חיתולים היום' : 'חיתולים'}
            value={diaperLogs.length}
            sub={`${logs.filter(l => l.diaper_poop).length} קקי`}
            color="var(--amber)"
          />
        </div>

        {/* Filter */}
        <div className="filter-row" style={{ marginBottom: '16px' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`filter-chip ${filter === f.key ? 'active' : ''}`}
              style={filter === f.key ? { background: 'var(--primary-light)', borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* רשימת רשומות */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>טוען...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>👶</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>אין רשומות עדיין</p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>לחץ + הוסף כדי לתעד האכלה או חיתול</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {logs.map(log => (
              <LogRow
                key={log.id}
                log={log}
                onDelete={handleDelete}
                onEdit={handleEdit}
                showDate={showDateInRow}
              />
            ))}
          </div>
        )}
      </div>

      {ToastEl}

      {/* FAB */}
      <button
        className="fab"
        style={{ background: 'var(--primary)' }}
        onClick={() => { setEditingLog(null); setShowModal(true) }}
      >+</button>

      <QuickLogModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingLog(null) }}
        onSave={handleSave}
        lastCc={lastCc}
        editingLog={editingLog}
      />
    </div>
  )
}
