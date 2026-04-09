import { useState, useEffect, useCallback } from 'react'
import { HomeworkDB } from '../lib/db'
import { confirmDelete, PageSpinner } from '../components/UI'

const STATUS_META = {
  pending:     { label: 'ממתין',   color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  in_progress: { label: 'בתהליך', color: 'var(--sky)',        bg: 'var(--sky-light)'   },
  done:        { label: 'הושלם',  color: 'var(--mint)',       bg: 'var(--mint-light)'  },
}

const PREP_META = {
  not_started: { label: 'לא התחלתי', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  studying:    { label: 'לומד',      color: 'var(--amber)',      bg: 'var(--amber-light)' },
  ready:       { label: 'מוכן',      color: 'var(--mint)',       bg: 'var(--mint-light)'  },
}

function todayDateInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateLocal(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDay(dateStr) {
  const d = parseDateLocal(dateStr)
  const today   = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (+d === +today)    return 'היום'
  if (+d === +tomorrow) return 'מחר'
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

function isOverdue(dateStr, status) {
  if (status === 'done') return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return parseDateLocal(dateStr) < today
}

const EMPTY_FORM = { type: 'homework', subject: '', description: '', dueDate: '', status: 'pending', prepStatus: 'not_started', grade: '' }

export default function ChildHomework({ child, householdId, showToast }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showDone, setShowDone]   = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    if (!child) return
    setLoading(true)
    const data = await HomeworkDB.getAll(child.id)
    setItems(data)
    setLoading(false)
  }, [child?.id])

  useEffect(() => { load() }, [load])

  const openAdd = (defaultType = 'homework') => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, type: defaultType, dueDate: todayDateInput() })
    setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      type: item.type, subject: item.subject, description: item.description || '',
      dueDate: item.due_date, status: item.status,
      prepStatus: item.prep_status || 'not_started', grade: item.grade || '',
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.subject.trim() || !form.dueDate) return
    setSaving(true)
    try {
      if (editing) {
        await HomeworkDB.update(editing.id, {
          type: form.type, subject: form.subject.trim(), description: form.description,
          due_date: form.dueDate, status: form.status,
          prep_status: form.prepStatus, grade: form.grade,
        })
      } else {
        await HomeworkDB.add(child.id, householdId, { ...form, subject: form.subject.trim() })
      }
      setShowAdd(false)
      showToast(editing ? '✓ עודכן' : '✓ נוסף')
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    if (!confirmDelete(`למחוק "${item.subject}"?`)) return
    try { await HomeworkDB.delete(item.id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const cycleStatus = async (item) => {
    const order = ['pending', 'in_progress', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    try { await HomeworkDB.update(item.id, { status: next }); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const cyclePrepStatus = async (item) => {
    const order = ['not_started', 'studying', 'ready']
    const next = order[(order.indexOf(item.prep_status || 'not_started') + 1) % order.length]
    try { await HomeworkDB.update(item.id, { prep_status: next }); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  if (loading) return <PageSpinner />

  const pending = items.filter(i => i.status !== 'done')
  const done    = items.filter(i => i.status === 'done')

  const filteredPending = pending.filter(i => typeFilter === 'all' || i.type === typeFilter)
  const filteredDone    = done.filter(i => typeFilter === 'all' || i.type === typeFilter)

  // Group pending by due_date
  const grouped = {}
  filteredPending.forEach(item => {
    if (!grouped[item.due_date]) grouped[item.due_date] = []
    grouped[item.due_date].push(item)
  })
  const sortedDates = Object.keys(grouped).sort()

  const ItemCard = ({ item }) => {
    const overdue = isOverdue(item.due_date, item.status)
    const s = STATUS_META[item.status] || STATUS_META.pending
    const p = PREP_META[item.prep_status || 'not_started']
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '12px 14px',
        background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
        border: `1px solid ${overdue ? 'var(--coral)' : 'var(--border)'}`,
        marginBottom: '6px',
        opacity: item.status === 'done' ? 0.6 : 1,
      }}>
        <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>
          {item.type === 'exam' ? '📋' : '📝'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
            {item.subject}
          </div>
          {item.description ? <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.description}</div> : null}
          <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
            <button onClick={() => cycleStatus(item)}
              style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: s.bg, color: s.color, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
              {s.label}
            </button>
            {item.type === 'exam' && (
              <button onClick={() => cyclePrepStatus(item)}
                style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: p.bg, color: p.color, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                {p.label}
              </button>
            )}
            {item.grade ? (
              <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '999px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
                ציון: {item.grade}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4, padding: '3px' }}>✏️</button>
          <button onClick={() => handleDelete(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.3, padding: '3px' }}>🗑️</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: '8px' }}>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '14px' }}>
        {[
          { key: 'all',      label: 'הכל' },
          { key: 'homework', label: '📝 שיעורי בית' },
          { key: 'exam',     label: '📋 מבחנים' },
        ].map(t => (
          <button key={t.key} onClick={() => setTypeFilter(t.key)}
            style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', background: typeFilter === t.key ? 'var(--primary)' : 'transparent', color: typeFilter === t.key ? '#fff' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending items grouped by date */}
      {sortedDates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '12px' }}>
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>📚</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {typeFilter === 'exam' ? 'אין מבחנים קרובים' : 'אין שיעורי בית פתוחים'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>לחץ + הוסף כדי להתחיל לעקוב</p>
        </div>
      ) : (
        sortedDates.map(date => (
          <div key={date} style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: isOverdue(date, grouped[date][0]?.status) ? 'var(--coral)' : 'var(--text-muted)' }}>
                {isOverdue(date, grouped[date][0]?.status) ? '⚠️ ' : ''}{formatDay(date)}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {grouped[date].map(item => <ItemCard key={item.id} item={item} />)}
          </div>
        ))
      )}

      {/* Completed (collapsible) */}
      {filteredDone.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <button onClick={() => setShowDone(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 0', fontFamily: 'var(--font-body)' }}>
            {showDone ? '▲' : '▼'} הושלם ({filteredDone.length})
          </button>
          {showDone && <div style={{ marginTop: '8px' }}>{filteredDone.map(item => <ItemCard key={item.id} item={item} />)}</div>}
        </div>
      )}

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn" style={{ flex: 1, background: 'var(--primary)', color: '#fff' }} onClick={() => openAdd('homework')}>+ שיעורי בית</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => openAdd('exam')}>+ מבחן</button>
      </div>

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
                {editing ? '✏️ עריכה' : form.type === 'exam' ? '📋 מבחן חדש' : '📝 שיעורי בית'}
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '0 16px 16px' }}>
              {!editing && (
                <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '12px' }}>
                  {[{ key: 'homework', label: '📝 שיעורי בית' }, { key: 'exam', label: '📋 מבחן' }].map(t => (
                    <button key={t.key} onClick={() => setForm(f => ({ ...f, type: t.key }))}
                      style={{ flex: 1, padding: '9px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-body)', background: form.type === t.key ? 'var(--primary)' : 'transparent', color: form.type === t.key ? '#fff' : 'var(--text-secondary)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              <input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="מקצוע (מתמטיקה, אנגלית...)" style={{ marginBottom: '8px' }} autoFocus />
              <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder={form.type === 'exam' ? 'נושא המבחן (אופציונלי)' : 'פירוט המשימה (אופציונלי)'} style={{ marginBottom: '10px' }} />

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {form.type === 'exam' ? 'תאריך המבחן:' : 'תאריך הגשה:'}
                </label>
                <input type="date" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} dir="ltr" />
              </div>

              {editing && form.type === 'exam' && (
                <input className="input" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                  placeholder="ציון (אחרי הבחינה, אופציונלי)" style={{ marginBottom: '12px' }} />
              )}

              <div className="modal-actions">
                <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff', opacity: (!form.subject.trim() || !form.dueDate) ? 0.4 : 1 }}
                  onClick={handleSave} disabled={saving || !form.subject.trim() || !form.dueDate}>
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
