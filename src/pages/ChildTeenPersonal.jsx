import { useState, useEffect, useCallback } from 'react'
import { HobbiesDB, WorkShiftsDB, PocketMoneyDB, ChildrenDB } from '../lib/db'
import { confirmDelete } from '../components/UI'

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
}
function fmtTime(t) { return t ? String(t).slice(0, 5) : '' }
function calcShiftHours(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return (mins / 60).toFixed(1)
}

const INPUT16 = { fontSize: '16px' }
const sheetStyle = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }
const sheetInner = {
  position: 'relative', width: '100%', background: 'var(--bg-card)',
  borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
  paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
  maxHeight: '92vh', overflowY: 'auto',
}
const cardStyle = {
  background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '12px',
}

// ── Default army prep checklist ───────────────────────────────────────────
const DEFAULT_ARMY_ITEMS = [
  { id: 'a1', title: 'צו ראשון',          done: false, date: null },
  { id: 'a2', title: 'יום בוחן',           done: false, date: null },
  { id: 'a3', title: 'מיון',               done: false, date: null },
  { id: 'a4', title: 'בדיקות רפואיות',     done: false, date: null },
  { id: 'a5', title: 'קבלת ספר גיוס',     done: false, date: null },
  { id: 'a6', title: 'מועד גיוס',          done: false, date: null },
]
const DEFAULT_DRIVING = {
  lessons: [],
  theory_test:    { date: null, status: 'not_done' },
  practical_test: { date: null, status: 'not_done' },
}
const TEST_STATUS = {
  not_done:  { label: 'טרם נבחן',  color: 'var(--text-muted)' },
  scheduled: { label: 'מתוכנן',    color: '#F59E0B' },
  passed:    { label: 'עבר ✓',     color: '#10B981' },
  failed:    { label: 'נכשל',      color: '#EF4444' },
}

const HOBBY_TYPES = [
  { key: 'hobby',       label: 'תחביב' },
  { key: 'work',        label: 'עבודה' },
  { key: 'volunteering',label: 'התנדבות' },
  { key: 'army_prep',   label: 'הכנה לצבא' },
  { key: 'other',       label: 'אחר' },
]
const MONEY_CATS = ['מזון', 'בגדים', 'בידור', 'תחבורה', 'אחר']

// ── SectionHeader ──────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, count, open, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
      padding: '12px 0', fontFamily: 'var(--font-body)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{emoji}</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {count > 0 && (
          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
            {count}
          </span>
        )}
      </div>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
    </button>
  )
}

// ── Hobbies Section ────────────────────────────────────────────────────────
function HobbiesSection({ child, householdId, showToast }) {
  const [items,   setItems]  = useState([])
  const [showAdd, setShowAdd]= useState(false)
  const [saving,  setSaving] = useState(false)
  const [form,    setForm]   = useState({ name: '', type: 'hobby', frequencyNotes: '' })

  const load = useCallback(async () => {
    const data = await HobbiesDB.getAll(child.id)
    setItems(data)
  }, [child.id])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await HobbiesDB.add(child.id, householdId, { ...form, name: form.name.trim() })
      setForm({ name: '', type: 'hobby', frequencyNotes: '' })
      setShowAdd(false)
      showToast('✓ נוסף')
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirmDelete('למחוק?')) return
    try { await HobbiesDB.delete(id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const TYPE_COLORS = {
    hobby: '#6C63FF', work: '#F59E0B', volunteering: '#10B981',
    army_prep: '#EF4444', other: 'var(--text-muted)',
  }

  return (
    <div dir="rtl">
      {items.length === 0 && !showAdd ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          לא נוספו תחביבים או עיסוקים עדיין
        </p>
      ) : (
        <div style={{ marginBottom: '10px' }}>
          {items.map(item => {
            const typeLabel = HOBBY_TYPES.find(t => t.key === item.type)?.label || item.type
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>{item.name}</span>
                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: TYPE_COLORS[item.type] + '22', color: TYPE_COLORS[item.type], fontWeight: 700 }}>
                      {typeLabel}
                    </span>
                  </div>
                  {item.frequency_notes ? <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.frequency_notes}</div> : null}
                </div>
                <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.3 }}>🗑️</button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd ? (
        <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '10px', direction: 'rtl', boxSizing: 'border-box' }}>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="שם (כדורגל, ריצה, DJ...)" style={{ ...INPUT16, marginBottom: '10px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} autoFocus />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', direction: 'rtl' }}>
            {HOBBY_TYPES.map(t => (
              <button key={t.key} onClick={() => setForm(f => ({ ...f, type: t.key }))}
                style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer',
                  border: form.type === t.key ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: form.type === t.key ? 'var(--primary-light)' : 'var(--bg-elevated)',
                  color: form.type === t.key ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }}>
                {t.label}
              </button>
            ))}
          </div>
          <input className="input" value={form.frequencyNotes} onChange={e => setForm(f => ({ ...f, frequencyNotes: e.target.value }))}
            placeholder="הערות (אופציונלי)" style={{ ...INPUT16, marginBottom: '12px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={handleAdd} disabled={saving || !form.name.trim()}>
              {saving ? '...' : '+ הוסף'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: '100%', marginBottom: '4px' }} onClick={() => setShowAdd(true)}>
          + הוסף תחביב / עיסוק
        </button>
      )}
    </div>
  )
}

// ── Work Shifts Section ───────────────────────────────────────────────────
function WorkShiftsSection({ child, householdId, showToast }) {
  const [items,   setItems]  = useState([])
  const [showAdd, setShowAdd]= useState(false)
  const [saving,  setSaving] = useState(false)
  const [form,    setForm]   = useState({ shiftDate: todayStr(), workplace: '', startTime: '', endTime: '', earnings: '', notes: '' })

  const load = useCallback(async () => {
    const data = await WorkShiftsDB.getAll(child.id)
    setItems(data)
  }, [child.id])

  useEffect(() => { load() }, [load])

  const totalThisMonth = (() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return items.filter(s => s.shift_date?.startsWith(ym) && s.earnings)
      .reduce((sum, s) => sum + parseFloat(s.earnings), 0)
  })()

  const handleAdd = async () => {
    if (!form.shiftDate) return
    setSaving(true)
    try {
      await WorkShiftsDB.add(child.id, householdId, form)
      setForm({ shiftDate: todayStr(), workplace: '', startTime: '', endTime: '', earnings: '', notes: '' })
      setShowAdd(false)
      showToast('✓ משמרת נוספה')
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirmDelete('למחוק משמרת?')) return
    try { await WorkShiftsDB.delete(id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  return (
    <div dir="rtl">
      {totalThisMonth > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(16,185,129,0.1)', border: '1px solid #10B981', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>💰</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>השתכרת החודש: ₪{totalThisMonth.toFixed(0)}</span>
        </div>
      )}
      {items.slice(0, 5).map(shift => {
        const hrs = calcShiftHours(shift.start_time, shift.end_time)
        return (
          <div key={shift.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{fmtDate(shift.shift_date)}{shift.workplace ? ` · ${shift.workplace}` : ''}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {fmtTime(shift.start_time)}{shift.end_time ? ` – ${fmtTime(shift.end_time)}` : ''}
                {hrs ? ` (${hrs} שעות)` : ''}
                {shift.earnings ? ` · ₪${parseFloat(shift.earnings).toFixed(0)}` : ''}
              </div>
            </div>
            <button onClick={() => handleDelete(shift.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.3 }}>🗑️</button>
          </div>
        )
      })}

      {showAdd ? (
        <div style={{ 
          padding: '16px', 
          background: 'var(--bg-elevated)', 
          borderRadius: 'var(--radius-md)', 
          marginTop: '10px', 
          direction: 'rtl', 
          boxSizing: 'border-box'
        }}>
          {/* Date */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>תאריך:</label>
            <input type="date" className="input" value={form.shiftDate}
              onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))}
              style={{ ...INPUT16, textAlign: 'right', direction: 'rtl' }} />
          </div>

          {/* Workplace */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>מקום עבודה:</label>
            <input className="input" value={form.workplace}
              onChange={e => setForm(f => ({ ...f, workplace: e.target.value }))}
              placeholder="שם המקום..." style={{ ...INPUT16, textAlign: 'right' }} />
          </div>

          {/* Start + End time row */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>כניסה:</label>
              <input type="time" className="input" value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                style={{ ...INPUT16, textAlign: 'center' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>יציאה:</label>
              <input type="time" className="input" value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                style={{ ...INPUT16, textAlign: 'center' }} />
            </div>
          </div>

          {/* Earnings */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>הכנסה (₪):</label>
            <input className="input" type="number" inputMode="decimal" value={form.earnings}
              onChange={e => setForm(f => ({ ...f, earnings: e.target.value }))}
              placeholder="0" style={{ ...INPUT16, textAlign: 'right' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }}
              onClick={handleAdd} disabled={saving || !form.shiftDate}>
              {saving ? '...' : '+ הוסף'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '8px' }} onClick={() => setShowAdd(true)}>
          + הוסף משמרת
        </button>
      )}
    </div>
  )
}

// ── Pocket Money Section ──────────────────────────────────────────────────
function PocketMoneySection({ child, householdId, showToast }) {
  const [items,   setItems]  = useState([])
  const [showAdd, setShowAdd]= useState(false)
  const [addType, setAddType]= useState('expense')
  const [saving,  setSaving] = useState(false)
  const [form,    setForm]   = useState({ type: 'expense', amount: '', description: '', category: '', entryDate: todayStr() })

  const load = useCallback(async () => {
    const data = await PocketMoneyDB.getAll(child.id)
    setItems(data)
  }, [child.id])

  useEffect(() => { load() }, [load])

  const balance = items.reduce((sum, i) => {
    if (i.type === 'allowance' || i.type === 'income') return sum + parseFloat(i.amount)
    if (i.type === 'expense') return sum - parseFloat(i.amount)
    return sum
  }, 0)

  const openAdd = (type) => {
    setAddType(type)
    setForm({ type, amount: '', description: '', category: '', entryDate: todayStr() })
    setShowAdd(true)
  }

  const handleAdd = async () => {
    if (!form.amount || !form.entryDate) return
    setSaving(true)
    try {
      await PocketMoneyDB.add(child.id, householdId, form)
      setShowAdd(false)
      showToast('✓ נוסף')
      load()
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try { await PocketMoneyDB.delete(id); showToast('✓ נמחק'); load() }
    catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const balanceColor = balance >= 0 ? '#10B981' : '#EF4444'

  return (
    <div dir="rtl">
      {/* Balance summary */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: balanceColor }}>₪{Math.abs(balance).toFixed(0)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{balance >= 0 ? 'יתרה' : 'חוב'}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: '#10B981' }}>
            ₪{items.filter(i => i.type === 'allowance' || i.type === 'income').reduce((s, i) => s + parseFloat(i.amount), 0).toFixed(0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>הכנסות</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: '#EF4444' }}>
            ₪{items.filter(i => i.type === 'expense').reduce((s, i) => s + parseFloat(i.amount), 0).toFixed(0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>הוצאות</div>
        </div>
      </div>

      {/* Recent entries */}
      {items.slice(0, 8).map(item => {
        const isIncome = item.type === 'allowance' || item.type === 'income'
        return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '16px' }}>{item.type === 'allowance' ? '💳' : isIncome ? '📥' : '📤'}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{item.description || (item.type === 'allowance' ? 'דמי כיס' : item.category || 'הוצאה')}</span>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmtDate(item.entry_date)}</div>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: isIncome ? '#10B981' : '#EF4444' }}>
              {isIncome ? '+' : '-'}₪{parseFloat(item.amount).toFixed(0)}
            </span>
            <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: 0.3 }}>✕</button>
          </div>
        )
      })}

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button className="btn" style={{ flex: 1, background: 'var(--primary)', color: '#fff' }} onClick={() => openAdd('allowance')}>+ דמי כיס</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => openAdd('expense')}>- הוצאה</button>
      </div>

      {/* Add sheet */}
      {showAdd && (
        <div style={sheetStyle}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAdd(false)} />
          <div style={sheetInner}>
            <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
            </div>
            <div style={{ padding: '10px 18px 22px', direction: 'rtl', boxSizing: 'border-box' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px', margin: '0 0 14px', textAlign: 'right' }}>
                {addType === 'allowance' ? '💳 הוספת דמי כיס' : addType === 'income' ? '📥 הכנסה' : '📤 הוצאה'}
              </h3>
              <input type="number" inputMode="decimal" className="input" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="סכום (₪)" style={{ ...INPUT16, marginBottom: '10px', textAlign: 'right', width: '100%', boxSizing: 'border-box' }} autoFocus />
              <input className="input" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="תיאור (אופציונלי)" style={{ ...INPUT16, marginBottom: '10px', textAlign: 'right', width: '100%', boxSizing: 'border-box' }} />
              {addType === 'expense' && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', direction: 'rtl' }}>
                  {MONEY_CATS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                      style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', border: form.category === c ? '2px solid var(--primary)' : '1px solid var(--border)', background: form.category === c ? 'var(--primary-light)' : 'var(--bg-elevated)', color: form.category === c ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>תאריך:</label>
                <input type="date" className="input" value={form.entryDate}
                  onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))}
                  style={{ ...INPUT16, textAlign: 'right', direction: 'rtl', width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div className="modal-actions">
                <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={handleAdd} disabled={saving || !form.amount}>
                  {saving ? '...' : '+ הוסף'}
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

// ── Army Prep Section ─────────────────────────────────────────────────────
function ArmyPrepSection({ child, showToast }) {
  const [data,     setData]    = useState(null)
  const [editNote, setEditNote]= useState(false)
  const [noteText, setNoteText]= useState('')
  const [saving,   setSaving]  = useState(false)

  const load = useCallback(async () => {
    const fresh = await ChildrenDB.getOne(child.id)
    const prep = fresh?.army_prep
    if (!prep || !prep.items) {
      setData({ items: DEFAULT_ARMY_ITEMS.map(i => ({ ...i })), notes: '' })
    } else {
      setData(prep)
    }
  }, [child.id])

  useEffect(() => { load() }, [load])

  const save = async (updated) => {
    try {
      await ChildrenDB.update(child.id, { army_prep: updated })
      setData(updated)
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const toggleItem = (id) => {
    if (!data) return
    const updated = { ...data, items: data.items.map(i => i.id === id ? { ...i, done: !i.done } : i) }
    save(updated)
  }

  const saveNote = async () => {
    setSaving(true)
    try { await save({ ...data, notes: noteText }); setEditNote(false); showToast('✓ נשמר') }
    finally { setSaving(false) }
  }

  if (!data) return null
  const doneCount = data.items.filter(i => i.done).length

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(doneCount / data.items.length) * 100}%`, background: 'var(--primary)', transition: 'width 0.3s', borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
          {doneCount}/{data.items.length}
        </span>
      </div>
      {data.items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
          onClick={() => toggleItem(item.id)}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            border: item.done ? '2px solid #10B981' : '2px solid var(--border)',
            background: item.done ? '#10B981' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {item.done && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>
            {item.title}
          </span>
        </div>
      ))}
      {editNote ? (
        <div style={{ marginTop: '12px' }}>
          <textarea className="input" value={noteText} onChange={e => setNoteText(e.target.value)}
            rows={3} placeholder="הערות חופשיות..." style={{ fontSize: '16px', resize: 'vertical', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={saveNote} disabled={saving}>{saving ? '...' : '✓ שמור'}</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditNote(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '10px' }}
          onClick={() => { setNoteText(data.notes || ''); setEditNote(true) }}>
          {data.notes ? '📝 ' + data.notes.slice(0, 40) + (data.notes.length > 40 ? '...' : '') : '+ הוסף הערות'}
        </button>
      )}
    </div>
  )
}

// ── Driving Log Section ───────────────────────────────────────────────────
function DrivingSection({ child, showToast }) {
  const [data,    setData]   = useState(null)
  const [showAdd, setShowAdd]= useState(false)
  const [lessonDate, setLessonDate] = useState(todayStr())
  const [lessonNotes, setLessonNotes]= useState('')
  const [saving, setSaving]  = useState(false)

  const load = useCallback(async () => {
    const fresh = await ChildrenDB.getOne(child.id)
    const dl = fresh?.driving_log
    if (!dl || !dl.lessons) { setData({ ...DEFAULT_DRIVING, lessons: [] }) }
    else setData(dl)
  }, [child.id])

  useEffect(() => { load() }, [load])

  const save = async (updated) => {
    try {
      await ChildrenDB.update(child.id, { driving_log: updated })
      setData(updated)
    } catch (e) { showToast('❌ שגיאה: ' + e.message) }
  }

  const addLesson = async () => {
    if (!lessonDate) return
    setSaving(true)
    try {
      const newLesson = { id: Date.now().toString(), date: lessonDate, notes: lessonNotes }
      const updated = { ...data, lessons: [newLesson, ...(data.lessons || [])] }
      await save(updated)
      setShowAdd(false)
      setLessonDate(todayStr())
      setLessonNotes('')
      showToast('✓ שיעור נוסף')
    } finally { setSaving(false) }
  }

  const updateTestStatus = async (testKey, status) => {
    const updated = { ...data, [testKey]: { ...(data[testKey] || {}), status } }
    await save(updated)
  }

  const updateTestDate = async (testKey, date) => {
    const updated = { ...data, [testKey]: { ...(data[testKey] || {}), date } }
    await save(updated)
  }

  if (!data) return null

  const TEST_KEYS = [
    { key: 'theory_test', label: 'טסט תיאוריה' },
    { key: 'practical_test', label: 'מבחן נהיגה' },
  ]

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: 'var(--primary)' }}>{(data.lessons || []).length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>שיעורים</div>
        </div>
        {TEST_KEYS.map(({ key, label }) => {
          const t = data[key] || {}
          const meta = TEST_STATUS[t.status || 'not_done']
          return (
            <div key={key} style={{ flex: 1, padding: '8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <select value={t.status || 'not_done'} onChange={e => updateTestStatus(key, e.target.value)}
                  style={{ fontSize: '11px', fontWeight: 700, color: meta.color, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0 }}>
                  {Object.entries(TEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="date" value={t.date || ''} onChange={e => updateTestDate(key, e.target.value)}
                  dir="ltr" style={{ fontSize: '10px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', padding: 0, width: '100%' }} />
              </div>
            </div>
          )
        })}
      </div>

      {(data.lessons || []).slice(0, 5).map(l => (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '14px' }}>🚗</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{fmtDate(l.date)}</span>
            {l.notes ? <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '8px' }}> · {l.notes}</span> : null}
          </div>
        </div>
      ))}

      {showAdd ? (
        <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginTop: '10px', direction: 'rtl', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px', textAlign: 'right' }}>תאריך:</label>
            <input type="date" className="input" value={lessonDate} onChange={e => setLessonDate(e.target.value)}
              style={{ ...INPUT16, textAlign: 'right', direction: 'rtl', width: '100%', boxSizing: 'border-box' }} autoFocus />
          </div>
          <input className="input" value={lessonNotes} onChange={e => setLessonNotes(e.target.value)}
            placeholder="הערות (אופציונלי)" style={{ ...INPUT16, marginBottom: '12px', textAlign: 'right', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 2, background: 'var(--primary)', color: '#fff' }} onClick={addLesson} disabled={saving || !lessonDate}>{saving ? '...' : '+ הוסף'}</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '8px' }} onClick={() => setShowAdd(true)}>
          + הוסף שיעור נהיגה
        </button>
      )}
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────
export default function ChildTeenPersonal({ child, householdId, showToast, rangeKey }) {
  const [open, setOpen] = useState({ hobbies: true, work: false, money: false, army: false, driving: false })
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))

  const isTeenager = rangeKey === 'teenager'

  return (
    <div style={{ paddingTop: '8px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
        {isTeenager
          ? 'הסקשן האישי שלך — מה שחשוב לך, רק בשבילך.'
          : 'מעקב תקציב ודמי כיס — ניהול עצמאי.'}
      </p>

      {/* תחביבים — only for teenagers */}
      {isTeenager && (
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <SectionHeader emoji="🎨" title="תחביבים והתעסקות" count={0} open={open.hobbies} onToggle={() => toggle('hobbies')} />
          {open.hobbies && <div style={{ paddingBottom: '12px' }}><HobbiesSection child={child} householdId={householdId} showToast={showToast} /></div>}
        </div>
      )}

      {/* עבודה — only for teenagers */}
      {isTeenager && (
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <SectionHeader emoji="💼" title="עבודה ומשמרות" count={0} open={open.work} onToggle={() => toggle('work')} />
          {open.work && <div style={{ paddingBottom: '12px' }}><WorkShiftsSection child={child} householdId={householdId} showToast={showToast} /></div>}
        </div>
      )}

      {/* תקציב כיס — preteen + teenager */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
        <SectionHeader emoji="💰" title="תקציב כיס" count={0} open={open.money} onToggle={() => toggle('money')} />
        {open.money && <div style={{ paddingBottom: '12px' }}><PocketMoneySection child={child} householdId={householdId} showToast={showToast} /></div>}
      </div>

      {/* הכנה לצבא — only for teenagers */}
      {isTeenager && (
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <SectionHeader emoji="🎖️" title="הכנה לצבא / שירות לאומי" count={0} open={open.army} onToggle={() => toggle('army')} />
          {open.army && <div style={{ paddingBottom: '12px' }}><ArmyPrepSection child={child} showToast={showToast} /></div>}
        </div>
      )}

      {/* רישיון נהיגה — only for teenagers */}
      {isTeenager && (
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <SectionHeader emoji="🚗" title="רישיון נהיגה" count={0} open={open.driving} onToggle={() => toggle('driving')} />
          {open.driving && <div style={{ paddingBottom: '12px' }}><DrivingSection child={child} showToast={showToast} /></div>}
        </div>
      )}
    </div>
  )
}
