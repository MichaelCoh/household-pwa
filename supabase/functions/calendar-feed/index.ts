// Public ICS calendar feed (Tier 2 — webcal:// subscription).
//
// Native calendar apps (Apple Calendar, Google Calendar, Outlook) subscribe to
//   webcal://<project>.functions.supabase.co/functions/v1/calendar-feed/<token>.ics
// and poll periodically. There is no JWT — auth is the random token in the URL.
// Rotating the token in calendar_connections.feed_token immediately invalidates
// every existing subscription.
//
// This function is configured with verify_jwt = false in supabase/config.toml.
//
// Returns RFC 5545 compliant text/calendar with VEVENT entries for:
//   • app events (table `events`)
//   • app tasks with a due_date (table `tasks`)
// Privacy: NO baby logs, expenses, or other sensitive data is ever included.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

// ── ICS helpers (RFC 5545) ──────────────────────────────────────────────────

function escapeText(s: string): string {
  if (!s) return ''
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines per RFC 5545 (max 75 octets per line, continued by CRLF + space).
function fold(line: string): string {
  if (line.length <= 73) return line
  const out: string[] = []
  let s = line
  // First line: 75 chars max
  out.push(s.slice(0, 73))
  s = s.slice(73)
  // Continuation lines: 74 (1 leading space)
  while (s.length > 0) {
    out.push(' ' + s.slice(0, 72))
    s = s.slice(72)
  }
  return out.join('\r\n')
}

function dateToICS(dateStr: string): string {
  // YYYY-MM-DD → YYYYMMDD (date-only)
  return dateStr.replace(/-/g, '')
}

function dateTimeToICS(dateStr: string, timeStr: string, tz = 'Asia/Jerusalem'): {
  start: string; tzid: string
} {
  // dateStr YYYY-MM-DD, timeStr HH:MM → YYYYMMDDTHHMMSS in TZID=Asia/Jerusalem
  const d = dateStr.replace(/-/g, '')
  const t = timeStr.replace(':', '') + '00'
  return { start: `${d}T${t}`, tzid: tz }
}

function rfc5545Now(): string {
  const d = new Date()
  return (
    d.getUTCFullYear().toString().padStart(4, '0') +
    (d.getUTCMonth() + 1).toString().padStart(2, '0') +
    d.getUTCDate().toString().padStart(2, '0') +
    'T' +
    d.getUTCHours().toString().padStart(2, '0') +
    d.getUTCMinutes().toString().padStart(2, '0') +
    d.getUTCSeconds().toString().padStart(2, '0') +
    'Z'
  )
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function recurrenceToRRULE(
  recurrence: string | null,
  interval: number,
  weekday: number | null,
  endDate: string | null = null,
): string | null {
  const n = Math.max(1, interval | 0 || 1)
  // RFC 5545 UNTIL is exclusive; bound by end-of-day so the final occurrence is included.
  const untilSuffix = endDate
    ? `;UNTIL=${String(endDate).replace(/-/g, '')}T235959Z`
    : ''
  switch (recurrence) {
    case 'daily':
      return `FREQ=DAILY;INTERVAL=${n}${untilSuffix}`
    case 'weekly': {
      if (weekday != null && weekday >= 0 && weekday <= 6) {
        const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
        return `FREQ=WEEKLY;INTERVAL=${n};BYDAY=${map[weekday]}${untilSuffix}`
      }
      return `FREQ=WEEKLY;INTERVAL=${n}${untilSuffix}`
    }
    case 'monthly':
      return `FREQ=MONTHLY;INTERVAL=${n}${untilSuffix}`
    case 'yearly':
      return `FREQ=YEARLY;INTERVAL=${n}${untilSuffix}`
    case 'custom':
      return `FREQ=DAILY;INTERVAL=${n}${untilSuffix}`
    default:
      return null
  }
}

function valarmBlock(minutesBefore: number, summary: string): string[] {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER:-PT${Math.max(0, minutesBefore | 0)}M`,
    'END:VALARM',
  ]
}

// ── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Token can be supplied either as ?token=… or as the last path segment
  // (with or without .ics suffix). The latter form is what webcal:// subscribers
  // use because some calendar apps strip query strings.
  const url = new URL(req.url)
  let token = url.searchParams.get('token') || ''
  if (!token) {
    const parts = url.pathname.split('/').filter(Boolean)
    const tail = parts[parts.length - 1] || ''
    token = tail.replace(/\.ics$/i, '')
    // The first path segment is always 'calendar-feed'; if tail equals that,
    // there is no token in the path.
    if (token === 'calendar-feed') token = ''
  }

  if (!token || token.length < 16) {
    return new Response('missing or invalid token', { status: 400, headers: cors })
  }

  // Look up the connection by feed token.
  const { data: conn, error: connErr } = await supabase
    .from('calendar_connections')
    .select('id, user_id, household_id, provider')
    .eq('feed_token', token)
    .maybeSingle()

  if (connErr || !conn) {
    return new Response('not found', { status: 404, headers: cors })
  }

  // Pull events + tasks for the household. We only return reasonably-current data
  // (90 days back to 2 years forward) so the file stays small and fast.
  const today = new Date()
  const fromDate = new Date(today); fromDate.setDate(fromDate.getDate() - 90)
  const toDate = new Date(today);   toDate.setFullYear(toDate.getFullYear() + 2)
  const fromStr = fromDate.toISOString().slice(0, 10)
  const toStr = toDate.toISOString().slice(0, 10)

  const [{ data: events }, { data: tasks }] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, date, end_date, time, end_time, all_day, color, notes, location, recurrence, recurrence_interval, recurrence_end_date, reminder_minutes, created_at')
      .eq('household_id', conn.household_id)
      .gte('date', fromStr)
      .lte('date', toStr),
    supabase
      .from('tasks')
      .select('id, title, due_date, notes, recurrence, recurrence_interval, recurrence_weekday, recurrence_end_date, reminder_time, reminder_enabled, done')
      .eq('household_id', conn.household_id)
      .not('due_date', 'is', null)
      .gte('due_date', fromStr)
      .lte('due_date', toStr),
  ])

  const appOrigin = Deno.env.get('APP_PUBLIC_URL') || ''
  const calendarName = 'הבית שלנו'

  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Household App//Calendar Sync//HE')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`)
  lines.push('X-WR-TIMEZONE:Asia/Jerusalem')
  lines.push(`NAME:${escapeText(calendarName)}`)
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT15M')
  lines.push('X-PUBLISHED-TTL:PT15M')

  const dtstamp = rfc5545Now()

  // EVENTS
  for (const e of events ?? []) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:event-${e.id}@household-app`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(fold(`SUMMARY:${escapeText(e.title || '(ללא כותרת)')}`))

    const allDay = !!e.all_day || !e.time
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateToICS(e.date)}`)
      // For all-day, DTEND is exclusive (next day).
      const endExclusive = e.end_date ? addDays(e.end_date, 1) : addDays(e.date, 1)
      lines.push(`DTEND;VALUE=DATE:${dateToICS(endExclusive)}`)
    } else {
      const { start, tzid } = dateTimeToICS(e.date, e.time as string)
      lines.push(`DTSTART;TZID=${tzid}:${start}`)
      const endDate = e.end_date || e.date
      const endTime = e.end_time || e.time
      const { start: endVal } = dateTimeToICS(endDate, endTime as string)
      lines.push(`DTEND;TZID=${tzid}:${endVal}`)
    }

    const desc: string[] = []
    if (e.notes) desc.push(e.notes as string)
    if (appOrigin) desc.push(`פתח באפליקציה: ${appOrigin}/calendar`)
    if (desc.length) lines.push(fold(`DESCRIPTION:${escapeText(desc.join('\n'))}`))

    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location as string)}`))
    if (e.color) lines.push(`COLOR:${escapeText(e.color as string)}`)

    const rrule = recurrenceToRRULE(
      e.recurrence as string | null,
      (e.recurrence_interval as number) || 1,
      null,
      (e.recurrence_end_date as string | null) ?? null,
    )
    if (rrule) lines.push(`RRULE:${rrule}`)

    if (e.reminder_minutes != null) {
      for (const a of valarmBlock(e.reminder_minutes as number, e.title as string)) lines.push(a)
    }
    lines.push('END:VEVENT')
  }

  // TASKS (with a due date) — emitted as VEVENTs so they appear in calendar UI.
  for (const t of tasks ?? []) {
    if (t.done) continue
    if (!t.due_date) continue

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:task-${t.id}@household-app`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(fold(`SUMMARY:✅ ${escapeText(t.title || '(משימה)')}`))

    const reminder = t.reminder_time as string | null
    if (reminder) {
      const { start, tzid } = dateTimeToICS(t.due_date as string, reminder.slice(0, 5))
      lines.push(`DTSTART;TZID=${tzid}:${start}`)
      // 30-minute default duration so the event has visual presence
      const endHour = parseInt(reminder.slice(0, 2), 10)
      const endMin = parseInt(reminder.slice(3, 5), 10) + 30
      const carry = Math.floor(endMin / 60)
      const finalH = (endHour + carry) % 24
      const finalM = endMin % 60
      const endTimeStr = `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`
      const { start: endVal } = dateTimeToICS(t.due_date as string, endTimeStr)
      lines.push(`DTEND;TZID=${tzid}:${endVal}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateToICS(t.due_date as string)}`)
      lines.push(`DTEND;VALUE=DATE:${dateToICS(addDays(t.due_date as string, 1))}`)
    }

    const desc: string[] = ['(משימה מאפליקציית הבית)']
    if (t.notes) desc.push(t.notes as string)
    if (appOrigin) desc.push(`${appOrigin}/tasks`)
    lines.push(fold(`DESCRIPTION:${escapeText(desc.join('\n'))}`))

    const rrule = recurrenceToRRULE(
      t.recurrence as string | null,
      (t.recurrence_interval as number) || 1,
      t.recurrence_weekday as number | null,
      (t.recurrence_end_date as string | null) ?? null,
    )
    if (rrule) lines.push(`RRULE:${rrule}`)

    if (t.reminder_enabled && t.reminder_time) {
      for (const a of valarmBlock(0, t.title as string)) lines.push(a)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  const body = lines.join('\r\n') + '\r\n'

  // Touch last_sync_at silently (best-effort).
  await supabase
    .from('calendar_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', conn.id)

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="home-calendar.ics"',
      'Cache-Control': 'public, max-age=900', // 15 minutes
    },
  })
})
