/**
 * תזכורות משימות מתוזמנות — Web Push דרך send-push הקיים
 *
 * פריסה:
 *   supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
 *   supabase functions deploy dispatch-task-reminders --project-ref <ref>
 *
 * תזמון (כל 5 דקות דרך GitHub Actions, או כל דקה דרך Cron חיצוני):
 *   POST https://<ref>.supabase.co/functions/v1/dispatch-task-reminders
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Header: apikey: <SUPABASE_ANON_KEY>
 *
 * אזור זמן: Asia/Jerusalem
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const TZ = 'Asia/Jerusalem'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function todayStrJerusalem(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function hmJerusalem(now: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '0'
  return { h: parseInt(hour, 10), m: parseInt(minute, 10) }
}

function parseReminderTime(t: string | null): { h: number; m: number } | null {
  if (!t) return null
  const p = String(t).trim().split(':')
  if (p.length < 2) return null
  return { h: parseInt(p[0], 10) || 0, m: parseInt(p[1], 10) || 0 }
}

function minutesSinceMidnight(h: number, m: number): number {
  return h * 60 + m
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const cronSecret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('Authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const today = todayStrJerusalem(now)
  const { h: curH, m: curM } = hmJerusalem(now)
  const curMinutes = minutesSinceMidnight(curH, curM)

  try {
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('id, household_id, title, assigned_to, due_date, reminder_time, reminder_enabled, done')
      .eq('reminder_enabled', true)
      .eq('done', false)
      .not('reminder_time', 'is', null)
      .not('due_date', 'is', null)
      .eq('due_date', today)

    if (tasksErr) throw tasksErr

    const { data: sentRows } = await supabase
      .from('task_reminder_sent')
      .select('task_id')
      .eq('fire_date', today)

    const already = new Set((sentRows ?? []).map((r) => r.task_id))

    const candidates = (tasks ?? []).filter((task) => {
      const rt = parseReminderTime(task.reminder_time as string)
      if (!rt) return false
      const reminderMinutes = minutesSinceMidnight(rt.h, rt.m)
      if (reminderMinutes > curMinutes) return false
      if (already.has(task.id)) return false
      return true
    })

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          date: today,
          time: `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`,
          dispatched: 0,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const householdIds = [...new Set(candidates.map((t) => t.household_id))]
    const { data: allMembers, error: memErr } = await supabase
      .from('household_members')
      .select('household_id, user_id')
      .in('household_id', householdIds)

    if (memErr) throw memErr

    const membersByHouse = new Map<string, string[]>()
    for (const m of allMembers ?? []) {
      const hid = m.household_id as string
      const uid = m.user_id as string
      if (!membersByHouse.has(hid)) membersByHouse.set(hid, [])
      membersByHouse.get(hid)!.push(uid)
    }

    let dispatched = 0
    const errors: string[] = []

    for (const task of candidates) {
      const memberIds = membersByHouse.get(task.household_id) ?? []
      const a = task.assigned_to as string | null
      let onlyUserIds: string[]
      if (a && UUID_RE.test(a)) {
        onlyUserIds = [a]
      } else {
        onlyUserIds = memberIds
      }

      if (onlyUserIds.length === 0) {
        await supabase.from('task_reminder_sent').insert({ task_id: task.id, fire_date: today })
        continue
      }

      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          household_id: task.household_id,
          only_user_ids: onlyUserIds,
          title: '📋 תזכורת למשימה',
          body: task.title as string,
          url: '/tasks',
          category: 'tasks',
        }),
      })

      if (!pushRes.ok) {
        errors.push(`${task.id}: ${await pushRes.text()}`)
        continue
      }

      const { error: insErr } = await supabase.from('task_reminder_sent').insert({
        task_id: task.id,
        fire_date: today,
      })

      if (insErr) {
        if (insErr.code === '23505') {
          dispatched += 1
          continue
        }
        errors.push(`${task.id}: dedup ${insErr.message}`)
        continue
      }

      dispatched += 1
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: today,
        time: `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`,
        dispatched,
        errors: errors.length ? errors : undefined,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
