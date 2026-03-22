import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { TaskDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, CalendarPicker, useToast, confirmDelete } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'
import { sendPushNotification } from '../lib/notifications'

const PRIORITIES = [
  { key: 'high',   label: 'High',   color: 'var(--coral)', icon: '🔴' },
  { key: 'medium', label: 'Medium', color: 'var(--amber)', icon: '🟡' },
  { key: 'low',    label: 'Low',    color: 'var(--mint)',  icon: '🟢' },
]

export default function TasksPage() {
  const { user, householdId } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [filter, setFilter] = useState('pending')
  const [showToast, ToastEl] = useToast()

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

  const openAdd = () => { setEditing(null); setTitle(''); setPriority('medium'); setDueDate(''); setNotes(''); setShowModal(true) }
  const openEdit = (t) => { setEditing(t); setTitle(t.title); setPriority(t.priority); setDueDate(t.due_date || ''); setNotes(t.notes || ''); setShowModal(true) }

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('⚠️ נא להזין כותרת למשימה')
      return
    }
    try {
      if (editing) {
        await TaskDB.update(editing.id, { title: title.trim(), priority, due_date: dueDate || null, notes: notes.trim() })
        showToast('✓ המשימה עודכנה')
        sendPushNotification({ householdId, userId: user.id, title: '✅ משימה עודכנה', body: title.trim(), url: '/tasks', category: 'tasks' })
      } else {
        await TaskDB.add(householdId, user.id, title.trim(), priority, dueDate || null, notes.trim())
        showToast('✓ המשימה נוצרה')
        sendPushNotification({ householdId, userId: user.id, title: '✅ משימה חדשה', body: title.trim(), url: '/tasks', category: 'tasks' })
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
          ? <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '15px' }}>טוען...</div>
          : filtered.length === 0
          ? <EmptyState icon="✅" title="All clear!" subtitle="No tasks here. Tap + New Task to add one." />
          : filtered.map(t => {
            const p = PRIORITIES.find(x => x.key === t.priority) || PRIORITIES[1]
            const overdue = !t.done && t.due_date && new Date(t.due_date) < new Date()
            return (
              <div key={t.id} className={`list-item ${t.done ? 'done' : ''}`} style={{ position: 'relative' }}>
                <div className="priority-bar" style={{ background: p.color }} />
                <input type="checkbox" className="checkbox" checked={t.done} onChange={() => handleToggle(t)} style={{ accentColor: p.color }} />
                <div className="list-item-body">
                  <div className="list-item-title">{t.title}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                    <span className="pill" style={{ background: p.color + '20', color: p.color }}>{p.icon} {p.label}</span>
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
          <label className="input-label">Notes (optional)</label>
          <textarea className="input" placeholder="Add details..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
