import { useState, useEffect, useCallback } from 'react'
import { ActivitiesDB } from '../lib/db'
import { confirmDelete, PageSpinner } from '../components/UI'

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const ACTIVITY_COLORS = [
  '#6C63FF', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
]

function todayDateInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(dateStr, n) {
  const d = parseDateLocal(dateStr)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(t) {
  if (!t) return ''
  return String(t).slice(0, 5)
}

function getActivitiesForDate(activities, cancelledSet, oneOffsByDate, dateStr) {
  const dow = parseDateLocal(dateStr).getDay()
  const regular = activities
    .filter(a => a.day_of_week === dow && !cancelledSet.has(`${a.id}_${dateStr}`))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  const oneOffs = (oneOffsByDate[dateStr] || []).map(e => ({
    id: `exc_${e.id}`, name: e.title || 'אירוע מיוחד',
    start_time: e.start_time, end_time: null,
    location: e.location || '', notes: e.notes || '',
    color: '#10B981', isOneOff: true, exceptionId: e.id,
  }))
  return [...regular, ...oneOffs].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
}

// ── ActivityChip ───────────────────────────────────────────────────────────
function ActivityChip({ activity, onCancel, dateStr }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      borderRight: `3px solid ${activity.color || 'var(--primary)'}`,
      marginBottom: '6px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{activity.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
          {activity.start_time ? fmtTime(activity.start_time) : ''}
          {activity.end_time ? `–${fmtTime(activity.end_time)}` : ''}
          {activity.location ? ` · 📍 ${activity.location}` : ''}
        </div>
        {activity.notes ? <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>📝 {activity.notes}</div> : null}
      </div>
      {onCancel && !activity.isOneOff && (
        <button onClick={() => onCancel(activity, dateStr)}
          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
          ביטול להיום
        </button>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ChildActivities({ child, householdId, showToast }) {
  const [activities, setActivities]   = useState([])
  const [exceptions, setExceptions]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [editing, setEditing]         = useState(null)
  const [saving, setSaving]           = useState(false)

  const todayStr    = todayDateInput()
  const tomorrowStr = addDays(todayStr, 1)

  const fromDate = addDays(todayStr, -7)
  const toDate   = addDays(todayStr, 30)

  const [form, setForm] = useState({
    name: '', dayOfWeek: new Date().getDay(), startTime: '16:00', endTime: '',
    location: '', notes: '', reminderMinutes: 30, color: '#6C63FF',
  })

  const load = useCallback(async () => {
    if (!child) return
    setLoading(true)
    const [acts, excs] = await Promise.all([
      ActivitiesDB.getAll(child.id),
      ActivitiesDB.getExceptions(child.id, fromDate, toDate),
    ])
    setActivities(acts)
    setExceptions(excs)
    setLoading(false)
  }, [child?.id])

  useEffect(() => { load() }, [load])

  const cancelledSet = new Set(
    exceptions.filter(e => e.type === 'cancelled').map(e => `${e.activity_id}_${e.exception_date}`)
  )
  const oneOffsByDate = {}
  exceptions.filter(e => e.type === 'one_time').forEach(e => {
    if (!oneOffsByDate[e.exception_date]) oneOffsByDate[e.exception_date] = []
    oneOffsByDate[e.exception_date].push(e)
  })

  const todayActs    = getActivitiesForDate(activities, cancelledSet, oneOffsByDate, todayStr)
  const tomorrowActs = getActivitiesForDate(activities, cancelledSet, oneOffsByDate, tomorrowStr)

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', dayOfWeek: new Date().getDay(), startTime: '16:00', endTime: '', location: '', notes: '', reminderMinutes: 30, color: '#6C63FF' })
    setShowAdd(true)
  }

  const openEdit = (activity) => {
    setEditing(activity)
    setForm({
      name: activity.name, dayOfWeek: activity.day_of_week,
      startTime: fmtTime(activity.start_time) || '16:00',
      endTime: fmtTime(activity.end_time) || '',
      location: activity.location || '', notes: activity.notes || '',
      reminderMinutes: activity.reminder_minutes ?? 30, color: activity.color || '#6C63FF',
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await ActivitiesDB.update(editing.id, {
          name: form.name.trim(), day_of_week: form.dayOfWeek, start_time: form.startTime,
          end_time: form.endTime || null, location: form.location, notes: form.notes,
          reminder_minutes: form.reminderMinutes, color: form.color,
        })
        showToast('✓ עודכן')
      } else {
        await ActivitiesDB.add(child.id, householdId, { ...form, name: form.name.trim() })
        showToast('✓ חוג נוסף')
      }
      setShowAdd(false)
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (activity) => {
    if (!confirmDelete(`למחוק את "${activity.name}"?`)) return
    try { await ActivitiesDB.delete(activity.id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const handleMarkCancelled = async (activity, dateStr) => {
    try {
      await ActivitiesDB.addException(child.id, householdId, {
        activityId: activity.id, exceptionDate: dateStr, type: 'cancelled',
      })
      showToast('✓ סומן כבוטל להיום')
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  if (loading) return <PageSpinner />

  // Group weekly schedule by day (only days that have activities)
  const byDay = Array.from({ length: 7 }, (_, i) => ({
    dow: i, label: DAYS_HE[i],
    activities: activities.filter(a => a.day_of_week === i).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
  })).filter(d => d.activities.length > 0)

  const cardStyle = { background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '12px' }

  return (
    <div style={{ paddingTop: '8px' }}>

      {/* Today & Tomorrow at-a-glance */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {[
          { label: 'היום',  dateStr: todayStr,    acts: todayActs,    showCancel: true },
          { label: 'מחר',   dateStr: tomorrowStr, acts: tomorrowActs, showCancel: false },
        ].map(({ label, dateStr, acts, showCancel }) => (
          <div key={label} style={{ flex: 1, ...cardStyle, marginBottom: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{label}</div>
            {acts.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>אין חוגים</div>
              : acts.map(a => (
                <ActivityChip key={a.id} activity={a} dateStr={dateStr} onCancel={showCancel ? handleMarkCancelled : null} />
              ))
            }
          </div>
        ))}
      </div>

      {/* Weekly schedule */}
      {byDay.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', ...cardStyle }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>⚽</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>אין חוגים קבועים עדיין</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>לחץ על + הוסף חוג כדי להתחיל</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>לוח שבועי קבוע</p>
          {byDay.map(({ dow, label, activities: dayActs }) => (
            <div key={dow} style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>{label}</div>
              {dayActs.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ flex: 1 }}><ActivityChip activity={a} /></div>
                  <button onClick={() => openEdit(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.45, padding: '4px', flexShrink: 0 }}>✏️</button>
                  <button onClick={() => handleDelete(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.3, padding: '4px', flexShrink: 0 }}>🗑️</button>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <button className="btn btn-primary btn-full" onClick={openAdd} style={{ background: 'var(--primary)', color: '#fff', marginTop: '4px' }}>
        + הוסף חוג
      </button>

      {/* Add / Edit Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAdd(false)} />
          <div style={{
            position: 'relative', width: '100%', background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 14px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px', margin: 0 }}>
                {editing ? '✏️ עריכת חוג' : '⚽ חוג חדש'}
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '0 16px 16px' }}>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="שם החוג (כדורגל, ציור...)" style={{ marginBottom: '12px' }} autoFocus />

              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>יום בשבוע:</p>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {DAYS_HE.map((d, i) => (
                  <button key={i} onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                    style={{
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                      border: form.dayOfWeek === i ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: form.dayOfWeek === i ? 'var(--primary-light)' : 'var(--bg-elevated)',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      color: form.dayOfWeek === i ? 'var(--primary)' : 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)',
                    }}>
                    {d}
                  </button>
                ))}
              </div>

              <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>שעת התחלה:</label>
                  <input type="time" className="input" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>שעת סיום:</label>
                  <input type="time" className="input" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="מיקום (אופציונלי)" style={{ marginBottom: '8px' }} />
              <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="הערות (למשל: להביא נעלי כדורגל)" style={{ marginBottom: '12px' }} />

              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>צבע:</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {ACTIVITY_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: form.color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer', flexShrink: 0,
                    }} />
                ))}
              </div>

              <div className="modal-actions">
                <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff', opacity: !form.name.trim() ? 0.4 : 1 }}
                  onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? '...' : editing ? '✓ עדכן' : '+ הוסף'}
                </button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
