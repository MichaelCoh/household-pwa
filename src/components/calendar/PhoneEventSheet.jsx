/**
 * PhoneEventSheet
 * Read-only bottom sheet for an imported_calendar_events row.
 * Shows full details + "פתח ביומן" deep-link to the native calendar app.
 *
 * iOS doesn't support web → Apple Calendar deep linking from a non-installed
 * PWA, so we fall back to clear instructions when needed.
 */

import { isIOS } from '../../lib/calendar/platform'

function fmtRange(ev) {
  if (!ev) return ''
  const dStart = new Date(ev.date + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
  if (ev.all_day || !ev.time) return dStart
  const t = ev.time
  const tEnd = ev.end_time && ev.end_time !== ev.time ? ` – ${ev.end_time}` : ''
  if (ev.end_date && ev.end_date !== ev.date) {
    const dEnd = new Date(ev.end_date + 'T00:00:00').toLocaleDateString('he-IL', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    return `${dStart} ${t} – ${dEnd}${tEnd}`
  }
  return `${dStart} · ${t}${tEnd}`
}

function deepLinkLabel(source) {
  if (source === 'google') return '📅 פתח ב-Google Calendar'
  return '📅 פתח באפליקציית היומן'
}

function deepLinkHref(ev) {
  if (!ev) return null
  if (ev.html_link) return ev.html_link
  if (ev.source === 'google' && ev.source_event_id) {
    return `https://calendar.google.com/calendar/u/0/r/eventedit/${ev.source_event_id}`
  }
  return null
}

export default function PhoneEventSheet({ event, onClose }) {
  if (!event) return null
  const href = deepLinkHref(event)
  const sourceLabel = event.source === 'google'
    ? `Google Calendar · ${event.source_calendar_name || ''}`
    : 'יומן חיצוני'

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h2 className="modal-title">{event.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <span className="pill" style={{
            background: event.source === 'google' ? '#4285F410' : 'var(--bg-elevated)',
            color: event.source === 'google' ? '#4285F4' : 'var(--text-secondary)',
            border: `1px solid ${event.source === 'google' ? '#4285F440' : 'var(--border)'}`,
          }}>
            {sourceLabel}
          </span>
        </div>

        <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            📅 מתי
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{fmtRange(event)}</div>
        </div>

        {event.location && (
          <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              📍 מיקום
            </div>
            <div style={{ fontSize: '14px' }}>{event.location}</div>
          </div>
        )}

        {event.description && (
          <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              📝 פרטים
            </div>
            <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {event.description}
            </div>
          </div>
        )}

        {event.recurrence_rule && (
          <div className="card" style={{ padding: '12px 14px', marginBottom: '14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            🔁 אירוע חוזר
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ flex: 2, background: 'var(--sky)', color: '#fff', textDecoration: 'none' }}
            >
              {deepLinkLabel(event.source)}
            </a>
          ) : (
            <div style={{
              flex: 2,
              padding: '11px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--amber-light)',
              color: 'var(--amber)',
              fontSize: '13px',
              textAlign: 'center',
            }}>
              {isIOS
                ? 'פתח את אפליקציית היומן ידנית כדי לראות את האירוע'
                : 'אין קישור חיצוני זמין לאירוע זה'}
            </div>
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  )
}
