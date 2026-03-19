import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '../lib/theme.jsx'

// ── Modal ─────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, onSubmit, submitLabel = 'Save', submitColor = 'var(--primary)', children }) {
  useEffect(() => {
    if (!open) return
    // כשמקלדת עולה — גלול את ה-input לתצוגה
    const handleFocus = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    }
    document.addEventListener('focus', handleFocus, true)
    return () => document.removeEventListener('focus', handleFocus, true)
  }, [open])

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
        <div className="modal-actions">
          <button className="btn" style={{ flex: 2, background: submitColor, color: '#fff' }} onClick={onSubmit}>{submitLabel}</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────
export function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [])
  return <div className="toast">{message}</div>
}

export function useToast() {
  const [toast, setToast] = useState(null)
  const show = (msg) => setToast(msg)
  const ToastEl = toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null
  return [show, ToastEl]
}

// ── Calendar Picker ───────────────────────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function CalendarPicker({ value, onChange, accentColor = 'var(--primary)' }) {
  const today = new Date()
  const initial = value ? new Date(value + 'T00:00:00') : today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()

  const dateStr = d => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const isSelected = d => value === dateStr(d)
  const isToday = d => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d
  const isPast = d => new Date(dateStr(d)) < new Date(today.toDateString())

  const prevMonth = () => { viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1) }
  const nextMonth = () => { viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1) }

  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '16px', border: '1px solid var(--border)' }}>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}>‹</button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}>›</button>
      </div>
      {/* Day headers */}
      <div className="cal-grid" style={{ marginBottom: '4px' }}>
        {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
      </div>
      {/* Cells */}
      <div className="cal-grid">
        {cells.map((d, i) => (
          <button
            key={i}
            className={`cal-cell ${d && isSelected(d) ? 'selected' : ''} ${d && isToday(d) && !isSelected(d) ? 'today' : ''} ${d && isPast(d) && !isToday(d) ? 'past' : ''}`}
            style={d && isSelected(d) ? { background: accentColor } : {}}
            onClick={() => d && onChange(dateStr(d))}
            disabled={!d}
          >
            {d || ''}
          </button>
        ))}
      </div>
      {/* Selected display */}
      {value && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: accentColor + '15', border: `1px solid ${accentColor}40` }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: accentColor }}>
            📅 {new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accentColor, fontWeight: 700, fontSize: '14px' }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle, action, actionLabel }) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {action && <button className="btn btn-ghost" style={{ marginTop: '16px' }} onClick={action}>{actionLabel}</button>}
    </div>
  )
}

// ── Page Header ───────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, accent, icon, action, actionLabel, actionColor }) {
  return (
    <div className="page-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="page-header-accent" style={{ background: accent }} />
          <div>
            <h1 className="page-title">{icon && <span>{icon}</span>}{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>
        {action && (
          <button className="btn btn-sm" style={{ background: actionColor || accent, color: '#fff' }} onClick={action}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Confirm delete (web native) ───────────────────────────────────────────
export function confirmDelete(message) {
  return window.confirm(message || 'Delete this item?')
}

// ── Offline Banner ────────────────────────────────────────────────────────
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (isOnline) return null

  return (
    <div style={{
      background: 'var(--amber)',
      color: '#000',
      textAlign: 'center',
      padding: '6px 16px',
      fontSize: '13px',
      fontWeight: 600,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      ⚠️ אין חיבור לאינטרנט — מציג נתונים שמורים
    </div>
  )
}

// ── Theme Toggle ──────────────────────────────────────────────────────────
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options = [
    { value: 'dark',   label: '🌙 כהה' },
    { value: 'light',  label: '☀️ בהיר' },
    { value: 'system', label: '⚙️ לפי מכשיר' },
  ]

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`btn btn-sm ${theme === opt.value ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTheme(opt.value)}
          style={theme === opt.value ? { background: 'var(--primary)', color: '#fff' } : {}}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
