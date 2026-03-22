import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { TaskDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, CalendarPicker, useToast, confirmDelete, PageSpinner } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'
import { sendPushNotification } from '../lib/notifications'

const PRIORITIES = [
  { key: 'high',   label: 'High',   color: 'var(--coral)', icon: '🔴' },
  { key: 'medium', label: 'Medium', color: 'var(--amber)', icon: '🟡' },
  { key: 'low',    label: 'Low',    color: 'var(--mint)',  icon: '🟢' },
]

function taskAssigneeDisplay(task, members) {
  const a = task.assigned_to
  if (a == null || a === '') return { text: 'לא משוייך', kind: 'none' }
  if (a === 'all') return { text: 'כולם', kind: 'all' }
  const m = members.find(x => x.user_id === a)
  return { text: m?.display_name?.trim() || 'משתמש', kind: 'user' }
}

/** התראות Push: שיוך לאדם ספציפי → רק אליו. לא משוייך או כולם → כל בני הבית חוץ ממי שביצע */
function notifyTaskPush({ householdId, userId, assignedTo, title, isUpdate }) {
  const base = {
    householdId,
    userId,
    title: isUpdate ? '✅ משימה עודכנה' : '✅ משימה חדשה',
    body: title.trim(),
    url: '/tasks',
    category: 'tasks',
  }
  if (assignedTo && assignedTo !== 'all') {
    sendPushNotification({ ...base, onlyUserIds: [assignedTo] })
  } else {
    sendPushNotification(base)
  }
}

export default function TasksPage() {
  const { user, householdId, getMembers } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [assignee, setAssignee] = useState('none')
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('pending')
  const [showToast, ToastEl] = useToast()

  useEffect(() => {
    let cancelled = false
    if (!householdId) return
    ;(async () => {
      const m = await getMembers()
      if (!cancelled) setMembers(m || [])
    })()
    return () => { cancelled = true }
  }, [householdId])

  const load = async () => {
    const all = await TaskDB.getAll(householdId)
    setLoading(false)
    setTasks([...all].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const ao = a.due_date && new Date(a.due_date) < new Date()
      const bo = b.due_date && new Date(b.due_date) < new Date()
      if (ao !== bo) return ao ? -1 : 1
      const order = { high: 0, medium: 1, low: 2 }
      return (order[a.priority] || 1) - (order[b.priority] || 1)
    }))
  }

  useEffect(() => { if (householdId) load() }, [householdId])

  // Realtime: כל שינוי במשימות → רענון אוטומטי לשני המשתמשים
  useRealtimeRefresh('tasks', load)

  const openAdd = () => {
    setEditing(null)
    setTitle('')
    setPriority('medium')
    setDueDate('')
    setNotes('')
    setAssignee('none')
    setShowModal(true)
  }
  const openEdit = (t) => {
    setEditing(t)
    setTitle(t.title)
    setPriority(t.priority)
    setDueDate(t.due_date || '')
    setNotes(t.notes || '')
    const a = t.assigned_to
    if (a == null || a === '') setAssignee('none')
    else if (a === 'all') setAssignee('all')
    else setAssignee(a)
    setShowModal(true)
  }

  const assignedToPayload = () => (assignee === 'none' ? null : assignee === 'all' ? 'all' : assignee)

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('⚠️ נא להזין כותרת למשימה')
      return
    }
    try {
      const assigned = assignedToPayload()
      if (editing) {
        await TaskDB.update(editing.id, { title: title.trim(), priority, due_date: dueDate || null, notes: notes.trim(), assigned_to: assigned })
        showToast('✓ המשימה עודכנה')
        notifyTaskPush({ householdId, userId: user.id, assignedTo: assigned, title, isUpdate: true })
      } else {
        await TaskDB.add(householdId, user.id, title.trim(), priority, dueDate || null, notes.trim(), assigned)
        showToast('✓ המשימה נוצרה')
        notifyTaskPush({ householdId, userId: user.id, assignedTo: assigned, title, isUpdate: false })
      }
      setShowModal(false)
      load()
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message)
      console.error('TaskDB error:', err)
    }
  }

  const handleToggle = async (t) => {
    await TaskDB.toggle(t.id, !t.done)
    load()
  }

  const handleDelete = async (t) => {
    if (!confirmDelete(`Delete "${t.title}"?`)) return
    await TaskDB.delete(t.id)
    showToast('Task deleted')
    load()
  }

  const handleClearDone = async () => {
    const n = tasks.filter(t => t.done).length
    if (!n || !confirmDelete(`Clear ${n} completed task${n > 1 ? 's' : ''}?`)) return
    await TaskDB.clearDone(householdId)
    showToast(`${n} task${n > 1 ? 's' : ''} cleared`)
    load()
  }

  const filtered = filter === 'all' ? tasks : filter === 'done' ? tasks.filter(t => t.done) : tasks.filter(t => !t.done)
  const doneCount = tasks.filter(t => t.done).length
  const pendingCount = tasks.filter(t => !t.done).length
  const overdueCount = tasks.filter(t => !t.done && t.due_date && new Date(t.due_date) < new Date()).length

  return (
    <div>
      <PageHeader title="Tasks" icon="✅" accent="var(--coral)" subtitle={`${pendingCount} pending · ${doneCount} done`} action={openAdd} actionLabel="+ New Task" actionColor="var(--coral)" />

      <div className="page" style={{ paddingTop: '16px' }}>
        {overdueCount > 0 && <div className="overdue-bar">⚠️ {overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</div>}

        <div className="filter-row">
          {[['pending', `Pending (${pendingCount})`], ['done', `Done (${doneCount})`], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={`filter-chip ${filter === k ? 'active' : ''}`}
              style={filter === k ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
              onClick={() => setFilter(k)}>{l}</button>
          ))}
          {doneCount > 0 && (
            <button className="filter-chip" style={{ borderColor: 'var(--coral)', color: 'var(--coral)', background: 'var(--coral-light)', marginLeft: 'auto' }} onClick={handleClearDone}>
              🗑 Clear done
            </button>
          )}
        </div>

        {loading
          ? <PageSpinner />
          : filtered.length === 0
          ? <EmptyState icon="✅" title="All clear!" subtitle="No tasks here. Tap + New Task to add one." />
          : filtered.map(t => {
            const p = PRIORITIES.find(x => x.key === t.priority) || PRIORITIES[1]
            const overdue = !t.done && t.due_date && new Date(t.due_date) < new Date()
            const ad = taskAssigneeDisplay(t, members)
            const assigneePillStyle =
              ad.kind === 'none'
                ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                : ad.kind === 'all'
                  ? { background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }
                  : { background: 'var(--sky-light)', color: 'var(--sky)', border: '1px solid var(--sky)' }
            return (
              <div key={t.id} className={`list-item ${t.done ? 'done' : ''}`} style={{ position: 'relative' }}>
                <div className="priority-bar" style={{ background: p.color }} />
                <input type="checkbox" className="checkbox" checked={t.done} onChange={() => handleToggle(t)} style={{ accentColor: p.color }} />
                <div className="list-item-body">
                  <div className="list-item-title">{t.title}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                    <span className="pill" style={{ background: p.color + '20', color: p.color }}>{p.icon} {p.label}</span>
                    <span className="pill" style={{ fontSize: '11px', fontWeight: 600, ...assigneePillStyle }}>
                      {ad.kind === 'all' ? '👥' : ad.kind === 'none' ? '👤' : '✋'} {ad.text}
                    </span>
                    {t.due_date && (
                      <span className={`due-badge ${overdue ? 'overdue' : ''}`}>
                        {overdue ? '⚠️ ' : '📅 '}
                        {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {t.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>📝 {t.notes}</div>}
                  <div className="list-item-created">Created {timeAgo(t.created_at)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm btn-icon" title="Edit">✏️</button>
                  <button onClick={() => handleDelete(t)} className="btn btn-ghost btn-sm btn-icon" title="Delete">🗑️</button>
                </div>
              </div>
            )
          })
        }
      </div>

      {ToastEl}
      <button className="fab" style={{ background: 'var(--coral)' }} onClick={openAdd}>+</button>

      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? 'Edit Task' : 'New Task'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create Task'}
        submitColor="var(--coral)">
        <div className="input-group">
          <label className="input-label">Task title</label>
          <textarea className="input" placeholder="What needs to be done?" value={title} onChange={e => setTitle(e.target.value)} autoFocus rows={2} />
        </div>
        <div className="input-group">
          <label className="input-label">Priority</label>
          <div className="priority-row">
            {PRIORITIES.map(p => (
              <button key={p.key} className={`priority-chip ${priority === p.key ? 'active' : ''}`}
                style={priority === p.key ? { borderColor: p.color, color: p.color, background: p.color + '20' } : {}}
                onClick={() => setPriority(p.key)}>{p.icon} {p.label}</button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Due date</label>
          <CalendarPicker value={dueDate} onChange={setDueDate} accentColor="var(--coral)" />
        </div>
        <div className="input-group">
          <label className="input-label">מי מבצע? (אופציונלי)</label>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
            אפשר להשאיר ללא שיוך, לבחור חבר/ת בית, או &quot;כולם&quot; אם כל אחד יכול לבצע.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              className={`filter-chip ${assignee === 'none' ? 'active' : ''}`}
              style={assignee === 'none' ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
              onClick={() => setAssignee('none')}
            >
              לא משוייך
            </button>
            <button
              type="button"
              className={`filter-chip ${assignee === 'all' ? 'active' : ''}`}
              style={assignee === 'all' ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
              onClick={() => setAssignee('all')}
            >
              כולם
            </button>
            {members.map(m => (
              <button
                key={m.user_id}
                type="button"
                className={`filter-chip ${assignee === m.user_id ? 'active' : ''}`}
                style={assignee === m.user_id ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
                onClick={() => setAssignee(m.user_id)}
              >
                {m.display_name?.trim() || 'משתמש'}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Notes (optional)</label>
          <textarea className="input" placeholder="Add details..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
