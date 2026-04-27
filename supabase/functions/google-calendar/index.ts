// Google Calendar two-way sync (Tier 1).
//
// One function with several actions, dispatched on `body.action`:
//   • auth_url         → returns OAuth2 authorization URL
//   • exchange_code    → exchanges authorization code for tokens; persists secrets
//   • list_calendars   → returns the user's Google calendars (cached on connection)
//   • pull             → pulls events from enabled calendars into imported_calendar_events
//   • push             → mirrors a single app event/task to Google Calendar
//   • delete_remote    → deletes an event in Google when it was deleted in the app
//   • disconnect       → revokes Google access + nukes secrets + connection row
//   • rotate_feed_token→ rotates the webcal token, invalidating old subscriptions
//   • set_settings     → patches calendar_connections.settings
//
// Required Edge Function secrets (Dashboard → Edge Functions → Manage Secrets):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI         — must match an authorized redirect URI in Google
//                                 Cloud Console. Typically the front-end's /settings
//                                 page, e.g. https://your-app.com/settings
//   APP_PUBLIC_URL              — front-end origin, used in event descriptions
//   SUPABASE_URL                — auto
//   SUPABASE_SERVICE_ROLE_KEY   — auto

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

type Json = Record<string, unknown>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ── Token helpers ───────────────────────────────────────────────────────────

async function readTokens(supabase: ReturnType<typeof createClient>, connId: string) {
  const { data } = await supabase
    .from('calendar_secrets')
    .select('refresh_token, access_token, scope')
    .eq('connection_id', connId)
    .maybeSingle()
  return data as { refresh_token: string | null; access_token: string | null; scope: string | null } | null
}

async function writeTokens(
  supabase: ReturnType<typeof createClient>,
  connId: string,
  patch: { refresh_token?: string | null; access_token?: string | null; scope?: string | null },
) {
  await supabase.from('calendar_secrets').upsert(
    { connection_id: connId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'connection_id' },
  )
}

async function ensureAccessToken(
  supabase: ReturnType<typeof createClient>,
  connId: string,
  conn: { google_token_expires_at: string | null },
): Promise<string> {
  const tokens = await readTokens(supabase, connId)
  if (!tokens?.refresh_token) throw new Error('not_connected')

  const expires = conn.google_token_expires_at ? new Date(conn.google_token_expires_at).getTime() : 0
  // Refresh 60s before expiry to avoid mid-request expiration
  if (tokens.access_token && expires > Date.now() + 60_000) {
    return tokens.access_token
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('google_oauth_not_configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`token_refresh_failed: ${res.status} ${text}`)
  }
  const j = await res.json() as { access_token: string; expires_in: number; scope?: string }
  const newExpires = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString()
  await writeTokens(supabase, connId, { access_token: j.access_token, scope: j.scope ?? null })
  await supabase.from('calendar_connections')
    .update({ google_token_expires_at: newExpires })
    .eq('id', connId)
  return j.access_token
}

// ── Recurrence ──────────────────────────────────────────────────────────────

function recurrenceToRRULE(
  recurrence: string | null,
  interval: number,
  weekday: number | null,
): string | null {
  const n = Math.max(1, interval | 0 || 1)
  switch (recurrence) {
    case 'daily': return `RRULE:FREQ=DAILY;INTERVAL=${n}`
    case 'weekly': {
      if (weekday != null && weekday >= 0 && weekday <= 6) {
        const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
        return `RRULE:FREQ=WEEKLY;INTERVAL=${n};BYDAY=${map[weekday]}`
      }
      return `RRULE:FREQ=WEEKLY;INTERVAL=${n}`
    }
    case 'monthly': return `RRULE:FREQ=MONTHLY;INTERVAL=${n}`
    case 'yearly':  return `RRULE:FREQ=YEARLY;INTERVAL=${n}`
    case 'custom':  return `RRULE:FREQ=DAILY;INTERVAL=${n}`
    default: return null
  }
}

// ── Auth header → Supabase user ─────────────────────────────────────────────

async function getCallerUser(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await client.auth.getUser()
  return user
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function actionAuthUrl(_supabase: ReturnType<typeof createClient>, _userId: string, body: Json) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const redirect = (body.redirect_uri as string) || Deno.env.get('GOOGLE_REDIRECT_URI') || ''
  if (!clientId) return json({ error: 'google_oauth_not_configured' }, 503)
  if (!redirect)  return json({ error: 'missing_redirect_uri' }, 400)
  const state = (body.state as string) || crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent', // force refresh_token issuance
    state,
  })
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state })
}

async function actionExchangeCode(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  householdId: string,
  body: Json,
) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const code = body.code as string
  const redirect = (body.redirect_uri as string) || Deno.env.get('GOOGLE_REDIRECT_URI') || ''
  if (!clientId || !clientSecret) return json({ error: 'google_oauth_not_configured' }, 503)
  if (!code || !redirect) return json({ error: 'missing_code_or_redirect' }, 400)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirect, grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return json({ error: 'token_exchange_failed', detail: text }, 502)
  }
  const t = await tokenRes.json() as {
    access_token: string; refresh_token?: string; expires_in: number; scope: string
  }
  if (!t.refresh_token) {
    return json({ error: 'no_refresh_token', hint: 'revoke previous grant in Google Account first' }, 400)
  }

  // Identify the Google account
  const meRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${t.access_token}` },
  })
  const me = meRes.ok ? await meRes.json() as { email?: string } : {}

  const calsRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${t.access_token}` },
  })
  const cals = calsRes.ok ? await calsRes.json() as { items?: Array<{ id: string; summary: string; primary?: boolean; backgroundColor?: string }> } : { items: [] }
  const enabledCalendars = (cals.items ?? []).map((c) => ({
    id: c.id,
    name: c.summary,
    primary: !!c.primary,
    color: c.backgroundColor ?? '#4FC3F7',
    enabled: !!c.primary, // primary on by default
  }))

  const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString()

  // Upsert connection
  const { data: existing } = await supabase
    .from('calendar_connections')
    .select('id, settings')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle()

  let connId: string
  if (existing) {
    connId = existing.id as string
    await supabase.from('calendar_connections')
      .update({
        household_id: householdId,
        google_email: me.email ?? null,
        google_calendars: enabledCalendars,
        google_token_expires_at: expiresAt,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connId)
  } else {
    const { data: ins, error } = await supabase.from('calendar_connections').insert({
      user_id: user.id,
      household_id: householdId,
      provider: 'google',
      google_email: me.email ?? null,
      google_calendars: enabledCalendars,
      google_token_expires_at: expiresAt,
      settings: {
        auto_sync_new: true,
        import_external: true,
        default_event_sync: true,
        suppress_app_notifications_when_synced: true,
        source_prefs: {},
      },
    }).select('id').single()
    if (error) return json({ error: 'insert_failed', detail: error.message }, 500)
    connId = ins.id as string
  }

  await writeTokens(supabase, connId, {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    scope: t.scope,
  })

  await supabase.from('calendar_sync_log').insert({
    user_id: user.id,
    household_id: householdId,
    provider: 'google',
    direction: 'auth',
    status: 'success',
    items_count: enabledCalendars.length,
  })

  return json({ ok: true, email: me.email, calendars: enabledCalendars, connection_id: connId })
}

async function actionPull(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  householdId: string,
) {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, household_id, google_calendars, settings, google_token_expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle()
  if (!conn) return json({ error: 'not_connected' }, 404)

  const settings = (conn.settings as Json) || {}
  if (settings.import_external === false) {
    return json({ ok: true, imported: 0, skipped: 'import_disabled' })
  }

  let token: string
  try {
    token = await ensureAccessToken(supabase, conn.id as string, { google_token_expires_at: conn.google_token_expires_at as string | null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('calendar_connections').update({ status: 'error', last_error: msg }).eq('id', conn.id)
    return json({ error: 'auth_failed', detail: msg }, 401)
  }

  const calendars = (conn.google_calendars as Array<{ id: string; name: string; enabled: boolean }>) || []
  const enabled = calendars.filter((c) => c.enabled !== false)
  if (enabled.length === 0) return json({ ok: true, imported: 0 })

  const timeMin = new Date(); timeMin.setMonth(timeMin.getMonth() - 1)
  const timeMax = new Date(); timeMax.setFullYear(timeMax.getFullYear() + 1)
  let imported = 0, removed = 0
  const errors: string[] = []

  for (const cal of enabled) {
    try {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'false',
        showDeleted: 'true',
        maxResults: '500',
      })
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) {
        const t = await r.text()
        errors.push(`${cal.name || cal.id}: ${r.status} ${t.slice(0, 200)}`)
        continue
      }
      const j = await r.json() as { items?: Array<Json> }
      for (const ev of j.items ?? []) {
        try {
          const id = ev.id as string
          if ((ev.status as string) === 'cancelled') {
            const { error } = await supabase
              .from('imported_calendar_events')
              .update({ deleted_at: new Date().toISOString() })
              .eq('household_id', householdId)
              .eq('source', 'google')
              .eq('source_calendar_id', cal.id)
              .eq('source_event_id', id)
            if (!error) removed += 1
            continue
          }
          const start = ev.start as Json | undefined
          const end = ev.end as Json | undefined
          let date = '', time: string | null = null, allDay = false
          let endDate: string | null = null, endTime: string | null = null
          if (start?.date) {
            allDay = true
            date = start.date as string
            endDate = (end?.date as string) || date
          } else if (start?.dateTime) {
            const dt = new Date(start.dateTime as string)
            date = dt.toISOString().slice(0, 10)
            time = dt.toTimeString().slice(0, 5)
            if (end?.dateTime) {
              const dt2 = new Date(end.dateTime as string)
              endDate = dt2.toISOString().slice(0, 10)
              endTime = dt2.toTimeString().slice(0, 5)
            }
          } else continue

          const recurrenceArr = (ev.recurrence as string[] | undefined) ?? []
          const rrule = recurrenceArr.find((r) => r.startsWith('RRULE:'))?.replace(/^RRULE:/, '') ?? null

          const row = {
            household_id: householdId,
            imported_by_user_id: user.id,
            source: 'google',
            source_event_id: id,
            source_calendar_id: cal.id,
            source_calendar_name: cal.name,
            title: (ev.summary as string) || '(ללא כותרת)',
            description: (ev.description as string) || '',
            location: (ev.location as string) || '',
            date, time, end_date: endDate, end_time: endTime, all_day: allDay,
            recurrence_rule: rrule,
            color: '#4FC3F7',
            html_link: (ev.htmlLink as string) || null,
            raw: ev,
            deleted_at: null,
            updated_at: new Date().toISOString(),
          }
          await supabase.from('imported_calendar_events').upsert(row, {
            onConflict: 'household_id,source,source_calendar_id,source_event_id',
          })
          imported += 1
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
          errors.push(`event ${(ev as Json).id}: ${msg}`)
        }
      }
    } catch (calErr) {
      errors.push(`${cal.name}: ${calErr instanceof Error ? calErr.message : String(calErr)}`)
    }
  }

  await supabase.from('calendar_connections')
    .update({ last_sync_at: new Date().toISOString(), status: errors.length ? 'error' : 'active', last_error: errors.length ? errors.join('; ').slice(0, 500) : null })
    .eq('id', conn.id)

  await supabase.from('calendar_sync_log').insert({
    user_id: user.id,
    household_id: householdId,
    provider: 'google',
    direction: 'pull',
    status: errors.length ? (imported ? 'partial' : 'error') : 'success',
    items_count: imported,
    error_message: errors.length ? errors.join('; ').slice(0, 500) : null,
  })

  return json({ ok: true, imported, removed, errors: errors.length ? errors : undefined })
}

async function actionPush(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  householdId: string,
  body: Json,
) {
  const kind = body.kind as 'event' | 'task'
  const itemId = body.id as string
  if (!kind || !itemId) return json({ error: 'missing_kind_or_id' }, 400)

  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, google_calendars, google_token_expires_at, settings')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle()
  if (!conn) return json({ error: 'not_connected' }, 404)

  const calendars = (conn.google_calendars as Array<{ id: string; primary?: boolean }>) || []
  const calId = calendars.find((c) => c.primary)?.id || calendars[0]?.id || 'primary'

  let token: string
  try { token = await ensureAccessToken(supabase, conn.id as string, { google_token_expires_at: conn.google_token_expires_at as string | null }) }
  catch (e) { return json({ error: 'auth_failed', detail: e instanceof Error ? e.message : String(e) }, 401) }

  const tableName = kind === 'task' ? 'tasks' : 'events'
  const { data: row } = await supabase.from(tableName).select('*').eq('id', itemId).maybeSingle()
  if (!row) return json({ error: 'not_found' }, 404)

  const appOrigin = Deno.env.get('APP_PUBLIC_URL') || ''
  const linkBack = appOrigin
    ? `\n\n${kind === 'task' ? 'משימה' : 'אירוע'} מאפליקציית הבית: ${appOrigin}/${kind === 'task' ? 'tasks' : 'calendar'}`
    : ''

  let payload: Json
  if (kind === 'event') {
    const allDay = !!row.all_day || !row.time
    const start: Json = allDay ? { date: row.date } : { dateTime: `${row.date}T${row.time}:00`, timeZone: 'Asia/Jerusalem' }
    const endDate = row.end_date || row.date
    const endTime = row.end_time || row.time
    let end: Json
    if (allDay) {
      const d = new Date(`${endDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
      end = { date: d.toISOString().slice(0, 10) }
    } else {
      end = { dateTime: `${endDate}T${endTime}:00`, timeZone: 'Asia/Jerusalem' }
    }
    payload = {
      summary: row.title,
      description: (row.notes || '') + linkBack,
      location: row.location || undefined,
      start, end,
    }
    const rrule = recurrenceToRRULE(row.recurrence as string | null, (row.recurrence_interval as number) || 1, null)
    if (rrule) payload.recurrence = [rrule]
    if (row.reminder_minutes != null) {
      payload.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: row.reminder_minutes }] }
    }
  } else {
    // task → use due_date/reminder_time
    const dueDate = row.due_date as string | null
    if (!dueDate) return json({ error: 'task_has_no_date' }, 400)
    const reminder = row.reminder_time as string | null
    let start: Json, end: Json
    if (reminder) {
      const t = reminder.slice(0, 5)
      start = { dateTime: `${dueDate}T${t}:00`, timeZone: 'Asia/Jerusalem' }
      // 30 minute default duration
      const [hh, mm] = t.split(':').map((x) => parseInt(x, 10))
      const totalMin = hh * 60 + mm + 30
      const endHH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0')
      const endMM = String(totalMin % 60).padStart(2, '0')
      end = { dateTime: `${dueDate}T${endHH}:${endMM}:00`, timeZone: 'Asia/Jerusalem' }
    } else {
      start = { date: dueDate }
      const d = new Date(`${dueDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
      end = { date: d.toISOString().slice(0, 10) }
    }
    payload = {
      summary: `✅ ${row.title}`,
      description: (row.notes || '') + linkBack,
      start, end,
    }
    const rrule = recurrenceToRRULE(row.recurrence as string | null, (row.recurrence_interval as number) || 1, row.recurrence_weekday as number | null)
    if (rrule) payload.recurrence = [rrule]
    if (row.reminder_enabled && row.reminder_time) {
      payload.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
    }
  }

  const existingId = row.google_event_id as string | null
  const url = existingId
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(existingId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`
  const method = existingId ? 'PUT' : 'POST'

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    await supabase.from('calendar_sync_log').insert({
      user_id: user.id, household_id: householdId, provider: 'google', direction: 'push',
      status: 'error', items_count: 0, error_message: `${res.status} ${text.slice(0, 300)}`,
    })
    return json({ error: 'push_failed', status: res.status, detail: text }, 502)
  }
  const created = await res.json() as { id: string }

  await supabase.from(tableName).update({
    google_event_id: created.id,
    google_calendar_id: calId,
    last_pushed_at: new Date().toISOString(),
  }).eq('id', itemId)

  await supabase.from('calendar_sync_log').insert({
    user_id: user.id, household_id: householdId, provider: 'google', direction: 'push',
    status: 'success', items_count: 1,
  })

  return json({ ok: true, google_event_id: created.id })
}

async function actionDeleteRemote(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  body: Json,
) {
  const calId = (body.google_calendar_id as string) || 'primary'
  const eventId = body.google_event_id as string
  if (!eventId) return json({ error: 'missing_google_event_id' }, 400)

  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, google_token_expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle()
  if (!conn) return json({ error: 'not_connected' }, 404)

  let token: string
  try { token = await ensureAccessToken(supabase, conn.id as string, { google_token_expires_at: conn.google_token_expires_at as string | null }) }
  catch (e) { return json({ error: 'auth_failed', detail: e instanceof Error ? e.message : String(e) }, 401) }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const text = await res.text()
    return json({ error: 'delete_failed', status: res.status, detail: text }, 502)
  }
  return json({ ok: true })
}

async function actionDisconnect(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  householdId: string,
) {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle()
  if (!conn) return json({ ok: true, alreadyDisconnected: true })

  const tokens = await readTokens(supabase, conn.id as string)
  if (tokens?.refresh_token) {
    // best-effort revoke at Google
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {})
  }

  await supabase.from('calendar_secrets').delete().eq('connection_id', conn.id)
  await supabase.from('imported_calendar_events').delete().eq('household_id', householdId).eq('source', 'google')
  // Clear google_event_id from all events/tasks
  await supabase.from('events').update({ google_event_id: null, google_calendar_id: null }).eq('household_id', householdId).not('google_event_id', 'is', null)
  await supabase.from('tasks').update({ google_event_id: null, google_calendar_id: null }).eq('household_id', householdId).not('google_event_id', 'is', null)
  await supabase.from('calendar_connections').delete().eq('id', conn.id)
  await supabase.from('calendar_sync_log').insert({
    user_id: user.id, household_id: householdId, provider: 'google', direction: 'auth',
    status: 'success', items_count: 0, error_message: 'disconnected',
  })

  return json({ ok: true })
}

async function actionRotateFeedToken(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  householdId: string,
) {
  const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const { data: existing } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'webcal')
    .maybeSingle()
  if (existing) {
    await supabase.from('calendar_connections')
      .update({ feed_token: newToken, household_id: householdId, updated_at: new Date().toISOString(), status: 'active' })
      .eq('id', existing.id)
  } else {
    await supabase.from('calendar_connections').insert({
      user_id: user.id, household_id: householdId, provider: 'webcal',
      feed_token: newToken,
      settings: { auto_sync_new: true, default_event_sync: true },
    })
  }
  return json({ ok: true, feed_token: newToken })
}

async function actionSetSettings(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  body: Json,
) {
  const provider = (body.provider as string) || 'google'
  const patch = (body.settings as Json) || {}
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, settings')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .maybeSingle()
  if (!conn) return json({ error: 'not_connected' }, 404)
  const merged = { ...(conn.settings as Json), ...patch }
  // calendars patch separately
  const cals = body.calendars as unknown
  const update: Json = { settings: merged, updated_at: new Date().toISOString() }
  if (Array.isArray(cals)) update.google_calendars = cals
  const { error } = await supabase.from('calendar_connections').update(update).eq('id', conn.id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, settings: merged })
}

// ── Dispatch ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: Json
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const action = String(body.action || '')
  if (!action) return json({ error: 'missing_action' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const user = await getCallerUser(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  // Resolve household_id from membership (server-side, ignore client claim).
  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  const householdId = member?.household_id as string | undefined

  try {
    switch (action) {
      case 'auth_url':
        return await actionAuthUrl(supabase, user.id, body)
      case 'exchange_code':
        if (!householdId) return json({ error: 'no_household' }, 400)
        return await actionExchangeCode(supabase, user, householdId, body)
      case 'pull':
        if (!householdId) return json({ error: 'no_household' }, 400)
        return await actionPull(supabase, user, householdId)
      case 'push':
        if (!householdId) return json({ error: 'no_household' }, 400)
        return await actionPush(supabase, user, householdId, body)
      case 'delete_remote':
        return await actionDeleteRemote(supabase, user, body)
      case 'disconnect':
        if (!householdId) return json({ error: 'no_household' }, 400)
        return await actionDisconnect(supabase, user, householdId)
      case 'rotate_feed_token':
        if (!householdId) return json({ error: 'no_household' }, 400)
        return await actionRotateFeedToken(supabase, user, householdId)
      case 'set_settings':
        return await actionSetSettings(supabase, user, body)
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[google-calendar] ${action} error:`, msg)
    return json({ error: 'internal', detail: msg }, 500)
  }
})
