import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { EventDB, ExpenseDB, TaskDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, CalendarPicker, useToast, confirmDelete, PageSpinner } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'
import { ImportedEventDB } from '../lib/calendar/db'
import { getConnections, buildFeedUrl } from '../lib/calendar/connection'
import {
  syncPullGoogle,
  syncPushEventToGoogle,
  syncDeleteFromGoogle,
  registerBackgroundSync,
  listenForServiceWorkerSync,
} from '../lib/calendar/sync'
import { isGoogleConfiguredFrontend } from '../lib/calendar/google'
import { isIOS, isInstalledPWA, supportsWebPush } from '../lib/calendar/platform'
import { isOccurrenceOn, formatDateOnly } from '../lib/recurrence'
import PhoneEventSheet from '../components/calendar/PhoneEventSheet'

// ── CALENDAR ──────────────────────────────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const EVENT_COLORS = ['#5B6AF0', '#00BFA5', '#FF5A5A', '#FF9500', '#9C6FFF', '#2196F3', '#34C759', '#FF6B9D']
const REMINDER_OPTIONS = [
  { value: '', label: 'ללא' },
  { value: '10', label: '10 דק׳' },
  { value: '30', label: '30 דק׳' },
  { value: '60', label: 'שעה' },
  { value: '1440', label: 'יום' },
]
const RECURRENCE_OPTIONS_INLINE = [
  { value: 'none', label: 'ללא חזרה' },
  { value: 'daily', label: 'יומי' },
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'yearly', label: 'שנתי' },
]

const SOURCE_LABELS = {
  app:    { label: 'האפליקציה',      color: 'var(--sky)',     emoji: '🏠' },
  google: { label: 'Google Calendar', color: '#4285F4',         emoji: '🟢' },
  ics:    { label: 'יומן חיצוני',     color: '#9C6FFF',         emoji: '📁' },
}

export function CalendarPage() {
  const { user, householdId } = useAuth()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [events, setEvents] = useState([])
  const [monthTasks, setMonthTasks] = useState([])
  /** Recurring tasks/events whose anchor is BEFORE the current month — only the
   *  anchor row is in the DB; we expand virtual occurrences for rendering. */
  const [recurringTasks, setRecurringTasks] = useState([])
  const [recurringEvents, setRecurringEvents] = useState([])
  const [importedEvents, setImportedEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0])
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [reminderMinutes, setReminderMinutes] = useState('')
  const [syncToPhone, setSyncToPhone] = useState(null) // null = inherit
  const [color, setColor] = useState('#5B6AF0')
  const [notes, setNotes] = useState('')
  const [showToast, ToastEl] = useToast()
  const [formError, setFormError] = useState('')
  const [modalDate, setModalDate] = useState(now.toISOString().split('T')[0])
  const [connections, setConnections] = useState([])
  const [activeFilters, setActiveFilters] = useState({ app: true, google: true, ics: true })
  const [syncing, setSyncing] = useState(false)
  const [phoneEvent, setPhoneEvent] = useState(null)

  const googleConn = useMemo(() => connections.find((c) => c.provider === 'google'), [connections])
  const webcalConn = useMemo(() => connections.find((c) => c.provider === 'webcal'), [connections])
  const anyCalendarConnected = !!(googleConn || webcalConn)

  // Connection-level default for new events (for the "sync to phone" toggle)
  const defaultSyncEnabled = useMemo(() => {
    if (!anyCalendarConnected) return false
    const s = (googleConn || webcalConn)?.settings || {}
    return s.default_event_sync !== false
  }, [googleConn, webcalConn, anyCalendarConnected])

  const load = async (yr = viewYear, mo = viewMonth) => {
    // Last day of visible month, used as the "as-of" cap for active recurring queries.
    const monthEnd = formatDateOnly(new Date(yr, mo + 1, 0))
    const [ev, taskRows, recT, recE, imp] = await Promise.all([
      EventDB.getForMonth(householdId, yr, mo),
      TaskDB.getForMonth(householdId, yr, mo),
      TaskDB.getActiveRecurring(householdId, monthEnd),
      EventDB.getActiveRecurring(householdId, monthEnd),
      ImportedEventDB.getForMonth(householdId, yr, mo),
    ])
    setEvents(ev)
    setMonthTasks(taskRows)
    setRecurringTasks(recT)
    setRecurringEvents(recE)
    setImportedEvents(imp)
    setLoading(false)
  }

  useEffect(() => { if (householdId) load(viewYear, viewMonth) }, [householdId, viewYear, viewMonth])

  // Load calendar connections for source-aware UI
  useEffect(() => {
    if (!user) return
    getConnections(user.id).then(setConnections)
  }, [user?.id])

  // Realtime: אירועים + משימות (תאריך יעד) מסתנכרנים ליומן
  useRealtimeRefresh('events', load)
  useRealtimeRefresh('tasks', load)
  useRealtimeRefresh('imported_calendar_events', load)

  // ── Background sync wiring ─────────────────────────────────────────────
  // 1. Try to register Background Sync. If unavailable (iOS), we fall back
  //    to syncing on every screen visit.
  // 2. Listen for SW broadcast and pull when triggered.
  useEffect(() => {
    if (!user) return
    let cancelled = false

    const triggerPull = async () => {
      if (!isGoogleConfiguredFrontend) return
      if (!googleConn) return
      setSyncing(true)
      try {
        await syncPullGoogle(user.id)
        if (!cancelled) await load()
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }

    const off = listenForServiceWorkerSync(triggerPull)
    registerBackgroundSync().catch(() => {})
    // Sync on every calendar screen visit (covers iOS).
    triggerPull()

    return () => { cancelled = true; off() }
  }, [user?.id, googleConn?.id])

  // ── Pull-to-refresh ────────────────────────────────────────────────────
  const containerRef = useRef(null)
  const pullStartY = useRef(0)
  const pulling = useRef(false)
  const [pullPx, setPullPx] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchStart = (e) => {
      if (window.scrollY > 0) return
      pullStartY.current = e.touches[0].clientY
      pulling.current = true
    }
    const onTouchMove = (e) => {
      if (!pulling.current) return
      const dy = e.touches[0].clientY - pullStartY.current
      if (dy > 0 && window.scrollY <= 0) {
        setPullPx(Math.min(dy * 0.4, 80))
      } else {
        setPullPx(0)
      }
    }
    const onTouchEnd = async () => {
      if (!pulling.current) return
      pulling.current = false
      const dy = pullPx
      setPullPx(0)
      if (dy > 60 && user && googleConn) {
        setSyncing(true)
        try {
          await syncPullGoogle(user.id)
          await load()
          showToast('✅ סונכרן עם Google Calendar')
        } finally {
          setSyncing(false)
        }
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [user?.id, googleConn?.id, pullPx])

  const openModal = (date, existing = null) => {
    const d = existing?.date || date || selectedDate || now.toISOString().split('T')[0]
    setEditingEvent(existing)
    setModalDate(d)
    setTitle(existing?.title || '')
    setTime(existing?.time || '')
    setEndTime(existing?.end_time || '')
    setEndDate(existing?.end_date || '')
    setAllDay(!!existing?.all_day || (existing && !existing.time) || false)
    setLocation(existing?.location || '')
    setRecurrence(existing?.recurrence || 'none')
    setRecurrenceEndDate(existing?.recurrence_end_date || '')
    setReminderMinutes(existing?.reminder_minutes != null ? String(existing.reminder_minutes) : '')
    setSyncToPhone(existing?.sync_to_phone === undefined || existing?.sync_to_phone === null ? null : !!existing.sync_to_phone)
    setNotes(existing?.notes || '')
    setColor(existing?.color || '#5B6AF0')
    setFormError('')
    setShowModal(true)
  }

  const handleAdd = async () => {
    setFormError('')
    if (!title.trim()) { setFormError('יש להזין כותרת לאירוע'); return }
    if (!modalDate) { setFormError('יש לבחור תאריך'); return }
    try {
      const extra = {
        end_date: endDate || null,
        end_time: allDay ? null : (endTime || null),
        all_day: !!allDay,
        location: location.trim(),
        recurrence,
        recurrence_interval: 1,
        recurrence_end_date: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : null,
        reminder_minutes: reminderMinutes === '' ? null : parseInt(reminderMinutes, 10),
        sync_to_phone: syncToPhone,
      }
      let saved
      if (editingEvent) {
        saved = await EventDB.update(editingEvent.id, {
          title: title.trim(),
          date: modalDate,
          time: allDay ? null : (time || null),
          color,
          notes: notes.trim(),
          ...extra,
        })
      } else {
        saved = await EventDB.add(
          householdId, user.id,
          title.trim(),
          modalDate,
          allDay ? null : (time || null),
          color,
          notes.trim(),
          extra,
        )
      }
      // Push to Google asynchronously
      if (saved) syncPushEventToGoogle(user.id, saved).catch(() => {})

      const eventDate = new Date(modalDate + 'T00:00:00')
      setViewYear(eventDate.getFullYear())
      setViewMonth(eventDate.getMonth())
      setSelectedDate(modalDate)
      setShowModal(false)
      setEditingEvent(null)
      showToast(editingEvent ? '✓ האירוע עודכן' : '✓ האירוע נוסף')
      load(eventDate.getFullYear(), eventDate.getMonth())
    } catch (e) {
      setFormError('שגיאה בשמירה: ' + e.message)
    }
  }

  const handleDelete = async (e) => {
    if (!confirmDelete(`Delete "${e.title}"?`)) return
    const googleEventId = e.google_event_id
    const googleCalendarId = e.google_calendar_id
    await EventDB.delete(e.id)
    if (googleEventId) syncDeleteFromGoogle({ google_event_id: googleEventId, google_calendar_id: googleCalendarId }).catch(() => {})
    showToast('✓ האירוע נמחק')
    load()
  }

  const handleManualSync = async () => {
    if (!googleConn || !user) return
    setSyncing(true)
    try {
      const r = await syncPullGoogle(user.id)
      await load()
      showToast(r.ok ? `✅ סונכרנו ${r.imported || 0} אירועים` : '⚠️ הסנכרון לא הושלם')
    } finally {
      setSyncing(false)
    }
  }

  const prevMonth = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const dateStr = d => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Source filter — also gates the recurring lists, since they're app data.
  const visibleEvents     = activeFilters.app    ? events                                            : []
  const visibleTasks      = activeFilters.app    ? monthTasks                                        : []
  const visibleRecTasks   = activeFilters.app    ? recurringTasks                                    : []
  const visibleRecEvents  = activeFilters.app    ? recurringEvents                                   : []
  const visibleImported   = importedEvents.filter((ev) => activeFilters[ev.source] !== false)

  // Recurring-aware predicates. A recurring item appears on every day its
  // pattern lands on, bounded by recurrence_end_date. The DB returns only the
  // anchor row; isOccurrenceOn does the math.
  const taskOccursOn = (t, ds) => isOccurrenceOn(t.due_date, ds, t.recurrence, t.recurrence_interval || 1, t.recurrence_weekday, t.recurrence_end_date)
  const eventOccursOn = (e, ds) => isOccurrenceOn(e.date, ds, e.recurrence, e.recurrence_interval || 1, null, e.recurrence_end_date)

  const tasksForDate = (ds) => {
    const seen = new Set()
    const out = []
    for (const t of visibleTasks) {
      if (t.due_date === ds && !t.done && !seen.has(t.id)) { seen.add(t.id); out.push(t) }
    }
    for (const t of visibleRecTasks) {
      if (seen.has(t.id)) continue
      // Recurring tasks: show on every matching day. The "done" flag only
      // hides the current anchor occurrence; future virtual occurrences keep
      // showing until the user hits recurrence_end_date or deletes the task.
      const isAnchor = t.due_date === ds
      if (isAnchor && t.done) continue
      if (taskOccursOn(t, ds)) { seen.add(t.id); out.push(t) }
    }
    return out
  }

  const eventsForDate = (ds) => {
    const seen = new Set()
    const out = []
    for (const e of visibleEvents) {
      if (e.date === ds && !seen.has(e.id)) { seen.add(e.id); out.push(e) }
    }
    for (const e of visibleRecEvents) {
      if (seen.has(e.id)) continue
      if (eventOccursOn(e, ds)) { seen.add(e.id); out.push(e) }
    }
    return out
  }

  const hasEvent = d => {
    const ds = dateStr(d)
    return (
      eventsForDate(ds).length > 0 ||
      tasksForDate(ds).length > 0 ||
      visibleImported.some(ev => ev.date === ds)
    )
  }
  const isToday = d => now.getFullYear() === viewYear && now.getMonth() === viewMonth && now.getDate() === d
  const isSelected = d => selectedDate === dateStr(d)

  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' })
  const selectedEvents = eventsForDate(selectedDate)
  const selectedTasks = tasksForDate(selectedDate)
  const selectedImported = visibleImported.filter(ev => ev.date === selectedDate)

  // Compose sync-status indicator
  const lastSyncAt = googleConn?.last_sync_at
  const syncStatusEl = anyCalendarConnected && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
      {syncing ? (
        <>
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--sky)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <span>מסנכרן...</span>
        </>
      ) : googleConn?.status === 'error' ? (
        <>
          <span>⚠️</span>
          <span style={{ color: 'var(--coral)' }}>שגיאת סנכרון — </span>
          <Link to="/settings" style={{ color: 'var(--sky)', fontWeight: 600 }}>תיקון</Link>
        </>
      ) : lastSyncAt ? (
        <>
          <span>🔄</span>
          <span>סונכרן {timeAgo(lastSyncAt)}</span>
          {googleConn && (
            <button onClick={handleManualSync} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }}>
              סנכרן עכשיו
            </button>
          )}
        </>
      ) : googleConn ? (
        <>
          <span>🔄</span>
          <button onClick={handleManualSync} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }}>
            סנכרן עכשיו
          </button>
        </>
      ) : null}
    </div>
  )

  return (
    <div ref={containerRef}>
      <PageHeader title="Calendar" icon="📅" accent="var(--sky)" subtitle={`${MONTHS[viewMonth]} ${viewYear}`} action={() => openModal()} actionLabel="+ Add Event" actionColor="var(--sky)" />

      <div className="page" style={{ paddingTop: '20px', transform: `translateY(${pullPx}px)`, transition: pulling.current ? 'none' : 'transform 0.2s' }}>
        {isIOS && !isInstalledPWA && (
          <div className="card" style={{ padding: '10px 14px', marginBottom: '12px', background: 'var(--amber-light)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📲</span>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>הוסף למסך הבית</strong> כדי לקבל התראות וסנכרון רקע באייפון.
            </div>
          </div>
        )}
        {isIOS && isInstalledPWA && !supportsWebPush && (
          <div className="card" style={{ padding: '10px 14px', marginBottom: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            ℹ️ התראות Push דורשות iOS 16.4 ומעלה. סנכרון יומן עובד תקין.
          </div>
        )}
        {syncStatusEl}

        {/* Source filter bar */}
        {(googleConn || importedEvents.length > 0) && (
          <div className="filter-row" style={{ marginBottom: '12px' }}>
            {[
              { key: 'app',    label: '🏠 האפליקציה' },
              googleConn || importedEvents.some(e => e.source === 'google') ? { key: 'google', label: '🟢 Google Calendar' } : null,
              importedEvents.some(e => e.source === 'ics') ? { key: 'ics', label: '📁 יומן חיצוני' } : null,
            ].filter(Boolean).map(({ key, label }) => (
              <button
                key={key}
                className={`filter-chip ${activeFilters[key] !== false ? 'active' : ''}`}
                onClick={() => setActiveFilters((p) => ({ ...p, [key]: p[key] === false ? true : false }))}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}>‹</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px' }}>{MONTHS[viewMonth]} {viewYear}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}>›</button>
        </div>

        {/* Calendar grid */}
        <div className="card" style={{ padding: '12px', marginBottom: '20px' }}>
          <div className="cal-grid" style={{ marginBottom: '4px' }}>
            {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => (
              <button key={i}
                className={`cal-cell ${d && isSelected(d) ? 'selected' : ''} ${d && isToday(d) && !isSelected(d) ? 'today' : ''} ${d && !isToday(d) && new Date(dateStr(d)) < new Date(now.toDateString()) ? 'past' : ''} ${d && hasEvent(d) ? 'has-event' : ''}`}
                style={d && isSelected(d) ? { background: 'var(--sky)' } : d && isToday(d) ? { color: 'var(--sky)' } : {}}
                onClick={() => d && setSelectedDate(dateStr(d))}
                disabled={!d}>
                {d || ''}
              </button>
            ))}
          </div>
        </div>

        {/* Selected day events */}
        <div className="section-label">
          {selectedLabel}
          <span onClick={() => openModal(selectedDate)} style={{ cursor: 'pointer', color: 'var(--sky)' }}>+ Add</span>
        </div>

        {loading
          ? <PageSpinner />
          : selectedEvents.length === 0 && selectedTasks.length === 0 && selectedImported.length === 0
          ? <div className="card" style={{ padding: '16px', textAlign: 'center' }}><p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>אין אירועים או משימות · לחץ + להוספת אירוע</p></div>
          : (
            <>
              {selectedTasks.map(t => (
                <div key={`task-${t.id}`} className="list-item" style={{ borderRight: '3px solid var(--coral)' }}>
                  <div style={{ width: 4, minHeight: 40, borderRadius: 2, background: 'var(--coral)', flexShrink: 0 }} />
                  <div className="list-item-body">
                    <div className="list-item-title">✅ {t.title}</div>
                    <div className="list-item-meta" style={{ color: 'var(--coral)', fontWeight: 600 }}>משימה · לוח משימות</div>
                    {t.notes && <div className="list-item-meta">📝 {t.notes}</div>}
                  </div>
                  <Link to="/tasks" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, fontSize: '12px' }}>פתח</Link>
                </div>
              ))}
              {selectedEvents.map(e => (
                <div key={e.id} className="list-item" style={{ cursor: 'pointer', borderRight: `3px solid ${SOURCE_LABELS.app.color}` }} onClick={() => openModal(e.date, e)}>
                  <div style={{ width: 4, minHeight: 40, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                  <div className="list-item-body">
                    <div className="list-item-title">{e.title}</div>
                    {e.time && <div className="list-item-meta">🕐 {e.time}{e.end_time ? ` – ${e.end_time}` : ''}</div>}
                    {e.location && <div className="list-item-meta">📍 {e.location}</div>}
                    {e.notes && <div className="list-item-meta">📝 {e.notes}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span className="pill" style={{ background: 'var(--sky-light)', color: 'var(--sky)', fontSize: '10px' }}>{SOURCE_LABELS.app.emoji} {SOURCE_LABELS.app.label}</span>
                      {e.google_event_id && <span className="pill" style={{ background: '#4285F410', color: '#4285F4', fontSize: '10px' }}>↗ Google</span>}
                      {e.recurrence && e.recurrence !== 'none' && <span className="pill" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '10px' }}>🔁 {e.recurrence}</span>}
                    </div>
                  </div>
                  <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e) }} className="btn btn-ghost btn-sm btn-icon">🗑️</button>
                </div>
              ))}
              {selectedImported.map(e => {
                const meta = SOURCE_LABELS[e.source] || SOURCE_LABELS.ics
                return (
                  <div key={`imp-${e.id}`} className="list-item" style={{ cursor: 'pointer', borderRight: `3px solid ${meta.color}` }} onClick={() => setPhoneEvent(e)}>
                    <div style={{ width: 4, minHeight: 40, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                    <div className="list-item-body">
                      <div className="list-item-title">{e.title}</div>
                      {e.time && <div className="list-item-meta">🕐 {e.time}{e.end_time ? ` – ${e.end_time}` : ''}</div>}
                      {e.location && <div className="list-item-meta">📍 {e.location}</div>}
                      {e.description && <div className="list-item-meta truncate">📝 {e.description}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span className="pill" style={{ background: meta.color + '15', color: meta.color, fontSize: '10px' }}>{meta.emoji} {e.source_calendar_name || meta.label}</span>
                        {e.recurrence_rule && <span className="pill" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '10px' }}>🔁 חוזר</span>}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: '14px', color: 'var(--text-muted)' }}>›</span>
                  </div>
                )
              })}
            </>
          )
        }
      </div>

      {ToastEl}
      <PhoneEventSheet event={phoneEvent} onClose={() => setPhoneEvent(null)} />
      <button className="fab" style={{ background: 'var(--sky)' }} onClick={() => openModal()}>+</button>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingEvent(null); setFormError('') }} title={editingEvent ? 'עריכת אירוע' : 'אירוע חדש'} onSubmit={handleAdd} submitLabel={editingEvent ? 'שמור' : 'הוסף אירוע'} submitColor="var(--sky)">
        {formError && <p style={{ color: 'var(--coral)', fontSize: '13px', marginBottom: '12px', background: 'var(--coral-light)', padding: '10px', borderRadius: '8px' }}>{formError}</p>}
        <div className="input-group">
          <label className="input-label">כותרת</label>
          <input className="input" placeholder="מה קורה?" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">תאריך</label>
          <CalendarPicker value={modalDate} onChange={setModalDate} accentColor="var(--sky)" />
        </div>
        <div className="input-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <label className="input-label" style={{ marginBottom: 0, flex: 1 }}>אירוע יום שלם</label>
            <button
              type="button"
              onClick={() => setAllDay((v) => !v)}
              style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: allDay ? 'var(--sky)' : 'var(--border)' }}
              aria-pressed={allDay}
            >
              <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 3, right: allDay ? 3 : 23, transition: 'right 0.2s' }} />
            </button>
          </div>
        </div>
        {!allDay && (
          <div className="input-group" style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label className="input-label">שעת התחלה</label>
              <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="input-label">שעת סיום</label>
              <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        )}
        <div className="input-group">
          <label className="input-label">מיקום (לא חובה)</label>
          <input className="input" placeholder="כתובת או שם המקום" value={location} onChange={e => setLocation(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">חזרה</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {RECURRENCE_OPTIONS_INLINE.map((o) => (
              <button key={o.value} type="button" onClick={() => setRecurrence(o.value)}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                  border: recurrence === o.value ? '1.5px solid var(--sky)' : '1.5px solid var(--border)',
                  background: recurrence === o.value ? 'var(--sky-light)' : 'var(--bg-elevated)',
                  color: recurrence === o.value ? 'var(--sky)' : 'var(--text-secondary)',
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {recurrence !== 'none' && (
          <div className="input-group">
            <label className="input-label">תאריך סיום החזרה (אופציונלי)</label>
            <input
              className="input"
              type="date"
              value={recurrenceEndDate}
              min={modalDate || undefined}
              onChange={e => setRecurrenceEndDate(e.target.value)}
              style={{ direction: 'ltr' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              {recurrenceEndDate
                ? `האירוע יפסיק לחזור אחרי ${new Date(recurrenceEndDate + 'T00:00:00').toLocaleDateString('he-IL')}.`
                : 'ללא תאריך סיום — האירוע יחזור עד שיימחק.'}
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
        <div className="input-group">
          <label className="input-label">תזכורת</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {REMINDER_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setReminderMinutes(o.value)}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                  border: reminderMinutes === o.value ? '1.5px solid var(--sky)' : '1.5px solid var(--border)',
                  background: reminderMinutes === o.value ? 'var(--sky-light)' : 'var(--bg-elevated)',
                  color: reminderMinutes === o.value ? 'var(--sky)' : 'var(--text-secondary)',
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">צבע</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {EVENT_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">הערות (לא חובה)</label>
          <textarea className="input" placeholder="פרטים נוספים..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
        {anyCalendarConnected && (
          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '18px' }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>סנכרן ליומן הטלפון</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {syncToPhone === null ? `ברירת מחדל: ${defaultSyncEnabled ? 'מסונכרן' : 'לא מסונכרן'}` : (syncToPhone ? 'מסונכרן' : 'לא מסונכרן')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncToPhone((v) => v === null ? !defaultSyncEnabled : (v ? false : null))}
                style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: (syncToPhone === null ? defaultSyncEnabled : syncToPhone) ? 'var(--mint)' : 'var(--border)' }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 3, right: (syncToPhone === null ? defaultSyncEnabled : syncToPhone) ? 3 : 23, transition: 'right 0.2s' }} />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── BUDGET ────────────────────────────────────────────────────────────────
const EXP_CATS = ['🍔 Food', '🚗 Transport', '🏠 Housing', '💊 Health', '👕 Shopping', '🎬 Entertainment', '💡 Utilities', '📱 Tech', '🎓 Education', '💸 Other']
const INC_CATS = ['💼 Salary', '💰 Freelance', '🎁 Gift', '📈 Investment', '💵 Other']

export function BudgetPage() {
  const { user, householdId } = useAuth()
  const now = new Date()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [type, setType] = useState('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('💸 Other')
  const [date, setDate] = useState(now.toISOString().split('T')[0])
  const [showToast, ToastEl] = useToast()

  const load = async () => {
    const data = await ExpenseDB.getForMonth(householdId, now.getFullYear(), now.getMonth())
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { if (householdId) load() }, [householdId])

  // Realtime: הוצאות והכנסות מסתנכרנות מיד לשני המשתמשים
  useRealtimeRefresh('expenses', load)

  const handleAdd = async () => {
    if (!description.trim() || !amount) return
    await ExpenseDB.add(householdId, user.id, description.trim(), amount, category, type, date)
    setDescription(''); setAmount(''); setCategory(type === 'expense' ? '💸 Other' : '💵 Other')
    setShowModal(false)
    showToast('Transaction added!')
    load()
  }

  const handleDelete = async (item) => {
    if (!confirmDelete(`Delete "${item.description}"?`)) return
    await ExpenseDB.delete(item.id)
    showToast('Deleted')
    load()
  }

  const income = items.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
  const expense = items.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
  const balance = income - expense
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = []
    acc[item.date].push(item)
    return acc
  }, {})

  return (
    <div>
      <PageHeader title="Budget" icon="💳" accent="var(--amber)" subtitle={monthLabel} action={() => setShowModal(true)} actionLabel="+ Add" actionColor="var(--amber)" />

      <div className="page" style={{ paddingTop: '20px' }}>
        {/* Summary */}
        <div className="budget-summary">
          <div className="budget-row">
            {[['Income', `$${income.toFixed(2)}`, 'var(--mint)'], ['Expenses', `$${expense.toFixed(2)}`, 'var(--coral)'], ['Balance', `$${balance.toFixed(2)}`, balance >= 0 ? 'var(--mint)' : 'var(--coral)']].map(([l, v, c]) => (
              <div key={l} className="budget-col">
                <div className="budget-amount" style={{ color: c }}>{v}</div>
                <div className="budget-label">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {loading
          ? <PageSpinner />
          : items.length === 0
          ? <EmptyState icon="💳" title="No transactions yet" subtitle="Tap + Add to record your first expense" />
          : Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(dk => (
            <div key={dk}>
              <div className="section-label">
                {new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              {grouped[dk].map(item => (
                <div key={item.id} className="list-item">
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: item.type === 'income' ? 'var(--mint-light)' : 'var(--coral-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                    {item.category.split(' ')[0]}
                  </div>
                  <div className="list-item-body">
                    <div className="list-item-title">{item.description}</div>
                    <div className="list-item-meta">{item.category}</div>
                    <div className="list-item-created">Added {timeAgo(item.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: item.type === 'income' ? 'var(--mint)' : 'var(--coral)' }}>
                      {item.type === 'income' ? '+' : '-'}${Number(item.amount).toFixed(2)}
                    </span>
                    <button onClick={() => handleDelete(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4 }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        }
      </div>

      {ToastEl}
      <button className="fab" style={{ background: 'var(--amber)' }} onClick={() => setShowModal(true)}>+</button>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Transaction" onSubmit={handleAdd} submitLabel="Add" submitColor="var(--amber)">
        <div className="type-toggle">
          {[['expense', '💸 Expense'], ['income', '💵 Income']].map(([k, l]) => (
            <button key={k} className="type-btn"
              style={type === k ? { borderColor: k === 'expense' ? 'var(--coral)' : 'var(--mint)', color: k === 'expense' ? 'var(--coral)' : 'var(--mint)', background: k === 'expense' ? 'var(--coral-light)' : 'var(--mint-light)' } : {}}
              onClick={() => { setType(k); setCategory(k === 'expense' ? '💸 Other' : '💵 Other') }}>{l}
            </button>
          ))}
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <input className="input" placeholder="What was this for?" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">Amount ($)</label>
          <input className="input" type="number" placeholder="0.00" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Date</label>
          <CalendarPicker value={date} onChange={setDate} accentColor="var(--amber)" />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(type === 'expense' ? EXP_CATS : INC_CATS).map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                style={{ padding: '6px 12px', borderRadius: '999px', border: `1.5px solid ${category === cat ? (type === 'expense' ? 'var(--coral)' : 'var(--mint)') : 'var(--border)'}`, background: category === cat ? (type === 'expense' ? 'var(--coral-light)' : 'var(--mint-light)') : 'var(--bg-elevated)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: category === cat ? (type === 'expense' ? 'var(--coral)' : 'var(--mint)') : 'var(--text-secondary)' }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
