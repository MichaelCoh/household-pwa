import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { TaskDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, CalendarPicker, useToast, confirmDelete, PageSpinner } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'
import { sendPushNotification, isNotificationSupported, getNotificationPermission, subscribeToNotifications } from '../lib/notifications'
import { RECURRENCE_OPTIONS, WEEKDAY_OPTIONS_HE } from '../lib/recurrence'

const PRIORITIES = [
  { key: 'high', label: 'גבוהה', color: 'var(--coral)', icon: '🔴' },
  { key: 'medium', label: 'בינונית', color: 'var(--amber)', icon: '🟡' },
  { key: 'low', label: 'נמוכה', color: 'var(--mint)', icon: '🟢' },
]

function normTimeForInput(t) {
  if (!t) return '09:00'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : '09:00'
}

function parseAssignedTo(val) {
  if (!val || val === '') return { type: 'none', ids: [] }
  if (val === 'all') return { type: 'all', ids: [] }
  try {
    const arr = JSON.parse(val)
    if (Array.isArray(arr)) return { type: 'multi', ids: arr }
  } catch {}
  return { type: 'single', ids: [val] }
}

function serializeAssignees(selectedIds, isAll) {
  if (isAll) return 'all'
  if (selectedIds.length === 0) return null
  if (selectedIds.length === 1) return selectedIds[0]
  return JSON.stringify(selectedIds)
}

function taskAssigneeDisplay(task, members) {
  const parsed = parseAssignedTo(task.assigned_to)
  if (parsed.type === 'none') return { text: 'לא משוייך', kind: 'none', ids: [] }
  if (parsed.type === 'all') return { text: 'כולם', kind: 'all', ids: [] }
  const ids = parsed.ids
  if (ids.length === 1) {
    const m = members.find(x => x.user_id === ids[0])
    return { text: m?.display_name?.trim() || 'משתמש', kind: 'user', ids }
  }
  const names = ids.map(id => members.find(x => x.user_id === id)?.display_name?.trim() || 'משתמש')
  return { text: names.join(', '), kind: 'multi', ids }
}

function recurrenceShortLabel(t) {
  const r = t.recurrence || 'none'
  if (r === 'none') return null
  const n = t.recurrence_interval || 1
  if (r === 'daily') return 'כל יום'
  if (r === 'weekly') {
    if (t.recurrence_weekday != null && t.recurrence_weekday >= 0 && t.recurrence_weekday <= 6) {
      const wd = WEEKDAY_OPTIONS_HE.find(w => w.key === t.recurrence_weekday)
      return wd ? `כל ${wd.label}` : 'שבועי'
    }
    return n > 1 ? `כל ${n} שבועות` : 'שבועי'
  }
  if (r === 'monthly') return n > 1 ? `כל ${n} חודשים` : 'חודשי'
  if (r === 'yearly') return n > 1 ? `כל ${n} שנים` : 'שנתי'
  if (r === 'custom') return `כל ${n} ימים`
  return null
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
  const parsed = parseAssignedTo(assignedTo)
  if (parsed.type === 'single' || parsed.type === 'multi') {
    sendPushNotification({ ...base, onlyUserIds: parsed.ids })
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
  const [selectedAssignees, setSelectedAssignees] = useState([])
  const [assignAll, setAssignAll] = useState(false)
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('pending')
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [showToast, ToastEl] = useToast()

  const [recurrence, setRecurrence] = useState('none')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(0)
  /** שבועי: רק אם true נשמר recurrence_weekday ב-DB; אחרת חזרה כל 7 יום מתאריך היעד */
  const [weeklyFixedDay, setWeeklyFixedDay] = useState(false)
  /** תאריך סיום אופציונלי לחזרה — ריק = ללא הגבלה */
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderTime, setReminderTime] = useState('09:00')

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

  useRealtimeRefresh('tasks', load)

  const resetRecurrence = () => {
    setRecurrence('none')
    setRecurrenceInterval(1)
    setRecurrenceWeekday(0)
    setWeeklyFixedDay(false)
    setRecurrenceEndDate('')
    setReminderEnabled(false)
    setReminderTime('09:00')
  }

  const openAdd = () => {
    setEditing(null)
    setTitle('')
    setPriority('medium')
    setDueDate('')
    setNotes('')
    setSelectedAssignees([])
    setAssignAll(false)
    resetRecurrence()
    setReminderEnabled(true)
    setShowModal(true)
  }

  const openEdit = (t) => {
    setEditing(t)
    setTitle(t.title)
    setPriority(t.priority)
    setDueDate(t.due_date || '')
    setNotes(t.notes || '')
    const parsed = parseAssignedTo(t.assigned_to)
    if (parsed.type === 'all') {
      setAssignAll(true)
      setSelectedAssignees([])
    } else {
      setAssignAll(false)
      setSelectedAssignees(parsed.ids)
    }
    setRecurrence(t.recurrence || 'none')
    setRecurrenceInterval(t.recurrence_interval || 1)
    const wd = t.recurrence_weekday
    setWeeklyFixedDay(typeof wd === 'number' && wd >= 0 && wd <= 6)
    setRecurrenceWeekday(typeof wd === 'number' ? wd : 0)
    setRecurrenceEndDate(t.recurrence_end_date || '')
    setReminderEnabled(!!t.reminder_enabled)
    setReminderTime(normTimeForInput(t.reminder_time))
    setShowModal(true)
  }

  const assignedToPayload = () => serializeAssignees(selectedAssignees, assignAll)

  const buildOpts = () => {
    const rt = reminderEnabled ? `${reminderTime || '09:00'}:00` : null
    return {
      recurrence: recurrence || 'none',
      recurrence_interval: Math.max(1, parseInt(recurrenceInterval, 10) || 1),
      recurrence_weekday: recurrence === 'weekly' && weeklyFixedDay ? recurrenceWeekday : null,
      recurrence_end_date: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : null,
      reminder_enabled: reminderEnabled,
      reminder_time: rt,
    }
  }

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('⚠️ נא להזין כותרת למשימה')
      return
    }
    if (recurrence !== 'none' && !dueDate.trim()) {
      showToast('⚠️ למשימה חוזרת נא לבחור תאריך יעד ראשון')
      return
    }
    try {
      const assigned = assignedToPayload()
      const opts = buildOpts()
      let savedRow = null
      if (editing) {
        await TaskDB.update(editing.id, {
          title: title.trim(),
          priority,
          due_date: dueDate || null,
          notes: notes.trim(),
          assigned_to: assigned,
          recurrence: opts.recurrence,
          recurrence_interval: opts.recurrence_interval,
          recurrence_weekday: opts.recurrence_weekday,
          recurrence_end_date: opts.recurrence_end_date,
          reminder_enabled: opts.reminder_enabled,
          reminder_time: opts.reminder_time,
        })
        savedRow = { ...editing, title: title.trim(), due_date: dueDate || null, notes: notes.trim(), recurrence: opts.recurrence, recurrence_interval: opts.recurrence_interval, recurrence_weekday: opts.recurrence_weekday, recurrence_end_date: opts.recurrence_end_date, reminder_enabled: opts.reminder_enabled, reminder_time: opts.reminder_time }
        showToast('✓ המשימה עודכנה')
        notifyTaskPush({ householdId, userId: user.id, assignedTo: assigned, title, isUpdate: true })
      } else {
        savedRow = await TaskDB.add(householdId, user.id, title.trim(), priority, dueDate || null, notes.trim(), assigned, opts)
        showToast('✓ המשימה נוצרה')
        notifyTaskPush({ householdId, userId: user.id, assignedTo: assigned, title, isUpdate: false })
      }
      setShowModal(false)
      load()
      if (opts.reminder_enabled && isNotificationSupported() && getNotificationPermission() !== 'granted') {
        try {
          await subscribeToNotifications(user.id, householdId)
          showToast('🔔 התראות הופעלו — תקבל תזכורות למשימות')
        } catch { /* user declined or error — silent */ }
      }
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
    if (!confirmDelete(`למחוק את "${t.title}"?`)) return
    await TaskDB.delete(t.id)
    showToast('המשימה נמחקה')
    load()
  }

  const handleClearDone = async () => {
    const n = tasks.filter(t => t.done).length
    if (!n || !confirmDelete(`למחוק ${n} משימות שהושלמו?`)) return
    await TaskDB.clearDone(householdId)
    showToast(`${n} משימות הוסרו`)
    load()
  }

  const isMyTask = (t) => {
    if (!user) return true
    const parsed = parseAssignedTo(t.assigned_to)
    if (parsed.type === 'none' || parsed.type === 'all') return true
    return parsed.ids.includes(user.id)
  }
  const baseTasks = myTasksOnly ? tasks.filter(isMyTask) : tasks
  const filtered = filter === 'all' ? baseTasks : filter === 'done' ? baseTasks.filter(t => t.done) : baseTasks.filter(t => !t.done)
  const doneCount = baseTasks.filter(t => t.done).length
  const pendingCount = baseTasks.filter(t => !t.done).length
  const todayStr = new Date().toISOString().slice(0, 10)
  const overdueCount = baseTasks.filter(t => !t.done && t.due_date && t.due_date < todayStr).length

  return (
    <div>
      <PageHeader title="משימות" icon="✅" accent="var(--coral)" subtitle={`${pendingCount} פתוחות · ${doneCount} הושלמו`} action={openAdd} actionLabel="+ משימה" actionColor="var(--coral)" />

      <div className="page" style={{ paddingTop: '16px' }}>
        {overdueCount > 0 && <div className="overdue-bar">⚠️ {overdueCount} באיחור</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', flex: 1 }}>
            {[['pending', `פתוחות ${pendingCount}`], ['done', `בוצעו ${doneCount}`], ['all', 'הכל']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s', background: filter === k ? 'var(--coral)' : 'transparent', color: filter === k ? '#fff' : 'var(--text-secondary)' }}>{l}</button>
            ))}
          </div>
          <button onClick={() => setMyTasksOnly(v => !v)} style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${myTasksOnly ? 'var(--sky)' : 'var(--border)'}`, background: myTasksOnly ? 'var(--sky-light)' : 'var(--bg-elevated)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: myTasksOnly ? 'var(--sky)' : 'var(--text-secondary)', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            👤 שלי
          </button>
        </div>
        {filter === 'done' && doneCount > 0 && (
          <button onClick={handleClearDone} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '8px', marginBottom: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--coral)', background: 'var(--coral-light)', color: 'var(--coral)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
            🗑 נקה משימות שהושלמו
          </button>
        )}

        {loading
          ? <PageSpinner />
          : filtered.length === 0
          ? <EmptyState icon="✅" title="הכל מסודר" subtitle="אין משימות כאן. לחץ + משימה כדי להוסיף." />
          : (() => {
            const renderTask = (t) => {
            const p = PRIORITIES.find(x => x.key === t.priority) || PRIORITIES[1]
            const overdue = !t.done && t.due_date && t.due_date < todayStr
            const ad = taskAssigneeDisplay(t, members)
            const assigneePillStyle =
              ad.kind === 'none'
                ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                : ad.kind === 'all'
                  ? { background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }
                  : ad.kind === 'multi'
                    ? { background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }
                    : { background: 'var(--sky-light)', color: 'var(--sky)', border: '1px solid var(--sky)' }
            const recLabel = recurrenceShortLabel(t)
            return (
              <div key={t.id} className={`list-item ${t.done ? 'done' : ''}`} style={{ position: 'relative' }}>
                <div className="priority-bar" style={{ background: p.color }} />
                <input type="checkbox" className="checkbox" checked={t.done} onChange={() => handleToggle(t)} style={{ accentColor: p.color }} />
                <div className="list-item-body">
                  <div className="list-item-title">{t.title}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                    <span className="pill" style={{ background: p.color + '20', color: p.color }}>{p.icon} {p.label}</span>
                    <span className="pill" style={{ fontSize: '11px', fontWeight: 600, ...assigneePillStyle }}>
                      {ad.kind === 'all' ? '👥' : ad.kind === 'none' ? '👤' : ad.kind === 'multi' ? '👥' : '✋'} {ad.text}
                    </span>
                    {recLabel && (
                      <span className="pill" style={{ fontSize: '11px', fontWeight: 600, background: 'rgba(108,99,255,0.12)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                        🔄 {recLabel}
                      </span>
                    )}
                    {t.reminder_enabled && t.due_date && (
                      <span className="pill" style={{ fontSize: '11px', fontWeight: 600, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                        🔔 {normTimeForInput(t.reminder_time)}
                      </span>
                    )}
                    {t.due_date ? (
                      <span className={`due-badge ${overdue ? 'overdue' : ''}`}>
                        {overdue ? '⚠️ ' : '📅 '}
                        {new Date(t.due_date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.7 }}>
                        ללא תאריך יעד
                      </span>
                    )}
                  </div>
                  {t.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>📝 {t.notes}</div>}
                  <div className="list-item-created">נוצר {timeAgo(t.created_at)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm btn-icon" title="עריכה">✏️</button>
                  <button onClick={() => handleDelete(t)} className="btn btn-ghost btn-sm btn-icon" title="מחיקה">🗑️</button>
                </div>
              </div>
            )
            }
            if (!myTasksOnly && filter !== 'done' && members.length > 1) {
              const groups = new Map()
              for (const t of filtered) {
                const parsed = parseAssignedTo(t.assigned_to)
                if (parsed.type === 'none') {
                  if (!groups.has('__none__')) groups.set('__none__', [])
                  groups.get('__none__').push(t)
                } else if (parsed.type === 'all') {
                  if (!groups.has('__all__')) groups.set('__all__', [])
                  groups.get('__all__').push(t)
                } else {
                  for (const uid of parsed.ids) {
                    if (!groups.has(uid)) groups.set(uid, [])
                    groups.get(uid).push(t)
                  }
                }
              }
              const order = ['__none__', ...members.map(m => m.user_id), '__all__']
              const sortedKeys = [...groups.keys()].sort((a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b)))
              return sortedKeys.map(key => {
                const groupTasks = groups.get(key)
                const label = key === '__none__' ? 'לא משוייך' : key === '__all__' ? 'כולם' : (members.find(m => m.user_id === key)?.display_name || 'משתמש')
                const icon = key === '__none__' ? '👤' : key === '__all__' ? '👥' : '✋'
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', marginTop: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px' }}>{icon}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({groupTasks.length})</span>
                    </div>
                    {groupTasks.map(renderTask)}
                  </div>
                )
              })
            }
            return filtered.map(renderTask)
          })()
        }
      </div>

      {ToastEl}
      <button className="fab" style={{ background: 'var(--coral)' }} onClick={openAdd}>+</button>

      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editing ? 'עריכת משימה' : 'משימה חדשה'}
        onSubmit={handleSave}
        submitLabel={editing ? 'שמור' : 'צור משימה'}
        submitColor="var(--coral)">
        <div className="input-group">
          <label className="input-label">מה לעשות?</label>
          <textarea className="input" placeholder="למשל: להזמין חיסונים" value={title} onChange={e => setTitle(e.target.value)} autoFocus rows={2} />
        </div>
        <div className="input-group">
          <label className="input-label">עדיפות</label>
          <div className="priority-row">
            {PRIORITIES.map(p => (
              <button key={p.key} type="button" className={`priority-chip ${priority === p.key ? 'active' : ''}`}
                style={priority === p.key ? { borderColor: p.color, color: p.color, background: p.color + '20' } : {}}
                onClick={() => setPriority(p.key)}>{p.icon} {p.label}</button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">תאריך יעד</label>
          <CalendarPicker value={dueDate} onChange={setDueDate} accentColor="var(--coral)" />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
            נדרש למשימה חוזרת — התאריך הראשון שממנו מחשבים את החזרות.
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">חזרה</label>
          <select
            className="input"
            value={recurrence}
            onChange={e => {
              const v = e.target.value
              setRecurrence(v)
              if (v !== 'weekly') setWeeklyFixedDay(false)
            }}
            style={{ cursor: 'pointer' }}
          >
            {RECURRENCE_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>

        {recurrence === 'weekly' && (
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, marginBottom: '10px' }}>
              <input type="checkbox" checked={weeklyFixedDay} onChange={e => setWeeklyFixedDay(e.target.checked)} style={{ width: 18, height: 18 }} />
              קבע יום קבוע בשבוע
            </label>
            {weeklyFixedDay && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {WEEKDAY_OPTIONS_HE.map(w => (
                  <button
                    key={w.key}
                    type="button"
                    className={`filter-chip ${recurrenceWeekday === w.key ? 'active' : ''}`}
                    style={recurrenceWeekday === w.key ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
                    onClick={() => setRecurrenceWeekday(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              {weeklyFixedDay
                ? 'המשימה תחזור בכל פעם ביום שנבחר.'
                : 'המשימה תחזור כל 7 יום מתאריך היעד הנוכחי (בלי יום קבוע).'}
            </p>
          </div>
        )}

        {(recurrence === 'monthly' || recurrence === 'yearly' || recurrence === 'custom') && (
          <div className="input-group">
            <label className="input-label">
              {recurrence === 'monthly' ? 'כל כמה חודשים' : recurrence === 'yearly' ? 'כל כמה שנים' : 'כל כמה ימים'}
            </label>
            <input
              className="input"
              type="number"
              min={1}
              max={365}
              value={recurrenceInterval}
              onChange={e => setRecurrenceInterval(e.target.value)}
            />
          </div>
        )}

        {recurrence !== 'none' && (
          <div className="input-group">
            <label className="input-label">תאריך סיום החזרה (אופציונלי)</label>
            <input
              className="input"
              type="date"
              value={recurrenceEndDate}
              min={dueDate || undefined}
              onChange={e => setRecurrenceEndDate(e.target.value)}
              style={{ direction: 'ltr' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              {recurrenceEndDate
                ? `המשימה תפסיק לחזור אחרי ${new Date(recurrenceEndDate + 'T00:00:00').toLocaleDateString('he-IL')}.`
                : 'ללא תאריך סיום — המשימה תחזור עד שתסומן כבוצעה או תימחק.'}
            </p>
            {recurrenceEndDate && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRecurrenceEndDate('')}
                style={{ marginTop: '6px', padding: '4px 10px', fontSize: '12px' }}
              >
                בטל תאריך סיום
              </button>
            )}
          </div>
        )}

        <div className="input-group" style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
            תזכורת ביום היעד
          </label>
          {reminderEnabled && (
            <div style={{ marginTop: '12px' }}>
              <label className="input-label">שעת תזכורת</label>
              <input type="time" className="input" value={reminderTime} onChange={e => setReminderTime(e.target.value)} style={{ direction: 'ltr', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                תקבל התראת Push בשעה שנבחרה ביום היעד.
              </p>
            </div>
          )}
        </div>

        <div className="input-group">
          <label className="input-label">מי מבצע? (אופציונלי)</label>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
            בחר חברי בית אחד או יותר. &quot;כולם&quot; בוחר את כל חברי הבית.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              className={`filter-chip ${!assignAll && selectedAssignees.length === 0 ? 'active' : ''}`}
              style={!assignAll && selectedAssignees.length === 0 ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
              onClick={() => { setAssignAll(false); setSelectedAssignees([]) }}
            >
              לא משוייך
            </button>
            <button
              type="button"
              className={`filter-chip ${assignAll ? 'active' : ''}`}
              style={assignAll ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
              onClick={() => {
                if (assignAll) { setAssignAll(false); setSelectedAssignees([]) }
                else { setAssignAll(true); setSelectedAssignees([]) }
              }}
            >
              👥 כולם
            </button>
            {members.map(m => {
              const isSelected = !assignAll && selectedAssignees.includes(m.user_id)
              return (
                <button
                  key={m.user_id}
                  type="button"
                  className={`filter-chip ${isSelected ? 'active' : ''}`}
                  style={isSelected ? { background: 'var(--coral-light)', borderColor: 'var(--coral)', color: 'var(--coral)' } : {}}
                  onClick={() => {
                    setAssignAll(false)
                    setSelectedAssignees(prev =>
                      prev.includes(m.user_id)
                        ? prev.filter(id => id !== m.user_id)
                        : [...prev, m.user_id]
                    )
                  }}
                >
                  {isSelected ? '✓ ' : ''}{m.display_name?.trim() || 'משתמש'}
                </button>
              )
            })}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">הערות (אופציונלי)</label>
          <textarea className="input" placeholder="פרטים נוספים..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
