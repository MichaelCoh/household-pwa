import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { EventDB, ExpenseDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, CalendarPicker, useToast, confirmDelete, PageSpinner } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'

// ── CALENDAR ──────────────────────────────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const EVENT_COLORS = ['#5B6AF0', '#00BFA5', '#FF5A5A', '#FF9500', '#9C6FFF', '#2196F3', '#34C759', '#FF6B9D']

export function CalendarPage() {
  const { user, householdId } = useAuth()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0])
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [color, setColor] = useState('#5B6AF0')
  const [notes, setNotes] = useState('')
  const [showToast, ToastEl] = useToast()
  const [formError, setFormError] = useState('')
  const [modalDate, setModalDate] = useState(now.toISOString().split('T')[0])

  const load = async (yr = viewYear, mo = viewMonth) => {
    const data = await EventDB.getForMonth(householdId, yr, mo)
    setEvents(data)
    setLoading(false)
  }

  useEffect(() => { if (householdId) load(viewYear, viewMonth) }, [householdId, viewYear, viewMonth])

  // Realtime: אירועים מסתנכרנים מיד לשני המשתמשים
  useRealtimeRefresh('events', load)

  const openModal = (date) => {
    // אתחול המודאל עם התאריך הנבחר (או היום)
    const d = date || selectedDate || now.toISOString().split('T')[0]
    setModalDate(d)
    setTitle(''); setTime(''); setNotes(''); setColor('#5B6AF0'); setFormError('')
    setShowModal(true)
  }

  const handleAdd = async () => {
    setFormError('')
    if (!title.trim()) { setFormError('יש להזין כותרת לאירוע'); return }
    if (!modalDate) { setFormError('יש לבחור תאריך'); return }
    try {
      await EventDB.add(householdId, user.id, title.trim(), modalDate, time || null, color, notes.trim())
      // קפוץ לחודש של האירוע שנוסף וטען עם הערכים הנכונים
      const eventDate = new Date(modalDate + 'T00:00:00')
      const eYear = eventDate.getFullYear()
      const eMonth = eventDate.getMonth()
      setViewYear(eYear)
      setViewMonth(eMonth)
      setSelectedDate(modalDate)
      setTitle(''); setTime(''); setNotes(''); setColor('#5B6AF0'); setFormError('')
      setShowModal(false)
      showToast('✓ האירוע נוסף')
      load(eYear, eMonth)
    } catch (e) {
      setFormError('שגיאה בשמירה: ' + e.message)
    }
  }

  const handleDelete = async (e) => {
    if (!confirmDelete(`Delete "${e.title}"?`)) return
    await EventDB.delete(e.id)
    showToast('Event deleted')
    load()
  }

  const prevMonth = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const dateStr = d => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const hasEvent = d => events.some(e => e.date === dateStr(d))
  const isToday = d => now.getFullYear() === viewYear && now.getMonth() === viewMonth && now.getDate() === d
  const isSelected = d => selectedDate === dateStr(d)

  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const selectedEvents = events.filter(e => e.date === selectedDate)

  return (
    <div>
      <PageHeader title="Calendar" icon="📅" accent="var(--sky)" subtitle={`${MONTHS[viewMonth]} ${viewYear}`} action={() => openModal()} actionLabel="+ Add Event" actionColor="var(--sky)" />

      <div className="page" style={{ paddingTop: '20px' }}>
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
          : selectedEvents.length === 0
          ? <div className="card" style={{ padding: '16px', textAlign: 'center' }}><p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No events · tap "+ Add" to create one</p></div>
          : selectedEvents.map(e => (
            <div key={e.id} className="list-item">
              <div style={{ width: 4, minHeight: 40, borderRadius: 2, background: e.color, flexShrink: 0 }} />
              <div className="list-item-body">
                <div className="list-item-title">{e.title}</div>
                {e.time && <div className="list-item-meta">🕐 {e.time}</div>}
                {e.notes && <div className="list-item-meta">📝 {e.notes}</div>}
                <div className="list-item-created">Created {timeAgo(e.created_at)}</div>
              </div>
              <button onClick={() => handleDelete(e)} className="btn btn-ghost btn-sm btn-icon">🗑️</button>
            </div>
          ))
        }
      </div>

      {ToastEl}
      <button className="fab" style={{ background: 'var(--sky)' }} onClick={() => openModal()}>+</button>

      <Modal open={showModal} onClose={() => { setShowModal(false); setFormError('') }} title="אירוע חדש" onSubmit={handleAdd} submitLabel="הוסף אירוע" submitColor="var(--sky)">
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
          <label className="input-label">Time (optional)</label>
          <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Color</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {EVENT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Notes (optional)</label>
          <textarea className="input" placeholder="Add details..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
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
