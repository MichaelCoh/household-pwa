import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { BabyDB, ChildrenDB } from '../lib/db'
import { buildWeeklyInsight, getIsoWeekKey, resolveChildNameForInsight } from '../lib/babyInsights'
import { sendPushNotification } from '../lib/notifications'
import { useRealtimeRefresh } from '../lib/realtime'
import { useToast, confirmDelete, PageSpinner } from '../components/UI'

// ── קבועים ────────────────────────────────────────────────────────────────
const FEED_TYPES = [
  { key: 'nursing',    label: 'הנקה',     icon: '🤱', hasCC: false },
  { key: 'breastmilk', label: 'חלב שאוב', icon: '🍼', hasCC: true  },
  { key: 'formula',    label: 'מטרנה',    icon: '🥛', hasCC: true  },
]

const FILTERS = [
  { key: 'today',     label: 'היום'   },
  { key: 'yesterday', label: 'אתמול'  },
  { key: 'week',      label: '7 ימים' },
  { key: 'month',     label: 'חודש'   },
]

const EMOJI_OPTIONS = ['👶','🍼','🤱','🧸','🦁','🐻','🐼','🦊','🌟','⭐','🌈','💫','🌸','🎀','🎈','🐯','🐥','🦋','🌙','🌺']

// ── עזרים ─────────────────────────────────────────────────────────────────
function getDateRange(filter) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (filter === 'today')
    return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() }
  if (filter === 'yesterday') {
    const y = new Date(today.getTime() - 86400000)
    return { from: y.toISOString(), to: today.toISOString() }
  }
  if (filter === 'week')
    return { from: new Date(today.getTime() - 6 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() }
  return { from: new Date(today.getTime() - 29 * 86400000).toISOString(), to: new Date(today.getTime() + 86400000).toISOString() }
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
/** סיכום שבועי — פופ־אפ אלגנטי */
function WeeklyInsightModal({ open, onClose, insight, childName }) {
  if (!open || !insight) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div
        role="presentation"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        onKeyDown={e => e.key === 'Escape' && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-insight-title"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          maxHeight: '85vh',
          overflow: 'auto',
          background: 'linear-gradient(145deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          padding: '24px 20px 20px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '40px', lineHeight: 1, marginBottom: '8px' }}>✨</div>
          <h2 id="weekly-insight-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: 'var(--text-primary)', margin: 0 }}>
            סיכום השבוע
          </h2>
          {childName && (
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--primary)', fontWeight: 600 }}>{childName}</p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {insight.lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '22px', flexShrink: 0 }}>{line.icon}</span>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 500 }}>{line.text}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-full"
          style={{ marginTop: '20px' }}
          onClick={onClose}
        >
          סגור
        </button>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '14px 12px',
      flex: 1, minWidth: 0, border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    }}>
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
      {sub && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center' }}>{sub}</span>}
    </div>
  )
}

// ── שורת יומן ─────────────────────────────────────────────────────────────
function LogRow({ log, onDelete, onEdit, showDate, childLabel }) {
  const feedInfo = FEED_TYPES.find(f => f.key === log.feed_type)
  const hasFeed  = !!log.feed_type
  const hasDiap  = log.diaper_pee || log.diaper_poop

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      {/* שעה */}
      <div style={{ textAlign: 'center', minWidth: '44px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>
          {formatTime(log.logged_at)}
        </div>
        {showDate && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatDate(log.logged_at)}</div>
        )}
      </div>

      {/* תוכן */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {childLabel && (
          <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginBottom: '3px' }}>{childLabel}</div>
        )}
        {hasFeed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px' }}>{feedInfo?.icon}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{feedInfo?.label}</span>
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
        {log.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>📝 {log.notes}</div>}
        {!hasFeed && !hasDiap && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>הערה בלבד</span>}
      </div>

      {/* כפתורים */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
        <button onClick={() => onEdit(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.45, padding: '4px' }}>✏️</button>
        <button onClick={() => onDelete(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.35, padding: '4px' }}>🗑️</button>
      </div>
    </div>
  )
}

// ── ניהול ילדים (bottom sheet) ─────────────────────────────────────────────
function ManageChildrenModal({ open, onClose, childList, householdId, onUpdate }) {
  const [editingId,  setEditingId]  = useState(null)
  const [editName,   setEditName]   = useState('')
  const [editEmoji,  setEditEmoji]  = useState('👶')
  const [addingNew,  setAddingNew]  = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newEmoji,   setNewEmoji]   = useState('👶')
  const [saving,     setSaving]     = useState(false)

  const startEdit = (child) => {
    setEditingId(child.id)
    setEditName(child.name)
    setEditEmoji(child.emoji || '👶')
    setAddingNew(false)
  }

  const saveEdit = async () => {
    if (!editName.trim() || saving) return
    setSaving(true)
    try {
      await ChildrenDB.update(editingId, { name: editName.trim(), emoji: editEmoji })
      setEditingId(null)
      onUpdate()
    } finally { setSaving(false) }
  }

  const handleDelete = async (child) => {
    if (!confirmDelete(`למחוק את ${child.name}? הרשומות שלו יישארו ללא שיוך.`)) return
    await ChildrenDB.delete(child.id)
    onUpdate()
  }

  const saveNew = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    try {
      await ChildrenDB.add(householdId, newName.trim(), newEmoji)
      setAddingNew(false)
      setNewName('')
      setNewEmoji('👶')
      onUpdate()
    } finally { setSaving(false) }
  }

  const EmojiPicker = ({ selected, onSelect }) => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
      {EMOJI_OPTIONS.map(e => (
        <button key={e} type="button" onClick={() => onSelect(e)}
          style={{ fontSize: '20px', padding: '5px', background: selected === e ? 'var(--primary-light)' : 'none', border: selected === e ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: '8px', cursor: 'pointer' }}>
          {e}
        </button>
      ))}
    </div>
  )

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px' }}>👶 ניהול ילדים</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* רשימת ילדים */}
          {childList.length === 0 && !addingNew && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', fontSize: '14px' }}>עדיין לא הוספת ילדים</p>
          )}

          {childList.map(child => (
            <div key={child.id}>
              {editingId === child.id ? (
                <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>בחר אייקון:</p>
                  <EmojiPicker selected={editEmoji} onSelect={setEditEmoji} />
                  <input
                    className="input" value={editName} autoFocus
                    onChange={e => setEditName(e.target.value)}
                    placeholder="שם הילד"
                    style={{ marginBottom: '10px' }}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={saveEdit} disabled={saving}>
                      {saving ? '...' : '✓ שמור'}
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditingId(null)}>ביטול</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '26px' }}>{child.emoji}</span>
                  <span style={{ flex: 1, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{child.name}</span>
                  <button onClick={() => startEdit(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', opacity: 0.5, padding: '6px' }}>✏️</button>
                  <button onClick={() => handleDelete(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', opacity: 0.4, padding: '6px' }}>🗑️</button>
                </div>
              )}
            </div>
          ))}

          {/* הוספת ילד חדש */}
          {addingNew ? (
            <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginTop: '12px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>בחר אייקון:</p>
              <EmojiPicker selected={newEmoji} onSelect={setNewEmoji} />
              <input
                className="input" value={newName} autoFocus
                onChange={e => setNewName(e.target.value)}
                placeholder="שם הילד..."
                style={{ marginBottom: '10px' }}
                onKeyDown={e => e.key === 'Enter' && saveNew()}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={saveNew} disabled={saving || !newName.trim()}>
                  {saving ? '...' : '+ הוסף'}
                </button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setAddingNew(false); setNewName('') }}>ביטול</button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: '14px' }}
              onClick={() => { setAddingNew(true); setEditingId(null) }}
            >
              + הוסף ילד
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── מודאל הוספה/עריכה ────────────────────────────────────────────────────
function QuickLogModal({ open, onClose, onSave, lastCc, editingLog, childList, defaultChildId }) {
  const [feedType,   setFeedType]  = useState(null)
  const [ccInput,    setCcInput]   = useState('')
  const [diaperPee,  setDiaperPee] = useState(false)
  const [diaperPoop, setDiaperPoop]= useState(false)
  const [notes,      setNotes]     = useState('')
  const [timeInput,  setTimeInput] = useState(nowTimeInput())
  const [dateInput,  setDateInput] = useState(todayDateInput())
  const [childId,    setChildId]   = useState(null)
  const [saving,     setSaving]    = useState(false)

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
        setChildId(editingLog.child_id || defaultChildId || null)
      } else {
        setFeedType(null)
        setCcInput(lastCc != null ? String(lastCc) : '')
        setDiaperPee(false)
        setDiaperPoop(false)
        setNotes('')
        setTimeInput(nowTimeInput())
        setDateInput(todayDateInput())
        setChildId(defaultChildId || null)
      }
      setSaving(false)
    }
  }, [open, editingLog, lastCc, defaultChildId])

  if (!open) return null

  const currentFeed = FEED_TYPES.find(f => f.key === feedType)
  const showCC      = currentFeed?.hasCC
  const isValid     = feedType || diaperPee || diaperPoop || notes.trim()

  const titleChildName =
    (childId && childList.find(c => c.id === childId)?.name) ||
    (childList.length === 1 ? childList[0].name : '')

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    const loggedAt = new Date(`${dateInput}T${timeInput}`).toISOString()
    await onSave({
      loggedAt, feedType,
      feedAmountCc: showCC && ccInput !== '' ? Number(ccInput) : null,
      diaperPee, diaperPoop, notes, childId,
    })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
        </div>

        {/* כותרת: ✕ משמאל, טקסט במרכז (כמו בתמונה) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px 14px',
            gap: '8px',
            direction: 'ltr',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              fontSize: '18px',
              lineHeight: 1,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          <div
            dir="rtl"
            style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '17px', color: 'var(--text-primary)', lineHeight: 1.35 }}
          >
            {editingLog ? '✏️ עריכת רשומה' : '👶 רשומה חדשה'}
            {titleChildName ? ` – ${titleChildName}` : ''}
          </div>
          <div style={{ width: 36, flexShrink: 0 }} aria-hidden />
        </div>

        {/* בחירת ילד */}
        {childList.length > 0 && (
          <div style={{ padding: '0 16px 14px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>עבור מי:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {childList.map(child => (
                <button key={child.id} type="button" onClick={() => setChildId(child.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-md)',
                    border: childId === child.id ? '2px solid var(--primary)' : '2px solid var(--border)',
                    background: childId === child.id ? 'var(--primary-light)' : 'var(--bg-elevated)',
                    cursor: 'pointer', fontSize: '15px', fontWeight: 600,
                    color: childId === child.id ? 'var(--primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {child.emoji} {child.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* תאריך | שעה — שורה אחת, תיבות מעוגלות (dir=ltr למניעת חפיפה ב-RTL) */}
        <div
          dir="ltr"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: '10px',
            padding: '0 16px 16px',
          }}
        >
          <div
            style={{
              minWidth: 0,
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              padding: '10px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <input
              type="date"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            style={{
              minWidth: 0,
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              padding: '10px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '18px', flexShrink: 0 }} aria-hidden>🕐</span>
            <input
              type="time"
              value={timeInput}
              onChange={e => setTimeInput(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                fontSize: '17px',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* האכלה */}
        <div style={{ padding: '0 16px 12px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            🍼 האכלה
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {FEED_TYPES.map(ft => (
              <button key={ft.key} type="button" onClick={() => setFeedType(feedType === ft.key ? null : ft.key)}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 'var(--radius-md)',
                  border: feedType === ft.key ? '2px solid var(--primary)' : '2px solid var(--border)',
                  background: feedType === ft.key ? 'var(--primary-light)' : 'var(--bg-elevated)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: '24px' }}>{ft.icon}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: feedType === ft.key ? 'var(--primary)' : 'var(--text-secondary)' }}>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* כמות — שורה אחת: כמות מימין, מספר במרכז */}
        {showCC && (
          <div
            style={{
              position: 'relative',
              margin: '0 16px 14px',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              direction: 'rtl',
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              כמות:
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '5px' }}>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                style={{
                  width: '64px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '22px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--primary)',
                  textAlign: 'center',
                  padding: 0,
                }}
              />
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>cc</span>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 16px 14px' }} />

        {/* חיתול */}
        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            🧷 חיתול
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setDiaperPee(p => !p)}
              style={{ flex: 1, padding: '14px 8px', borderRadius: 'var(--radius-md)', border: diaperPee ? '2px solid #f0c040' : '2px solid var(--border)', background: diaperPee ? 'rgba(255,214,0,0.15)' : 'var(--bg-elevated)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '28px' }}>💛</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPee ? '#b8860b' : 'var(--text-secondary)' }}>פיפי</span>
            </button>
            <button type="button" onClick={() => setDiaperPoop(p => !p)}
              style={{ flex: 1, padding: '14px 8px', borderRadius: 'var(--radius-md)', border: diaperPoop ? '2px solid #8B5A2B' : '2px solid var(--border)', background: diaperPoop ? 'rgba(139,90,43,0.15)' : 'var(--bg-elevated)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '28px' }}>💩</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPoop ? '#8B5A2B' : 'var(--text-secondary)' }}>קקי</span>
            </button>
          </div>
        </div>

        {/* הערה */}
        <div style={{ padding: '0 16px 16px' }}>
          <input type="text" placeholder="הערה (אופציונלי)..." value={notes} onChange={e => setNotes(e.target.value)}
            className="input" style={{ fontSize: '14px' }} />
        </div>

        {/* כפתורים */}
        <div className="modal-actions">
          <button type="button" className="btn"
            style={{ flex: 2, background: 'var(--primary)', color: '#fff', opacity: !isValid ? 0.4 : 1 }}
            onClick={handleSave} disabled={saving || !isValid}>
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
  const [logs,            setLogs]           = useState([])
  const [childList,       setChildList]      = useState([])
  const [selectedChildId, setSelectedChildId]= useState(null)
  const [lastLog,         setLastLog]        = useState(null)
  const [lastFeed,        setLastFeed]       = useState(null)
  const [filter,          setFilter]         = useState('today')
  const [showModal,       setShowModal]      = useState(false)
  const [editingLog,      setEditingLog]     = useState(null)
  const [showChildModal,  setShowChildModal] = useState(false)
  const [loading,         setLoading]        = useState(true)
  const [showToast,       ToastEl]           = useToast()
  const [showWeeklyInsight, setShowWeeklyInsight] = useState(false)
  const [weeklyInsightData, setWeeklyInsightData] = useState(null)
  const autoInsightAttemptedRef = useRef(null)

  const load = useCallback(async () => {
    if (!householdId) return
    const { from, to } = getDateRange(filter)
    const [fetchedLogs, last, lastFeedLog, fetchedChildren] = await Promise.all([
      BabyDB.getLogs(householdId, from, to, selectedChildId),
      BabyDB.getLast(householdId, selectedChildId),
      BabyDB.getLastFeed(householdId, selectedChildId),
      ChildrenDB.getAll(householdId),
    ])
    setLogs(fetchedLogs)
    setLastLog(last)
    setLastFeed(lastFeedLog)
    setChildList(fetchedChildren)
    setLoading(false)
  }, [householdId, filter, selectedChildId])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh('baby_logs', load)

  const currentChild = selectedChildId ? childList.find(c => c.id === selectedChildId) : null

  const openWeeklyInsightModal = useCallback(async () => {
    if (!householdId) return
    const { from, to } = getDateRange('week')
    const weekLogs = await BabyDB.getLogs(householdId, from, to, selectedChildId)
    const name = resolveChildNameForInsight(childList, selectedChildId, weekLogs)
    setWeeklyInsightData(buildWeeklyInsight(weekLogs, name))
    setShowWeeklyInsight(true)
  }, [householdId, selectedChildId, childList])

  /** פעם אחת בשבוע — פופ־אפ אוטומטי אם יש נתונים (ניתן לכבות בסגירה) */
  useEffect(() => {
    if (loading || !householdId || childList.length === 0) return
    const wk = getIsoWeekKey()
    const dismissKey = `baby-insight-dismissed-${householdId}-${wk}`
    if (localStorage.getItem(dismissKey)) return
    if (autoInsightAttemptedRef.current === wk) return
    let cancelled = false
    ;(async () => {
      const { from, to } = getDateRange('week')
      const weekLogs = await BabyDB.getLogs(householdId, from, to, selectedChildId)
      if (cancelled) return
      const name = resolveChildNameForInsight(childList, selectedChildId, weekLogs)
      const insight = buildWeeklyInsight(weekLogs, name)
      if (insight.lines.length === 0) return
      const meaningful = weekLogs.some(l => l.feed_type || l.diaper_pee || l.diaper_poop)
      if (!meaningful) return
      autoInsightAttemptedRef.current = wk
      setWeeklyInsightData(insight)
      setShowWeeklyInsight(true)
    })()
    return () => { cancelled = true }
  }, [loading, householdId, childList, selectedChildId, logs.length])

  const closeWeeklyInsight = () => {
    const wk = getIsoWeekKey()
    if (householdId) localStorage.setItem(`baby-insight-dismissed-${householdId}-${wk}`, '1')
    setShowWeeklyInsight(false)
  }

  const handleSave = async ({ loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes, childId }) => {
    try {
      if (editingLog) {
        await BabyDB.update(editingLog.id, { loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes, childId })
        showToast('✓ עודכן!')
      } else {
        await BabyDB.add(householdId, user.id, loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes, childId)
        showToast('✓ נשמר!')
        if (feedType) {
          const child = childList.find(c => c.id === childId)
          const feedLabel = feedType === 'nursing' ? 'הנקה' : feedType === 'breastmilk' ? 'חלב שאוב' : 'מטרנה'
          sendPushNotification({
            householdId, userId: user.id,
            title: `👶 האכלה${child ? ` — ${child.name}` : ''}`,
            body: feedLabel + (feedAmountCc ? ` ${feedAmountCc}cc` : ''),
            url: '/baby', category: 'baby',
          })
        }
      }
      setShowModal(false)
      setEditingLog(null)
      load()
    } catch (e) {
      showToast('❌ שגיאה: ' + e.message)
    }
  }

  const handleEdit   = (log) => { setEditingLog(log); setShowModal(true) }
  const handleDelete = async (log) => {
    if (!confirmDelete('למחוק רשומה זו?')) return
    try { await BabyDB.delete(log.id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  // ── סטטיסטיקות ──────────────────────────────────────────────────────────
  const feedingLogs   = logs.filter(l => l.feed_type)
  const diaperLogs    = logs.filter(l => l.diaper_pee || l.diaper_poop)
  const totalCC       = feedingLogs.filter(l => l.feed_amount_cc != null).reduce((s, l) => s + l.feed_amount_cc, 0)
  const lastFeedTime  = lastFeed ? formatTime(lastFeed.logged_at) : '—'
  const lastFeedSince = lastFeed ? timeSince(lastFeed.logged_at) : null
  const lastCc        = lastLog?.feed_amount_cc ?? null
  const showDateInRow = filter === 'week' || filter === 'month'

  // ילד ברירת מחדל לרשומה חדשה
  const defaultChildId = selectedChildId || (childList.length === 1 ? childList[0].id : null)

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="page-header-accent" style={{ background: 'var(--primary)' }} />
            <div>
              <h1 className="page-title">{currentChild ? `${currentChild.emoji} ${currentChild.name}` : '👶 יומן ילדים'}</h1>
              <p className="page-subtitle">מעקב האכלות וחיתולים</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              onClick={openWeeklyInsightModal}
            >
              ✨ סיכום השבוע
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}
              onClick={() => { setEditingLog(null); setShowModal(true) }}>
              + הוסף
            </button>
          </div>
        </div>
      </div>

      <div className="page" style={{ paddingTop: '16px' }}>

        {/* Child selector tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
            <button onClick={() => setSelectedChildId(null)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: !selectedChildId ? 'var(--primary)' : 'transparent', color: !selectedChildId ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>הכל</button>
            {childList.map(child => (
              <button key={child.id} onClick={() => setSelectedChildId(child.id)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: selectedChildId === child.id ? 'var(--primary)' : 'transparent', color: selectedChildId === child.id ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{child.emoji} {child.name}</button>
            ))}
          </div>
          <button onClick={() => setShowChildModal(true)} style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--font-body)' }}>⚙️ ילדים</button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <StatCard icon="⏱️" label="האכלה אחרונה" value={lastFeedTime} sub={lastFeedSince} color="var(--primary)" />
          <StatCard icon="🍼" label="האכלות" value={feedingLogs.length}
            sub={totalCC > 0 ? `סה"כ ${totalCC} cc` : null} color="var(--teal)" />
          <StatCard icon="🧷" label="חיתולים" value={diaperLogs.length}
            sub={`${logs.filter(l => l.diaper_poop).length} קקי`} color="var(--amber)" />
        </div>

        {/* Time filter */}
        <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: filter === f.key ? 'var(--primary)' : 'transparent', color: filter === f.key ? '#fff' : 'var(--text-secondary)' }}>{f.label}</button>
          ))}
        </div>

        {/* Logs */}
        {loading ? (
          <PageSpinner />
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>👶</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {childList.length === 0 ? 'הוסף ילד תחילה' : 'אין רשומות בתקופה זו'}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {childList.length === 0 ? 'לחץ ⚙️ ילדים כדי להוסיף' : 'לחץ + הוסף כדי לתעד האכלה או חיתול'}
            </p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {logs.map(log => {
              const logChild = !selectedChildId ? childList.find(c => c.id === log.child_id) : null
              return (
                <LogRow key={log.id} log={log}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  showDate={showDateInRow}
                  childLabel={logChild ? `${logChild.emoji} ${logChild.name}` : null}
                />
              )
            })}
          </div>
        )}
      </div>

      {ToastEl}

      <button className="fab" style={{ background: 'var(--primary)' }}
        onClick={() => { setEditingLog(null); setShowModal(true) }}>+</button>

      <QuickLogModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingLog(null) }}
        onSave={handleSave}
        lastCc={lastCc}
        editingLog={editingLog}
        childList={childList}
        defaultChildId={defaultChildId}
      />

      <ManageChildrenModal
        open={showChildModal}
        onClose={() => setShowChildModal(false)}
        childList={childList}
        householdId={householdId}
        onUpdate={load}
      />

      <WeeklyInsightModal
        open={showWeeklyInsight}
        onClose={closeWeeklyInsight}
        insight={weeklyInsightData}
        childName={currentChild ? `${currentChild.emoji} ${currentChild.name}` : (childList.length > 1 ? 'כל הילדים' : childList[0] ? `${childList[0].emoji} ${childList[0].name}` : null)}
      />
    </div>
  )
}
