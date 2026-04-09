import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { BabyDB, ChildrenDB, MilestonesDB, VaccinationsDB, ActivitiesDB, HomeworkDB, SleepDB } from '../lib/db'
import ChildActivities    from './ChildActivities'
import ChildHomework      from './ChildHomework'
import ChildTeenPersonal  from './ChildTeenPersonal'
import { buildWeeklyInsight, getIsoWeekKey, resolveChildNameForInsight } from '../lib/babyInsights'
import { sendPushNotification } from '../lib/notifications'
import { useRealtimeRefresh } from '../lib/realtime'
import { useToast, confirmDelete, PageSpinner } from '../components/UI'
import { getAgeRange, getAgeDisplay, FEATURE_META, getFeaturesForChild } from '../lib/ageRanges'

// ── constants ─────────────────────────────────────────────────────────────
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

function getSectionTabs(rangeKey) {
  const tabs = [{ key: 'daily', label: 'יומי', icon: '📅' }]
  // teenager replaces chugim with hobbies/personal — no schedule tab
  if (['kindergarten', 'school', 'preteen'].includes(rangeKey)) {
    tabs.push({ key: 'schedule', label: 'חוגים', icon: '⚽' })
  }
  if (['school', 'preteen', 'teenager'].includes(rangeKey)) {
    tabs.push({ key: 'school', label: 'לימודים', icon: '📚' })
  }
  if (rangeKey === 'preteen') {
    tabs.push({ key: 'teen', label: 'כסף', icon: '💰' })
  }
  if (rangeKey === 'teenager') {
    tabs.push({ key: 'teen', label: 'אישי', icon: '🧑' })
  }
  tabs.push({ key: 'health', label: 'על הילד', icon: '👤' })
  return tabs
}

// ── helpers ───────────────────────────────────────────────────────────────
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

function formatDateShort(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

function nowTimeInput() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function todayDateInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── StatCard ──────────────────────────────────────────────────────────────
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

// ── WeeklyInsightModal ────────────────────────────────────────────────────
function WeeklyInsightModal({ open, onClose, insight, childName }) {
  if (!open || !insight) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div role="presentation" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby="weekly-insight-title" style={{ position: 'relative', width: '100%', maxWidth: 400, maxHeight: '85vh', overflow: 'auto', background: 'linear-gradient(145deg, var(--bg-card) 0%, var(--bg-elevated) 100%)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', padding: '24px 20px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '40px', lineHeight: 1, marginBottom: '8px' }}>✨</div>
          <h2 id="weekly-insight-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: 'var(--text-primary)', margin: 0 }}>סיכום השבוע</h2>
          {childName && <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--primary)', fontWeight: 600 }}>{childName}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {insight.lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '22px', flexShrink: 0 }}>{line.icon}</span>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 500 }}>{line.text}</p>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-full" style={{ marginTop: '20px' }} onClick={onClose}>סגור</button>
      </div>
    </div>
  )
}

// ── LogRow ─────────────────────────────────────────────────────────────────
function LogRow({ log, onDelete, onEdit, showDate, childLabel }) {
  const feedInfo = FEED_TYPES.find(f => f.key === log.feed_type)
  const hasFeed  = !!log.feed_type
  const hasDiap  = log.diaper_pee || log.diaper_poop
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ textAlign: 'center', minWidth: '44px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{formatTime(log.logged_at)}</div>
        {showDate && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatDate(log.logged_at)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {childLabel && <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginBottom: '3px' }}>{childLabel}</div>}
        {hasFeed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px' }}>{feedInfo?.icon}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{feedInfo?.label}</span>
            {log.feed_amount_cc != null && <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 700, background: 'var(--primary-light)', padding: '1px 8px', borderRadius: '999px' }}>{log.feed_amount_cc} cc</span>}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
        <button onClick={() => onEdit(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.45, padding: '4px' }}>✏️</button>
        <button onClick={() => onDelete(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.35, padding: '4px' }}>🗑️</button>
      </div>
    </div>
  )
}

// ── ManageChildrenModal ───────────────────────────────────────────────────
function ManageChildrenModal({ open, onClose, childList, householdId, onUpdate }) {
  const [editingId,  setEditingId]  = useState(null)
  const [editName,   setEditName]   = useState('')
  const [editEmoji,  setEditEmoji]  = useState('👶')
  const [editDob,    setEditDob]    = useState('')
  const [addingNew,  setAddingNew]  = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newEmoji,   setNewEmoji]   = useState('👶')
  const [newDob,     setNewDob]     = useState('')
  const [saving,     setSaving]     = useState(false)

  const startEdit = (child) => {
    setEditingId(child.id)
    setEditName(child.name)
    setEditEmoji(child.emoji || '👶')
    setEditDob(child.date_of_birth || '')
    setAddingNew(false)
  }

  const saveEdit = async () => {
    if (!editName.trim() || saving) return
    setSaving(true)
    try {
      await ChildrenDB.update(editingId, { name: editName.trim(), emoji: editEmoji, date_of_birth: editDob || null })
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
    // Optimistically close the form and clear fields immediately
    const nameSnapshot = newName.trim()
    const emojiSnapshot = newEmoji
    const dobSnapshot = newDob
    setAddingNew(false)
    setNewName('')
    setNewEmoji('👶')
    setNewDob('')
    // Trigger optimistic render — onUpdate re-fetches but we also fire the DB call
    onUpdate()
    try {
      await ChildrenDB.add(householdId, nameSnapshot, emojiSnapshot, dobSnapshot || null)
      onUpdate()
    } catch (e) {
      console.error('saveNew error:', e)
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
      <div style={{ position: 'relative', width: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '12px 0 0' }}><div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px' }}>👶 ניהול ילדים</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {childList.length === 0 && !addingNew && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', fontSize: '14px' }}>עדיין לא הוספת ילדים</p>
          )}
          {childList.map(child => (
            <div key={child.id}>
              {editingId === child.id ? (
                <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>בחר אייקון:</p>
                  <EmojiPicker selected={editEmoji} onSelect={setEditEmoji} />
                  <input className="input" value={editName} autoFocus onChange={e => setEditName(e.target.value)} placeholder="שם הילד" style={{ marginBottom: '10px' }} onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>תאריך לידה:</label>
                    <input type="date" className="input" value={editDob} onChange={e => setEditDob(e.target.value)} dir="ltr" />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={saveEdit} disabled={saving}>{saving ? '...' : '✓ שמור'}</button>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditingId(null)}>ביטול</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '26px' }}>{child.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>{child.name}</span>
                    {child.date_of_birth && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getAgeDisplay(child.date_of_birth)} · {getAgeRange(child.date_of_birth)?.emoji} {getAgeRange(child.date_of_birth)?.label}</span>
                    )}
                  </div>
                  <button onClick={() => startEdit(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', opacity: 0.5, padding: '6px' }}>✏️</button>
                  <button onClick={() => handleDelete(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', opacity: 0.4, padding: '6px' }}>🗑️</button>
                </div>
              )}
            </div>
          ))}
          {addingNew ? (
            <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginTop: '12px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>בחר אייקון:</p>
              <EmojiPicker selected={newEmoji} onSelect={setNewEmoji} />
              <input className="input" value={newName} autoFocus onChange={e => setNewName(e.target.value)} placeholder="שם הילד..." style={{ marginBottom: '10px' }} onKeyDown={e => e.key === 'Enter' && saveNew()} />
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>תאריך לידה:</label>
                <input type="date" className="input" value={newDob} onChange={e => setNewDob(e.target.value)} dir="ltr" />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={saveNew} disabled={saving || !newName.trim()}>{saving ? '...' : '+ הוסף'}</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setAddingNew(false); setNewName(''); setNewDob('') }}>ביטול</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-full" style={{ marginTop: '14px' }} onClick={() => { setAddingNew(true); setEditingId(null) }}>+ הוסף ילד</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── QuickLogModal (feeding/diaper) ────────────────────────────────────────
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
  const titleChildName = (childId && childList.find(c => c.id === childId)?.name) || (childList.length === 1 ? childList[0].name : '')

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    const loggedAt = new Date(`${dateInput}T${timeInput}`).toISOString()
    await onSave({ loggedAt, feedType, feedAmountCc: showCC && ccInput !== '' ? Number(ccInput) : null, diaperPee, diaperPoop, notes, childId })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}><div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} /></div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 14px', gap: '8px', direction: 'ltr' }}>
          <button type="button" onClick={onClose} aria-label="סגור" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '18px', lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          <div dir="rtl" style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '17px', color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {editingLog ? '✏️ עריכת רשומה' : '👶 רשומה חדשה'}{titleChildName ? ` – ${titleChildName}` : ''}
          </div>
          <div style={{ width: 36, flexShrink: 0 }} aria-hidden />
        </div>

        {childList.length > 0 && (
          <div style={{ padding: '0 16px 14px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>עבור מי:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {childList.map(child => (
                <button key={child.id} type="button" onClick={() => setChildId(child.id)}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: childId === child.id ? '2px solid var(--primary)' : '2px solid var(--border)', background: childId === child.id ? 'var(--primary-light)' : 'var(--bg-elevated)', cursor: 'pointer', fontSize: '15px', fontWeight: 600, color: childId === child.id ? 'var(--primary)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                  {child.emoji} {child.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px', padding: '0 16px 16px' }}>
          <div style={{ minWidth: 0, borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} style={{ width: '100%', maxWidth: '100%', minWidth: 0, border: 'none', background: 'transparent', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ minWidth: 0, borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }} aria-hidden>🕐</span>
            <input type="time" value={timeInput} onChange={e => setTimeInput(e.target.value)} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>🍼 האכלה</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {FEED_TYPES.map(ft => (
              <button key={ft.key} type="button" onClick={() => setFeedType(feedType === ft.key ? null : ft.key)}
                style={{ flex: 1, padding: '12px 8px', borderRadius: 'var(--radius-md)', border: feedType === ft.key ? '2px solid var(--primary)' : '2px solid var(--border)', background: feedType === ft.key ? 'var(--primary-light)' : 'var(--bg-elevated)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
                <span style={{ fontSize: '24px' }}>{ft.icon}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: feedType === ft.key ? 'var(--primary)' : 'var(--text-secondary)' }}>{ft.label}</span>
              </button>
            ))}
          </div>
        </div>

        {showCC && (
          <div style={{ position: 'relative', margin: '0 16px 14px', padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', direction: 'rtl' }}>
            <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>כמות:</span>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '5px' }}>
              <input type="number" inputMode="numeric" placeholder="0" value={ccInput} onChange={e => setCcInput(e.target.value)} style={{ width: '64px', border: 'none', background: 'transparent', fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--primary)', textAlign: 'center', padding: 0 }} />
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>cc</span>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 16px 14px' }} />

        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>🧷 חיתול</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setDiaperPee(p => !p)} style={{ flex: 1, padding: '14px 8px', borderRadius: 'var(--radius-md)', border: diaperPee ? '2px solid #f0c040' : '2px solid var(--border)', background: diaperPee ? 'rgba(255,214,0,0.15)' : 'var(--bg-elevated)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '28px' }}>💛</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPee ? '#b8860b' : 'var(--text-secondary)' }}>פיפי</span>
            </button>
            <button type="button" onClick={() => setDiaperPoop(p => !p)} style={{ flex: 1, padding: '14px 8px', borderRadius: 'var(--radius-md)', border: diaperPoop ? '2px solid #8B5A2B' : '2px solid var(--border)', background: diaperPoop ? 'rgba(139,90,43,0.15)' : 'var(--bg-elevated)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '28px' }}>💩</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: diaperPoop ? '#8B5A2B' : 'var(--text-secondary)' }}>קקי</span>
            </button>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <input type="text" placeholder="הערה (אופציונלי)..." value={notes} onChange={e => setNotes(e.target.value)} className="input" style={{ fontSize: '14px' }} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff', opacity: !isValid ? 0.4 : 1 }} onClick={handleSave} disabled={saving || !isValid}>
            {saving ? '...' : editingLog ? '✓ עדכן' : '✓ שמור'}
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── ChildProfileSection ───────────────────────────────────────────────────
function ChildProfileSection({ child, householdId, onUpdate, showToast }) {
  const [editing, setEditing]         = useState(null)
  const [milestones, setMilestones]   = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Profile form state
  const [newAllergyText, setNewAllergyText] = useState('')
  const [dobInput, setDobInput]             = useState('')

  // Milestone form
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [msDate, setMsDate]   = useState(todayDateInput())
  const [msDesc, setMsDesc]   = useState('')

  // Vaccination form
  const [showAddVax, setShowAddVax] = useState(false)
  const [vaxName, setVaxName]       = useState('')
  const [vaxDate, setVaxDate]       = useState(todayDateInput())
  const [vaxNext, setVaxNext]       = useState('')

  const loadProfileData = useCallback(async () => {
    if (!child) return
    setLoadingProfile(true)
    const [ms, vx] = await Promise.all([
      MilestonesDB.getAll(child.id),
      VaccinationsDB.getAll(child.id),
    ])
    setMilestones(ms)
    setVaccinations(vx)
    setDobInput(child.date_of_birth || '')
    setLoadingProfile(false)
  }, [child])

  useEffect(() => { loadProfileData() }, [loadProfileData])

  if (!child) return null
  if (loadingProfile) return <PageSpinner />

  const allergies = Array.isArray(child.allergies) ? child.allergies : []
  const ageRange = getAgeRange(child.date_of_birth)

  const handleSaveDob = async () => {
    try {
      await ChildrenDB.update(child.id, { date_of_birth: dobInput || null })
      showToast('✓ תאריך לידה עודכן')
      onUpdate()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleAddAllergy = async () => {
    if (!newAllergyText.trim()) return
    const updated = [...allergies, newAllergyText.trim()]
    try {
      await ChildrenDB.update(child.id, { allergies: updated })
      setNewAllergyText('')
      showToast('✓ אלרגיה נוספה')
      onUpdate()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleRemoveAllergy = async (idx) => {
    const updated = allergies.filter((_, i) => i !== idx)
    try {
      await ChildrenDB.update(child.id, { allergies: updated })
      showToast('✓ אלרגיה הוסרה')
      onUpdate()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleAddMilestone = async () => {
    if (!msDesc.trim()) return
    try {
      await MilestonesDB.add(child.id, householdId, msDate, msDesc.trim())
      setShowAddMilestone(false)
      setMsDesc('')
      setMsDate(todayDateInput())
      showToast('✓ אבן דרך נוספה')
      loadProfileData()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleDeleteMilestone = async (id) => {
    if (!confirmDelete('למחוק אבן דרך זו?')) return
    try {
      await MilestonesDB.delete(id)
      showToast('✓ נמחק')
      loadProfileData()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleAddVax = async () => {
    if (!vaxName.trim()) return
    try {
      await VaccinationsDB.add(child.id, householdId, vaxName.trim(), vaxDate || null, vaxNext || null)
      setShowAddVax(false)
      setVaxName('')
      setVaxDate(todayDateInput())
      setVaxNext('')
      showToast('✓ חיסון נוסף')
      loadProfileData()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleDeleteVax = async (id) => {
    if (!confirmDelete('למחוק חיסון זה?')) return
    try {
      await VaccinationsDB.delete(id)
      showToast('✓ נמחק')
      loadProfileData()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const cardStyle = { background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px', marginBottom: '14px' }
  const sectionTitle = (icon, text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{text}</span>
    </div>
  )

  return (
    <div style={{ paddingTop: '8px' }}>
      {/* Age Range Badge */}
      {ageRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', border: '1px solid var(--primary)', marginBottom: '14px' }}>
          <span style={{ fontSize: '22px' }}>{ageRange.emoji}</span>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>{ageRange.label} — {getAgeDisplay(child.date_of_birth)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {getFeaturesForChild(child).map(f => FEATURE_META[f]?.emoji).filter(Boolean).join(' ')} פיצ׳רים פעילים
            </div>
          </div>
        </div>
      )}

      {/* Date of Birth */}
      <div style={cardStyle}>
        {sectionTitle('🎂', 'תאריך לידה')}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="date" className="input" value={dobInput} onChange={e => setDobInput(e.target.value)} dir="ltr" style={{ flex: 1 }} />
          <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={handleSaveDob}>שמור</button>
        </div>
        {!child.date_of_birth && <p style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '8px' }}>⚠️ הוסף תאריך לידה כדי להפעיל פיצ׳רים מותאמים גיל</p>}
      </div>

      {/* Allergies */}
      <div style={cardStyle}>
        {sectionTitle('⚠️', 'אלרגיות')}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: allergies.length > 0 ? '10px' : '0' }}>
          {allergies.map((a, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', background: 'var(--coral-light)', color: 'var(--coral)', fontSize: '13px', fontWeight: 600 }}>
              {a}
              <button onClick={() => handleRemoveAllergy(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--coral)', padding: '0 2px' }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input className="input" value={newAllergyText} onChange={e => setNewAllergyText(e.target.value)} placeholder="הוסף אלרגיה..." style={{ flex: 1, fontSize: '13px' }} onKeyDown={e => e.key === 'Enter' && handleAddAllergy()} />
          <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={handleAddAllergy} disabled={!newAllergyText.trim()}>+</button>
        </div>
      </div>

      {/* Pediatrician */}
      {/* Milestones */}
      <div style={cardStyle}>
        {sectionTitle('🌟', 'אבני דרך')}
        {milestones.length === 0 && !showAddMilestone && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>עדיין לא נוספו אבני דרך</p>
        )}
        {milestones.map(ms => (
          <div key={ms.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', marginTop: '5px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{ms.description}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDateShort(ms.milestone_date)}</div>
            </div>
            <button onClick={() => handleDeleteMilestone(ms.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4, padding: '4px' }}>🗑️</button>
          </div>
        ))}
        {showAddMilestone ? (
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginTop: '8px' }}>
            <input className="input" value={msDesc} onChange={e => setMsDesc(e.target.value)} placeholder='תיאור (למשל "צעדים ראשונים")' style={{ marginBottom: '8px', fontSize: '13px' }} autoFocus />
            <input type="date" className="input" value={msDate} onChange={e => setMsDate(e.target.value)} dir="ltr" style={{ marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={handleAddMilestone} disabled={!msDesc.trim()}>+ הוסף</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAddMilestone(false)}>ביטול</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={() => setShowAddMilestone(true)}>+ הוסף אבן דרך</button>
        )}
      </div>

      {/* Vaccinations */}
      <div style={cardStyle}>
        {sectionTitle('💉', 'חיסונים')}
        {vaccinations.length === 0 && !showAddVax && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>עדיין לא נרשמו חיסונים</p>
        )}
        {vaccinations.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '18px' }}>💉</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{v.vaccine_name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {v.given_date ? `ניתן: ${formatDateShort(v.given_date)}` : 'טרם ניתן'}
                {v.next_date ? ` · הבא: ${formatDateShort(v.next_date)}` : ''}
              </div>
            </div>
            <button onClick={() => handleDeleteVax(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4, padding: '4px' }}>🗑️</button>
          </div>
        ))}
        {showAddVax ? (
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginTop: '8px' }}>
            <input className="input" value={vaxName} onChange={e => setVaxName(e.target.value)} placeholder="שם החיסון" style={{ marginBottom: '8px', fontSize: '13px' }} autoFocus />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>תאריך מתן:</label>
                <input type="date" className="input" value={vaxDate} onChange={e => setVaxDate(e.target.value)} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>חיסון הבא:</label>
                <input type="date" className="input" value={vaxNext} onChange={e => setVaxNext(e.target.value)} dir="ltr" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={handleAddVax} disabled={!vaxName.trim()}>+ הוסף</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAddVax(false)}>ביטול</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={() => setShowAddVax(true)}>+ הוסף חיסון</button>
        )}
      </div>
    </div>
  )
}

// ── SleepWidget (toddler daily tab) ───────────────────────────────────────
function SleepWidget({ child, householdId, showToast }) {
  const [todaySleep, setTodaySleep] = useState(null)
  const [editing,    setEditing]    = useState(false)
  const [bedtime,    setBedtime]    = useState('')
  const [wakeTime,   setWakeTime]   = useState('')
  const [napMins,    setNapMins]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const today = todayDateInput()

  const load = useCallback(async () => {
    const logs = await SleepDB.getAll(child.id, today, today)
    const t = logs[0] || null
    setTodaySleep(t)
    if (t) {
      setBedtime(t.bedtime ? t.bedtime.slice(0, 5) : '')
      setWakeTime(t.wake_time ? t.wake_time.slice(0, 5) : '')
      setNapMins(t.nap_minutes > 0 ? String(t.nap_minutes) : '')
    } else { setBedtime(''); setWakeTime(''); setNapMins('') }
  }, [child.id, today])

  useEffect(() => { load() }, [load])

  const calcHours = () => {
    if (!bedtime || !wakeTime) return null
    const [bh, bm] = bedtime.split(':').map(Number)
    const [wh, wm] = wakeTime.split(':').map(Number)
    let mins = (wh * 60 + wm) - (bh * 60 + bm)
    if (mins < 0) mins += 24 * 60
    return (mins / 60).toFixed(1)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await SleepDB.upsert(child.id, householdId, {
        sleepDate: today, bedtime: bedtime || null, wakeTime: wakeTime || null,
        napMinutes: parseInt(napMins || '0', 10),
      })
      showToast('✓ שינה עודכנה')
      setEditing(false)
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const hours = calcHours()

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? '12px' : todaySleep ? '10px' : '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🌙</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>שינה — היום</span>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ fontSize: '13px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)', background: 'var(--primary-light)', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
            {todaySleep ? '✏️ עדכן' : '+ הוסף'}
          </button>
        )}
      </div>

      {!editing && todaySleep && (
        <div style={{ display: 'flex', gap: '16px' }}>
          {todaySleep.bedtime && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'var(--primary)' }}>{todaySleep.bedtime.slice(0, 5)}</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>שכיבה</div></div>}
          {todaySleep.wake_time && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'var(--teal)' }}>{todaySleep.wake_time.slice(0, 5)}</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>קימה</div></div>}
          {hours && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'var(--mint)' }}>{hours}ש׳</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>שינה</div></div>}
          {todaySleep.nap_minutes > 0 && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'var(--amber)' }}>{todaySleep.nap_minutes}׳</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>תנומה</div></div>}
        </div>
      )}
      {!editing && !todaySleep && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>לא נרשמה שינה להיום</p>
      )}

      {editing && (
        <>
          <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>שכיבה:</label><input type="time" className="input" value={bedtime} onChange={e => setBedtime(e.target.value)} /></div>
            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>קימה:</label><input type="time" className="input" value={wakeTime} onChange={e => setWakeTime(e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>תנומה (דקות):</label>
            <input type="number" inputMode="numeric" className="input" value={napMins} onChange={e => setNapMins(e.target.value)} placeholder="0" />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={handleSave} disabled={saving}>{saving ? '...' : '✓ שמור'}</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>ביטול</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── AgeTransitionModal ─────────────────────────────────────────────────────
function AgeTransitionModal({ data, onConfirm, onDismiss }) {
  if (!data) return null
  const { child, newRange } = data
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onDismiss} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', padding: '24px 20px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '52px', marginBottom: '12px', lineHeight: 1 }}>{newRange.emoji}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: 'var(--text-primary)', margin: '0 0 8px' }}>
          {child.emoji} {child.name} גדל!
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          {child.name} עבר לטווח גיל חדש —<br />
          <strong style={{ color: 'var(--primary)' }}>{newRange.label}</strong>
        </p>
        {newRange.features?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '18px' }}>
            {newRange.features.map(fKey => {
              const meta = FEATURE_META[fKey]
              if (!meta) return null
              return (
                <div key={fKey} style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--primary-light)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{meta.emoji}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={onConfirm}>כיף! בואו נתחיל</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onDismiss}>אחר כך</button>
        </div>
      </div>
    </div>
  )
}

// ── All Children Summary View ──────────────────────────────────────────────
function AllChildrenView({ childList, loading, logs, onSelectChild, onAddChild }) {
  if (loading) return <PageSpinner />

  if (childList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 16px' }}>
        <div style={{ fontSize: '56px', marginBottom: '14px' }}>👶</div>
        <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>עדיין אין ילדים</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>הוסף את הילד הראשון שלך כדי להתחיל לעקוב</p>
        <button className="btn" style={{ background: 'var(--primary)', color: '#fff', padding: '12px 24px' }} onClick={onAddChild}>⚙️ הוסף ילד</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {childList.map(child => {
        const range = getAgeRange(child.date_of_birth)
        const rangeKey = range?.key || 'infant'
        const isInfantChild = rangeKey === 'infant'

        // Infant: count today's feedings & diapers from logs
        const todayStr = new Date().toISOString().slice(0, 10)
        const childLogs = logs.filter(l => l.child_id === child.id && l.logged_at?.slice(0, 10) === todayStr)
        const feedCount = childLogs.filter(l => l.feed_type).length
        const diaperCount = childLogs.filter(l => l.diaper_pee || l.diaper_poop).length

        const ageDisplay = child.date_of_birth ? getAgeDisplay(child.date_of_birth) : null

        const rangeEmoji = {
          infant: '👶', toddler: '🧒', kindergarten: '🎒', school: '📚', preteen: '🎧', teenager: '🧑'
        }[rangeKey] || '👦'

        const chips = []
        if (isInfantChild) {
          chips.push({ icon: '🍼', text: `${feedCount} האכלות` })
          chips.push({ icon: '🧷', text: `${diaperCount} חיתולים` })
        } else if (rangeKey === 'toddler') {
          chips.push({ icon: '😴', text: 'מעקב שינה' })
          chips.push({ icon: '🍱', text: 'תזכורת אוכל' })
        } else if (['kindergarten', 'school', 'preteen'].includes(rangeKey)) {
          chips.push({ icon: '⚽', text: 'חוגים' })
          chips.push({ icon: '📚', text: 'שיעורי בית' })
        } else if (rangeKey === 'teenager') {
          chips.push({ icon: '💼', text: 'משמרות' })
          chips.push({ icon: '💰', text: 'דמי כיס' })
          chips.push({ icon: '🎯', text: 'תחביבים' })
        }

        return (
          <button
            key={child.id}
            onClick={() => onSelectChild(child)}
            style={{ width: '100%', textAlign: 'right', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', fontFamily: 'var(--font-body)' }}
          >
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-elevated)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
              {child.emoji || rangeEmoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{child.name}</span>
                {ageDisplay && <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '2px 7px' }}>{ageDisplay}</span>}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: chips.length ? '8px' : 0 }}>
                {rangeEmoji} {range?.label || 'תינוק'}
              </div>
              {chips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {chips.map((c, i) => (
                    <span key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px 8px' }}>
                      {c.icon} {c.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', flexShrink: 0 }}>←</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
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
  const [sectionTab,         setSectionTab]         = useState('daily')
  const [visitedTabs,        setVisitedTabs]        = useState(() => new Set(['daily']))
  const [ageTransitionModal, setAgeTransitionModal] = useState(null)
  const [todaySchedule,      setTodaySchedule]      = useState([])
  const [pendingHwCount,     setPendingHwCount]     = useState(0)

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
  const currentAgeRange = currentChild ? getAgeRange(currentChild.date_of_birth) : null
  const isInfant = !currentAgeRange || currentAgeRange.key === 'infant'

  const openWeeklyInsightModal = useCallback(async () => {
    if (!householdId) return
    const { from, to } = getDateRange('week')
    const weekLogs = await BabyDB.getLogs(householdId, from, to, selectedChildId)
    const name = resolveChildNameForInsight(childList, selectedChildId, weekLogs)
    setWeeklyInsightData(buildWeeklyInsight(weekLogs, name))
    setShowWeeklyInsight(true)
  }, [householdId, selectedChildId, childList])

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

  const switchTab = useCallback((key) => {
    setSectionTab(key)
    setVisitedTabs(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev); next.add(key); return next
    })
  }, [])

  const closeWeeklyInsight = () => {
    const wk = getIsoWeekKey()
    if (householdId) localStorage.setItem(`baby-insight-dismissed-${householdId}-${wk}`, '1')
    setShowWeeklyInsight(false)
  }

  // Age-transition detection — run when childList changes (DOBs)
  const childDobKey = childList.map(c => `${c.id}:${c.date_of_birth || ''}`).join(',')
  useEffect(() => {
    if (loading || childList.length === 0) return
    for (const child of childList) {
      if (!child.date_of_birth) continue
      const range = getAgeRange(child.date_of_birth)
      if (!range) continue
      const storeKey = `child-range-${child.id}`
      const saved = localStorage.getItem(storeKey)
      if (!saved) {
        localStorage.setItem(storeKey, range.key)
      } else if (saved !== range.key) {
        setAgeTransitionModal({ child, newRange: range })
        break
      }
    }
  }, [loading, childDobKey])

  // Load today's schedule + pending homework count for non-infant daily view
  useEffect(() => {
    if (!selectedChildId || !currentAgeRange) { setTodaySchedule([]); setPendingHwCount(0); return }
    if (isInfant) return
    const rangeKey = currentAgeRange.key
    ;(async () => {
      if (['kindergarten', 'school', 'preteen'].includes(rangeKey)) {
        const acts = await ActivitiesDB.getAll(selectedChildId)
        const todayDow = new Date().getDay()
        const getActivityDaysLocal = (a) => {
          const m = a.days_of_week
          return Array.isArray(m) && m.length > 0 ? m : [a.day_of_week]
        }
        setTodaySchedule(acts.filter(a => getActivityDaysLocal(a).includes(todayDow)).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')))
      } else {
        setTodaySchedule([])
      }
      if (['school', 'preteen', 'teenager'].includes(rangeKey)) {
        const hw = await HomeworkDB.getAll(selectedChildId)
        setPendingHwCount(hw.filter(h => h.status !== 'done').length)
      } else {
        setPendingHwCount(0)
      }
    })()
  }, [selectedChildId, currentAgeRange?.key, isInfant])

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

  const feedingLogs   = logs.filter(l => l.feed_type)
  const diaperLogs    = logs.filter(l => l.diaper_pee || l.diaper_poop)
  const totalCC       = feedingLogs.filter(l => l.feed_amount_cc != null).reduce((s, l) => s + l.feed_amount_cc, 0)
  const lastFeedTime  = lastFeed ? formatTime(lastFeed.logged_at) : '—'
  const lastFeedSince = lastFeed ? timeSince(lastFeed.logged_at) : null
  const lastCc        = lastLog?.feed_amount_cc ?? null
  const showDateInRow = filter === 'week' || filter === 'month'
  const defaultChildId = selectedChildId || (childList.length === 1 ? childList[0].id : null)

  const showInfantTracker = sectionTab === 'daily' && selectedChildId && isInfant
  const showAllChildrenView = !selectedChildId

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="page-header-accent" style={{ background: 'var(--primary)' }} />
            <div>
              <h1 className="page-title">{currentChild ? `${currentChild.emoji} ${currentChild.name}` : '👶 יומן ילדים'}</h1>
              <p className="page-subtitle">
                {currentAgeRange && currentChild?.date_of_birth
                  ? `${currentAgeRange.emoji} ${currentAgeRange.label} — ${getAgeDisplay(currentChild.date_of_birth)}`
                  : 'מעקב האכלות וחיתולים'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {showInfantTracker && (
              <>
                <button type="button" className="btn btn-sm btn-ghost" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }} onClick={openWeeklyInsightModal}>
                  ✨ סיכום
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={() => { setEditingLog(null); setShowModal(true) }}>
                  + הוסף
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page" style={{ paddingTop: '16px' }}>

        {/* Child selector tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
            <button onClick={() => { setSelectedChildId(null); setSectionTab('daily'); setVisitedTabs(new Set(['daily'])) }} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: !selectedChildId ? 'var(--primary)' : 'transparent', color: !selectedChildId ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>הכל</button>
            {childList.map(child => (
              <button key={child.id} onClick={() => {
                const range = getAgeRange(child.date_of_birth)
                const available = getSectionTabs(range?.key).map(t => t.key)
                const nextTab = available.includes(sectionTab) ? sectionTab : 'daily'
                setSectionTab(nextTab)
                setVisitedTabs(new Set([nextTab]))
                setSelectedChildId(child.id)
              }} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: selectedChildId === child.id ? 'var(--primary)' : 'transparent', color: selectedChildId === child.id ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{child.emoji} {child.name}</button>
            ))}
          </div>
          <button onClick={() => setShowChildModal(true)} style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--font-body)' }}>⚙️ ילדים</button>
        </div>

        {/* Section tabs (only when a specific child is selected) */}
        {selectedChildId && (() => {
          const tabs = getSectionTabs(currentAgeRange?.key)
          return (
            <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px' }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => switchTab(t.key)} style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: sectionTab === t.key ? 'var(--primary)' : 'transparent', color: sectionTab === t.key ? '#fff' : 'var(--text-secondary)' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )
        })()}

        {/* ── ALL CHILDREN VIEW (הכל tab) ─────────────────────────────── */}
        {showAllChildrenView && (
          <AllChildrenView
            childList={childList}
            loading={loading}
            logs={logs}
            onSelectChild={(child) => {
              const range = getAgeRange(child.date_of_birth)
              const available = getSectionTabs(range?.key).map(t => t.key)
              const nextTab = available.includes(sectionTab) ? sectionTab : 'daily'
              setSectionTab(nextTab)
              setVisitedTabs(new Set([nextTab]))
              setSelectedChildId(child.id)
            }}
            onAddChild={() => setShowChildModal(true)}
          />
        )}

        {/* ── DAILY TAB (specific child selected) ─────────────────────── */}
        {selectedChildId && sectionTab === 'daily' && (
          <>
            {/* Non-infant child daily view */}
            {!isInfant && (
              <div>
                {/* Toddler: sleep tracking widget */}
                {currentAgeRange?.key === 'toddler' && currentChild && (
                  <SleepWidget child={currentChild} householdId={householdId} showToast={showToast} />
                )}

                {/* Kindergarten+: today's activities summary (not for teenager who uses hobbies) */}
                {['kindergarten', 'school', 'preteen'].includes(currentAgeRange?.key) && (
                  <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>📅 היום</div>
                    {todaySchedule.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>אין חוגים היום</p>
                    ) : todaySchedule.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color || 'var(--primary)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>{a.name}</span>
                          {a.start_time && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '6px' }}> · {String(a.start_time).slice(0, 5)}</span>}
                          {a.location && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}> · {a.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* School+: pending homework badge */}
                {['school', 'preteen', 'teenager'].includes(currentAgeRange?.key) && pendingHwCount > 0 && (
                  <div style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                    onClick={() => setSectionTab('school')}>
                    <span style={{ fontSize: '20px' }}>📚</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>{pendingHwCount} שיעורי בית / מבחנים ממתינים</div>
                      <div style={{ fontSize: '11px', color: 'var(--primary)', opacity: 0.8 }}>לחץ לצפייה בטאב לימודים ←</div>
                    </div>
                  </div>
                )}

                {/* Food reminder info */}
                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🍱</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>תזכורת אוכל</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>אל תשכח לארוז אוכל לגן / לבית ספר</div>
                  </div>
                </div>
              </div>
            )}

            {/* Infant tracker */}
            {showInfantTracker && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                  <StatCard icon="⏱️" label="האכלה אחרונה" value={lastFeedTime} sub={lastFeedSince} color="var(--primary)" />
                  <StatCard icon="🍼" label="האכלות" value={feedingLogs.length} sub={totalCC > 0 ? `סה"כ ${totalCC} cc` : null} color="var(--teal)" />
                  <StatCard icon="🧷" label="חיתולים" value={diaperLogs.length} sub={`${logs.filter(l => l.diaper_poop).length} קקי`} color="var(--amber)" />
                </div>

                <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px' }}>
                  {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: filter === f.key ? 'var(--primary)' : 'transparent', color: filter === f.key ? '#fff' : 'var(--text-secondary)' }}>{f.label}</button>
                  ))}
                </div>

                {loading ? (
                  <PageSpinner />
                ) : logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                    <div style={{ fontSize: '52px', marginBottom: '12px' }}>👶</div>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>אין רשומות בתקופה זו</p>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>לחץ + הוסף כדי לתעד האכלה או חיתול</p>
                  </div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    {logs.map(log => (
                      <LogRow key={log.id} log={log} onDelete={handleDelete} onEdit={handleEdit} showDate={showDateInRow} childLabel={null} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── SCHEDULE TAB — keep-mounted after first visit ─────────────── */}
        {visitedTabs.has('schedule') && selectedChildId && currentChild && (
          <div style={{ display: sectionTab === 'schedule' ? 'block' : 'none' }}>
            <ChildActivities child={currentChild} householdId={householdId} showToast={showToast} />
          </div>
        )}

        {/* ── SCHOOL TAB — keep-mounted after first visit ───────────────── */}
        {visitedTabs.has('school') && selectedChildId && currentChild && (
          <div style={{ display: sectionTab === 'school' ? 'block' : 'none' }}>
            <ChildHomework child={currentChild} householdId={householdId} showToast={showToast} />
          </div>
        )}

        {/* ── TEEN TAB — hobbies, work, money, army, driving ───────────── */}
        {visitedTabs.has('teen') && selectedChildId && currentChild && (
          <div style={{ display: sectionTab === 'teen' ? 'block' : 'none' }}>
            <ChildTeenPersonal child={currentChild} householdId={householdId} showToast={showToast} rangeKey={currentAgeRange?.key} />
          </div>
        )}

        {/* ── PROFILE & HEALTH TAB — keep-mounted after first visit ─────── */}
        {visitedTabs.has('health') && selectedChildId && currentChild && (
          <div style={{ display: sectionTab === 'health' ? 'block' : 'none' }}>
            <ChildProfileSection child={currentChild} householdId={householdId} onUpdate={load} showToast={showToast} />
          </div>
        )}

      </div>

      {ToastEl}

      {showInfantTracker && (
        <button className="fab" style={{ background: 'var(--primary)' }} onClick={() => { setEditingLog(null); setShowModal(true) }}>+</button>
      )}

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

      <AgeTransitionModal
        data={ageTransitionModal}
        onConfirm={() => {
          if (ageTransitionModal) {
            localStorage.setItem(`child-range-${ageTransitionModal.child.id}`, ageTransitionModal.newRange.key)
            if (ageTransitionModal.child.id === selectedChildId) setSectionTab('daily')
          }
          setAgeTransitionModal(null)
        }}
        onDismiss={() => {
          if (ageTransitionModal) localStorage.setItem(`child-range-${ageTransitionModal.child.id}`, ageTransitionModal.newRange.key)
          setAgeTransitionModal(null)
        }}
      />
    </div>
  )
}
