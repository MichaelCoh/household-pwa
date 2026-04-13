import { useState, useEffect, useCallback } from 'react'
import { HomeworkDB } from '../lib/db'
import { confirmDelete } from '../components/UI'

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_ORDER = ['pending', 'in_progress', 'done']
const STATUS_META = {
  pending:     { label: 'ממתין',   icon: '🔵', color: '#6C63FF', bg: 'rgba(108,99,255,0.1)' },
  in_progress: { label: 'בתהליך', icon: '🟡', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  done:        { label: 'הושלם',  icon: '✅', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
}
const PREP_META = {
  not_started: { label: 'לא התחלתי', color: 'var(--text-muted)',  bg: 'var(--bg-elevated)' },
  studying:    { label: 'לומד',      color: '#F59E0B',             bg: 'rgba(245,158,11,0.12)' },
  ready:       { label: 'מוכן',      color: '#10B981',             bg: 'rgba(16,185,129,0.12)' },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateLocal(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isOverdue(dateStr, status) {
  if (status === 'done') return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return parseDateLocal(dateStr) < today
}

function isPast(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return parseDateLocal(dateStr) <= today
}

function formatDay(dateStr) {
  const d = parseDateLocal(dateStr)
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (+d === +today)    return 'היום'
  if (+d === +tomorrow) return 'מחר'
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

const EMPTY_HW = { subject: '', description: '', dueDate: '', status: 'pending', prepStatus: 'not_started', grade: '' }
const INPUT16  = { fontSize: '16px' }

// ── Grade Popup ────────────────────────────────────────────────────────────
function GradePopup({ exam, onSave, onDismiss }) {
  const [grade, setGrade] = useState(exam.grade || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(exam, grade.trim())
    setSaving(false)
  }

  const handleNoGrade = async () => {
    setSaving(true)
    await onSave(exam, '__NO_GRADE__')
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onDismiss} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', padding: '24px 22px 22px', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px', lineHeight: 1 }}>📋</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {exam.subject}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {formatDay(exam.due_date)}
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px', textAlign: 'center' }}>
            {exam.grade && exam.grade !== '__NO_GRADE__' ? 'ערוך ציון:' : 'הזן ציון:'}
          </label>
          <input type="text" className="input" value={grade}
            onChange={e => setGrade(e.target.value)}
            placeholder="למשל: 95, א׳, מצוין..."
            autoFocus
            style={{ ...INPUT16, textAlign: 'center', fontWeight: 700, fontSize: '20px', padding: '14px', width: '100%', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn" style={{ background: 'var(--primary)', color: '#fff', padding: '12px' }}
            onClick={handleSave} disabled={saving || !grade.trim()}>
            {saving ? '...' : '✓ שמור ציון'}
          </button>
          {!exam.grade && (
            <button className="btn btn-ghost" onClick={handleNoGrade} disabled={saving}>
              אין עדיין ציון
            </button>
          )}
          <button className="btn btn-ghost" onClick={onDismiss}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── ItemRow ────────────────────────────────────────────────────────────────
function ItemRow({ item, onStatusChange, onPrepChange, onEdit, onDelete, onGradeClick }) {
  const overdue = isOverdue(item.due_date, item.status)
  const s = STATUS_META[item.status] || STATUS_META.pending
  const p = PREP_META[item.prep_status || 'not_started']
  const isDone = item.status === 'done'
  const isExam = item.type === 'exam'

  const hasGrade = item.grade && item.grade !== '__NO_GRADE__'
  const noGradeYet = item.grade === '__NO_GRADE__'

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-md)',
      background: isDone ? 'rgba(16,185,129,0.06)' : 'var(--bg-card)',
      border: `1px solid ${overdue ? '#EF4444' : isDone ? '#10B98133' : 'var(--border)'}`,
      marginBottom: '6px',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>
          {isExam ? '📋' : '📝'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {item.subject}
          </div>
          {item.description ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {item.description}
            </div>
          ) : null}
          {/* Grade display for exams */}
          {isExam && isDone && (
            <button onClick={() => onGradeClick(item)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '6px',
                padding: '4px 11px', borderRadius: '999px',
                background: hasGrade ? '#6C63FF22' : 'var(--bg-elevated)',
                border: hasGrade ? '1px solid var(--primary)' : '1px solid var(--border)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: hasGrade ? 'var(--primary)' : 'var(--text-muted)' }}>
                {hasGrade ? `ציון: ${item.grade}` : noGradeYet ? 'אין ציון (לחץ לעדכון)' : 'הוסף ציון'}
              </span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          <button onClick={() => onEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.4, padding: '3px' }}>✏️</button>
          <button onClick={() => onDelete(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', opacity: 0.3, padding: '3px' }}>🗑️</button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', marginTop: '10px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {STATUS_ORDER.map((sKey) => {
          const meta = STATUS_META[sKey]
          const active = item.status === sKey
          return (
            <button key={sKey} onClick={() => !active && onStatusChange(item, sKey)}
              style={{
                flex: 1, padding: '5px 4px', border: 'none', cursor: active ? 'default' : 'pointer',
                fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-body)',
                background: active ? meta.bg : 'var(--bg-elevated)',
                color: active ? meta.color : 'var(--text-muted)',
                transition: 'background 0.12s, color 0.12s',
                borderLeft: '1px solid var(--border)',
              }}>
              {meta.icon} {meta.label}
            </button>
          )
        })}
      </div>

      {/* Exam prep */}
      {isExam && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          {Object.entries(PREP_META).map(([pk, pm]) => {
            const active = (item.prep_status || 'not_started') === pk
            return (
              <button key={pk} onClick={() => onPrepChange(item, pk)}
                style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '999px',
                  cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)',
                  background: active ? pm.bg : 'var(--bg-elevated)',
                  color: active ? pm.color : 'var(--text-muted)',
                  border: active ? `1px solid ${pm.color}` : '1px solid var(--border)',
                }}>
                {pm.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ChildHomework({ child, householdId, showToast }) {
  const [items,         setItems]        = useState([])
  const [loading,       setLoading]      = useState(true)
  const [subTab,        setSubTab]       = useState('homework')
  const [showDone,      setShowDone]     = useState(false)
  const [showAdd,       setShowAdd]      = useState(false)
  const [editing,       setEditing]      = useState(null)
  const [saving,        setSaving]       = useState(false)
  const [form,          setForm]         = useState(EMPTY_HW)
  const [gradePopup,    setGradePopup]   = useState(null)

  const load = useCallback(async () => {
    if (!child) return
    setLoading(true)
    const data = await HomeworkDB.getAll(child.id)
    setItems(data)
    setLoading(false)
  }, [child?.id])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (item, newStatus) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    try {
      await HomeworkDB.update(item.id, { status: newStatus })
      if (newStatus === 'done' && item.type === 'exam' && !item.grade) {
        setTimeout(() => setGradePopup(item), 300)
      }
    } catch (e) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
      showToast('❌ שגיאה: ' + e.message)
    }
  }

  const handlePrepChange = async (item, newPrep) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, prep_status: newPrep } : i))
    try { await HomeworkDB.update(item.id, { prep_status: newPrep }) }
    catch (e) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, prep_status: item.prep_status } : i))
      showToast('❌ שגיאה: ' + e.message)
    }
  }

  const handleSaveGrade = async (exam, gradeValue) => {
    try {
      await HomeworkDB.update(exam.id, { grade: gradeValue })
      showToast(gradeValue === '__NO_GRADE__' ? '✓ סומן ללא ציון' : '✓ ציון נשמר')
      setGradePopup(null)
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_HW, dueDate: todayStr() })
    setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      subject: item.subject, description: item.description || '',
      dueDate: item.due_date, status: item.status,
      prepStatus: item.prep_status || 'not_started', grade: item.grade === '__NO_GRADE__' ? '' : (item.grade || ''),
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.subject.trim() || !form.dueDate) return
    setSaving(true)
    try {
      if (editing) {
        await HomeworkDB.update(editing.id, {
          subject: form.subject.trim(), description: form.description,
          due_date: form.dueDate, status: form.status,
          prep_status: form.prepStatus, grade: form.grade,
        })
      } else {
        await HomeworkDB.add(child.id, householdId, {
          type: subTab, subject: form.subject.trim(), description: form.description,
          dueDate: form.dueDate, status: 'pending',
        })
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

  // ── Filtering ─────────────────────────────────────────────────────────
  const filtered = items.filter(i => i.type === subTab)
  const pending  = filtered.filter(i => i.status !== 'done')
  const done     = filtered.filter(i => i.status === 'done')

  const grouped = {}
  pending.forEach(item => {
    if (!grouped[item.due_date]) grouped[item.due_date] = []
    grouped[item.due_date].push(item)
  })
  const sortedDates = Object.keys(grouped).sort()

  const isExamTab = subTab === 'exam'

  // Grade average for exams
  const gradedExams = items.filter(i => i.type === 'exam' && i.grade && i.grade !== '__NO_GRADE__')
  const numericGrades = gradedExams.map(e => parseFloat(e.grade)).filter(g => !isNaN(g))
  const average = numericGrades.length > 0
    ? (numericGrades.reduce((sum, g) => sum + g, 0) / numericGrades.length).toFixed(1)
    : null

  const gradeAvailable = editing ? isPast(form.dueDate || todayStr()) : isPast(form.dueDate || todayStr())

  if (loading) return (
    <div style={{ paddingTop: '12px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 72, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', marginBottom: '8px', opacity: 0.6 }} />
      ))}
    </div>
  )

  return (
    <div style={{ paddingTop: '8px' }}>

      {/* Grade average for exams */}
      {isExamTab && average && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          padding: '12px 16px', marginBottom: '14px',
          background: 'linear-gradient(135deg, rgba(108,99,255,0.08) 0%, rgba(108,99,255,0.15) 100%)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)',
        }}>
          <span style={{ fontSize: '20px' }}>📊</span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', color: 'var(--primary)' }}>
              {average}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              ממוצע ציונים ({numericGrades.length} {numericGrades.length === 1 ? 'מבחן' : 'מבחנים'})
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '14px' }}>
        {[
          { key: 'homework', label: '📝 שיעורי בית' },
          { key: 'exam',     label: '📋 מבחנים' },
        ].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-body)', background: subTab === t.key ? 'var(--primary)' : 'transparent', color: subTab === t.key ? '#fff' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending items */}
      {sortedDates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '12px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>{isExamTab ? '📋' : '📝'}</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {isExamTab ? 'אין מבחנים קרובים' : 'אין שיעורי בית פתוחים'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>לחץ + הוסף</p>
        </div>
      ) : (
        sortedDates.map(date => {
          const overGroup = grouped[date].some(i => isOverdue(date, i.status))
          return (
            <div key={date} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: overGroup ? '#EF4444' : 'var(--text-muted)' }}>
                  {overGroup ? '⚠️ ' : ''}{formatDay(date)}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {grouped[date].map(item => (
                <ItemRow key={item.id} item={item}
                  onStatusChange={handleStatusChange}
                  onPrepChange={handlePrepChange}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onGradeClick={setGradePopup}
                />
              ))}
            </div>
          )
        })
      )}

      {/* Completed (collapsible) */}
      {done.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <button onClick={() => setShowDone(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 0', fontFamily: 'var(--font-body)' }}>
            {showDone ? '▲' : '▼'} הושלם ({done.length})
          </button>
          {showDone && (
            <div style={{ marginTop: '8px' }}>
              {done.map(item => (
                <ItemRow key={item.id} item={item}
                  onStatusChange={handleStatusChange}
                  onPrepChange={handlePrepChange}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onGradeClick={setGradePopup}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add button */}
      <button className="btn" style={{ width: '100%', background: 'var(--primary)', color: '#fff' }} onClick={openAdd}>
        + {isExamTab ? 'הוסף מבחן' : 'הוסף שיעורי בית'}
      </button>

      {/* Add / Edit sheet */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 14px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px', margin: 0 }}>
                {editing ? '✏️ עריכה' : isExamTab ? '📋 מבחן חדש' : '📝 שיעורי בית'}
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: '0 18px 18px', direction: 'rtl', boxSizing: 'border-box' }}>
              <input className="input" value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="מקצוע (מתמטיקה, אנגלית...)"
                style={{ ...INPUT16, marginBottom: '10px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} autoFocus />
              <input className="input" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder={isExamTab ? 'נושא המבחן (אופציונלי)' : 'פירוט (אופציונלי)'}
                style={{ ...INPUT16, marginBottom: '12px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
                  {isExamTab ? 'תאריך המבחן:' : 'תאריך הגשה:'}
                </label>
                <input type="date" className="input" value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  style={{ ...INPUT16, width: '100%', boxSizing: 'border-box', textAlign: 'right', direction: 'rtl' }} />
              </div>

              {(editing?.type === 'exam' || isExamTab) && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textAlign: 'right' }}>
                    ציון:
                  </label>
                  <input className="input" value={form.grade}
                    onChange={e => gradeAvailable && setForm(f => ({ ...f, grade: e.target.value }))}
                    placeholder={gradeAvailable ? 'הזן ציון (מספר או טקסט)' : 'זמין לאחר המבחן'}
                    disabled={!gradeAvailable}
                    style={{ ...INPUT16, opacity: gradeAvailable ? 1 : 0.45, background: gradeAvailable ? undefined : 'var(--bg-elevated)', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
                </div>
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

      {gradePopup && <GradePopup exam={gradePopup} onSave={handleSaveGrade} onDismiss={() => setGradePopup(null)} />}
    </div>
  )
}
