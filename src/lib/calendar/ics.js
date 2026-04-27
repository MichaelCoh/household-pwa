/**
 * ics.js
 * ─────────────────────────────────────────────────────────────────
 * RFC 5545 ICS generation + parsing.
 *
 * The generator is used for Tier 3 (manual export).
 * The parser is used for Tier 3 import — accepts a .ics file from any
 * external calendar (Apple Calendar, Outlook, etc.) and turns the events
 * into rows ready to insert into `events` or `imported_calendar_events`.
 *
 * The server-side ICS feed (Tier 2) lives in
 *   supabase/functions/calendar-feed/index.ts
 * and uses an equivalent generator. We keep client-side generation here
 * for the offline-friendly download path.
 */

const TZ = 'Asia/Jerusalem'

function pad(n) { return String(n).padStart(2, '0') }

function escapeText(s) {
  if (!s) return ''
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function unescapeText(s) {
  if (!s) return ''
  return String(s)
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function fold(line) {
  if (line.length <= 73) return line
  const out = [line.slice(0, 73)]
  let s = line.slice(73)
  while (s.length > 0) { out.push(' ' + s.slice(0, 72)); s = s.slice(72) }
  return out.join('\r\n')
}

function dateToICS(dateStr) { return dateStr.replace(/-/g, '') }
function dateTimeToICS(dateStr, timeStr) {
  return `${dateStr.replace(/-/g, '')}T${(timeStr || '00:00').replace(':', '')}00`
}

function nowUTC() {
  const d = new Date()
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  )
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function recurrenceToRRULE(recurrence, interval, weekday, endDate = null) {
  const n = Math.max(1, parseInt(interval, 10) || 1)
  // RFC 5545 UNTIL is exclusive at the time level; for date-only recurrences we
  // bound by end-of-day so the final occurrence is included.
  const untilSuffix = endDate
    ? `;UNTIL=${String(endDate).replace(/-/g, '')}T235959Z`
    : ''
  switch (recurrence) {
    case 'daily': return `FREQ=DAILY;INTERVAL=${n}${untilSuffix}`
    case 'weekly': {
      if (weekday != null && weekday >= 0 && weekday <= 6) {
        const map = ['SU','MO','TU','WE','TH','FR','SA']
        return `FREQ=WEEKLY;INTERVAL=${n};BYDAY=${map[weekday]}${untilSuffix}`
      }
      return `FREQ=WEEKLY;INTERVAL=${n}${untilSuffix}`
    }
    case 'monthly': return `FREQ=MONTHLY;INTERVAL=${n}${untilSuffix}`
    case 'yearly':  return `FREQ=YEARLY;INTERVAL=${n}${untilSuffix}`
    case 'custom':  return `FREQ=DAILY;INTERVAL=${n}${untilSuffix}`
    default: return null
  }
}

/**
 * Generate an ICS file body (string) from app events + tasks.
 * @param {{events: Array, tasks: Array, appOrigin?: string, calendarName?: string}} input
 * @returns {string}
 */
export function generateICS({ events = [], tasks = [], appOrigin = '', calendarName = 'הבית שלנו' } = {}) {
  const lines = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Household App//Calendar Export//HE')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`)
  lines.push('X-WR-TIMEZONE:Asia/Jerusalem')

  const dtstamp = nowUTC()

  for (const e of events) {
    if (e.sync_to_phone === false) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:event-${e.id}@household-app`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(fold(`SUMMARY:${escapeText(e.title || '(ללא כותרת)')}`))
    const allDay = !!e.all_day || !e.time
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateToICS(e.date)}`)
      const endExclusive = addDays(e.end_date || e.date, 1)
      lines.push(`DTEND;VALUE=DATE:${dateToICS(endExclusive)}`)
    } else {
      lines.push(`DTSTART;TZID=${TZ}:${dateTimeToICS(e.date, e.time)}`)
      const endDate = e.end_date || e.date
      const endTime = e.end_time || e.time
      lines.push(`DTEND;TZID=${TZ}:${dateTimeToICS(endDate, endTime)}`)
    }
    const desc = []
    if (e.notes) desc.push(e.notes)
    if (appOrigin) desc.push(`${appOrigin}/calendar`)
    if (desc.length) lines.push(fold(`DESCRIPTION:${escapeText(desc.join('\n'))}`))
    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`))
    if (e.color)    lines.push(`COLOR:${escapeText(e.color)}`)
    const rrule = recurrenceToRRULE(e.recurrence, e.recurrence_interval || 1, null, e.recurrence_end_date)
    if (rrule) lines.push(`RRULE:${rrule}`)
    if (e.reminder_minutes != null) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${escapeText(e.title || '')}`)
      lines.push(`TRIGGER:-PT${Math.max(0, parseInt(e.reminder_minutes, 10) || 0)}M`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  for (const t of tasks) {
    if (t.sync_to_phone === false) continue
    if (t.done || !t.due_date) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:task-${t.id}@household-app`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(fold(`SUMMARY:✅ ${escapeText(t.title || '(משימה)')}`))
    if (t.reminder_time) {
      const time = String(t.reminder_time).slice(0, 5)
      lines.push(`DTSTART;TZID=${TZ}:${dateTimeToICS(t.due_date, time)}`)
      const [hh, mm] = time.split(':').map((x) => parseInt(x, 10))
      const total = hh * 60 + mm + 30
      const endTime = `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
      lines.push(`DTEND;TZID=${TZ}:${dateTimeToICS(t.due_date, endTime)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateToICS(t.due_date)}`)
      lines.push(`DTEND;VALUE=DATE:${dateToICS(addDays(t.due_date, 1))}`)
    }
    const desc = ['(משימה מאפליקציית הבית)']
    if (t.notes) desc.push(t.notes)
    if (appOrigin) desc.push(`${appOrigin}/tasks`)
    lines.push(fold(`DESCRIPTION:${escapeText(desc.join('\n'))}`))
    const rrule = recurrenceToRRULE(t.recurrence, t.recurrence_interval || 1, t.recurrence_weekday, t.recurrence_end_date)
    if (rrule) lines.push(`RRULE:${rrule}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/**
 * Trigger a download of the given ICS body in the browser.
 */
export function downloadICS(body, filename = 'home-calendar.ics') {
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 200)
}

// ── Parser ──────────────────────────────────────────────────────────────────

function unfoldLines(text) {
  // RFC 5545 line unfolding: a CRLF followed by a space/tab = continuation.
  return text.replace(/\r?\n[ \t]/g, '')
}

function parseICSDateTime(value, params) {
  // value: 20260427T180000 or 20260427T180000Z or 20260427
  // returns { date: 'YYYY-MM-DD', time: 'HH:MM' | null, allDay: boolean }
  const isDateOnly = /^\d{8}$/.test(value) || params?.VALUE === 'DATE'
  if (isDateOnly) {
    const v = value.replace(/[^0-9]/g, '').slice(0, 8)
    return {
      date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`,
      time: null,
      allDay: true,
    }
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  let date = `${m[1]}-${m[2]}-${m[3]}`
  let time = `${m[4]}:${m[5]}`
  if (m[7] === 'Z') {
    // UTC → convert to local
    const d = new Date(`${date}T${time}:00Z`)
    date = d.toISOString().slice(0, 10)
    time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return { date, time, allDay: false }
}

/**
 * Parse an ICS file body into a list of plain event objects.
 * @returns {Array<{uid, title, description, location, date, time, end_date, end_time, all_day, recurrence_rule, raw}>}
 */
export function parseICS(body) {
  const text = unfoldLines(String(body || ''))
  const lines = text.split(/\r?\n/)
  const events = []
  let cur = null

  for (const raw of lines) {
    if (!raw) continue
    if (raw === 'BEGIN:VEVENT') { cur = { raw: {} }; continue }
    if (raw === 'END:VEVENT') {
      if (cur && cur.uid && cur.date) events.push(cur)
      cur = null
      continue
    }
    if (!cur) continue

    // Property line: NAME[;PARAMS]:VALUE
    const colon = raw.indexOf(':')
    if (colon < 0) continue
    const head = raw.slice(0, colon)
    const value = raw.slice(colon + 1)
    const [name, ...paramsRaw] = head.split(';')
    const params = {}
    for (const p of paramsRaw) {
      const [k, v] = p.split('=')
      if (k && v) params[k.toUpperCase()] = v
    }
    cur.raw[name.toUpperCase()] = { value, params }

    switch (name.toUpperCase()) {
      case 'UID':         cur.uid = value; break
      case 'SUMMARY':     cur.title = unescapeText(value); break
      case 'DESCRIPTION': cur.description = unescapeText(value); break
      case 'LOCATION':    cur.location = unescapeText(value); break
      case 'DTSTART': {
        const p = parseICSDateTime(value, params)
        if (p) { cur.date = p.date; cur.time = p.time; cur.all_day = p.allDay }
        break
      }
      case 'DTEND': {
        const p = parseICSDateTime(value, params)
        if (p) { cur.end_date = p.date; cur.end_time = p.time }
        break
      }
      case 'RRULE':       cur.recurrence_rule = value; break
      default: break
    }
  }

  return events
}
